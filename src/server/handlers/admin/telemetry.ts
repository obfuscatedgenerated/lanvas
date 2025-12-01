import type { SocketHandlerFunction, SocketHandlerFlags } from "@/server/types";

import register from "@/server/prometheus";

export const handler: SocketHandlerFunction = async ({socket}) => {
    socket.emit("metrics", await register.metrics());
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
