import type {SocketHandlerFunction} from "@/server/types";

import {activity_check_in} from "@/server/afk";

// well under the client's ping interval, so legitimate pings from several tabs are never dropped
const MIN_PING_INTERVAL_MS = 5000;

// user id to when their last ping was accepted
const last_ping_times = new Map<string, number>();

// call when a user's last connection closes so the map doesn't grow forever
export const forget_activity_ping = (user_id: string): void => {
    last_ping_times.delete(user_id);
}

// client heartbeat while the user is interacting with the canvas, keeping them marked as active
export const handler: SocketHandlerFunction = ({socket}) => {
    const user = socket.user;
    if (!user || !user.sub) {
        return;
    }

    const current_time = Date.now();
    const last_ping = last_ping_times.get(user.sub);

    if (last_ping !== undefined && current_time - last_ping < MIN_PING_INTERVAL_MS) {
        return;
    }

    last_ping_times.set(user.sub, current_time);
    activity_check_in(user.sub);
}
