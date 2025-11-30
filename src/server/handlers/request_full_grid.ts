import type { SocketHandlerFunction } from "@/server/types";

import {get_grid_data} from "@/server/grid";

// send full grid data to client when requested

export const handler: SocketHandlerFunction = ({socket}) => {
    console.log(`Full grid requested by: ${socket.id}`);
    socket.emit("full_grid", get_grid_data());
}
