import type {SocketHandlerFunction} from "@/server/types";
import {get_grid_size} from "@/server/grid";

import type {Author, Comment} from "@/types";
import {is_user_banned} from "@/server/banlist";
import {get_config} from "@/server/config";
import {CONFIG_KEY_AUTOMOD_ENABLED, CONFIG_KEY_COMMENT_TIMEOUT_MS} from "@/consts";
import {DEFAULT_AUTOMOD_ENABLED, DEFAULT_COMMENT_TIMEOUT_MS} from "@/defaults";
import {AutoModStatus, check_text} from "@/server/automod";

const comment_ratelimits = new Map<string, number>();

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

    // check if user is banned
    if (is_user_banned(user.sub!)) {
        socket.emit("comment_rejected", {reason: "banned"});
        return;
    }

    // check if rate limited
    // TODO: add comment rate limit duration to admin page
    // TODO: let admin bypass rate limit
    const now = Date.now();
    const last_comment_time = comment_ratelimits.get(user.sub!) || 0;
    const rate_limit = get_config(CONFIG_KEY_COMMENT_TIMEOUT_MS, DEFAULT_COMMENT_TIMEOUT_MS);

    if (now - last_comment_time < rate_limit) {
        socket.emit("comment_rejected", {reason: "rate_limited", retry_after_ms: rate_limit - (now - last_comment_time)});
        return;
    }

    const automod_enabled = get_config(CONFIG_KEY_AUTOMOD_ENABLED, DEFAULT_AUTOMOD_ENABLED);
    if (automod_enabled) {
        const text_check = await check_text(comment);
        if (text_check.status === AutoModStatus.FLAGGED) {
            console.warn(`Automod flagged (${text_check.violating_labels.join(", ")}): ${comment}`);
            socket.emit("comment_rejected", {reason: "automod"});
            return;
        } else if (text_check.status === AutoModStatus.ERROR) {
            socket.emit("comment_rejected", {reason: "automod_error"});
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

    console.log(`[${author.name} (${author.user_id})] (${trimmed_x}, ${trimmed_y}): ${comment}`);

    // TODO: separate chat banning
    // TODO: persist to memory within timespan
    // TODO: should it support admin anonymous comments?

    io.emit("comment", {
        comment,
        x: trimmed_x,
        y: trimmed_y,
        author,
    } as Comment);
}
