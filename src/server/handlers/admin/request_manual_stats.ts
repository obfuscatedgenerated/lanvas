import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = ({socket, stats, manual_stat_keys}) => {
    // filter stats to only manual ones
    const manual_stats: {[key: string]: number} = {};
    for (const key of manual_stat_keys) {
        const value = stats.get(key);
        if (typeof value === "number") {
            manual_stats[key] = value;
        }
    }

    socket.emit("manual_stats", manual_stats);
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
