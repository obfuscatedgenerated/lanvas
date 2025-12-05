import type {SocketHandlerFlags, SocketHandlerFunction} from "@/server/types";
import {get_all_stats, get_all_stats_of_type, get_stat_type, set_db_stat, StatKeyType} from "@/server/stats";

export const handler: SocketHandlerFunction = async ({pool, payload, io}) => {
    const {key, value} = payload;
    if (typeof key !== "string" || typeof value !== "number" || isNaN(value)) {
        return;
    }

    if (key.length === 0) {
        console.log("Stat key cannot be empty, cannot update via admin_update_manual_stat");
        return;
    }

    if (key.length > 200) {
        console.log(`Stat key ${key} is too long, cannot update via admin_update_manual_stat`);
        return;
    }

    // if the stat key exists but is not marked as manual, reject the update
    // if it doesn't exist, we allow creating new manual stats
    const key_type = get_stat_type(key);
    if (key_type !== StatKeyType.MANUAL && key_type !== undefined) {
        console.log(`Stat key ${key} exists but is not marked as manual, cannot update via admin_update_manual_stat`);
        return;
    }

    // update in database
    try {
        await set_db_stat(pool, key, value, { create: true });

        // emit updated stats to all clients in stats room
        io.to("stats").emit("stats", Object.fromEntries(get_all_stats()));

        // emit updated manual stats to admin clients
        io.to("admin").emit("manual_stats", Object.fromEntries(get_all_stats_of_type(StatKeyType.MANUAL)));
    } catch (db_error) {
        console.error("Error during updating manual stat:", db_error);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
