import type {SocketHandlerFunction} from "@/server/types";

import {get_pranks_for} from "@/server/pranks";

// lets a client (re)sync the pranks currently affecting it on connect, so reloads and late joins can't dodge one
export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    socket.emit("pranks", get_pranks_for(user.sub));
}
