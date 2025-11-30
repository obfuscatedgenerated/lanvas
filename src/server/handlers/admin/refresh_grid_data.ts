import type {SocketHandlerFlags, SocketHandlerFunction} from "@/server/types";

import {get_author_data, get_grid_data, load_pixels, overwrite_author_data, overwrite_grid_data} from "@/server/grid";

export const handler: SocketHandlerFunction = async ({io, pool}) => {
    // reload pixels and authors from the database
    // TODO: instead of affecting global value and reverting, use a staging value
    const old_grid_data = get_grid_data(true);
    const old_author_data = get_author_data(true);
    try {
        console.log("Reloading grid from database...");

        const pixel_count = await load_pixels(pool);
        console.log(`Reloaded ${pixel_count} pixels from database.`);

        // broadcast the new grid to all clients
        io.emit("full_grid", get_grid_data());
        io.emit("full_author_data", get_author_data());
    } catch (db_error) {
        console.error("Database error during reloading pixels, keeping old grids:", db_error);

        overwrite_grid_data(old_grid_data);
        overwrite_author_data(old_author_data);
    }
}

export const flags: SocketHandlerFlags = {
    require_admin: true,
};
