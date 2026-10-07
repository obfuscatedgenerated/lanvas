import type { SocketHandlerFunction } from "@/server/types";

import {get_visible_leaderboards} from "@/server/leaderboards";
import {get_visible_stats} from "@/server/feature_stats";

// join stats room and send current stats when requested

export const handler: SocketHandlerFunction = ({socket}) => {
    if (socket.rooms.has("stats")) {
        return;
    }

    console.log(`Joining stats room: ${socket.id}`);
    socket.join("stats");

    socket.emit("stats", get_visible_stats());
    socket.emit("leaderboards", get_visible_leaderboards());
}
