import type { SocketHandlerFunction } from "@/server/types";

// join stats room and send current stats when requested

export const handler: SocketHandlerFunction = ({socket, stats}) => {
    if (socket.rooms.has("stats")) {
        return;
    }

    console.log(`Joining stats room: ${socket.id}`);
    socket.join("stats");
    socket.emit("stats", Object.fromEntries(stats));
}
