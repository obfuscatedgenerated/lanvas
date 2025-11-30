import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = async ({payload, banned_user_ids, pool, socket}) => {
    const user = socket.user!;

    // check for user_id in payload
    const {user_id} = payload;
    if (typeof user_id !== "string" || !user_id) {
        return;
    }

    // validate bigint
    try {
        if (user_id !== String(BigInt(user_id))) {
            console.log(`Got invalid bigint ${user_id}`);
            return;
        }
    } catch (err) {
        console.log(`Got invalid bigint ${user_id} with error: ${err}`);
        return;
    }

    const index = banned_user_ids.indexOf(user_id);
    if (index !== -1) {
        banned_user_ids.splice(index, 1);
        console.log(`User id ${user_id} unbanned by admin ${user.name} (id: ${user.sub})`);

        // also remove from database
        try {
            await pool.query(
                `DELETE FROM banned_user_ids WHERE user_id = $1`,
                [user_id]
            );
            console.log(`User id ${user_id} removed from banned_user_ids table`);
        } catch (db_error) {
            console.error("Database error during unbanning user, please remove from DB manually to ensure the unban is kept:", db_error);
        }
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
