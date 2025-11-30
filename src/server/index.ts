import "dotenv/config";

import {createServer} from "node:http";
import next from "next";

import {Server, type Socket} from "socket.io";

import {getToken, JWT} from "next-auth/jwt";
import {parse as parse_cookies} from "cookie";

import {Pool} from "pg";
import {Author} from "@/types";

import {
    DEFAULT_GRID_COLOR,
    DEFAULT_GRID_HEIGHT,
    DEFAULT_GRID_WIDTH,
    DEFAULT_PIXEL_TIMEOUT_MS,
    DEFAULT_READONLY
} from "@/defaults";

import {
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
    CONFIG_KEY_PIXEL_TIMEOUT_MS,
    CONFIG_KEY_READONLY
} from "@/consts";

import {
    get_config,
    get_config_raw,
    is_config_key_public,
    load_config,
    set_config,
    ConfigPersistStrategy
} from "@/server/config";

const dev = process.env.NODE_ENV !== "production";

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!NEXTAUTH_SECRET) {
    throw new Error("Missing NEXTAUTH_SECRET");
}

const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
});

const hostname = process.argv[2] || "localhost";
const port = parseInt(process.argv[3], 10) || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({dev, hostname, port});
const handler = app.getRequestHandler();

const initialise_grid_data = (height: number, width: number) => Array.from({ length: height }, () => Array(width).fill(DEFAULT_GRID_COLOR));

const initialise_author_data = (height: number, width: number) => Array.from({ length: height }, () => Array(width).fill(null));

// in memory caches with default empty values
let grid_data: string[][] = [];

let author_data: (Author | null)[][] = [];

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

const timeouts: {[user_id: string]: {
    started: number;
    ends: number;
}} = {};

let banned_user_ids: string[] = [];
let banned_usernames_cache: {[user_id: string]: string} = {};

interface ConnectedUserDetails {
    socket_id: string;
    user_id?: string;
    username?: string;
    context?: string;
}

const connected_users = new Set<ConnectedUserDetails>();
const unique_connected_user_ids = new Set<string>();

const stats = new Map<string, number>();
const manual_stat_keys = new Set<string>();

interface SocketWithJWT extends Socket {
    user?: JWT
}

const load_banned_users = async () => {
    const banned_users_res = await pool.query("SELECT user_id, username_at_ban FROM banned_user_ids");
    for (const row of banned_users_res.rows) {
        banned_user_ids.push(row.user_id);
        banned_usernames_cache[row.user_id] = row.username_at_ban;
    }
}

const load_stats = async () => {
    const stats_res = await pool.query("SELECT key, value, manual FROM stats");
    for (const row of stats_res.rows) {
        const value = parseInt(row.value, 10);

        if (isNaN(value)) {
            console.error(`Invalid stat value for key ${row.key}: ${row.value}`);
            continue;
        }

        stats.set(row.key, value);

        if (row.manual) {
            manual_stat_keys.add(row.key);
        } else {
            manual_stat_keys.delete(row.key);
        }
    }
}

const load_pixels = async (): Promise<number> => {
    const grid_height = get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT);
    const grid_width = get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH);

    grid_data = initialise_grid_data(grid_height, grid_width);
    author_data = initialise_author_data(grid_height, grid_width);

    const pixels = await pool.query("SELECT x, y, color, author_id, author.username, author.avatar_url FROM pixels JOIN user_details AS author ON pixels.author_id = author.user_id");

    let loaded_pixel_count = 0;
    for (const row of pixels.rows) {
        const {x, y, color, author_id, username, avatar_url} = row;

        // load each pixel into the in-memory grids
        if (x >= 0 && x < grid_width && y >= 0 && y < grid_height) {
            grid_data[y][x] = color;
            author_data[y][x] = {
                user_id: author_id,
                name: username,
                avatar_url,
            };

            loaded_pixel_count++;
        }
    }

    return loaded_pixel_count;
}

const main = async () => {
    // check the database connection
    console.log("Checking database connection...");
    try {
        await pool.query("SELECT 1");
        console.log("Connected to the database successfully.");
    } catch (error) {
        console.error("Failed to connect to the database:", error);
        console.error("Database connection failed, exiting.");
        process.exit(1);
    }

    await app.prepare();

    // load config from database
    const conf_key_count = await load_config(pool);
    console.log(`Loaded ${conf_key_count} config entries from database.`);

    console.log("Grid size:", get_config(CONFIG_KEY_GRID_WIDTH, 100), "x", get_config(CONFIG_KEY_GRID_HEIGHT, 100));

    // load banned users from database
    await load_banned_users();

    console.log(`Loaded ${banned_user_ids.length} banned users from database.`);

    // load stats from database
    await load_stats();

    console.log(`Loaded ${stats.size} stats from database.`);
    console.log(`Manual stats keys: ${Array.from(manual_stat_keys).join(", ")}`);

    // load existing pixels from database
    const loaded_pixel_count = await load_pixels();

    console.log(`Loaded ${loaded_pixel_count} pixels from database.`);

    const http_server = createServer(handler);

    const io = new Server(http_server);

    // jwt validation middleware
    io.use(async (socket, next_handler) => {
        const handshake = socket.handshake;

        if (!handshake.headers.cookie) {
            return next_handler(new Error("Authentication error: No cookies provided."));
        }

        // prepare cookies into format accepted by next-auth
        const handshake_with_cookies = {
            ...handshake,
            cookies: parse_cookies(handshake.headers.cookie || ""),
        }

        const token = await getToken({
            // @ts-expect-error the function just wants to see a request object with basic fields and cookies, this suffices
            req: handshake_with_cookies,
            secret: NEXTAUTH_SECRET,
        });

        if (!token) {
            return next_handler(new Error("Authentication error: Invalid token."));
        }

        (socket as SocketWithJWT).user = token
        next_handler();
    });

    io.on("connection", (sock) => {
        const socket = sock as SocketWithJWT;
        if (!socket.user || !socket.user.sub) {
            console.log("Unauthenticated socket connection attempt.");
            socket.disconnect(true);
            return;
        }

        // if they are admin, subscribe to the admin room
        if (socket.user.sub === process.env.DISCORD_ADMIN_USER_ID) {
            socket.join("admin");
            console.log(`Admin user connected: ${socket.id}, user ${socket.user.name} (id: ${socket.user.sub})`);
        }

        console.log(`Client connected: ${socket.id}, user ${socket.user.name} (id: ${socket.user.sub})`);
        connected_users.add({
            socket_id: socket.id,
            user_id: socket.user.sub,
            username: socket.user.name || undefined,
            context: socket.handshake.query.context as string | undefined,
        });

        unique_connected_user_ids.add(socket.user.sub);

        // send updated connected users list to admin room
        io.to("admin").emit("connected_users", Array.from(connected_users));

        // update in-memory stats cache
        stats.set("connected_unique_users", unique_connected_user_ids.size);

        // emit updated stats to all clients in stats room
        io.to("stats").emit("stats", Object.fromEntries(stats));

        // send full grid to client when requested
        socket.on("request_full_grid", () => {
            console.log(`Full grid requested by: ${socket.id}`);
            socket.emit("full_grid", grid_data);
        });

        // send full author data to client when requested
        socket.on("request_full_author_data", () => {
            console.log(`Full author data requested by: ${socket.id}`);
            socket.emit("full_author_data", author_data);
        });

        // join stats room and send current stats to client when requested
        socket.on("join_stats", () => {
            if (socket.rooms.has("stats")) {
                return;
            }

            console.log(`Joining stats room: ${socket.id}`);
            socket.join("stats");
            socket.emit("stats", Object.fromEntries(stats));
        });

        // handle pixel updates from clients
        socket.on("pixel_update", async (payload) => {
            try {
                const {x, y, color} = payload;
                //console.log(`Received pixel_update from ${socket.id}:`, payload);

                // basic validation of incoming data
                if (
                    !(
                        typeof x === "number" && x >= 0 && x < get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH) &&
                        typeof y === "number" && y >= 0 && y < get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT) &&
                        typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
                    )
                ) {
                    return;
                }

                if (get_config(CONFIG_KEY_READONLY, false)) {
                    socket.emit("pixel_update_rejected", {reason: "readonly"});
                    return;
                }

                if (!socket.user || !socket.user.sub || !socket.user.name) {
                    socket.emit("pixel_update_rejected", {reason: "unauthenticated"});
                    return;
                }

                // check if user is banned
                const user_id = socket.user.sub;
                if (banned_user_ids.includes(user_id)) {
                    socket.emit("pixel_update_rejected", {reason: "banned"});
                    return;
                }

                // check user isn't in timeout period
                const current_time = Date.now();
                if (timeouts[user_id] && timeouts[user_id].ends > current_time) {
                    // user is still in timeout period
                    const wait_time = Math.ceil((timeouts[user_id].ends - current_time) / 1000);
                    socket.emit("pixel_update_rejected", {reason: "timeout", wait_time});
                    return;
                }

                const author = {
                    user_id,
                    name: socket.user.name,
                    avatar_url: socket.user.picture || null,
                };

                // we will do an optimistic update, so we store the old state in case we need to revert
                const old_color = grid_data[y][x];
                const old_author = author_data[y][x];

                grid_data[y][x] = color;
                author_data[y][x] = author;
                console.log(`Pixel updated at (${x}, ${y}) to ${color} by user ${socket.user.name} (id: ${user_id})`);

                // set new timeout for user
                timeouts[user_id] = {
                    started: current_time,
                    ends: current_time + get_config(CONFIG_KEY_PIXEL_TIMEOUT_MS, DEFAULT_PIXEL_TIMEOUT_MS)
                };

                // broadcast the pixel update to all connected clients
                io.emit("pixel_update", {x, y, color, author});

                // try to update the database
                try {
                    // first upsert the user details in case they have changed
                    await pool.query(
                        `INSERT INTO user_details (user_id, username, avatar_url)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, avatar_url = EXCLUDED.avatar_url`,
                        [user_id, socket.user.name, socket.user.picture || null]
                    );

                    // create a transaction to ensure both pixel and stats are updated together
                    await pool.query("BEGIN");

                    // then upsert the pixel
                    await pool.query(
                        `INSERT INTO pixels (x, y, color, author_id)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color, author_id = EXCLUDED.author_id`,
                        [x, y, color, user_id]
                    );

                    // and increment the total_pixels_placed stat, as well as returning the new total
                    const stats_res = await pool.query(
                        `INSERT INTO stats (key, value)
                         VALUES ('total_pixels_placed', 1)
                         ON CONFLICT (key) DO UPDATE SET value = stats.value + 1
                         RETURNING value`,
                    );

                    await pool.query("COMMIT");

                    // update in-memory stats cache
                    const new_total = parseInt(stats_res.rows[0].value, 10);
                    stats.set("total_pixels_placed", new_total);

                    console.log(`Database updated for pixel at (${x}, ${y})`);

                    // emit updated stats to all clients in stats room
                    io.to("stats").emit("stats", Object.fromEntries(stats));
                } catch (db_error) {
                    console.error("Database error during pixel update:", db_error);

                    // revert in-memory state
                    // TODO: dealing with conflicting edits could be improved here to avoid race condition if one is reverted but another edit has happened since
                    grid_data[y][x] = old_color;
                    author_data[y][x] = old_author;

                    // notify clients to revert the pixel
                    io.emit("pixel_update", {x, y, color: old_color, author: old_author});

                    // remove the timeout since the update failed
                    delete timeouts[user_id];

                    // notify the user that their update failed to reset their client timer
                    socket.emit("pixel_update_rejected", {reason: "database_error"});
                }
            } catch (error) {
                console.error("pixel_update failed", error);
            }
        });

        socket.on("check_timeout", () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            const timeout = timeouts[user.sub];
            const current_time = Date.now();
            if (timeout && timeout.ends > current_time) {
                const remaining = timeout.ends - current_time;
                const elapsed = current_time - timeout.started;

                socket.emit("timeout_info", {
                    started: timeout.started,
                    remaining,
                    elapsed,
                    ends: timeout.ends,
                    checked_at: current_time
                });
            }
        });

        socket.on("check_readonly", () => {
            socket.emit("readonly", get_config(CONFIG_KEY_READONLY, DEFAULT_READONLY));
        });

        socket.on("get_public_config_value", (key: string) => {
            if (is_config_key_public(key)) {
                socket.emit("config_value", {key, value: get_config_raw(key) });
            }
        });

        socket.on("admin_get_config_value", (key: string) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_get_config_value attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            socket.emit("config_value", {key, value: get_config_raw(key) });
        });

        socket.on("admin_set_config_value", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_set_config_value attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            const {key, value, is_public} = payload;

            if (is_public === undefined) {
                console.log(`admin_set_config_value missing is_public by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // update in-memory config
            await set_config(pool, key, value, is_public);
            console.log(`Config key ${key} set to ${value} by admin ${user.name} (id: ${user.sub}), public: ${is_public}`);

            // if public, broadcast the new value to all clients
            if (is_public) {
                io.emit("config_value", {key, value});
            } else {
                // otherwise only send to admin room
                io.to("admin").emit("config_value", {key, value});
            }
        });

        socket.on("admin_ban_user", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_ban_user attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // check for user_id in payload
            const {user_id} = payload;
            if (typeof user_id !== "string" || !user_id) {
                return;
            }

            // validate bigint
            try {
                if (user_id !== String(BigInt(user_id))) {
                    console.log(`Got invalid bigint ${user_id}`);
                    return;
                }
            } catch (err) {
                console.log(`Got invalid bigint ${user_id} with error: ${err}`);
                return;
            }

            // add to banned list if not already present
            if (!banned_user_ids.includes(user_id)) {
                banned_user_ids.push(user_id);
                console.log(`User id ${user_id} banned by admin ${user.name} (id: ${user.sub})`);

                // look up the username, assuming we have it
                let username = null;
                try {
                    const res = await pool.query("SELECT username FROM user_details WHERE user_id = $1", [user_id]);
                    if (res.rows.length > 0) {
                        console.log(`Banned user id ${user_id} corresponds to username: ${res.rows[0].username}`);
                        username = res.rows[0].username;
                    } else {
                        console.log(`Banned user id ${user_id} has no known username in the database.`);
                    }
                } catch (db_error) {
                    console.error("Database error during fetching banned user's username:", db_error);
                }

                // also add to database
                try {
                    await pool.query(
                        `INSERT INTO banned_user_ids (user_id, username_at_ban) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
                        [user_id, username]
                    );
                    console.log(`User id ${user_id} added to banned_user_ids table`);
                } catch (db_error) {
                    console.error("Database error during banning user, please add to DB manually to ensure the ban is kept:", db_error);
                }
            }
        });

        socket.on("admin_unban_user", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_unban_user attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // check for user_id in payload
            const {user_id} = payload;
            if (typeof user_id !== "string" || !user_id) {
                return;
            }

            // validate bigint
            try {
                if (user_id !== String(BigInt(user_id))) {
                    console.log(`Got invalid bigint ${user_id}`);
                    return;
                }
            } catch (err) {
                console.log(`Got invalid bigint ${user_id} with error: ${err}`);
                return;
            }

            const index = banned_user_ids.indexOf(user_id);
            if (index !== -1) {
                banned_user_ids.splice(index, 1);
                console.log(`User id ${user_id} unbanned by admin ${user.name} (id: ${user.sub})`);

                // also remove from database
                try {
                    await pool.query(
                        `DELETE FROM banned_user_ids WHERE user_id = $1`,
                        [user_id]
                    );
                    console.log(`User id ${user_id} removed from banned_user_ids table`);
                } catch (db_error) {
                    console.error("Database error during unbanning user, please remove from DB manually to ensure the unban is kept:", db_error);
                }
            }
        });

        socket.on("admin_request_banned_users", async () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_request_banned_users attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // send the list of banned user ids back to the requester
            socket.emit("banned_user_ids", banned_user_ids);

            // send the username cache object too. lazy approach but means very little tweaks to data caching here are made, and no expensive augmenting
            socket.emit("banned_usernames_cache", banned_usernames_cache);
        });

        socket.on("admin_refresh_banned_users", async () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_refresh_banned_users attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // reload banned users from database
            // TODO: instead of affecting global value and reverting, use a staging value
            const old_banned_user_ids = banned_user_ids.slice();
            const old_banned_usernames_cache = structuredClone(banned_usernames_cache);
            try {
                banned_user_ids = [];
                banned_usernames_cache = {};
                console.log("Reloading banned users from database...");
                await load_banned_users();
                console.log(`Reloaded ${banned_user_ids.length} banned users from database.`);

                // send the updated list of banned user ids back to the requester
                socket.emit("banned_user_ids", banned_user_ids);
            } catch (db_error) {
                console.error("Database error during reloading banned users, keeping old list:", db_error);
                banned_user_ids = old_banned_user_ids;
                banned_usernames_cache = old_banned_usernames_cache;
            }
        });

        socket.on("admin_refresh_grid", async () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_refresh_grid attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }
            
            // reload pixels and authors from the database
            // TODO: instead of affecting global value and reverting, use a staging value
            const old_grid_data = grid_data.slice();
            const old_author_data = author_data.slice();
            try {
                console.log("Reloading grid from database...");

                const pixel_count = await load_pixels();
                console.log(`Reloaded ${pixel_count} pixels from database.`);

                // broadcast the new grid to all clients
                io.emit("full_grid", grid_data);
                io.emit("full_author_data", author_data);
            } catch (db_error) {
                console.error("Database error during reloading pixels, keeping old grids:", db_error);
                grid_data = old_grid_data;
                author_data = old_author_data;
            }
        });

        socket.on("admin_set_grid_size", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_set_grid_size attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

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
                await load_pixels();

                console.log(`Grid size changed to ${width} x ${height} by admin ${user.name} (id: ${user.sub})`);

                // broadcast the new full grid to all clients and config changes
                io.emit("config_value", {key: CONFIG_KEY_GRID_WIDTH, value: width});
                io.emit("config_value", {key: CONFIG_KEY_GRID_HEIGHT, value: height});
                io.emit("full_grid", grid_data);
                io.emit("full_author_data", author_data);
            } catch (db_error) {
                console.error("Database error during changing grid size, please set in DB manually to ensure the setting is kept:", db_error);

                // emit old config values to admin to revert their client
                socket.emit("config_value", {key: CONFIG_KEY_GRID_WIDTH, value: get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH)});
                socket.emit("config_value", {key: CONFIG_KEY_GRID_HEIGHT, value: get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT)});
            }
        });

        socket.on("admin_request_connected_users", () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_request_connected_users attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // send the list of connected users back to the requester
            socket.emit("connected_users", Array.from(connected_users));
        });

        socket.on("admin_set_readonly", async (payload) => {
            // kept for backwards compatibility

            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_set_readonly attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            if (typeof payload !== "boolean") {
                return;
            }

            await set_config(pool, CONFIG_KEY_READONLY, payload);
            console.log(`Readonly mode set to ${payload}`);

            // broadcast the new readonly value to all clients
            io.emit("readonly", payload);
        });

        socket.on("admin_send_message", (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_send_message attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            const {message, persist} = payload;
            if (typeof message !== "string") {
                return;
            }

            // TODO: store persistent messages in database and send to clients on connection

            // broadcast the admin message to all clients
            io.emit("admin_message", {message, persist});
        });

        socket.on("admin_request_manual_stats", () => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_request_manual_stats attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            // filter stats to only manual ones
            const manual_stats: {[key: string]: number} = {};
            for (const key of manual_stat_keys) {
                const value = stats.get(key);
                if (typeof value === "number") {
                    manual_stats[key] = value;
                }
            }

            socket.emit("manual_stats", manual_stats);
        });

        socket.on("admin_update_manual_stat", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_update_manual_stat attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            const {key, value} = payload;
            if (typeof key !== "string" || typeof value !== "number" || isNaN(value)) {
                return;
            }

            if (key.length === 0) {
                console.log("Stat key cannot be empty, cannot update via admin_update_manual_stat");
                return;
            }

            if (key.length > 200) {
                console.log(`Stat key ${key} is too long, cannot update via admin_update_manual_stat`);
                return;
            }

            // if the stat key exists but is not marked as manual, reject the update
            // if it doesn't exist, we allow creating new manual stats
            if (stats.has(key) && !manual_stat_keys.has(key)) {
                console.log(`Stat key ${key} is not marked as manual, cannot update via admin_update_manual_stat`);
                return;
            }

            // update in database
            try {
                await pool.query(
                    `INSERT INTO stats (key, value, manual) VALUES ($1, $2, true)
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, manual = EXCLUDED.manual`,
                    [key, value]
                );
                console.log(`Manual stat ${key} updated to ${value} in database by admin ${user.name} (id: ${user.sub})`);

                // update in-memory stats cache
                stats.set(key, value);
                manual_stat_keys.add(key);

                // emit updated stats to all clients in stats room
                io.to("stats").emit("stats", Object.fromEntries(stats));

                // emit updated manual stats to admin clients
                const manual_stats: {[key: string]: number} = {};
                for (const manual_key of manual_stat_keys) {
                    const stat_value = stats.get(manual_key);
                    if (typeof stat_value === "number") {
                        manual_stats[manual_key] = stat_value;
                    }
                }

                io.to("admin").emit("manual_stats", manual_stats);
            } catch (db_error) {
                console.error("Database error during updating manual stat:", db_error);
            }
        });

        socket.on("admin_delete_manual_stat", async (payload) => {
            const user = socket.user;
            if (!user || !user.sub) {
                return;
            }

            // check if their id matches the DISCORD_ADMIN_USER_ID env var
            if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                console.log(`Unauthorised admin_delete_manual_stat attempt by ${socket.id} (user id: ${user.sub})`);
                return;
            }

            if (typeof payload !== "string") {
                return;
            }

            if (!stats.has(payload)) {
                console.log(`Stat key ${payload} does not exist, cannot delete via admin_delete_manual_stat`);
                return;
            }

            if (!manual_stat_keys.has(payload)) {
                console.log(`Stat key ${payload} is not marked as manual, cannot delete via admin_delete_manual_stat`);
                return;
            }

            // delete from database
            try {
                await pool.query(
                    `DELETE FROM stats WHERE key = $1`,
                    [payload]
                );
                console.log(`Manual stat ${payload} deleted from database by admin ${user.name} (id: ${user.sub})`);

                // update in-memory stats cache
                stats.delete(payload);
                manual_stat_keys.delete(payload);

                // emit updated stats to all clients in stats room
                io.to("stats").emit("stats", Object.fromEntries(stats));

                // emit updated manual stats to admin clients
                const manual_stats: {[key: string]: number} = {};
                for (const manual_key of manual_stat_keys) {
                    const stat_value = stats.get(manual_key);
                    if (typeof stat_value === "number") {
                        manual_stats[manual_key] = stat_value;
                    }
                }
                io.to("admin").emit("manual_stats", manual_stats);
            } catch (db_error) {
                console.error("Database error during deleting manual stat:", db_error);
            }
        });

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);

            // remove from connected users set
            connected_users.forEach((user) => {
                if (user.socket_id === socket.id) {
                    connected_users.delete(user);
                }
            });

            // send updated connected users list to admin room
            io.to("admin").emit("connected_users", Array.from(connected_users));

            // determine if user has any other active connections
            let still_connected = false;
            connected_users.forEach((user) => {
                if (user.user_id === socket.user?.sub) {
                    still_connected = true;
                }
            });

            // if not, remove from unique connected user ids set
            if (!still_connected && socket.user && socket.user.sub) {
                unique_connected_user_ids.delete(socket.user.sub);

                // update in-memory stats cache
                stats.set("connected_unique_users", unique_connected_user_ids.size);

                // emit updated stats to all clients in stats room
                io.to("stats").emit("stats", Object.fromEntries(stats));
            }
        });
    });

    http_server
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
}

main();

// TODO: unique users ever stat
// TODO: move manual stat calc to a function or cache
// TODO: remove duplication of readonly and set config readonly, as clinets currently only listen when its admin_set_readonly event
