import type {SocketHandlerFunction} from "@/server/types";

import {get_config_raw, is_config_key_public} from "@/server/config";

export const handler: SocketHandlerFunction = ({socket, payload}) => {
    if (!payload || typeof payload !== "string") {
        return;
    }

    if (is_config_key_public(payload)) {
        socket.emit("config_value", {key: payload, value: get_config_raw(payload) });
    }
}
