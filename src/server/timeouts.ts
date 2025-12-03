import { get_config } from "@/server/config";

import { CONFIG_KEY_PIXEL_TIMEOUT_MS } from "@/consts";
import { DEFAULT_PIXEL_TIMEOUT_MS } from "@/defaults";

interface TimeoutSpan {
    started: number;
    ends: number;
}

interface CalculatedTimeoutData extends TimeoutSpan {
    remaining: number; // milliseconds
    elapsed: number; // milliseconds
    checked_at: number;
}

const timeouts = new Map<string, TimeoutSpan>(); // user id to timeout span

export const cleanup_timeouts = (): number => {
    const current_time = Date.now();
    let cleaned_count = 0;
    for (const [user_id, timeout] of timeouts.entries()) {
        if (timeout.ends <= current_time) {
            timeouts.delete(user_id);
            cleaned_count++;
        }
    }

    return cleaned_count;
}

export const get_timeout = (user_id: string): TimeoutSpan | null => {
    const timeout = timeouts.get(user_id);

    if (timeout) {
        const current_time = Date.now();
        if (timeout.ends > current_time) {
            return timeout;
        } else {
            // timeout expired, remove it
            timeouts.delete(user_id);
            return null;
        }
    }

    return null;
}

export const is_user_in_timeout = (user_id: string): boolean => {
    return get_timeout(user_id) !== null;
}

export const calculate_timeout_data = (timeout_data: TimeoutSpan): CalculatedTimeoutData => {
    const current_time = Date.now();

    return {
        ...timeout_data,

        remaining: Math.max(0, timeout_data.ends - current_time),
        elapsed: Math.max(0, current_time - timeout_data.started),

        checked_at: current_time,
    };
}

export const get_calculated_timeout = (user_id: string): CalculatedTimeoutData | null => {
    const timeout = get_timeout(user_id);
    if (timeout) {
        return calculate_timeout_data(timeout);
    }

    return null;
}

export const timeout_user = (user_id: string, duration_ms: number = get_config(CONFIG_KEY_PIXEL_TIMEOUT_MS, DEFAULT_PIXEL_TIMEOUT_MS)): TimeoutSpan => {
    const current_time = Date.now();

    const timeout: TimeoutSpan = {
        started: current_time,
        ends: current_time + duration_ms,
    };

    timeouts.set(user_id, timeout);
    return timeout;
}

export const remove_timeout = (user_id: string): boolean => {
    return timeouts.delete(user_id);
}

export const get_all_timeouts = (clone = false): Map<string, TimeoutSpan> => {
    if (clone) {
        return new Map(timeouts);
    }

    return timeouts;
}
