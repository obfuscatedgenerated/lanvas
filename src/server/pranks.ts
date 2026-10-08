import type {Server} from "socket.io";

import {user_room} from "@/server/gifts";


export type PrankID = "upside_down" | "rainbow" | "eraserhead" | "adware" | "invert" | "grayscale" | "glorp" | "no_glasses";

// all pranks currently last a minute; kept here as the single source of truth for client and server
const PRANK_DURATION_MS = 60_000;
export const prank_duration = (): number => PRANK_DURATION_MS;

const global_pranks = new Map<PrankID, number>(); // prank -> ends_at
const user_pranks = new Map<string, Map<PrankID, number>>(); // user id -> prank -> ends_at

const prune_global = (): void => {
    const now = Date.now();
    for (const [prank, ends_at] of global_pranks) {
        if (ends_at <= now) {
            global_pranks.delete(prank);
        }
    }
};

const prune_user = (user_id: string): void => {
    const personal = user_pranks.get(user_id);
    if (!personal) {
        return;
    }

    const now = Date.now();
    for (const [prank, ends_at] of personal) {
        if (ends_at <= now) {
            personal.delete(prank);
        }
    }

    if (personal.size === 0) {
        user_pranks.delete(user_id);
    }
};

export interface ActivePrank {
    prank: PrankID;
    remaining_ms: number;
}

export const get_pranks_for = (user_id: string): ActivePrank[] => {
    prune_global();
    prune_user(user_id);

    const ends_at_by_prank = new Map<PrankID, number>();

    for (const [prank, ends_at] of global_pranks) {
        ends_at_by_prank.set(prank, ends_at);
    }

    const personal = user_pranks.get(user_id);
    if (personal) {
        for (const [prank, ends_at] of personal) {
            ends_at_by_prank.set(prank, Math.max(ends_at, ends_at_by_prank.get(prank) ?? 0));
        }
    }

    const now = Date.now();
    return Array.from(ends_at_by_prank.entries()).map(([prank, ends_at]) => ({
        prank,
        remaining_ms: Math.max(0, ends_at - now),
    }));
};

// afflict a single user (e.g. the wheel spinner) and tell every tab they have open
export const prank_user = (io: Server, user_id: string, prank: PrankID, duration_ms: number = PRANK_DURATION_MS): void => {
    const personal = user_pranks.get(user_id) ?? new Map<PrankID, number>();
    personal.set(prank, Date.now() + duration_ms);
    user_pranks.set(user_id, personal);

    io.to(user_room(user_id)).emit("prank", {prank, remaining_ms: duration_ms});
};

// afflict everyone currently connected, and anyone who joins before it expires
export const prank_everyone = (io: Server, prank: PrankID, duration_ms: number = PRANK_DURATION_MS): void => {
    global_pranks.set(prank, Date.now() + duration_ms);
    io.emit("prank", {prank, remaining_ms: duration_ms});
};

// drop every global prank and tell clients to cancel them (used by chaos ceasefire / disable). per-user
// wheel pranks are left alone, since those aren't chaos's to undo.
export const clear_global_pranks = (io: Server): void => {
    for (const prank of global_pranks.keys()) {
        io.emit("prank", {prank, remaining_ms: 0});
    }

    global_pranks.clear();
};
