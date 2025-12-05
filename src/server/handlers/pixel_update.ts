import type { SocketHandlerFunction } from "@/server/types";

import type {PoolClient} from "pg";

import {get_config} from "@/server/config";

import {
    CONFIG_KEY_ADMIN_ANONYMOUS,
    CONFIG_KEY_ADMIN_GOD,
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
    CONFIG_KEY_READONLY
} from "@/consts";
import {DEFAULT_ADMIN_ANONYMOUS, DEFAULT_ADMIN_GOD, DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH} from "@/defaults";

import {is_user_banned} from "@/server/banlist";
import {get_cell, set_cell} from "@/server/grid";
import {intercept_client} from "@/server/prometheus";

import {get_calculated_pixel_timeout, is_user_in_pixel_timeout, remove_pixel_timeout, pixel_timeout_user} from "@/server/timeouts";
import snowflake from "@/snowflake";
import {get_all_stats, increment_virtual_stat} from "@/server/stats";

// handle pixel updates from clients

export const handler: SocketHandlerFunction = async ({socket, payload, io, pool}) => {
    let client: PoolClient | null = null;

    try {
        const {x, y, color} = payload;
        //console.log(`Received pixel_update from ${socket.id}:`, payload);

        // basic validation of incoming data
        if (
            !(
                typeof x === "number" && x >= 0 && x < get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH) &&
                typeof y === "number" && y >= 0 && y < get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT) &&
                typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
            )
        ) {
            return;
        }

        if (get_config(CONFIG_KEY_READONLY, false)) {
            socket.emit("pixel_update_rejected", {reason: "readonly"});
            return;
        }

        if (!socket.user || !socket.user.sub || !socket.user.name) {
            socket.emit("pixel_update_rejected", {reason: "unauthenticated"});
            return;
        }

        // check if user is banned
        const user_id = socket.user.sub;
        if (is_user_banned(user_id)) {
            socket.emit("pixel_update_rejected", {reason: "banned"});
            return;
        }

        const is_admin = socket.user.sub === process.env.DISCORD_ADMIN_USER_ID;
        const god = is_admin && get_config(CONFIG_KEY_ADMIN_GOD, DEFAULT_ADMIN_GOD);
        const anonymous = is_admin && get_config(CONFIG_KEY_ADMIN_ANONYMOUS, DEFAULT_ADMIN_ANONYMOUS);

        // check user isn't in timeout period
        if (!god && is_user_in_pixel_timeout(user_id)) {
            // user is still in timeout period
            const timeout = get_calculated_pixel_timeout(user_id)!;
            socket.emit("pixel_update_rejected", {reason: "timeout", wait_time: timeout.remaining});
            return;
        }

        const author = anonymous ? null :{
            user_id,
            name: socket.user.name,
            avatar_url: socket.user.picture || null,
        };

        // we will do an optimistic update, so we store the old state in case we need to revert
        const {color: old_color, author: old_author} = get_cell(x, y)!;

        set_cell(x, y, color, author);
        console.log(`Pixel updated at (${x}, ${y}) to ${color} by user ${socket.user.name} (id: ${user_id}) ${god ? "[GOD MODE]" : ""} ${anonymous ? "[ANONYMOUS]" : ""}`);

        // set new timeout for user with default duration (from config)
        if (!god) {
            pixel_timeout_user(user_id);
            // TODO: could emit here to the client rather than having the client calculate it themselves,
            //  although that makes rollback a little annoying without adding a new event or sending a 0 timeout
        }

        // broadcast the pixel update to all connected clients
        io.emit("pixel_update", {x, y, color, author});

        //// try to update the database
        //let transaction_open = false;

        client = await pool.connect();
        intercept_client(client);

        try {
            // first upsert the user details in case they have changed
            await client.query(
                `INSERT INTO user_details (user_id, username, avatar_url)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url`,
                [user_id, socket.user.name, socket.user.picture || null]
            );

            // no longer needed because total_pixels_placed is now a virtual stat
            // TODO probably dont need this client now either, but i remember since adding the upsert to the client rather than pool, it didnt memory leak anymore?????
            // // create a transaction to ensure both pixel and stats are updated together
            // await client.query("BEGIN");
            // transaction_open = true;

            const snowflake_id = snowflake.generate();

            // then upsert the pixel
            await client.query(
                "INSERT INTO pixels (x, y, color, author_id, snowflake) VALUES ($1, $2, $3, $4, $5)",
                [x, y, color, anonymous ? null : user_id, snowflake_id],
            );

            // TODO: ensure the latest cached pixel is the one with the latest snowflake to avoid reload inconsistencies? kinda over the top for the likelihood rn tho

            // await increment_db_stat(client, "total_pixels_placed");

            //await client.query("COMMIT");
            //transaction_open = false;

            console.log(`Database updated for pixel at (${x}, ${y})`);

            // and increment the total_pixels_placed stat, as well as returning the new total
            increment_virtual_stat("total_pixels_placed");

            // emit updated stats to all clients in stats room
            io.to("stats").emit("stats", Object.fromEntries(get_all_stats()));
        } catch (db_error) {
            console.error("Database error during pixel update:", db_error);

            // revert in-memory state
            // TODO: dealing with conflicting edits could be improved here to avoid race condition if one is reverted but another edit has happened since
            set_cell(x, y, old_color, old_author);

            // notify clients to revert the pixel
            io.emit("pixel_update", {x, y, color: old_color, author: old_author});

            // remove the timeout since the update failed
            remove_pixel_timeout(user_id);

            // notify the user that their update failed to reset their client timer
            socket.emit("pixel_update_rejected", {reason: "database_error"});

            // // rollback the transaction
            // if (transaction_open) {
            //     try {
            //         await client.query("ROLLBACK");
            //     } catch (rollback_error) {
            //         console.error("Error rolling back transaction:", rollback_error);
            //     }
            // }
        }
    } catch (error) {
        console.error("pixel_update failed", error);
    }  finally {
        if (client) {
            client.release();
        }
    }
}
