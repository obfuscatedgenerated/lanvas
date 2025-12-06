import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {get_active_users} from "@/server/afk";

export const handler: SocketHandlerFunction = async ({socket}) => {
    socket.emit("active_users", get_active_users());
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
