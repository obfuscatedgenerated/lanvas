import { get_config } from "@/server/config";

interface TimeoutSpan {
    started: number;
    ends: number;
}

interface CalculatedTimeoutData extends TimeoutSpan {
    remaining: number; // milliseconds
    elapsed: number; // milliseconds
    checked_at: number;
}

// user id to timeout span
const pixel_timeouts = new Map<string, TimeoutSpan>();
const comment_timeouts = new Map<string, TimeoutSpan>();
const casino_timeouts = new Map<string, TimeoutSpan>();

export const cleanup_timeouts = (): number => {
    const current_time = Date.now();
    let cleaned_count = 0;

    for (const [user_id, timeout] of pixel_timeouts.entries()) {
        if (timeout.ends <= current_time) {
            pixel_timeouts.delete(user_id);
            cleaned_count++;
        }
    }

    for (const [user_id, timeout] of comment_timeouts.entries()) {
        if (timeout.ends <= current_time) {
            comment_timeouts.delete(user_id);
            cleaned_count++;
        }
    }

    for (const [user_id, timeout] of casino_timeouts.entries()) {
        if (timeout.ends <= current_time) {
            casino_timeouts.delete(user_id);
            cleaned_count++;
        }
    }

    return cleaned_count;
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


export const get_pixel_timeout = (user_id: string): TimeoutSpan | null => {
    const timeout = pixel_timeouts.get(user_id);

    if (timeout) {
        const current_time = Date.now();
        if (timeout.ends > current_time) {
            return timeout;
        } else {
            // timeout expired, remove it
            pixel_timeouts.delete(user_id);
            return null;
        }
    }

    return null;
}

export const get_comment_timeout = (user_id: string): TimeoutSpan | null => {
    const timeout = comment_timeouts.get(user_id);

    if (timeout) {
        const current_time = Date.now();
        if (timeout.ends > current_time) {
            return timeout;
        } else {
            // timeout expired, remove it
            comment_timeouts.delete(user_id);
            return null;
        }
    }

    return null;
}

export const get_casino_timeout = (user_id: string): TimeoutSpan | null => {
    const timeout = casino_timeouts.get(user_id);

    if (timeout) {
        const current_time = Date.now();
        if (timeout.ends > current_time) {
            return timeout;
        } else {
            // timeout expired, remove it
            casino_timeouts.delete(user_id);
            return null;
        }
    }

    return null;
}


export const is_user_in_pixel_timeout = (user_id: string): boolean => {
    return get_pixel_timeout(user_id) !== null;
}

export const is_user_in_comment_timeout = (user_id: string): boolean => {
    return get_comment_timeout(user_id) !== null;
}

export const is_user_in_casino_timeout = (user_id: string): boolean => {
    return get_casino_timeout(user_id) !== null;
}


export const get_calculated_pixel_timeout = (user_id: string): CalculatedTimeoutData | null => {
    const timeout = get_pixel_timeout(user_id);
    if (timeout) {
        return calculate_timeout_data(timeout);
    }

    return null;
}

export const get_calculated_comment_timeout = (user_id: string): CalculatedTimeoutData | null => {
    const timeout = get_comment_timeout(user_id);
    if (timeout) {
        return calculate_timeout_data(timeout);
    }

    return null;
}

export const get_calculated_casino_timeout = (user_id: string): CalculatedTimeoutData | null => {
    const timeout = get_casino_timeout(user_id);
    if (timeout) {
        return calculate_timeout_data(timeout);
    }

    return null;
}


export const pixel_timeout_user = (user_id: string, duration_ms: number = get_config("pixel_timeout_ms")): TimeoutSpan => {
    const current_time = Date.now();

    const timeout: TimeoutSpan = {
        started: current_time,
        ends: current_time + duration_ms,
    };

    pixel_timeouts.set(user_id, timeout);
    return timeout;
}

export const comment_timeout_user = (user_id: string, duration_ms: number = get_config("comment_timeout_ms")): TimeoutSpan => {
    const current_time = Date.now();

    const timeout: TimeoutSpan = {
        started: current_time,
        ends: current_time + duration_ms,
    };

    comment_timeouts.set(user_id, timeout);
    return timeout;
}

export const casino_timeout_user = (user_id: string, duration_ms: number): TimeoutSpan => {
    const current_time = Date.now();

    const timeout: TimeoutSpan = {
        started: current_time,
        ends: current_time + duration_ms,
    };

    casino_timeouts.set(user_id, timeout);
    return timeout;
}


export const remove_pixel_timeout = (user_id: string): boolean => {
    return pixel_timeouts.delete(user_id);
}

export const remove_comment_timeout = (user_id: string): boolean => {
    return comment_timeouts.delete(user_id);
}

export const remove_casino_timeout = (user_id: string): boolean => {
    return casino_timeouts.delete(user_id);
}


export const get_all_pixel_timeouts = (clone = false): Map<string, TimeoutSpan> => {
    if (clone) {
        return new Map(pixel_timeouts);
    }

    return pixel_timeouts;
}

export const get_all_comment_timeouts = (clone = false): Map<string, TimeoutSpan> => {
    if (clone) {
        return new Map(comment_timeouts);
    }

    return comment_timeouts;
}

export const get_all_casino_timeouts = (clone = false): Map<string, TimeoutSpan> => {
    if (clone) {
        return new Map(casino_timeouts);
    }

    return casino_timeouts;
}
