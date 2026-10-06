import type {Server} from "socket.io";
import type {Pool} from "pg";

import type {Author, GiftLogEntry, WheelSegment} from "@/types";
import type {ConnectedUserDetails} from "@/server/types";

import {get_config, set_config} from "@/server/config";
import {CONFIG_KEY_CASINO_POT, CONFIG_KEY_CASINO_POT_SEED} from "@/consts";

import {get_active_users} from "@/server/afk";
import {emit_gift_info, give_gift, user_room} from "@/server/gifts";
import snowflake from "@/snowflake";
import {DEFAULT_CASINO_POT_SEED} from "@/defaults";

// must match the client wheel's spin duration, so nobody hears the result before the spinner's wheel stops
const REVEAL_DELAY_MS = 4500;

const GIFT_BOMB_RECIPIENTS = 3;
const CLOWNED_DURATION_MS = 2 * 60 * 1000;

// sentinel user that house payouts come from, excluded from generosity stats
export const HOUSE_AUTHOR: Author = {
    user_id: "0",
    name: "The House",
    avatar_url: "/house.png",
};

export interface CasinoContext {
    io: Server;
    pool: Pool;
    spinner: Author;
    connected_users: Set<ConnectedUserDetails>;
}

export type CasinoOutcomeKind = "win" | "weird" | "bust";

export interface CasinoOutcome {
    id: string;
    kind: CasinoOutcomeKind;
    weight: number;

    // the slice the wheel finally lands on
    segment_id: string;

    // a slice the wheel lands on first before creeping to segment_id, for the rigged bust
    tease_segment_id?: string;

    // ordinary results go to the quiet feed, rare ones get the big banner
    announce: "feed" | "banner";

    // performs the effect and returns the text everyone sees
    apply: (context: CasinoContext) => Promise<string> | string;
}

export const get_pot_seed = (): number => get_config(CONFIG_KEY_CASINO_POT_SEED, DEFAULT_CASINO_POT_SEED);
export const get_pot = (): number => get_config(CONFIG_KEY_CASINO_POT, get_pot_seed());

// in-memory value updates immediately and the db write is best effort, then everyone watching is told
const set_pot = (io: Server, pool: Pool, value: number): void => {
    void set_config(pool, CONFIG_KEY_CASINO_POT, value, false);

    // keeps the admin page's pot input from going stale
    io.to("admin").emit("config_value", {key: CONFIG_KEY_CASINO_POT, value});

    // lets the casino popup show the pot live
    io.emit("casino_pot", value);
};

export const add_to_pot = (io: Server, pool: Pool, amount: number): number => {
    const new_pot = get_pot() + amount;
    set_pot(io, pool, new_pot);

    return new_pot;
};

// user id to when their clown badge wears off
const clowned_until = new Map<string, number>();

// remaining durations rather than timestamps, so client clock drift doesn't matter
export const get_clowned_users = (): {user_id: string; remaining_ms: number}[] => {
    const current_time = Date.now();
    const clowned: {user_id: string; remaining_ms: number}[] = [];

    for (const [user_id, until] of clowned_until.entries()) {
        if (until <= current_time) {
            clowned_until.delete(user_id);
            continue;
        }

        clowned.push({user_id, remaining_ms: until - current_time});
    }

    return clowned;
};


let house_user_ready: Promise<void> | null = null;

// the gift log joins on user details for names, so the house needs a row like everyone else
const ensure_house_user = (pool: Pool): Promise<void> => {
    if (!house_user_ready) {
        house_user_ready = pool.query(
            `INSERT INTO user_details (user_id, username, avatar_url)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url`,
            [HOUSE_AUTHOR.user_id, HOUSE_AUTHOR.name, HOUSE_AUTHOR.avatar_url]
        ).then(() => undefined).catch((db_error) => {
            // allow a retry on the next payout
            house_user_ready = null;
            console.error("Failed to create the house user:", db_error);
        });
    }

    return house_user_ready;
};

// log and hand out a gift exactly like a player gift, so it lands in the jar, banner and gift log
const give_pixels = async (context: CasinoContext, from: Author, to: Author, amount: number): Promise<void> => {
    const gift_snowflake = snowflake.generate();

    try {
        if (from.user_id === HOUSE_AUTHOR.user_id) {
            await ensure_house_user(context.pool);
        }

        await context.pool.query(
            "INSERT INTO gift_log (snowflake, from_id, to_id, amount) VALUES ($1, $2, $3, $4)",
            [gift_snowflake, from.user_id, to.user_id, amount]
        );
    } catch (db_error) {
        // a win shouldn't vanish because a stats row failed, so the gift still goes out
        console.error("Failed to log casino gift:", db_error);
    }

    give_gift(to.user_id, from, amount, gift_snowflake.toString());

    emit_gift_info(context.io, to.user_id);
    context.io.to(user_room(to.user_id)).emit("gift_received", {from, amount});

    const log_entry: GiftLogEntry = {
        id: gift_snowflake.toString(),
        timestamp: snowflake.timestampFrom(gift_snowflake),
        from: {user_id: from.user_id, name: from.name},
        to: {user_id: to.user_id, name: to.name},
        amount,
        used: 0,
    };

    context.io.to("admin").emit("gift_logged", log_entry);
};

// active, connected players other than the spinner, shuffled
const pick_random_players = (context: CasinoContext, count: number): Author[] => {
    const active_ids = new Set(get_active_users());
    const candidates = new Map<string, Author>();

    for (const connected of context.connected_users) {
        if (!connected.user_id || connected.user_id === context.spinner.user_id || !active_ids.has(connected.user_id) || candidates.has(connected.user_id)) {
            continue;
        }

        candidates.set(connected.user_id, {
            user_id: connected.user_id,
            name: connected.username || "Unknown",
            avatar_url: connected.avatar_url ?? null,
        });
    }

    const shuffled = Array.from(candidates.values());

    for (let index = shuffled.length - 1; index > 0; index--) {
        const swap_index = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swap_index]] = [shuffled[swap_index], shuffled[index]];
    }

    return shuffled.slice(0, count);
};


const SEGMENTS: Omit<WheelSegment, "weight">[] = [
    {id: "double", label: "×2", color: "#16a34a"},
    {id: "clowned", label: "🤡", color: "#dc2626"},
    {id: "duck", label: "🦆", color: "#ca8a04"},
    {id: "jackpot", label: "JACKPOT", color: "#eab308"},
    {id: "nothing", label: "Nothing", color: "#404040"},
    {id: "triple", label: "×3", color: "#15803d"},
    {id: "taxman", label: "Taxman", color: "#b91c1c"},
    {id: "gift_bomb", label: "Gift bomb", color: "#9333ea"},
];

const OUTCOMES: CasinoOutcome[] = [
    // wins: 30%
    {
        id: "double",
        kind: "win",
        weight: 16,
        segment_id: "double",
        announce: "feed",
        apply: async (context) => {
            await give_pixels(context, HOUSE_AUTHOR, context.spinner, 2);
            return `${context.spinner.name} doubled up! +2 pixels`;
        },
    },
    {
        id: "triple",
        kind: "win",
        weight: 8,
        segment_id: "triple",
        announce: "feed",
        apply: async (context) => {
            await give_pixels(context, HOUSE_AUTHOR, context.spinner, 3);
            return `${context.spinner.name} tripled up! +3 pixels`;
        },
    },
    {
        id: "gift_bomb",
        kind: "win",
        weight: 4,
        segment_id: "gift_bomb",
        announce: "banner",
        apply: async (context) => {
            const recipients = pick_random_players(context, GIFT_BOMB_RECIPIENTS);

            // nobody else around to bomb, so the spinner gets the generosity back instead
            if (recipients.length === 0) {
                await give_pixels(context, HOUSE_AUTHOR, context.spinner, 1);
                return `${context.spinner.name} tried to gift bomb an empty room, so the house gave them a pixel instead`;
            }

            for (const recipient of recipients) {
                await give_pixels(context, context.spinner, recipient, 1);
            }

            return `💣 ${context.spinner.name} gift bombed ${recipients.map((recipient) => recipient.name).join(", ")}!`;
        },
    },
    {
        id: "jackpot",
        kind: "win",
        weight: 2,
        segment_id: "jackpot",
        announce: "banner",
        apply: async (context) => {
            const payout = get_pot();
            set_pot(context.io, context.pool, get_pot_seed());

            await give_pixels(context, HOUSE_AUTHOR, context.spinner, payout);
            return `🎰 JACKPOT! ${context.spinner.name} won ${payout} pixels!`;
        },
    },

    // weird: 35%
    {
        id: "duck",
        kind: "weird",
        weight: 35,
        segment_id: "duck",
        announce: "banner",
        // the client sees outcome_id "duck" in casino_result and sends the duck waddling
        apply: (context) => `🦆 ${context.spinner.name} summoned a duck`,
    },
    // TODO: more weird outcomes

    // busts: 35%
    {
        id: "clowned",
        kind: "bust",
        weight: 10,
        segment_id: "clowned",
        announce: "feed",
        apply: (context) => {
            clowned_until.set(context.spinner.user_id, Date.now() + CLOWNED_DURATION_MS);
            context.io.emit("clowned", {user_id: context.spinner.user_id, remaining_ms: CLOWNED_DURATION_MS});

            return `🤡 ${context.spinner.name} got clowned`;
        },
    },
    {
        id: "taxman",
        kind: "bust",
        weight: 10,
        segment_id: "taxman",
        announce: "feed",
        // the bet itself is handed to someone named, so it's clear where it went
        apply: async (context) => {
            const [recipient] = pick_random_players(context, 1);

            if (!recipient) {
                add_to_pot(context.io, context.pool, 1);
                return `The taxman came for ${context.spinner.name}'s bet but found nobody to give it to, so it went in the pot`;
            }

            await give_pixels(context, context.spinner, recipient, 1);
            return `💸 The taxman took ${context.spinner.name}'s bet and gave it to ${recipient.name}`;
        },
    },
    {
        id: "nothing",
        kind: "bust",
        weight: 10,
        segment_id: "nothing",
        announce: "feed",
        apply: (context) => {
            const pot = add_to_pot(context.io, context.pool, 1);
            return `The house thanks ${context.spinner.name} for their contribution (pot: ${pot})`;
        },
    },
    {
        id: "rigged",
        kind: "bust",
        weight: 5,
        segment_id: "nothing",
        tease_segment_id: "jackpot",
        announce: "feed",
        apply: (context) => {
            const pot = add_to_pot(context.io, context.pool, 1);
            return `${context.spinner.name} hit the JACKPOT... wait, no (pot: ${pot})`;
        },
    },
];

export const get_wheel_segments = (): WheelSegment[] =>
    SEGMENTS.map((segment) => ({
        ...segment,
        weight: OUTCOMES
            .filter((outcome) => outcome.segment_id === segment.id)
            .reduce((total, outcome) => total + outcome.weight, 0),
    }));

const roll = (): CasinoOutcome => {
    const total_weight = OUTCOMES.reduce((total, outcome) => total + outcome.weight, 0);
    let remaining = Math.random() * total_weight;

    for (const outcome of OUTCOMES) {
        remaining -= outcome.weight;

        if (remaining <= 0) {
            return outcome;
        }
    }

    return OUTCOMES[OUTCOMES.length - 1];
};

export const spin = (context: CasinoContext): CasinoOutcome => {
    const outcome = roll();

    setTimeout(async () => {
        try {
            const message = await outcome.apply(context);

            context.io.emit("casino_result", {
                outcome_id: outcome.id,
                kind: outcome.kind,
                spinner: context.spinner,
                message,
                announce: outcome.announce,
            });

            // the spinner's popup shows its own result without needing to know who it's signed in as
            context.io.to(user_room(context.spinner.user_id)).emit("casino_own_result", {outcome_id: outcome.id, message});
        } catch (apply_error) {
            console.error(`Casino outcome ${outcome.id} failed:`, apply_error);
        }
    }, REVEAL_DELAY_MS);

    return outcome;
};
