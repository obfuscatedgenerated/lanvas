import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = async ({payload, banned_user_ids, banned_usernames_cache, pool, socket}) => {
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

    // add to banned list if not already present
    if (!banned_user_ids.includes(user_id)) {
        banned_user_ids.push(user_id);
        console.log(`User id ${user_id} banned by admin ${user.name} (id: ${user.sub})`);

        // look up the username, assuming we have it
        let username = null;
        try {
            const res = await pool.query("SELECT username FROM user_details WHERE user_id = $1", [user_id]);
            if (res.rows.length > 0) {
                console.log(`Banned user id ${user_id} corresponds to username: ${res.rows[0].username}`);
                username = res.rows[0].username;
            } else {
                console.log(`Banned user id ${user_id} has no known username in the database.`);
            }
        } catch (db_error) {
            console.error("Database error during fetching banned user's username:", db_error);
        }

        // TODO wasnt here before but seems necessary? check if that's correct
        banned_usernames_cache[user_id] = username;

        // also add to database
        try {
            await pool.query(
                `INSERT INTO banned_user_ids (user_id, username_at_ban) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
                [user_id, username]
            );
            console.log(`User id ${user_id} added to banned_user_ids table`);
        } catch (db_error) {
            console.error("Database error during banning user, please add to DB manually to ensure the ban is kept:", db_error);
        }
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
