import type { SocketHandlerFunction, SocketHandlerFlags } from "@/server/types";

import {get_config_raw} from "@/server/config";

export const handler: SocketHandlerFunction = ({socket, payload}) => {
    if (!payload || typeof payload !== "string") {
        return;
    }

    socket.emit("config_value", {key: payload, value: get_config_raw(payload) });
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
