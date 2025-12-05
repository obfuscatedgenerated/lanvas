import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = ({io, payload}) => {
    const {message, persist} = payload;
    if (typeof message !== "string" || typeof persist !== "boolean") {
        return;
    }

    if (typeof payload.duration_ms !== "undefined" && typeof payload.duration_ms !== "number") {
        return;
    }

    // TODO: store persistent messages in database and send to clients on connection

    // broadcast the admin message to all clients
    io.emit("admin_message", {message, persist, duration_ms: payload.duration_ms});
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
