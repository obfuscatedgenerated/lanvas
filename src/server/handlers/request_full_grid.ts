import type { SocketHandlerFunction } from "@/server/types";

// send full grid data to client when requested

export const handler: SocketHandlerFunction = ({socket, grid_data}) => {
    console.log(`Full grid requested by: ${socket.id}`);
    socket.emit("full_grid", grid_data);
}
