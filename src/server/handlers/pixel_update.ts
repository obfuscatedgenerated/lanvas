import type { SocketHandlerFunction } from "@/server/types";

import type {PoolClient} from "pg";

import {get_config} from "@/server/config";

import {
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
    CONFIG_KEY_PIXEL_TIMEOUT_MS,
    CONFIG_KEY_READONLY
} from "@/consts";
import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH, DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";

import {is_user_banned} from "@/server/banlist";
import {get_cell, set_cell} from "@/server/grid";
import {intercept_client} from "@/server/prometheus";

// handle pixel updates from clients

export const handler: SocketHandlerFunction = async ({socket, payload, timeouts, io, pool, stats}) => {
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

        // check user isn't in timeout period
        const current_time = Date.now();
        if (timeouts[user_id] && timeouts[user_id].ends > current_time) {
            // user is still in timeout period
            const wait_time = Math.ceil((timeouts[user_id].ends - current_time) / 1000);
            socket.emit("pixel_update_rejected", {reason: "timeout", wait_time});
            return;
        }

        const author = {
            user_id,
            name: socket.user.name,
            avatar_url: socket.user.picture || null,
        };

        // we will do an optimistic update, so we store the old state in case we need to revert
        const {color: old_color, author: old_author} = get_cell(x, y)!;

        set_cell(x, y, color, author);
        console.log(`Pixel updated at (${x}, ${y}) to ${color} by user ${socket.user.name} (id: ${user_id})`);

        // set new timeout for user
        timeouts[user_id] = {
            started: current_time,
            ends: current_time + get_config(CONFIG_KEY_PIXEL_TIMEOUT_MS, DEFAULT_PIXEL_TIMEOUT_MS)
        };

        // broadcast the pixel update to all connected clients
        io.emit("pixel_update", {x, y, color, author});

        // try to update the database
        let transaction_open = false;

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

            // create a transaction to ensure both pixel and stats are updated together
            await client.query("BEGIN");
            transaction_open = true;

            // then upsert the pixel
            await client.query(
                `INSERT INTO pixels (x, y, color, author_id)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color, author_id = EXCLUDED.author_id`,
                [x, y, color, user_id]
            );

            // and increment the total_pixels_placed stat, as well as returning the new total
            const stats_res = await client.query(
                `INSERT INTO stats (key, value)
                         VALUES ('total_pixels_placed', 1)
                         ON CONFLICT (key) DO UPDATE SET value = stats.value + 1
                         RETURNING value`,
            );

            await client.query("COMMIT");
            transaction_open = false;

            // update in-memory stats cache
            const new_total = parseInt(stats_res.rows[0].value, 10);
            stats.set("total_pixels_placed", new_total);

            console.log(`Database updated for pixel at (${x}, ${y})`);

            // emit updated stats to all clients in stats room
            io.to("stats").emit("stats", Object.fromEntries(stats));
        } catch (db_error) {
            console.error("Database error during pixel update:", db_error);

            // revert in-memory state
            // TODO: dealing with conflicting edits could be improved here to avoid race condition if one is reverted but another edit has happened since
            set_cell(x, y, old_color, old_author);

            // notify clients to revert the pixel
            io.emit("pixel_update", {x, y, color: old_color, author: old_author});

            // remove the timeout since the update failed
            delete timeouts[user_id];

            // notify the user that their update failed to reset their client timer
            socket.emit("pixel_update_rejected", {reason: "database_error"});

            // rollback the transaction
            if (transaction_open) {
                try {
                    await client.query("ROLLBACK");
                } catch (rollback_error) {
                    console.error("Error rolling back transaction:", rollback_error);
                }
            }
        }
    } catch (error) {
        console.error("pixel_update failed", error);
    }  finally {
        if (client) {
            client.release();
        }
    }
}
