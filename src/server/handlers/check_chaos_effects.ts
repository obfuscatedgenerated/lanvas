import type {SocketHandlerFunction} from "@/server/types";

import {get_active_chaos_effects} from "@/server/chaos";

// lets a client (re)sync the list of currently active chaos effects on connect
export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("chaos_effects", get_active_chaos_effects());
}
