import type {Feature} from "@/types";

import {get_config} from "@/server/config";
import {get_all_stats} from "@/server/stats";

// config keys that reveal a feature, so the stats page can refresh the moment one is flipped
export const FEATURE_TOGGLE_KEYS: string[] = ["gifting_enabled", "casino_enabled"];

export const is_feature_enabled = (feature: Feature): boolean => feature === "gifting"
    ? get_config("gifting_enabled")
    : get_config("casino_enabled");

// stats belonging to a feature, never sent to players while that feature is turned off
const STAT_FEATURES: Record<string, Feature> = {
    pixels_gifted: "gifting",

    casino_spins: "casino",
    casino_pixels_won: "casino",
    casino_jackpots: "casino",
    ducks_summoned: "casino",
    clownings: "casino",
    taxman_collections: "casino",
};

// what players are allowed to see, use this for everything sent to the stats room
export const get_visible_stats = (): Record<string, number> => {
    const visible: Record<string, number> = {};

    for (const [key, value] of get_all_stats()) {
        const feature = STAT_FEATURES[key];

        if (!feature || is_feature_enabled(feature)) {
            visible[key] = value;
        }
    }

    return visible;
};