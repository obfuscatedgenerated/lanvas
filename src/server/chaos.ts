import type {Server} from "socket.io";
import type {Pool} from "pg";

import type {Author} from "@/types";

import {type ConfigKey, type ConfigValue, is_config_key_public} from "@/config_registry";
import {ConfigPersistStrategy, get_config, set_config} from "@/server/config";
import {end_poll, get_poll_source, get_vote_counts, get_poll_options, start_poll} from "@/server/polls";
import {get_active_users} from "@/server/afk";
import {clown_users} from "@/server/casino";
import {clear_global_pranks, prank_everyone, prank_duration} from "@/server/pranks";

interface ChaosContext {
    io: Server;
    pool: Pool;
}

interface ChaosEffect {
    id: string;
    label: string;
    available: () => boolean;
    activate: (context: ChaosContext) => void;
    // how long this effect should show as "active" in the UI. config effects last chaos_effect_ms; pranks
    // run on their own fixed client-side timers. omitted for instantaneous effects like ceasefire.
    active_ms?: () => number;
}

// a sentinel author so prank broadcasts that expect a spinner have a name to show
const CHAOS_AUTHOR: Author = {
    user_id: "0",
    name: "Chaos",
    avatar_url: null,
};

// temporary config overrides

const overrides = new Map<ConfigKey, {original: ConfigValue; timer: NodeJS.Timeout}>();
const apply_config_value = (context: ChaosContext, key: ConfigKey, value: ConfigValue): void => {
    // in-memory only: chaos is ephemeral and must not leak into the persisted config
    void set_config(context.pool, key, value as never, ConfigPersistStrategy.IN_MEMORY_ONLY);

    if (is_config_key_public(key)) {
        context.io.emit("config_value", {key, value});
    } else {
        context.io.to("admin").emit("config_value", {key, value});
    }
};

const override = (context: ChaosContext, key: ConfigKey, value: ConfigValue, duration_ms: number): void => {
    const existing = overrides.get(key);
    const original = existing ? existing.original : get_config(key);

    if (existing) {
        clearTimeout(existing.timer);
    }

    apply_config_value(context, key, value);

    const timer = setTimeout(() => {
        apply_config_value(context, key, original);
        overrides.delete(key);
    }, duration_ms);

    overrides.set(key, {original, timer});
};


// effect id to its label and when it wears off, so clients can show a live list with countdowns
const active_effects = new Map<string, {label: string; ends_at: number; timer: NodeJS.Timeout}>();

interface ActiveChaosEffect {
    id: string;
    label: string;
    remaining_ms: number;
}

// relative remaining rather than a timestamp, so client clock drift doesn't matter (like clowns/gifts)
export const get_active_chaos_effects = (): ActiveChaosEffect[] => {
    const now = Date.now();

    return Array.from(active_effects.entries()).map(([id, effect]) => ({
        id,
        label: effect.label,
        remaining_ms: Math.max(0, effect.ends_at - now),
    }));
};

const broadcast_active_effects = (context: ChaosContext): void => {
    context.io.emit("chaos_effects", get_active_chaos_effects());
};

// mark an effect active for a while, replacing any existing entry for the same id, and tell everyone
const add_active_effect = (context: ChaosContext, effect: ChaosEffect, duration_ms: number): void => {
    const existing = active_effects.get(effect.id);
    if (existing) {
        clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
        active_effects.delete(effect.id);
        broadcast_active_effects(context);
    }, duration_ms);

    active_effects.set(effect.id, {label: effect.label, ends_at: Date.now() + duration_ms, timer});
    broadcast_active_effects(context);
};

const clear_active_effects = (context: ChaosContext): void => {
    for (const {timer} of active_effects.values()) {
        clearTimeout(timer);
    }

    active_effects.clear();
    broadcast_active_effects(context);
};

// restore every live override immediately, used by the "ceasefire" effect and when chaos is turned off
const restore_all = (context: ChaosContext): void => {
    for (const [key, {original, timer}] of overrides) {
        clearTimeout(timer);
        apply_config_value(context, key, original);
    }

    overrides.clear();

    // calm restored: cancel the global pranks chaos inflicted (so they stop now and don't hit late joiners)
    clear_global_pranks(context.io);

    // and wipe the active-effects display
    clear_active_effects(context);
};

const effect_duration = (): number => get_config("chaos_effect_ms");

// effects

const casino_on = () => get_config("casino_enabled");
const comments_on = () => get_config("comments_enabled");
const gifting_on = () => get_config("gifting_enabled");


const casino_or_chaos = () => get_config("casino_enabled") || get_config("chaos_enabled");

// how long the duck invasion shows as active (ducks wander for ~this long)
const DUCK_MS = 40000;

const EFFECTS: ChaosEffect[] = [
    {
        id: "hyperspeed",
        label: "⚡ Hyperspeed - 1 second pixel cooldown for everyone",
        available: () => true,
        activate: (context) => {
            override(context, "pixel_timeout_ms", 1000, effect_duration());
            override(context, "cooldown_scaling_enabled", false, effect_duration());
        },
        active_ms: effect_duration,
    },
    {
        id: "molasses",
        label: "🐌 Molasses - 2 minute pixel cooldown for everyone",
        available: () => true,
        activate: (context) => {
            override(context, "pixel_timeout_ms", 2 * 60 * 1000, effect_duration());
            override(context, "cooldown_scaling_enabled", false, effect_duration());
        },
        active_ms: effect_duration,
    },
    {
        id: "ceasefire",
        label: "😌 Ceasefire - end all active chaos effects and restore calm",
        available: () => true,
        activate: (context) => restore_all(context),
    },

    {
        id: "gambleaware",
        label: "🎰 Gambleaware - spin the wheel almost nonstop (if you have pixels to spend)",
        available: casino_on,
        activate: (context) => override(context, "casino_timeout_ms", 2000, effect_duration()),
        active_ms: effect_duration,
    },

    {
        id: "motormouth",
        label: "💬 Motormouth - no chat cooldown",
        available: comments_on,
        activate: (context) => override(context, "comment_timeout_ms", 0, effect_duration()),
        active_ms: effect_duration,
    },
    {
        id: "vow_of_silence",
        label: "🤫 Vow of silence - 1 minute chat cooldown for everyone",
        available: comments_on,
        activate: (context) => override(context, "comment_timeout_ms", 60000, effect_duration()),
        active_ms: effect_duration,
    },

    {
        id: "topsy_turvy",
        label: "🔄 Topsy-turvy - flip everyone upside down",
        available: casino_or_chaos,
        activate: (context) => prank_everyone(context.io, "upside_down"),
        active_ms: prank_duration,
    },
    {
        id: "taste_the_rainbow",
        label: "🌈 Taste the rainbow - scramble everyone's colour picker",
        available: casino_or_chaos,
        activate: (context) => prank_everyone(context.io, "rainbow"),
        active_ms: prank_duration,
    },
    {
        id: "adware",
        label: "💻 Adware - everyone gets popups!",
        available: casino_or_chaos,
        activate: (context) => prank_everyone(context.io, "adware"),
        active_ms: prank_duration,
    },
    {
        id: "eraserhead",
        label: "🎥 Eraserhead - everyone can only paint white",
        available: casino_or_chaos,
        activate: (context) => prank_everyone(context.io, "eraserhead"),
        active_ms: prank_duration,
    },
    {
        id: "duck_invasion",
        label: "🦆 Duck invasion...",
        available: casino_or_chaos,
        active_ms: () => DUCK_MS,
        activate: (context) => {
            let n_ducks = 0;
            const interval = setInterval(() => {
                context.io.emit("casino_result", {
                    outcome_id: "duck",
                    kind: "weird",
                    spinner: CHAOS_AUTHOR,
                    message: "Chaos summoned a duck!",
                    announce: "feed",
                });

                n_ducks++;
                if (n_ducks >= 10) {
                    clearInterval(interval);
                }
            }, 1000);
        },
    }
];

// scheduler

let running = false;
let schedule_timer: NodeJS.Timeout | null = null;
let resolve_timer: NodeJS.Timeout | null = null;

// the effects offered in the current chaos poll, in option order, so a winning index maps back to an effect
let round_effects: ChaosEffect[] | null = null;

// how far chaos has escalated: climbs each resolved round, resets to calm on ceasefire or disable. drives
// a shorter interval and more simultaneous winners. capped so the numbers stay sane over a long session.
let intensity = 0;
const MAX_INTENSITY = 50;

// the gap before the next round, shortened as chaos ramps up (hyperbolic: fast at first, then flattening to
// the configured floor). with the ramp off it's just the base interval.
const effective_interval_ms = (): number => {
    const base = get_config("chaos_interval_ms");

    if (!get_config("chaos_ramp_enabled")) {
        return base;
    }

    return Math.max(get_config("chaos_min_interval_ms"), Math.round(base / (1 + intensity)));
};

// how many of the poll's top options to apply at once, growing one extra every couple of levels up to the cap
const effective_winner_count = (): number => {
    if (!get_config("chaos_ramp_enabled")) {
        return 1;
    }

    return Math.min(get_config("chaos_max_simultaneous"), 1 + Math.floor(intensity / 2));
};

// the indices of the top `count` options by votes, random within ties (and when nobody voted)
const pick_winning_indices = (counts: number[], count: number): number[] =>
    shuffle(counts.map((_vote, index) => index))
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, Math.max(1, Math.min(count, counts.length)));

const clear_timers = (): void => {
    if (schedule_timer) {
        clearTimeout(schedule_timer);
        schedule_timer = null;
    }

    if (resolve_timer) {
        clearTimeout(resolve_timer);
        resolve_timer = null;
    }
};

const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index--) {
        const swap_index = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swap_index]] = [copy[swap_index], copy[index]];
    }

    return copy;
};

const schedule_next = (context: ChaosContext): void => {
    if (!running) {
        return;
    }

    schedule_timer = setTimeout(() => begin_round(context), effective_interval_ms());
};

// forced rounds are admin-triggered one-offs that run even while the scheduler is idle (chaos disabled)
const begin_round = (context: ChaosContext, forced = false): void => {
    if (!forced && !running) {
        return;
    }

    if (get_poll_source() !== null) {
        if (!forced) {
            schedule_next(context);
        }
        return;
    }

    const available = EFFECTS.filter((effect) => effect.available());

    if (available.length < 2) {
        schedule_next(context);
        return;
    }

    const count = Math.min(get_config("chaos_option_count"), available.length);
    round_effects = shuffle(available).slice(0, count);

    const question = "What happens next?";
    const options = round_effects.map((effect) => effect.label);
    const ends_at = Date.now() + get_config("chaos_vote_ms");

    // how many of the top options will win this round (fixed for the round, since intensity only moves on
    // resolve), so the poll can tell voters up front
    const winners_count = Math.min(effective_winner_count(), options.length);

    start_poll(question, options, "chaos");
    context.io.emit("poll", {question, options, counts: new Array(options.length).fill(0), chaos: true, ends_at, winners_count});

    resolve_timer = setTimeout(() => resolve_round(context), get_config("chaos_vote_ms"));
};

const resolve_round = (context: ChaosContext): void => {
    resolve_timer = null;

    // if our poll was ended or replaced (e.g. an admin force-ended it), just carry on
    if (get_poll_source() !== "chaos" || !round_effects) {
        round_effects = null;
        schedule_next(context);
        return;
    }

    const effects = round_effects;
    const options = get_poll_options() ?? [];
    const counts = get_vote_counts() ?? new Array(options.length).fill(0);

    // as chaos ramps, more of the top options win and all apply at once, so effects stack and overlap
    const winning_indices = pick_winning_indices(counts, effective_winner_count());
    const winning_effects = winning_indices.map((index) => effects[index]).filter(Boolean);

    const results: Record<string, number> = {};
    options.forEach((option, index) => {
        results[option] = counts[index] ?? 0;
    });

    const total_votes = counts.reduce((sum, count) => sum + count, 0);

    end_poll();
    round_effects = null;

    // if the crowd voted for calm, it wins outright: run only ceasefire and reset the escalation
    const ceasefire = winning_effects.find((effect) => effect.id === "ceasefire");
    const applied = ceasefire ? [ceasefire] : winning_effects;

    // reuses the normal poll-end broadcast; the floating poll highlights every winning option as the reveal
    const winner_labels = applied.map((effect) => options[effects.indexOf(effect)]);
    context.io.emit("end_poll", {winners: winner_labels, results, total_votes, chaos: true});

    for (const effect of applied) {
        try {
            effect.activate(context);

            // show it in the persistent active-effects list for its duration (ceasefire etc. have none)
            if (effect.active_ms) {
                add_active_effect(context, effect, effect.active_ms());
            }
        } catch (error) {
            console.error(`Chaos effect ${effect.id} failed:`, error);
        }
    }

    // ceasefire wipes the escalation (restore_all already cleared live effects); otherwise it climbs
    if (ceasefire) {
        intensity = 0;
    } else {
        intensity = Math.min(MAX_INTENSITY, intensity + 1);
    }

    console.log(`Chaos round resolved: [${applied.map((effect) => effect.id).join(", ")}] (${total_votes} votes, intensity now ${intensity})`);

    schedule_next(context);
};

// lifecycle

const start_chaos = (context: ChaosContext): void => {
    if (running) {
        return;
    }

    running = true;
    console.log("Chaos mod enabled.");
    schedule_next(context);
};

const stop_chaos = (context: ChaosContext): void => {
    if (!running) {
        // still clear any lingering overrides in case the feature was toggled oddly
        restore_all(context);
        return;
    }

    running = false;
    clear_timers();
    intensity = 0;

    // if our own poll is still up, close it quietly without applying an effect
    if (get_poll_source() === "chaos") {
        const options = get_poll_options() ?? [];
        const counts = get_vote_counts() ?? [];
        const results: Record<string, number> = {};
        options.forEach((option, index) => {
            results[option] = counts[index] ?? 0;
        });

        end_poll();
        context.io.emit("end_poll", {winners: [], results, total_votes: counts.reduce((sum, count) => sum + count, 0), chaos: true});
    }

    round_effects = null;

    // the whole point of "easy to revert": drop every live effect back to normal at once
    restore_all(context);

    console.log("Chaos mod disabled, all effects reverted.");
};

export const sync_chaos = (context: ChaosContext): void => {
    if (get_config("chaos_enabled")) {
        start_chaos(context);
    } else {
        stop_chaos(context);
    }
};

export type ForceChaosResult = "started" | "poll_active";

export const force_chaos_round = (context: ChaosContext): ForceChaosResult => {
    if (get_poll_source() !== null) {
        return "poll_active";
    }

    if (schedule_timer) {
        clearTimeout(schedule_timer);
        schedule_timer = null;
    }

    begin_round(context, true);
    return "started";
};
