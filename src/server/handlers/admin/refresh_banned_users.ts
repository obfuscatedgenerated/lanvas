import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {
    get_banned_user_ids,
    get_banned_usernames_cache,
    load_banned_users,
    overwrite_banned_user_ids, overwrite_banned_usernames_cache
} from "@/server/banlist";

export const handler: SocketHandlerFunction = async ({pool, socket}) => {
    // reload banned users from database
    // TODO: instead of affecting global value and reverting, use a staging value
    const old_banned_user_ids = get_banned_user_ids(true);
    const old_banned_usernames_cache = get_banned_usernames_cache(true);
    try {
        console.log("Reloading banned users from database...");

        const ban_count = await load_banned_users(pool);
        console.log(`Reloaded ${ban_count} banned users from database.`);

        // send the updated list of banned user ids back to the requester
        socket.emit("banned_user_ids", get_banned_user_ids());
    } catch (db_error) {
        console.error("Database error during reloading banned users, keeping old list:", db_error);
        overwrite_banned_user_ids(old_banned_user_ids);
        overwrite_banned_usernames_cache(old_banned_usernames_cache);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
