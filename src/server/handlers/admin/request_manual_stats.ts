import type {SocketHandlerFlags, SocketHandlerFunction} from "@/server/types";

import {get_all_stats_of_type, StatKeyType} from "@/server/stats";

export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("manual_stats", Object.fromEntries(get_all_stats_of_type(StatKeyType.MANUAL)));
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
