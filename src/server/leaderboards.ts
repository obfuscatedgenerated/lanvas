import type {Pool} from "pg";
import type {Server} from "socket.io";

import type {Feature, Leaderboard, LeaderboardEntry} from "@/types";

import {HOUSE_AUTHOR} from "@/server/casino";
import {is_feature_enabled} from "@/server/feature_stats";

const LEADERBOARD_SIZE = 5;

// leaderboards are aggregate queries, so they're refreshed on a timer rather than on every gift or spin
export const LEADERBOARD_REFRESH_INTERVAL_MS = 30 * 1000;

interface LeaderboardDefinition {
    key: string;
    title: string;
    unit: string;

    // hidden from players while this feature is turned off
    feature: Feature | null;

    // must select user_id and value, the house is excluded and names are joined in afterwards
    query: string;
}

const LEADERBOARDS: LeaderboardDefinition[] = [
    {
        key: "most_pixels",
        feature: null,
        title: "Most pixels placed",
        unit: "pixels",
        query: `SELECT author_id AS user_id, COUNT(*) AS value FROM pixels WHERE author_id IS NOT NULL GROUP BY author_id`,
    },
    {
        key: "most_generous",
        feature: "gifting",
        title: "Most generous",
        unit: "pixels given",
        query: `SELECT from_id AS user_id, SUM(amount) AS value FROM gift_log WHERE source = 'gift' GROUP BY from_id`,
    },
    {
        key: "most_spoiled",
        feature: "gifting",
        title: "Most spoiled",
        unit: "pixels received",
        query: `SELECT to_id AS user_id, SUM(amount) AS value FROM gift_log WHERE source = 'gift' GROUP BY to_id`,
    },
    {
        key: "biggest_gambler",
        feature: "casino",
        title: "Biggest gambler",
        unit: "spins",
        query: `SELECT user_id, COUNT(*) AS value FROM casino_log GROUP BY user_id`,
    },
    {
        key: "luckiest",
        feature: "casino",
        title: "Luckiest",
        unit: "pixels won",
        query: `SELECT user_id, SUM(payout) AS value FROM casino_log WHERE payout > 0 GROUP BY user_id`,
    },
    {
        key: "biggest_jackpot",
        feature: "casino",
        title: "Biggest jackpot",
        unit: "pixels",
        query: `SELECT user_id, MAX(payout) AS value FROM casino_log WHERE outcome_id = 'jackpot' GROUP BY user_id`,
    },
    {
        key: "most_clowned",
        feature: "casino",
        title: "Most clowned",
        unit: "times",
        query: `SELECT user_id, COUNT(*) AS value FROM casino_log WHERE outcome_id = 'clowned' GROUP BY user_id`,
    },
    {
        key: "duck_keeper",
        feature: "casino",
        title: "Duck keeper",
        unit: "ducks",
        query: `SELECT user_id, COUNT(*) AS value FROM casino_log WHERE outcome_id = 'duck' GROUP BY user_id`,
    },
    {
        key: "most_taxed",
        feature: "casino",
        title: "Most taxed",
        unit: "times",
        query: `SELECT user_id, COUNT(*) AS value FROM casino_log WHERE outcome_id = 'taxman' GROUP BY user_id`,
    },
];

interface LeaderboardRow {
    name: string | null;
    avatar_url: string | null;
    value: string;
}

// empty boards are left out, so features that haven't been revealed yet don't show up on the stats page
export const compute_leaderboards = async (pool: Pool): Promise<Leaderboard[]> => {
    const leaderboards: Leaderboard[] = [];

    for (const definition of LEADERBOARDS) {
        const result = await pool.query<LeaderboardRow>(
            `SELECT user_details.username AS name, user_details.avatar_url, ranked.value
             FROM (${definition.query}) AS ranked
                      LEFT JOIN user_details ON user_details.user_id = ranked.user_id
             WHERE ranked.user_id <> $1
             ORDER BY ranked.value DESC
             LIMIT $2`,
            [HOUSE_AUTHOR.user_id, LEADERBOARD_SIZE]
        );

        const entries: LeaderboardEntry[] = result.rows.map((row) => ({
            name: row.name ?? "Unknown",
            avatar_url: row.avatar_url,
            value: parseInt(row.value, 10),
        }));

        if (entries.length > 0) {
            leaderboards.push({key: definition.key, title: definition.title, unit: definition.unit, feature: definition.feature, entries});
        }
    }

    return leaderboards;
};

let cached_leaderboards: Leaderboard[] = [];
let cached_json = "[]";

// what players are allowed to see, the cache keeps everything so flipping a feature on needs no recompute
export const get_visible_leaderboards = (): Leaderboard[] =>
    cached_leaderboards.filter((leaderboard) => leaderboard.feature === null || is_feature_enabled(leaderboard.feature));

// only tells the stats room when something actually changed
export const refresh_leaderboards = async (pool: Pool, io: Server): Promise<void> => {
    try {
        const leaderboards = await compute_leaderboards(pool);
        const leaderboards_json = JSON.stringify(leaderboards);

        if (leaderboards_json === cached_json) {
            return;
        }

        cached_leaderboards = leaderboards;
        cached_json = leaderboards_json;

        io.to("stats").emit("leaderboards", get_visible_leaderboards());
    } catch (db_error) {
        console.error("Failed to refresh leaderboards:", db_error);
    }
};

interface CountRow {
    value: string | null;
}

// restores the casino and gifting counters after a restart, only creating ones that have happened so nothing is spoiled
export const load_counter_stats = async (pool: Pool, set_counter: (key: string, value: number) => void): Promise<void> => {
    const counters: {key: string; query: string}[] = [
        {key: "pixels_gifted", query: `SELECT SUM(amount) AS value FROM gift_log WHERE source = 'gift'`},
        {key: "casino_spins", query: `SELECT COUNT(*) AS value FROM casino_log`},
        {key: "casino_pixels_won", query: `SELECT SUM(payout) AS value FROM casino_log`},
        {key: "casino_jackpots", query: `SELECT COUNT(*) AS value FROM casino_log WHERE outcome_id = 'jackpot'`},
        {key: "ducks_summoned", query: `SELECT COUNT(*) AS value FROM casino_log WHERE outcome_id = 'duck'`},
        {key: "clownings", query: `SELECT COUNT(*) AS value FROM casino_log WHERE outcome_id = 'clowned'`},
        {key: "taxman_collections", query: `SELECT COUNT(*) AS value FROM casino_log WHERE outcome_id = 'taxman'`},
    ];

    for (const counter of counters) {
        const result = await pool.query<CountRow>(counter.query);
        const value = parseInt(result.rows[0]?.value ?? "0", 10) || 0;

        if (value > 0) {
            set_counter(counter.key, value);
        }
    }
};