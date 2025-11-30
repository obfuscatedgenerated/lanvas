import type { SocketHandlerFunction } from "@/server/types";

import {get_author_data} from "@/server/grid";

// send full author data to client when requested

export const handler: SocketHandlerFunction = ({socket}) => {
    console.log(`Full author data requested by: ${socket.id}`);
    socket.emit("full_author_data", get_author_data());
}
