import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {get_banned_user_ids, get_banned_usernames_cache} from "@/server/banlist";

export const handler: SocketHandlerFunction = async ({socket}) => {
    // send the list of banned user ids back to the requester
    socket.emit("banned_user_ids", get_banned_user_ids());

    // send the username cache object too. lazy approach but means very little tweaks to data caching here are made, and no expensive augmenting
    socket.emit("banned_usernames_cache", get_banned_usernames_cache());
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
