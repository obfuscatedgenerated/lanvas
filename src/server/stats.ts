import type {Pool, Client, PoolClient} from "pg";
type ClientType = Pool | Client | PoolClient;

const stats = new Map<string, number>();

export enum StatKeyType {
    MANAGED, // stored in the db, but not editable by the admin
    MANUAL, // stored in the db, editable by the admin
    VIRTUAL // not stored in the db
}

const stat_key_types: Map<string, StatKeyType> = new Map();

export const load_stats = async (client: ClientType): Promise<number> => {
    const stats_res = await client.query("SELECT key, value, manual FROM stats");

    let count = 0;
    for (const row of stats_res.rows) {
        const value = parseInt(row.value, 10);

        if (isNaN(value)) {
            console.error(`Invalid stat value for key ${row.key}: ${row.value}`);
            continue;
        }

        stats.set(row.key, value);

        if (row.manual) {
            stat_key_types.set(row.key, StatKeyType.MANUAL);
        } else {
            stat_key_types.set(row.key, StatKeyType.MANAGED);
        }

        count++;
    }

    return count;
}

export const get_stat = (key: string): number | undefined => {
    return stats.get(key);
}

export const get_stat_type = (key: string): StatKeyType | undefined => {
    return stat_key_types.get(key);
}

export const get_all_stats = (clone = false): Map<string, number> => {
    if (clone) {
        return new Map(stats);
    }

    return stats;
}

export const get_all_stat_key_types = (clone = false): Map<string, StatKeyType> => {
    if (clone) {
        return new Map(stat_key_types);
    }

    return stat_key_types;
}

export const get_all_stat_keys_of_type = (type: StatKeyType): string[] => {
    const keys: string[] = [];

    for (const [key, stat_type] of stat_key_types.entries()) {
        if (stat_type === type) {
            keys.push(key);
        }
    }

    return keys;
}

export const get_all_stats_of_type = (type: StatKeyType): Map<string, number> => {
    const filtered_stats = new Map<string, number>();

    for (const [key, stat_type] of stat_key_types.entries()) {
        if (stat_type === type) {
            const value = stats.get(key);
            if (value !== undefined) {
                filtered_stats.set(key, value);
            }
        }
    }

    return filtered_stats;
}

export const init_manual_stat = async (client: ClientType, key: string, initial_value: number): Promise<boolean> => {
    if (key.length > 200) {
        throw new Error(`Stat key ${key} is longer than 200 characters`);
    }

    if (stats.has(key)) {
        return false;
    }

    await client.query("INSERT INTO stats (key, value, manual) VALUES ($1, $2, TRUE)", [key, initial_value]);
    stats.set(key, initial_value);
    stat_key_types.set(key, StatKeyType.MANUAL);

    return true;
}

export const init_virtual_stat = (key: string, initial_value: number): boolean => {
    if (stats.has(key)) {
        return false;
    }

    stats.set(key, initial_value);
    stat_key_types.set(key, StatKeyType.VIRTUAL);

    return true;
}

interface SetDbStatOptions {
    best_effort?: boolean;
    create?: boolean;
}

export const set_db_stat = async (client: ClientType, key: string, value: number, options: SetDbStatOptions = {}): Promise<boolean> => {
    const stat_type = stat_key_types.get(key);

    if (stat_type === undefined) {
        if (options.create) {
            return await init_manual_stat(client, key, value);
        } else {
            throw new Error(`Stat key ${key} does not exist`);
        }
    }

    if (stat_type === StatKeyType.VIRTUAL) {
        throw new Error(`Stat key ${key} is virtual, cannot set in database`);
    }

    // ensure the stat is set in the db
    if (!options.best_effort) {
        const res = await client.query("UPDATE stats SET value = $1 WHERE key = $2", [value, key]);
        if (res.rowCount === 0) {
            throw new Error(`Failed to update stat key ${key} in database`);
        }
    }

    stats.set(key, value);

    // if in best effort mode, try to update the db but don't throw on failure
    if (options.best_effort) {
        try {
            await client.query("UPDATE stats SET value = $1 WHERE key = $2", [value, key]);
        } catch (e) {
            console.warn(`Best effort update of stat key ${key} in database failed:`, e);
            return false;
        }
    }

    return true;
}

export const set_virtual_stat = (key: string, value: number, create = false) => {
    const stat_type = stat_key_types.get(key);

    if (stat_type === undefined) {
        if (create) {
            return init_virtual_stat(key, value);
        } else {
            throw new Error(`Stat key ${key} does not exist`);
        }
    }

    if (stat_type !== StatKeyType.VIRTUAL) {
        throw new Error(`Stat key ${key} is of type ${StatKeyType[stat_type]}, cannot set as virtual`);
    }

    stats.set(key, value);
}

export const increment_db_stat = async (client: ClientType, key: string, increment = 1, create = false): Promise<number> => {
    const stat_type = stat_key_types.get(key);

    if (stat_type === undefined) {
        if (create) {
            await init_manual_stat(client, key, increment);
            return increment;
        } else {
            throw new Error(`Stat key ${key} does not exist`);
        }
    }

    if (stat_type === StatKeyType.VIRTUAL) {
        throw new Error(`Stat key ${key} is virtual, cannot increment in database`);
    }

    // do an atomic increment in the db and get the new value
    const res = await client.query(
        `UPDATE stats SET value = value + $1 WHERE key = $2 RETURNING value`,
        [increment, key],
    );

    if (res.rowCount === 0) {
        throw new Error(`Failed to increment stat key ${key} in database`);
    }

    const new_value = parseInt(res.rows[0].value, 10);
    stats.set(key, new_value);

    return new_value;
}

export const increment_virtual_stat = (key: string, increment = 1, create = false): number => {
    const stat_type = stat_key_types.get(key);

    if (stat_type === undefined) {
        if (create) {
            init_virtual_stat(key, increment);
            return increment;
        } else {
            throw new Error(`Stat key ${key} does not exist`);
        }
    }

    if (stat_type !== StatKeyType.VIRTUAL) {
        throw new Error(`Stat key ${key} is of type ${StatKeyType[stat_type]}, cannot increment as virtual`);
    }

    const current_value = stats.get(key) || 0;
    const new_value = current_value + increment;
    stats.set(key, new_value);

    return new_value;
}

export const delete_manual_stat = async (client: ClientType, key: string) => {
    const stat_type = stat_key_types.get(key);

    if (stat_type !== StatKeyType.MANUAL) {
        throw new Error(`Stat key ${key} is not of type MANUAL, cannot delete`);
    }

    const res = await client.query("DELETE FROM stats WHERE key = $1", [key]);

    if (res.rowCount === 0) {
        throw new Error(`Failed to delete stat key ${key} from database`);
    }

    stats.delete(key);
    stat_key_types.delete(key);
}

export const delete_virtual_stat = (key: string) => {
    const stat_type = stat_key_types.get(key);

    if (stat_type !== StatKeyType.VIRTUAL) {
        throw new Error(`Stat key ${key} is not of type VIRTUAL, cannot delete`);
    }

    stats.delete(key);
    stat_key_types.delete(key);
}
