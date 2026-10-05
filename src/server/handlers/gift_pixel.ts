import type {SocketHandlerFunction} from "@/server/types";
import type {Author, GiftLogEntry} from "@/types";

import {get_config} from "@/server/config";
import {CONFIG_KEY_ADMIN_GOD, CONFIG_KEY_GIFTING_ENABLED, CONFIG_KEY_READONLY} from "@/consts";
import {DEFAULT_ADMIN_GOD, DEFAULT_GIFTING_ENABLED} from "@/defaults";

import {is_user_banned} from "@/server/banlist";
import {get_calculated_pixel_timeout, is_user_in_pixel_timeout, pixel_timeout_user, remove_pixel_timeout} from "@/server/timeouts";
import {emit_gift_info, give_gift, user_room} from "@/server/gifts";
import {activity_check_in, is_user_active} from "@/server/afk";
import snowflake from "@/snowflake";

// gift your ready pixel to another online user

export const handler: SocketHandlerFunction = async ({socket, payload, io, pool, connected_users}) => {
    const {to_id} = payload ?? {};

    if (typeof to_id !== "string") {
        return;
    }

    if (get_config(CONFIG_KEY_READONLY, false)) {
        socket.emit("gift_rejected", {reason: "readonly"});
        return;
    }

    if (!get_config(CONFIG_KEY_GIFTING_ENABLED, DEFAULT_GIFTING_ENABLED)) {
        socket.emit("gift_rejected", {reason: "disabled"});
        return;
    }

    const user = socket.user;
    if (!user || !user.sub || !user.name) {
        socket.emit("gift_rejected", {reason: "unauthenticated"});
        return;
    }

    const user_id = user.sub;
    if (is_user_banned(user_id)) {
        socket.emit("gift_rejected", {reason: "banned"});
        return;
    }

    activity_check_in(user_id);

    if (to_id === user_id) {
        socket.emit("gift_rejected", {reason: "self"});
        return;
    }

    // recipient must currently be connected, which also gives us their display details
    let recipient: Author | null = null;

    for (const connected of connected_users) {
        if (connected.user_id === to_id) {
            recipient = {
                user_id: to_id,
                name: connected.username || "Unknown",
                avatar_url: connected.avatar_url ?? null,
            };
            break;
        }
    }

    if (!recipient) {
        socket.emit("gift_rejected", {reason: "recipient_offline"});
        return;
    }

    if (!is_user_active(recipient.user_id)) {
        socket.emit("gift_rejected", {reason: "recipient_afk", recipient});
        return;
    }

    if (is_user_banned(recipient.user_id)) {
        socket.emit("gift_rejected", {reason: "recipient_banned", recipient});
        return;
    }

    const is_admin = user_id === process.env.DISCORD_ADMIN_USER_ID;
    const god = is_admin && get_config(CONFIG_KEY_ADMIN_GOD, DEFAULT_ADMIN_GOD);

    // gifting costs your ready pixel
    if (!god && is_user_in_pixel_timeout(user_id)) {
        const timeout = get_calculated_pixel_timeout(user_id)!;
        socket.emit("gift_rejected", {reason: "timeout", wait_time: timeout.remaining});
        return;
    }

    // take the pixel before awaiting the db, so a second request can't spend it in the meantime
    if (!god) {
        pixel_timeout_user(user_id);
    }

    const sender: Author = {
        user_id,
        name: user.name,
        avatar_url: user.picture || null,
    };

    const gift_snowflake = snowflake.generate();

    try {
        // keep user details current so stats can join on usernames
        await pool.query(
            `INSERT INTO user_details (user_id, username, avatar_url)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url`,
            [sender.user_id, sender.name, sender.avatar_url]
        );

        // the recipient's name may be a fallback, so never overwrite an existing record with it
        await pool.query(
            `INSERT INTO user_details (user_id, username, avatar_url)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id) DO NOTHING`,
            [recipient.user_id, recipient.name, recipient.avatar_url]
        );

        await pool.query(
            "INSERT INTO gift_log (snowflake, from_id, to_id, amount) VALUES ($1, $2, $3, $4)",
            [gift_snowflake, sender.user_id, recipient.user_id, 1]
        );
    } catch (db_error) {
        console.error("Database error during gift:", db_error);

        // give the sender their pixel back
        if (!god) {
            remove_pixel_timeout(user_id);
        }

        socket.emit("gift_rejected", {reason: "database_error"});
        return;
    }

    if (!god) {
        io.to(user_room(user_id)).emit("timeout_info", get_calculated_pixel_timeout(user_id));
    }

    give_gift(recipient.user_id, sender, 1, gift_snowflake.toString());

    emit_gift_info(io, recipient.user_id);
    io.to(user_room(recipient.user_id)).emit("gift_received", {from: sender});
    socket.emit("gift_sent", {to: recipient});

    // live update for any admin viewing the gift log
    const log_entry: GiftLogEntry = {
        id: gift_snowflake.toString(),
        timestamp: snowflake.timestampFrom(gift_snowflake),
        from: {user_id: sender.user_id, name: sender.name},
        to: {user_id: recipient.user_id, name: recipient.name},
        amount: 1,
        used: 0,
    };

    io.to("admin").emit("gift_logged", log_entry);

    console.log(`Gift from ${user.name} (id: ${user_id}) to ${recipient.name} (id: ${recipient.user_id})`);
}
