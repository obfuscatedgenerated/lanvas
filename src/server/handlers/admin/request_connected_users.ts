import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = async ({connected_users, socket}) => {
    // send the list of connected users back to the requester
    socket.emit("connected_users", Array.from(connected_users));
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
