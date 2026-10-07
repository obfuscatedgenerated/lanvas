import type { SocketHandlerFunction } from "@/server/types";

import type {PoolClient} from "pg";

import {get_config} from "@/server/config";

import {is_user_banned} from "@/server/banlist";
import {get_cell, set_cell} from "@/server/grid";
import {intercept_client} from "@/server/prometheus";

import {calculate_timeout_data, get_calculated_pixel_timeout, is_user_in_pixel_timeout, remove_pixel_timeout, pixel_timeout_user} from "@/server/timeouts";
import snowflake from "@/snowflake";
import {increment_virtual_stat} from "@/server/stats";
import {activity_check_in} from "@/server/afk";
import {consume_gift, emit_gift_info, refund_gift} from "@/server/gifts";

import type {HeldGift} from "@/types";
import {get_visible_stats} from "@/server/feature_stats";

// handle pixel updates from clients

export const handler: SocketHandlerFunction = async ({socket, payload, io, pool}) => {
    let client: PoolClient | null = null;

    try {
        const {x, y, color} = payload;
        //console.log(`Received pixel_update from ${socket.id}:`, payload);

        // basic validation of incoming data
        if (
            !(
                typeof x === "number" && x >= 0 && x < get_config("grid_width") &&
                typeof y === "number" && y >= 0 && y < get_config("grid_height") &&
                typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
            )
        ) {
            return;
        }

        if (get_config("readonly")) {
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

        activity_check_in(user_id);

        const is_admin = socket.user.sub === process.env.DISCORD_ADMIN_USER_ID;
        const god = is_admin && get_config("admin_god");
        const anonymous = is_admin && get_config("admin_anonymous");

        // check user isn't in timeout period, spending a held gift instead if they have one
        let used_gift: HeldGift | null = null;

        if (!god && is_user_in_pixel_timeout(user_id)) {
            const gift_result = consume_gift(user_id);

            if (gift_result.status === "burst_gap") {
                socket.emit("pixel_update_rejected", {reason: "burst_gap"});
                return;
            }

            if (gift_result.status === "none") {
                // user is still in timeout period
                const timeout = get_calculated_pixel_timeout(user_id)!;
                socket.emit("pixel_update_rejected", {reason: "timeout", wait_time: timeout.remaining});
                return;
            }

            used_gift = gift_result.gift;
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

        // set new timeout for user with default duration (from config), unless they spent a gift
        if (used_gift) {
            emit_gift_info(io, user_id);
        } else if (!god) {
            // tell the client the authoritative cooldown, which may be longer than the base timeout when
            // player-count scaling is on, so the client's timer matches instead of guessing from the base.
            // on a db failure below the placement is rolled back and pixel_update_rejected resets this.
            const timeout = pixel_timeout_user(user_id);
            socket.emit("timeout_info", calculate_timeout_data(timeout));
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
                "INSERT INTO pixels (x, y, color, author_id, snowflake, gift_snowflake) VALUES ($1, $2, $3, $4, $5, $6)",
                [x, y, color, anonymous ? null : user_id, snowflake_id, used_gift ? used_gift.id : null],
            );

            // TODO: ensure the latest cached pixel is the one with the latest snowflake to avoid reload inconsistencies? kinda over the top for the likelihood rn tho

            // await increment_db_stat(client, "total_pixels_placed");

            //await client.query("COMMIT");
            //transaction_open = false;

            console.log(`Database updated for pixel at (${x}, ${y})`);

            // and increment the total_pixels_placed stat, as well as returning the new total
            increment_virtual_stat("total_pixels_placed");

            // emit updated stats to all clients in stats room
            io.to("stats").emit("stats", get_visible_stats());
        } catch (db_error) {
            console.error("Database error during pixel update:", db_error);

            // revert in-memory state
            // TODO: dealing with conflicting edits could be improved here to avoid race condition if one is reverted but another edit has happened since
            set_cell(x, y, old_color, old_author);

            // notify clients to revert the pixel
            io.emit("pixel_update", {x, y, color: old_color, author: old_author});

            // give back whatever the placement cost since the update failed
            if (used_gift) {
                refund_gift(user_id, used_gift);
            } else {
                remove_pixel_timeout(user_id);
            }

            // notify the user that their update failed to reset their client timer
            socket.emit("pixel_update_rejected", {reason: "database_error"});

            // a gift placement never started a timeout, so restore the client's view of the existing one
            if (used_gift) {
                const existing_timeout = get_calculated_pixel_timeout(user_id);
                if (existing_timeout) {
                    socket.emit("timeout_info", existing_timeout);
                }

                emit_gift_info(io, user_id);
            }

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
