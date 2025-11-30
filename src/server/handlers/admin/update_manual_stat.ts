import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";
import {socket} from "@/socket";

export const handler: SocketHandlerFunction = async ({pool, payload, io, socket, stats, manual_stat_keys}) => {
    const user = socket.user!;

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
    if (stats.has(key) && !manual_stat_keys.has(key)) {
        console.log(`Stat key ${key} is not marked as manual, cannot update via admin_update_manual_stat`);
        return;
    }

    // update in database
    try {
        await pool.query(
            `INSERT INTO stats (key, value, manual) VALUES ($1, $2, true)
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, manual = EXCLUDED.manual`,
            [key, value]
        );
        console.log(`Manual stat ${key} updated to ${value} in database by admin ${user.name} (id: ${user.sub})`);

        // update in-memory stats cache
        stats.set(key, value);
        manual_stat_keys.add(key);

        // emit updated stats to all clients in stats room
        io.to("stats").emit("stats", Object.fromEntries(stats));

        // emit updated manual stats to admin clients
        const manual_stats: {[key: string]: number} = {};
        for (const manual_key of manual_stat_keys) {
            const stat_value = stats.get(manual_key);
            if (typeof stat_value === "number") {
                manual_stats[manual_key] = stat_value;
            }
        }

        io.to("admin").emit("manual_stats", manual_stats);
    } catch (db_error) {
        console.error("Database error during updating manual stat:", db_error);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
