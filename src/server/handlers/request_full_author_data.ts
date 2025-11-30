import type { SocketHandlerFunction } from "@/server/types";

// send full author data to client when requested

export const handler: SocketHandlerFunction = ({socket, author_data}) => {
    console.log(`Full author data requested by: ${socket.id}`);
    socket.emit("full_author_data", author_data);
}
