import type {Server} from "socket.io";

import type {Author, GiftInfo, HeldGift} from "@/types";

import {get_config} from "@/server/config";
import {CONFIG_KEY_GIFT_BURST_GAP_MS, CONFIG_KEY_GIFT_EXPIRY_MS} from "@/consts";
import {DEFAULT_GIFT_EXPIRY_MS, DEFAULT_GIFT_BURST_GAP_MS} from "@/defaults";
import snowflake from "@/snowflake";

// user id to the gifts they currently hold, soonest expiring first
const held_gifts = new Map<string, HeldGift[]>();

// user id to the last time they spent a gift, to enforce a gap between burst placements
const last_gift_use = new Map<string, number>();

export const user_room = (user_id: string): string => `user:${user_id}`;

// drop expired or empty gifts for a user, returning what's left
const prune_gifts = (user_id: string): HeldGift[] => {
    const gifts = held_gifts.get(user_id);
    if (!gifts) {
        return [];
    }

    const current_time = Date.now();
    const remaining = gifts.filter(gift => gift.expires > current_time && gift.amount > 0);

    if (remaining.length === 0) {
        held_gifts.delete(user_id);
    } else {
        held_gifts.set(user_id, remaining);
    }

    return remaining;
}

const sum_amounts = (gifts: HeldGift[]): number => gifts.reduce((total, gift) => total + gift.amount, 0);

export const get_gift_balance = (user_id: string): number => sum_amounts(prune_gifts(user_id));

export const get_gift_info = (user_id: string): GiftInfo => {
    const gifts = prune_gifts(user_id);

    const burst_gap_ms = get_config(CONFIG_KEY_GIFT_BURST_GAP_MS, DEFAULT_GIFT_BURST_GAP_MS);
    const last_use = last_gift_use.get(user_id);

    return {
        balance: sum_amounts(gifts),
        next_expiry: gifts.length > 0 ? gifts[0].expires : null,
        gifts,
        burst_remaining_ms: last_use === undefined ? 0 : Math.max(0, last_use + burst_gap_ms - Date.now()),
        burst_gap_ms,
    };
}

export const give_gift = (to_id: string, from: Author, amount = 1, id = snowflake.generate().toString()): HeldGift => {
    const gift: HeldGift = {
        id,
        from,
        amount,
        expires: Date.now() + get_config(CONFIG_KEY_GIFT_EXPIRY_MS, DEFAULT_GIFT_EXPIRY_MS),
    };

    const gifts = prune_gifts(to_id);
    gifts.push(gift);
    gifts.sort((first, second) => first.expires - second.expires);
    held_gifts.set(to_id, gifts);

    return gift;
}

export type ConsumeGiftResult =
    | {status: "consumed"; gift: HeldGift}
    | {status: "none"}
    | {status: "burst_gap"};

// spend one pixel from the soonest expiring gift
export const consume_gift = (user_id: string): ConsumeGiftResult => {
    const gifts = prune_gifts(user_id);
    if (gifts.length === 0) {
        return {status: "none"};
    }

    const current_time = Date.now();
    const last_use = last_gift_use.get(user_id);

    if (last_use !== undefined && current_time - last_use < get_config(CONFIG_KEY_GIFT_BURST_GAP_MS, DEFAULT_GIFT_BURST_GAP_MS)) {
        return {status: "burst_gap"};
    }

    const gift = gifts[0];
    gift.amount--;
    last_gift_use.set(user_id, current_time);

    prune_gifts(user_id);

    return {status: "consumed", gift};
}

// give back a spent pixel, e.g. if the placement failed to persist
export const refund_gift = (user_id: string, gift: HeldGift): void => {
    if (gift.expires <= Date.now()) {
        return;
    }

    const gifts = prune_gifts(user_id);
    gift.amount++;

    if (!gifts.includes(gift)) {
        gifts.push(gift);
        gifts.sort((first, second) => first.expires - second.expires);
        held_gifts.set(user_id, gifts);
    }

    last_gift_use.delete(user_id);
}

// prune every user's gifts, returning the ids of users who lost any
export const cleanup_expired_gifts = (): string[] => {
    const affected_user_ids: string[] = [];

    for (const [user_id, gifts] of held_gifts.entries()) {
        const count_before = gifts.length;

        if (prune_gifts(user_id).length !== count_before) {
            affected_user_ids.push(user_id);
        }
    }

    const current_time = Date.now();
    for (const [user_id, last_use] of last_gift_use.entries()) {
        if (current_time - last_use >= DEFAULT_GIFT_BURST_GAP_MS) {
            last_gift_use.delete(user_id);
        }
    }

    return affected_user_ids;
}

export const emit_gift_info = (io: Server, user_id: string): void => {
    io.to(user_room(user_id)).emit("gift_info", get_gift_info(user_id));
}
