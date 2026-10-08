export type ConfigType = "number" | "boolean" | "string";
export type ConfigValue = number | boolean | string;

export interface ConfigDefinition {
    type: ConfigType;
    default: ConfigValue;
    public: boolean; // whether non-admin clients are allowed to read the value
    min?: number;
    max?: number;
}

// don't rename any keys unless you know what you're doing!
export const CONFIG = {
    grid_width: {type: "number", default: 200, public: true, min: 1, max: 1000},
    grid_height: {type: "number", default: 115, public: true, min: 1, max: 1000},
    readonly: {type: "boolean", default: false, public: true},
    pixel_timeout_ms: {type: "number", default: 10000, public: true, min: 0},
    // scales the pixel cooldown up with the number of active players, to keep pace manageable as the canvas fills.
    // effective cooldown = min(pixel_timeout_ms + cooldown_per_player_ms * active_players, cooldown_max_ms)
    cooldown_scaling_enabled: {type: "boolean", default: false, public: true},
    cooldown_per_player_ms: {type: "number", default: 1000, public: false, min: 0},
    cooldown_max_ms: {type: "number", default: 30000, public: false, min: 0},
    admin_god: {type: "boolean", default: false, public: false},
    admin_anonymous: {type: "boolean", default: false, public: false},
    comment_timeout_ms: {type: "number", default: 5000, public: true, min: 0},
    automod_enabled: {type: "boolean", default: true, public: false},
    censor_enabled: {type: "boolean", default: true, public: false},
    comments_enabled: {type: "boolean", default: true, public: true},
    gift_expiry_ms: {type: "number", default: 5 * 60 * 1000, public: false, min: 0},
    gifting_enabled: {type: "boolean", default: true, public: true},
    gift_burst_gap_ms: {type: "number", default: 500, public: false, min: 0},
    casino_enabled: {type: "boolean", default: false, public: true},
    casino_timeout_ms: {type: "number", default: 5 * 60 * 1000, public: true, min: 0},
    casino_pot: {type: "number", default: 20, public: false, min: 0},
    casino_pot_seed: {type: "number", default: 20, public: false, min: 0},
    chaos_enabled: {type: "boolean", default: false, public: true},
    chaos_interval_ms: {type: "number", default: 3 * 60 * 1000, public: false, min: 10000},
    chaos_vote_ms: {type: "number", default: 15000, public: false, min: 5000},
    chaos_option_count: {type: "number", default: 4, public: false, min: 2, max: 6},
    chaos_effect_ms: {type: "number", default: 60000, public: false, min: 5000},
    chaos_ramp_enabled: {type: "boolean", default: true, public: false},
    chaos_min_interval_ms: {type: "number", default: 15000, public: false, min: 5000},
    chaos_max_simultaneous: {type: "number", default: 3, public: false, min: 1, max: 6},
} as const satisfies Record<string, ConfigDefinition>;

export type ConfigKey = keyof typeof CONFIG;

type ValueTypeMap = {number: number; boolean: boolean; string: string};
export type ConfigValueType<K extends ConfigKey> = ValueTypeMap[(typeof CONFIG)[K]["type"]];


export const is_config_key = (key: string): key is ConfigKey =>
    Object.prototype.hasOwnProperty.call(CONFIG, key);


export const is_config_key_public = (key: string): boolean =>
    is_config_key(key) && CONFIG[key].public;


export const config_default = <K extends ConfigKey>(key: K): ConfigValueType<K> =>
    CONFIG[key].default as ConfigValueType<K>;

/**
 * Validates a value against a key's definition (type and bounds).
 * @returns null if valid, otherwise a human-readable reason.
 */
export const validate_config_value = (key: ConfigKey, value: unknown): string | null => {
    const def: ConfigDefinition = CONFIG[key];

    switch (def.type) {
        case "number":
            if (typeof value !== "number" || !Number.isFinite(value)) {
                return "expected a finite number";
            }
            if (def.min !== undefined && value < def.min) {
                return `must be at least ${def.min}`;
            }
            if (def.max !== undefined && value > def.max) {
                return `must be at most ${def.max}`;
            }
            return null;
        case "boolean":
            return typeof value === "boolean" ? null : "expected a boolean";
        case "string":
            return typeof value === "string" ? null : "expected a string";
    }
};
