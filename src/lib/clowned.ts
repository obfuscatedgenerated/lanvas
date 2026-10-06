"use client";

import {useSyncExternalStore} from "react";

// tiny client store of who's currently clowned, shared by every name on the page without prop drilling

const clowned_user_ids = new Set<string>();
const expiry_timeouts = new Map<string, NodeJS.Timeout>();
const listeners = new Set<() => void>();

const notify = () => {
    for (const listener of listeners) {
        listener();
    }
};

export const clown_user = (user_id: string, remaining_ms: number): void => {
    const existing_timeout = expiry_timeouts.get(user_id);
    if (existing_timeout) {
        clearTimeout(existing_timeout);
    }

    clowned_user_ids.add(user_id);

    expiry_timeouts.set(user_id, setTimeout(() => {
        clowned_user_ids.delete(user_id);
        expiry_timeouts.delete(user_id);
        notify();
    }, remaining_ms));

    notify();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const useIsClowned = (user_id: string | null | undefined): boolean =>
    useSyncExternalStore(
        subscribe,
        () => !!user_id && clowned_user_ids.has(user_id),
        () => false,
    );