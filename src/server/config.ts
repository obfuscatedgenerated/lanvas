import type {Pool} from "pg";

const config = new Map<string, unknown>();
const public_config_keys = new Set<string>();

/**
 * Loads configuration from the database into the in-memory cache.
 * @param pool The database connection pool
 */
export const load_config = async (pool: Pool) => {
    const config_res = await pool.query("SELECT key, value, public FROM config");
    for (const row of config_res.rows) {
        config.set(row.key, row.value);

        if (row.public) {
            public_config_keys.add(row.key);
        } else {
            public_config_keys.delete(row.key);
        }
    }

    return config.size;
}

/**
 * Gets a configuration value from the in-memory cache.
 * @param key The key to get
 * @param default_value The default value to return if the key is not found
 */
export const get_config = <T>(key: string, default_value: T): T => {
    if (config.has(key)) {
        return config.get(key) as T;
    } else {
        return default_value;
    }
}

/**
 * Gets a raw configuration value from the in-memory cache, returning undefined if not found.
 * @param key The key to get
 */
export const get_config_raw = (key: string): unknown | undefined => {
    return config.get(key);
}

/**
 * Checks if a configuration key is marked as public.
 * @param key The key to check
 */
export const is_config_key_public = (key: string): boolean => {
    return public_config_keys.has(key);
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
 * Sets a configuration value, both in-memory and in the database.
 * @param pool The database connection pool
 * @param key The key to set
 * @param value The value to set it to
 * @param is_public Whether the key should be public or not. Leave undefined to not change.
 * @param persist_strategy The persistence strategy to use. Default is BEST_EFFORT.
 */
export const set_config = async (pool: Pool, key: string, value: unknown, is_public?: boolean, persist_strategy: ConfigPersistStrategy = ConfigPersistStrategy.BEST_EFFORT) => {
    if (persist_strategy === ConfigPersistStrategy.STRICT) {
        try {
            await pool.query(`
                INSERT INTO config (key, value, public)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value = $2, public = $3
            `, [key, value, is_public ?? is_config_key_public(key)]);

            console.log(`Persisted config change for key ${key}`);
        } catch (e) {
            throw new Error(`Failed to persist config change for key ${key}: ${e}`);
        }
    }

    config.set(key, value);

    if (is_public !== undefined) {
        if (is_public) {
            public_config_keys.add(key);
        } else {
            public_config_keys.delete(key);
        }
    }

    if (persist_strategy === ConfigPersistStrategy.BEST_EFFORT) {
        // best effort persistence
        try {
            await pool.query(`
                INSERT INTO config (key, value, public)
                VALUES ($1, $2, $3)
                ON CONFLICT (key) DO UPDATE SET value = $2, public = $3
            `, [key, value, is_public ?? is_config_key_public(key)]);

            console.log(`Persisted config change for key ${key}`);
        } catch (e) {
            console.warn(`Failed to persist config change for key ${key}, but updated in-memory: ${e}`);
        }
    }
}

// TODO: automatic default resolution from defaults file?
