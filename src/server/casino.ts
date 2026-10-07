import type {Server} from "socket.io";
import type {Pool} from "pg";

import type {Author, GiftLogEntry, WheelSegment} from "@/types";
import type {ConnectedUserDetails} from "@/server/types";

import {get_config, set_config} from "@/server/config";

import {get_active_users} from "@/server/afk";
import {emit_gift_info, give_gift, user_room} from "@/server/gifts";
import {prank_user} from "@/server/pranks";
import snowflake from "@/snowflake";
import {increment_virtual_stat} from "@/server/stats";
import {get_visible_stats} from "@/server/feature_stats";

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
    payout: number;
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

export const get_pot_seed = (): number => get_config("casino_pot_seed");
export const get_pot = (): number => get_config("casino_pot", get_pot_seed());

// in-memory value updates immediately and the db write is best effort, then everyone watching is told
const set_pot = (io: Server, pool: Pool, value: number): void => {
    void set_config(pool, "casino_pot", value);

    // keeps the admin page's pot input from going stale
    io.to("admin").emit("config_value", {key: "casino_pot", value});

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

// clown a batch of users for a given duration, reused by the casino's own clown outcome and by chaos mod
export const clown_users = (io: Server, user_ids: Iterable<string>, duration_ms: number): void => {
    const until = Date.now() + duration_ms;

    for (const user_id of user_ids) {
        clowned_until.set(user_id, until);
        io.emit("clowned", {user_id, remaining_ms: duration_ms});
    }
};

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
            "INSERT INTO gift_log (snowflake, from_id, to_id, amount, source) VALUES ($1, $2, $3, $4, 'casino')",
            [gift_snowflake, from.user_id, to.user_id, amount]
        );
    } catch (db_error) {
        // a win shouldn't vanish because a stats row failed, so the gift still goes out
        console.error("Failed to log casino gift:", db_error);
    }

    give_gift(to.user_id, from, amount, gift_snowflake.toString());

    if (from.user_id === HOUSE_AUTHOR.user_id && to.user_id === context.spinner.user_id) {
        context.payout += amount;
    }

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
    {id: "adware", label: "Adware", color: "#f97316"},
    {id: "upside_down", label: "uʍop ǝpᴉsd∩", color: "#0ea5e9"},
    {id: "rainbow", label: "Taste the rainbow", color: "#a855f7"},
    {id: "eraserhead", label: "Eraserhead", color: "#52525b"},
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
        weight: 15,
        segment_id: "duck",
        announce: "banner",
        // the client sees outcome_id "duck" in casino_result and sends the duck waddling for everyone
        apply: (context) => `🦆 ${context.spinner.name} summoned a duck`,
    },
    {
        id: "adware",
        kind: "weird",
        weight: 5,
        segment_id: "adware",
        announce: "feed",
        // popup spam for only the spinner for 1 min, persisted so a reload can't shake it off
        apply: (context) => {
            prank_user(context.io, context.spinner.user_id, "adware");
            return `💻 ${context.spinner.name} got adware (for 1 minute)`;
        },
    },
    {
        id: "upside_down",
        kind: "weird",
        weight: 5,
        segment_id: "upside_down",
        announce: "feed",
        // flip for only the spinner for 1 min, persisted so a reload can't undo it
        apply: (context) => {
            prank_user(context.io, context.spinner.user_id, "upside_down");
            return `🔄 ${context.spinner.name} got turned upside down (for 1 minute)`;
        },
    },
    {
        id: "rainbow",
        kind: "weird",
        weight: 5,
        segment_id: "rainbow",
        announce: "feed",
        // randomised colour picker for only the spinner for 1 min, persisted across reloads
        apply: (context) => {
            prank_user(context.io, context.spinner.user_id, "rainbow");
            return `🌈 ${context.spinner.name} is tasting the rainbow! (for 1 minute)`;
        },
    },
    {
        id: "eraserhead",
        kind: "weird",
        weight: 5,
        segment_id: "eraserhead",
        announce: "feed",
        // can only draw white for only the spinner for 1 min, persisted across reloads
        apply: (context) => {
            prank_user(context.io, context.spinner.user_id, "eraserhead");
            return `🎥 ${context.spinner.name} has become Eraserhead (for 1 minute)`;
        },
    },

    // busts: 35%
    {
        id: "clowned",
        kind: "bust",
        weight: 10,
        segment_id: "clowned",
        announce: "feed",
        apply: (context) => {
            clown_users(context.io, [context.spinner.user_id], CLOWNED_DURATION_MS);

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

// outcomes with their own counter on the stats page, created the first time each happens so nothing is spoiled early
const OUTCOME_STAT_KEYS: Record<string, string> = {
    jackpot: "casino_jackpots",
    duck: "ducks_summoned",
    clowned: "clownings",
    taxman: "taxman_collections",
};

// best effort, a spin still counts for the player even if its stats row can't be written
const record_spin = async (context: CasinoContext, outcome: CasinoOutcome): Promise<void> => {
    increment_virtual_stat("casino_spins", 1, true);

    const outcome_stat_key = OUTCOME_STAT_KEYS[outcome.id];
    if (outcome_stat_key) {
        increment_virtual_stat(outcome_stat_key, 1, true);
    }

    if (context.payout > 0) {
        increment_virtual_stat("casino_pixels_won", context.payout, true);
    }

    context.io.to("stats").emit("stats", get_visible_stats());

    try {
        await context.pool.query(
            "INSERT INTO casino_log (snowflake, user_id, outcome_id, kind, payout) VALUES ($1, $2, $3, $4, $5)",
            [snowflake.generate(), context.spinner.user_id, outcome.id, outcome.kind, context.payout]
        );
    } catch (db_error) {
        console.error("Failed to log casino spin:", db_error);
    }
};

export const spin = (base_context: Omit<CasinoContext, "payout">): CasinoOutcome => {
    const outcome = roll();
    const context: CasinoContext = {...base_context, payout: 0};

    setTimeout(async () => {
        try {
            const message = await outcome.apply(context);
            await record_spin(context, outcome);

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
