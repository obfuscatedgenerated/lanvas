import type {SocketHandlerFunction} from "@/server/types";
import type {Author} from "@/types";

import {get_config} from "@/server/config";
import {CONFIG_KEY_ADMIN_GOD, CONFIG_KEY_READONLY} from "@/consts";
import {DEFAULT_ADMIN_GOD} from "@/defaults";

import {is_user_banned} from "@/server/banlist";
import {get_cell_author} from "@/server/grid";
import {get_calculated_pixel_timeout, is_user_in_pixel_timeout, pixel_timeout_user} from "@/server/timeouts";
import {emit_gift_info, give_gift, user_room} from "@/server/gifts";
import {activity_check_in} from "@/server/afk";

// gift your ready pixel to the author of the pixel at (x, y)

export const handler: SocketHandlerFunction = ({socket, payload, io, unique_connected_user_ids}) => {
    const {x, y} = payload ?? {};

    if (typeof x !== "number" || typeof y !== "number") {
        return;
    }

    if (get_config(CONFIG_KEY_READONLY, false)) {
        socket.emit("gift_rejected", {reason: "readonly"});
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

    // recipient is looked up server side rather than trusted from the client
    const recipient = get_cell_author(x, y);
    if (!recipient) {
        socket.emit("gift_rejected", {reason: "no_author"});
        return;
    }

    if (recipient.user_id === user_id) {
        socket.emit("gift_rejected", {reason: "self"});
        return;
    }

    if (!unique_connected_user_ids.has(recipient.user_id)) {
        socket.emit("gift_rejected", {reason: "recipient_offline", recipient});
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

    if (!god) {
        pixel_timeout_user(user_id);
        io.to(user_room(user_id)).emit("timeout_info", get_calculated_pixel_timeout(user_id));
    }

    const sender: Author = {
        user_id,
        name: user.name,
        avatar_url: user.picture || null,
    };

    give_gift(recipient.user_id, sender);

    emit_gift_info(io, recipient.user_id);
    io.to(user_room(recipient.user_id)).emit("gift_received", {from: sender, x, y});
    socket.emit("gift_sent", {to: recipient});

    console.log(`Gift from ${user.name} (id: ${user_id}) to ${recipient.name} (id: ${recipient.user_id}) via pixel (${x}, ${y})`);
}
