import type { SocketHandlerFunction } from "@/server/types";
import {get_calculated_timeout} from "@/server/timeouts";

export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const timeout = get_calculated_timeout(user.sub);
    if (timeout) {
        socket.emit("timeout_info", timeout);
    }
}
