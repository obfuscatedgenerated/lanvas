import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = async ({pool, payload, io, socket, stats, manual_stat_keys}) => {
    const user = socket.user!;

    if (typeof payload !== "string") {
        return;
    }

    if (!stats.has(payload)) {
        console.log(`Stat key ${payload} does not exist, cannot delete via admin_delete_manual_stat`);
        return;
    }

    if (!manual_stat_keys.has(payload)) {
        console.log(`Stat key ${payload} is not marked as manual, cannot delete via admin_delete_manual_stat`);
        return;
    }

    // delete from database
    try {
        await pool.query(
            `DELETE FROM stats WHERE key = $1`,
            [payload]
        );
        console.log(`Manual stat ${payload} deleted from database by admin ${user.name} (id: ${user.sub})`);

        // update in-memory stats cache
        stats.delete(payload);
        manual_stat_keys.delete(payload);

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
        console.error("Database error during deleting manual stat:", db_error);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
