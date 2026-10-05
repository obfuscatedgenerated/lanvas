import type {SocketHandlerFunction} from "@/server/types";
import {get_gift_info} from "@/server/gifts";

export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    socket.emit("gift_info", get_gift_info(user.sub));
}
