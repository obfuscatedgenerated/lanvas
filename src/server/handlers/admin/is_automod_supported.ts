import type { SocketHandlerFunction, SocketHandlerFlags } from "@/server/types";

import {is_automod_supported} from "@/server/automod";

export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("automod_support", is_automod_supported());
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
