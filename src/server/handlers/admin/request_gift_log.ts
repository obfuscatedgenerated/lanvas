import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";
import type {GiftLogEntry} from "@/types";

import snowflake from "@/snowflake";

const DEFAULT_GIFT_LOG_LIMIT = 100;
const MAX_GIFT_LOG_LIMIT = 500;

interface GiftLogRow {
    snowflake: string;
    from_id: string;
    from_name: string | null;
    to_id: string;
    to_name: string | null;
    amount: number;
    used: string;
}

// send the most recent gifts, newest first, with how many of each gift's pixels have been placed
export const handler: SocketHandlerFunction = async ({socket, pool, payload}) => {
    const requested_limit = typeof payload?.limit === "number" ? payload.limit : DEFAULT_GIFT_LOG_LIMIT;
    const limit = Math.min(Math.max(1, Math.floor(requested_limit)), MAX_GIFT_LOG_LIMIT);

    try {
        const result = await pool.query<GiftLogRow>(
            `SELECT
                gift_log.snowflake,
                gift_log.from_id,
                sender.username AS from_name,
                gift_log.to_id,
                receiver.username AS to_name,
                gift_log.amount,
                (SELECT COUNT(*) FROM pixels WHERE pixels.gift_snowflake = gift_log.snowflake) AS used
            FROM gift_log
                LEFT JOIN user_details AS sender ON sender.user_id = gift_log.from_id
                LEFT JOIN user_details AS receiver ON receiver.user_id = gift_log.to_id
            ORDER BY gift_log.snowflake DESC
            LIMIT $1`,
            [limit]
        );

        const entries: GiftLogEntry[] = result.rows.map((row) => ({
            id: row.snowflake,
            timestamp: snowflake.timestampFrom(row.snowflake),
            from: {user_id: row.from_id, name: row.from_name},
            to: {user_id: row.to_id, name: row.to_name},
            amount: row.amount,
            used: parseInt(row.used, 10),
        }));

        socket.emit("gift_log", entries);
    } catch (db_error) {
        console.error("Database error while fetching gift log:", db_error);
        socket.emit("gift_log_error");
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
