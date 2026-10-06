import type {SocketHandlerFunction} from "@/server/types";

import {get_clowned_users} from "@/server/casino";

// so anyone joining mid-clown still sees the badges
export const handler: SocketHandlerFunction = ({socket}) => {
    socket.emit("clowned_users", get_clowned_users());
}