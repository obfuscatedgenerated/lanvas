import type {SocketHandlerFunction} from "@/server/types";

import {get_config} from "@/server/config";
import {CONFIG_KEY_READONLY} from "@/consts";
import {DEFAULT_READONLY} from "@/defaults";

export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("readonly", get_config(CONFIG_KEY_READONLY, DEFAULT_READONLY));
}
