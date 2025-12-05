import type {SocketHandlerFlags, SocketHandlerFunction} from "@/server/types";
import {delete_manual_stat, get_all_stats, get_all_stats_of_type, get_stat_type, StatKeyType} from "@/server/stats";

export const handler: SocketHandlerFunction = async ({pool, payload, io, socket}) => {
    if (typeof payload !== "string") {
        return;
    }

    const key_type = get_stat_type(payload);
    if (key_type !== StatKeyType.MANUAL) {
        console.log(`Stat key ${payload} does not exist or is not marked as manual, cannot delete via admin_delete_manual_stat`);
        return;
    }

    // delete from database
    try {
        await delete_manual_stat(pool, payload);

        // emit updated stats to all clients in stats room
        io.to("stats").emit("stats", Object.fromEntries(get_all_stats()));

        // emit updated manual stats to admin clients
        io.to("admin").emit("manual_stats", Object.fromEntries(get_all_stats_of_type(StatKeyType.MANUAL)));
    } catch (db_error) {
        console.error("Eerror during deleting manual stat:", db_error);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
