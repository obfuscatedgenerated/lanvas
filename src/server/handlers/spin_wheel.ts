import type {SocketHandlerFunction} from "@/server/types";
import type {Author} from "@/types";

import {get_config} from "@/server/config";
import {
    CONFIG_KEY_ADMIN_GOD,
    CONFIG_KEY_CASINO_ENABLED,
    CONFIG_KEY_CASINO_TIMEOUT_MS,
    CONFIG_KEY_READONLY
} from "@/consts";
import {DEFAULT_ADMIN_GOD, DEFAULT_CASINO_ENABLED, DEFAULT_CASINO_TIMEOUT_MS} from "@/defaults";

import {is_user_banned} from "@/server/banlist";
import {activity_check_in} from "@/server/afk";
import {
    casino_timeout_user,
    get_calculated_casino_timeout,
    get_calculated_pixel_timeout,
    is_user_in_casino_timeout,
    is_user_in_pixel_timeout,
    pixel_timeout_user,
} from "@/server/timeouts";
import {consume_gift, emit_gift_info, user_room} from "@/server/gifts";
import {spin} from "@/server/casino";

// wager a pixel on the wheel: checks, wager and timeout all happen synchronously before spinning, so double clicks can't both get through

export const handler: SocketHandlerFunction = ({socket, io, pool, connected_users}) => {
    if (!get_config(CONFIG_KEY_CASINO_ENABLED, DEFAULT_CASINO_ENABLED)) {
        socket.emit("spin_rejected", {reason: "disabled"});
        return;
    }

    if (get_config(CONFIG_KEY_READONLY, false)) {
        socket.emit("spin_rejected", {reason: "readonly"});
        return;
    }

    const user = socket.user;
    if (!user || !user.sub || !user.name) {
        socket.emit("spin_rejected", {reason: "unauthenticated"});
        return;
    }

    const user_id = user.sub;
    if (is_user_banned(user_id)) {
        socket.emit("spin_rejected", {reason: "banned"});
        return;
    }

    activity_check_in(user_id);

    const is_admin = user_id === process.env.DISCORD_ADMIN_USER_ID;
    const god = is_admin && get_config(CONFIG_KEY_ADMIN_GOD, DEFAULT_ADMIN_GOD);

    if (!god && is_user_in_casino_timeout(user_id)) {
        socket.emit("spin_rejected", {reason: "spin_timeout", timeout: get_calculated_casino_timeout(user_id)});
        return;
    }

    // the wager costs exactly what a placement does: your ready pixel first, otherwise a held gift
    if (!god) {
        if (!is_user_in_pixel_timeout(user_id)) {
            pixel_timeout_user(user_id);
            io.to(user_room(user_id)).emit("timeout_info", get_calculated_pixel_timeout(user_id));
        } else {
            const gift_result = consume_gift(user_id);

            if (gift_result.status === "burst_gap") {
                socket.emit("spin_rejected", {reason: "burst_gap"});
                return;
            }

            if (gift_result.status === "none") {
                socket.emit("spin_rejected", {reason: "no_pixel", timeout: get_calculated_pixel_timeout(user_id)});
                return;
            }

            emit_gift_info(io, user_id);
        }

        casino_timeout_user(user_id, get_config(CONFIG_KEY_CASINO_TIMEOUT_MS, DEFAULT_CASINO_TIMEOUT_MS));
    }

    const spinner: Author = {
        user_id,
        name: user.name,
        avatar_url: user.picture || null,
    };

    const outcome = spin({io, pool, spinner, connected_users});

    // the spinner's wheel starts turning now, everyone else hears the result once it lands
    io.to(user_room(user_id)).emit("spin_started", {
        segment_id: outcome.segment_id,
        tease_segment_id: outcome.tease_segment_id ?? null,
        casino_timeout: get_calculated_casino_timeout(user_id),
    });

    console.log(`${user.name} (id: ${user_id}) spun the wheel and will land on ${outcome.id}`);
}
