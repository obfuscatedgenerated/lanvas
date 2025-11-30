import type {SocketHandlerFunction, SocketHandlerFlags} from "@/server/types";

import {CONFIG_KEY_GRID_HEIGHT, CONFIG_KEY_GRID_WIDTH} from "@/consts";
import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH} from "@/defaults";

import {ConfigPersistStrategy, get_config, set_config} from "@/server/config";
import {get_author_data, get_grid_data, load_pixels} from "@/server/grid";

export const handler: SocketHandlerFunction = async ({pool, socket, io, payload}) => {
    const user = socket.user!;
    const {width, height} = payload;

    if (
        !(typeof width === "number" && width > 0 && width <= 1000 &&
            typeof height === "number" && height > 0 && height <= 1000)
    ) {
        return;
    }

    // persist to database
    try {
        await pool.query(
            `INSERT INTO config (key, value, public) VALUES ($1, $2, true), ($3, $4, true)
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [CONFIG_KEY_GRID_WIDTH, width, CONFIG_KEY_GRID_HEIGHT, height]
        );
        console.log(`Grid size persisted to database as ${width} x ${height}`);

        // update in memory config too
        // already handled persistence ourself, so use IN_MEMORY_ONLY strategy
        await set_config(pool, CONFIG_KEY_GRID_WIDTH, width, true, ConfigPersistStrategy.IN_MEMORY_ONLY);
        await set_config(pool, CONFIG_KEY_GRID_HEIGHT, height, true, ConfigPersistStrategy.IN_MEMORY_ONLY);

        // update in-memory grid with new size
        await load_pixels(pool);

        console.log(`Grid size changed to ${width} x ${height} by admin ${user.name} (id: ${user.sub})`);

        // broadcast the new full grid to all clients and config changes
        io.emit("config_value", {key: CONFIG_KEY_GRID_WIDTH, value: width});
        io.emit("config_value", {key: CONFIG_KEY_GRID_HEIGHT, value: height});

        io.emit("full_grid", get_grid_data());
        io.emit("full_author_data", get_author_data());
    } catch (db_error) {
        console.error("Database error during changing grid size, please set in DB manually to ensure the setting is kept:", db_error);

        // emit old config values to admin to revert their client
        socket.emit("config_value", {key: CONFIG_KEY_GRID_WIDTH, value: get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH)});
        socket.emit("config_value", {key: CONFIG_KEY_GRID_HEIGHT, value: get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT)});
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
