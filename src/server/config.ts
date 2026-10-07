import type {Pool} from "pg";

import {
    CONFIG,
    config_default,
    type ConfigKey,
    type ConfigValueType,
} from "@/config_registry";

const config = new Map<string, unknown>();

// re-exported so the rest of the server keeps a single config import surface
export {is_config_key, is_config_key_public, validate_config_value} from "@/config_registry";

/**
 * Loads configuration from the database into the in-memory cache.
 * @param pool The database connection pool
 */
export const load_config = async (pool: Pool) => {
    const config_res = await pool.query("SELECT key, value FROM config");
    for (const row of config_res.rows) {
        config.set(row.key, row.value);
    }

    return config.size;
}

/**
 * Gets a configuration value from the in-memory cache, strongly typed to the key.
 * Falls back to the registry default, or to an explicit override if one is given.
 * @param key The key to get
 * @param default_override Optional value to use instead of the registered default when unset
 */
export const get_config = <K extends ConfigKey>(key: K, default_override?: ConfigValueType<K>): ConfigValueType<K> => {
    if (config.has(key)) {
        return config.get(key) as ConfigValueType<K>;
    }

    return default_override ?? config_default(key);
}

/**
 * Gets a raw configuration value from the in-memory cache, returning undefined if not found.
 * @param key The key to get
 */
export const get_config_raw = (key: string): unknown | undefined => {
    return config.get(key);
}

/**
 * Database persistence strategies for configuration changes.
 */
export enum ConfigPersistStrategy {
    STRICT, // persist first, fail if it doesn't work
    BEST_EFFORT, // try to persist, but update in-memory even if it fails
    IN_MEMORY_ONLY, // only update in-memory, don't persist
}

/**
 * Sets a configuration value, both in-memory and in the database. The key's public visibility
 * is taken from the registry, so callers no longer pass it.
 * @param pool The database connection pool
 * @param key The key to set
 * @param value The value to set it to
 * @param persist_strategy The persistence strategy to use. Default is BEST_EFFORT.
 */
export const set_config = async <K extends ConfigKey>(pool: Pool, key: K, value: ConfigValueType<K>, persist_strategy: ConfigPersistStrategy = ConfigPersistStrategy.BEST_EFFORT) => {
    const is_public = CONFIG[key].public;

    if (persist_strategy === ConfigPersistStrategy.STRICT) {
        try {
            await pool.query(`
                INSERT INTO config (key, value, public)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value = $2, public = $3
            `, [key, value, is_public]);

            console.log(`Persisted config change for key ${key}`);
        } catch (e) {
            throw new Error(`Failed to persist config change for key ${key}: ${e}`);
        }
    }

    config.set(key, value);

    if (persist_strategy === ConfigPersistStrategy.BEST_EFFORT) {
        // best effort persistence
        try {
            await pool.query(`
                INSERT INTO config (key, value, public)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value = $2, public = $3
            `, [key, value, is_public]);

            console.log(`Persisted config change for key ${key}`);
        } catch (e) {
            console.warn(`Failed to persist config change for key ${key}, but updated in-memory: ${e}`);
        }
    }
}
