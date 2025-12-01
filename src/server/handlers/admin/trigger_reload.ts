import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

export const handler: SocketHandlerFunction = ({io}) => {
    // broadcast the reload request to all clients
    io.emit("reload");
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
}
