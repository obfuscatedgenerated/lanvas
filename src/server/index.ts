import "dotenv/config";

import {createServer} from "node:http";
import next from "next";

import {Server} from "socket.io";

import {getToken} from "next-auth/jwt";
import {parse as parse_cookies} from "cookie";

import {Pool} from "pg";

import {Author} from "@/types";
import {
    ConnectedUserDetails,
    SocketWithJWT,
    SocketHandler
} from "@/server/types";

import {
    DEFAULT_GRID_COLOR,
    DEFAULT_GRID_HEIGHT,
    DEFAULT_GRID_WIDTH,
} from "@/defaults";

import {
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
} from "@/consts";

import {
    get_config,
    load_config,
    set_config,
    ConfigPersistStrategy
} from "@/server/config";

import * as handlers from "@/server/handlers/@ALL";

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
const req_handler = app.getRequestHandler();

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

const connected_users = new Set<ConnectedUserDetails>();
const unique_connected_user_ids = new Set<string>();

const stats = new Map<string, number>();
const manual_stat_keys = new Set<string>();

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

    // read out handler names to verify they are loaded, as well as double checking flags for safety
    console.log(`Loaded ${Object.keys(handlers).length} socket handlers:`);
    for (const handler_name of Object.keys(handlers)) {
        console.log(`- ${handler_name}`);

        if (handler_name.startsWith("admin_")) {
            //@ts-expect-error handler guaranteed to exist from above
            const handler = handlers[handler_name] as SocketHandler;
            if (!handler.flags || !handler.flags.require_admin === undefined) {
                console.warn(`  WARNING: handler with admin prefix is missing require_admin flag!!! It will not be protected as intended. If this is intentional, set require_admin to false explicitly.`);
            }
        }
    }

    const http_server = createServer(req_handler);

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

        // TODO: need to move banned users to module to make this work as handler. will define inline for now
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

        // TODO: need to move grid data to module to make this work as handler. will define inline for now
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

        // TODO: need to move load_pixels to module to make this work as handler. will define inline for now
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

        // register all handlers
        for (const [handler_name, h] of Object.entries(handlers)) {
            const handler = h as SocketHandler;

            socket.on(handler_name, (payload) => {
                // check for admin if required
                if (handler.flags && handler.flags.require_admin) {
                    const user = socket.user;
                    if (!user || !user.sub) {
                        return;
                    }

                    // check if their id matches the DISCORD_ADMIN_USER_ID env var
                    if (user.sub !== process.env.DISCORD_ADMIN_USER_ID) {
                        console.log(`Unauthorised ${handler_name} attempt by ${socket.id} (user id: ${user.sub})`);
                        return;
                    }
                }

                // invoke the handler
                handler.handler({
                    io,
                    socket,
                    pool,
                    payload,
                    grid_data,
                    author_data,
                    timeouts,
                    banned_user_ids,
                    banned_usernames_cache,
                    connected_users,
                    unique_connected_user_ids,
                    stats,
                    manual_stat_keys,
                });
            });
        }

        // register a catch-all for unknown events
        socket.onAny((event, ...args) => {
            if (!socket.eventNames().includes(event)) {
                console.warn(`Unknown event received from ${socket.id}: ${event}`, args);
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
