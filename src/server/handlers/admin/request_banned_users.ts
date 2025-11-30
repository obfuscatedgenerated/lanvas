import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = async ({banned_user_ids, banned_usernames_cache, socket}) => {
    // send the list of banned user ids back to the requester
    socket.emit("banned_user_ids", banned_user_ids);

    // send the username cache object too. lazy approach but means very little tweaks to data caching here are made, and no expensive augmenting
    socket.emit("banned_usernames_cache", banned_usernames_cache);
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
