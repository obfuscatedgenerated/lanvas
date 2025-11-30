import type {Pool} from "pg";
import type {Server, Socket} from "socket.io";
import type {JWT} from "next-auth/jwt";

import type {Author} from "@/types";

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
    payload: any;

    // TODO: move these to singletons. for now will send all relevant data references as context
    timeouts: {[user_id: string]: {
            started: number;
            ends: number;
        }};
    connected_users: Set<ConnectedUserDetails>;
    unique_connected_user_ids: Set<string>;
    stats: Map<string, number>;
    manual_stat_keys: Set<string>;
}

export type SocketHandlerFunction = (context: SocketHandlerContext) => Promise<void> | void;

export interface SocketHandlerFlags {
    require_admin?: boolean;
}

export interface SocketHandler {
    handler: SocketHandlerFunction;
    flags?: SocketHandlerFlags;
}
