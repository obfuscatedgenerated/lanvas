import type {Pool} from "pg";
import type {Server, Socket} from "socket.io";
import type {JWT} from "next-auth/jwt";

export interface ConnectedUserDetails {
    socket_id: string;
    user_id?: string;
    username?: string;
    context?: string;
}

export interface SocketWithJWT extends Socket {
    user?: JWT
}

export interface SocketHandlerContext {
    pool: Pool;
    socket: SocketWithJWT;
    io: Server;
    // TODO: use unknown or never and have handlers do their own assertions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;

    connected_users: Set<ConnectedUserDetails>;
    unique_connected_user_ids: Set<string>;
}

export type SocketHandlerFunction = (context: SocketHandlerContext) => Promise<void> | void;

export interface SocketHandlerFlags {
    require_admin?: boolean;
}

export interface SocketHandler {
    handler: SocketHandlerFunction;
    flags?: SocketHandlerFlags;
}
