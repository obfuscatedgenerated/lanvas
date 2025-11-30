import type { SocketHandlerFunction } from "@/server/types";

export const handler: SocketHandlerFunction = ({socket, timeouts}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const timeout = timeouts[user.sub];
    const current_time = Date.now();
    if (timeout && timeout.ends > current_time) {
        const remaining = timeout.ends - current_time;
        const elapsed = current_time - timeout.started;

        socket.emit("timeout_info", {
            started: timeout.started,
            remaining,
            elapsed,
            ends: timeout.ends,
            checked_at: current_time
        });
    }
}
