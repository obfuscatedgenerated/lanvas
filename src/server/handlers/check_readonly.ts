import type {SocketHandlerFunction} from "@/server/types";

import {get_config} from "@/server/config";

export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("readonly", get_config("readonly"));
}
