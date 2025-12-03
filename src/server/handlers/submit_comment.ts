import type {SocketHandlerFunction} from "@/server/types";
import {get_grid_size} from "@/server/grid";

import type {Author, Comment} from "@/types";
import {is_user_banned} from "@/server/banlist";

export const handler: SocketHandlerFunction = ({io, payload, socket}) => {
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

    const author: Author = {
        user_id: user.sub!,
        name: user.name || "Unknown",
        avatar_url: user.picture || null,
    };

    // trim the x and y to 3 decimal places to minimise packet size
    const trimmed_x = Math.round((x + Number.EPSILON) * 1000) / 1000;
    const trimmed_y = Math.round((y + Number.EPSILON) * 1000) / 1000;

    console.log(`[${author.name} (${author.user_id})] (${trimmed_x}, ${trimmed_y}): ${comment}`);

    // TODO: comment rate limiting
    // TODO: check text appropriateness with tensorflow toxicity model or basic dictionary filter
    // TODO: persist to memory within timespan
    // TODO: should it support admin anonymous comments?

    io.emit("comment", {
        comment,
        x: trimmed_x,
        y: trimmed_y,
        author,
    } as Comment);
}
