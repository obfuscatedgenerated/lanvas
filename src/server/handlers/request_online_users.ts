import type {SocketHandlerFunction} from "@/server/types";
import type {OnlineUser} from "@/types";

import {is_user_active} from "@/server/afk";
import {get_config} from "@/server/config";

// send the requester a deduplicated list of other users currently on the canvas, and subscribe them to activity changes
export const handler: SocketHandlerFunction = ({socket, connected_users}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    if (!get_config("gifting_enabled")) {
        socket.emit("online_users", []);
        return;
    }

    const online_users = new Map<string, OnlineUser>();

    for (const connected of connected_users) {
        // a user can have several tabs open, and only canvas viewers can actually spend a gift
        if (!connected.user_id || connected.user_id === user.sub || connected.context !== "/" || online_users.has(connected.user_id)) {
            continue;
        }

        online_users.set(connected.user_id, {
            user_id: connected.user_id,
            name: connected.username || "Unknown",
            avatar_url: connected.avatar_url ?? null,
            is_active: is_user_active(connected.user_id),
        });
    }

    socket.join("online_users");
    socket.emit("online_users", Array.from(online_users.values()));
}
