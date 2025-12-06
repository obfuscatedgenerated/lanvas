const AFK_TIMEOUT_MS = 60 * 1000; // 60 seconds

const active_users: Set<string> = new Set();
const user_timeouts: Map<string, NodeJS.Timeout> = new Map();

type ActivityChangeListener = (user_id: string, is_active: boolean) => void;
const activity_change_listeners: Set<ActivityChangeListener> = new Set();

export const activity_check_in = (user_id: string) => {
    const was_active = active_users.has(user_id);
    active_users.add(user_id);

    // clear any existing timeout for the user
    if (user_timeouts.has(user_id)) {
        clearTimeout(user_timeouts.get(user_id)!);
    }

    // schedule a new timeout to mark user as inactive
    const timeout = setTimeout(() => {
        active_users.delete(user_id);
        user_timeouts.delete(user_id);

        // invoke activity change listeners
        activity_change_listeners.forEach((listener) => {
            listener(user_id, false);
        });
    }, AFK_TIMEOUT_MS);

    user_timeouts.set(user_id, timeout);

    // invoke activity change listeners if user was previously inactive
    if (!was_active) {
        activity_change_listeners.forEach((listener) => {
            listener(user_id, true);
        });
    }
}

export const is_user_active = (user_id: string): boolean => {
    return active_users.has(user_id);
}

export const get_active_users = (): string[] => {
    return Array.from(active_users);
}

export const on_activity_change = (listener: ActivityChangeListener) => {
    activity_change_listeners.add(listener);
}

export const off_activity_change = (listener: ActivityChangeListener) => {
    activity_change_listeners.delete(listener);
}

// TODO: when user disconnects, clean up their timeout and active status
