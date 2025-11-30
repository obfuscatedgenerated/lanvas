import type {Pool} from "pg";

// TODO: why not just use the banned username cache keys with null value if dont know the username? also why not use a map?
let banned_user_ids: string[] = [];
let banned_usernames_cache: {[user_id: string]: string} = {};

export const load_banned_users = async (pool: Pool) => {
    banned_user_ids = [];
    banned_usernames_cache = {};

    const banned_users_res = await pool.query("SELECT user_id, username_at_ban FROM banned_user_ids");
    for (const row of banned_users_res.rows) {
        banned_user_ids.push(row.user_id);
        banned_usernames_cache[row.user_id] = row.username_at_ban;
    }

    return banned_user_ids.length;
}

export const get_banned_user_ids = (clone = false): string[] => {
    if (clone) {
        return banned_user_ids.slice();
    }

    return banned_user_ids;
}

export const is_user_banned = (user_id: string): boolean => {
    return banned_user_ids.includes(user_id);
}

export const ban_user = (user_id: string, username_at_ban: string | null) => {
    if (!is_user_banned(user_id)) {
        banned_user_ids.push(user_id);

        if (username_at_ban) {
            banned_usernames_cache[user_id] = username_at_ban;
        }
    }
}

export const unban_user = (user_id: string) => {
    const index = banned_user_ids.indexOf(user_id);
    if (index !== -1) {
        banned_user_ids.splice(index, 1);
        delete banned_usernames_cache[user_id];
    }
}

export const get_banned_usernames_cache = (clone = false): {[user_id: string]: string} => {
    if (clone) {
        return structuredClone(banned_usernames_cache);
    }

    return banned_usernames_cache;
}

export const lookup_banned_username = (user_id: string): string | undefined => {
    return banned_usernames_cache[user_id];
}

export const overwrite_banned_user_ids = (new_banned_user_ids: string[]) => {
    banned_user_ids = new_banned_user_ids;
}

export const overwrite_banned_usernames_cache = (new_banned_usernames_cache: {[user_id: string]: string}) => {
    banned_usernames_cache = new_banned_usernames_cache;
}

// TODO: move ban persistence logic here rather than in ban/unban handlers

