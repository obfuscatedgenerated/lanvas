import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {force_chaos_round} from "@/server/chaos";

export const handler: SocketHandlerFunction = ({io, socket, pool}) => {
    const user = socket.user!;

    const result = force_chaos_round({io, pool});

    console.log(`Admin ${user.name} (id: ${user.sub}) forced a chaos round: ${result}`);
    socket.emit("chaos_forced", {result});
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
