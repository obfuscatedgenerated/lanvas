import type {SocketHandlerFunction} from "@/server/types";
import {get_calculated_casino_timeout} from "@/server/timeouts";

export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const timeout = get_calculated_casino_timeout(user.sub);
    socket.emit("casino_timeout_info", {
        remaining_ms: timeout ? timeout.remaining : 0,
        duration_ms: timeout ? timeout.ends - timeout.started : 0,
    });
}
