import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = ({io, payload}) => {
    const {message, persist} = payload;
    if (typeof message !== "string") {
        return;
    }

    // TODO: store persistent messages in database and send to clients on connection

    // broadcast the admin message to all clients
    io.emit("admin_message", {message, persist});
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
