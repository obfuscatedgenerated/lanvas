import type {SocketHandlerFunction} from "@/server/types";
import {get_grid_size} from "@/server/grid";

import type {Author, Comment} from "@/types";
import {is_user_banned} from "@/server/banlist";
import {apply_basic_censor, AutoModStatus, check_text} from "@/server/automod";
import {comment_timeout_user, get_calculated_comment_timeout, remove_comment_timeout} from "@/server/timeouts";

import {get_config} from "@/server/config";
import {
    CONFIG_KEY_ADMIN_GOD,
    CONFIG_KEY_AUTOMOD_ENABLED,
    CONFIG_KEY_CENSOR_ENABLED,
    CONFIG_KEY_COMMENTS_ENABLED
} from "@/consts";
import {DEFAULT_ADMIN_GOD, DEFAULT_AUTOMOD_ENABLED, DEFAULT_CENSOR_ENABLED, DEFAULT_COMMENTS_ENABLED} from "@/defaults";

export const handler: SocketHandlerFunction = async ({io, payload, socket}) => {
    const user = socket.user!;

    if (typeof payload !== "object") {
        return;
    }

    const {comment, x, y} = payload;
    if (typeof comment !== "string" || typeof x !== "number" || typeof y !== "number") {
        return;
    }

    // check comment length
    if (comment.length === 0 || comment.length > 100) {
        return;
    }

    // validate x and y are within bounds
    const {width, height} = get_grid_size();
    if (x < 0 || x >= width || y < 0 || y >= height) {
        return;
    }

    // check if comments are enabled
    const comments_enabled = get_config(CONFIG_KEY_COMMENTS_ENABLED, DEFAULT_COMMENTS_ENABLED);
    if (!comments_enabled) {
        socket.emit("comment_rejected", {reason: "disabled"});
        return;
    }

    // check if user is banned
    if (is_user_banned(user.sub!)) {
        socket.emit("comment_rejected", {reason: "banned"});
        return;
    }

    const is_admin = user.sub === process.env.DISCORD_ADMIN_USER_ID;
    const god = is_admin && get_config(CONFIG_KEY_ADMIN_GOD, DEFAULT_ADMIN_GOD);

    // check if rate limited
    if (!god) {
        const timeout = get_calculated_comment_timeout(user.sub!);
        if (timeout) {
            socket.emit("comment_rejected", {reason: "timeout", wait_time: timeout.remaining});
            return;
        }
    }

    comment_timeout_user(user.sub!);

    const censor_enabled = get_config(CONFIG_KEY_CENSOR_ENABLED, DEFAULT_CENSOR_ENABLED);
    let censored_comment = comment;
    if (censor_enabled) {
        censored_comment = apply_basic_censor(comment);
    }

    const automod_enabled = get_config(CONFIG_KEY_AUTOMOD_ENABLED, DEFAULT_AUTOMOD_ENABLED);
    if (automod_enabled) {
        // pass in the uncensored comment for automod checking to give the best chance of catching bad content
        const text_check = await check_text(comment);
        if (text_check.status === AutoModStatus.FLAGGED) {
            socket.emit("comment_rejected", {reason: "automod", labels: text_check.violating_labels, cache_hit: text_check.cache_hit});

            // cancel the timeout
            remove_comment_timeout(user.sub!);

            return;
        } else if (text_check.status === AutoModStatus.ERROR) {
            socket.emit("comment_rejected", {reason: "automod_error"});

            // cancel the timeout
            remove_comment_timeout(user.sub!);

            return;
        }
    }

    const author: Author = {
        user_id: user.sub!,
        name: user.name || "Unknown",
        avatar_url: user.picture || null,
    };

    // trim the x and y to 3 decimal places to minimise packet size
    const trimmed_x = Math.round((x + Number.EPSILON) * 1000) / 1000;
    const trimmed_y = Math.round((y + Number.EPSILON) * 1000) / 1000;

    // TODO: separate chat banning
    // TODO: persist to memory within timespan
    // TODO: should it support admin anonymous comments?

    io.emit("comment", {
        comment: censored_comment,
        x: trimmed_x,
        y: trimmed_y,
        author,
    } as Comment);
}

// TODO: should comments also check in with afk? or should it just be pixel placing that counts?
