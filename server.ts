import "dotenv/config";

import {createServer} from "node:http";
import next from "next";

import {Server, type Socket} from "socket.io";

import {getToken, JWT} from "next-auth/jwt";
import {parse as parse_cookies} from "cookie";

import {Pool} from "pg";

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

// TODO: move these values to the database so they can be changed without redeploying, and transmit the values to the client via ws rather than baked in env vars
const GRID_WIDTH = process.env.NEXT_PUBLIC_GRID_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GRID_WIDTH) : 100;
const GRID_HEIGHT = process.env.NEXT_PUBLIC_GRID_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GRID_HEIGHT) : 100;
const PIXEL_TIMEOUT_MS = process.env.NEXT_PUBLIC_PIXEL_TIMEOUT_MS ? parseInt(process.env.NEXT_PUBLIC_PIXEL_TIMEOUT_MS) : 30000;

console.log(`Grid size: ${GRID_WIDTH}x${GRID_HEIGHT}`);

const initialise_grid_data = () => Array.from({length: GRID_HEIGHT}, () =>
    Array(GRID_WIDTH).fill("#FFFFFF")
);

const initialise_author_data = () => Array.from({length: GRID_HEIGHT}, () =>
    Array(GRID_WIDTH).fill(null)
);

// in memory caches with default empty values
let grid_data = initialise_grid_data();

let author_data = initialise_author_data();

let readonly = false;

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

const timeouts: {[user_id: string]: number} = {};

let banned_user_ids: string[] = [];
let banned_usernames_cache: {[user_id: string]: string} = {};

interface ConnectedUserDetails {
    socket_id: string;
    user_id?: string;
    username?: string;
}

const connected_users = new Set<ConnectedUserDetails>();

const stats = new Map<string, number>();

interface SocketWithJWT extends Socket {
    user?: JWT
}

const load_pixels = async () => {
    const pixels = await pool.query("SELECT x, y, color, author_id, author.username, author.avatar_url FROM pixels JOIN user_details AS author ON pixels.author_id = author.user_id");

    let loaded_pixel_count = 0;
    for (const row of pixels.rows) {
        const {x, y, color, author_id, username, avatar_url} = row;

        // load each pixel into the in-memory grids
        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
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

const load_banned_users = async () => {
    const banned_users_res = await pool.query("SELECT user_id, username_at_ban FROM banned_user_ids");
    for (const row of banned_users_res.rows) {
        banned_user_ids.push(row.user_id);
        banned_usernames_cache[row.user_id] = row.username_at_ban;
    }
}

const load_stats = async () => {
    const stats_res = await pool.query("SELECT key, value FROM stats");
    for (const row of stats_res.rows) {
        const value = parseInt(row.value, 10);

        if (isNaN(value)) {
            console.error(`Invalid stat value for key ${row.key}: ${row.value}`);
            continue;
        }

        stats.set(row.key, value);
    }
}

const main = async () => {
    await app.prepare();

    // load existing pixels from database
    const loaded_pixel_count = await load_pixels();

    console.log(`Loaded ${loaded_pixel_count} pixels from database.`);

    // load banned users from database
    await load_banned_users();

    console.log(`Loaded ${banned_user_ids.length} banned users from database.`);

    // load stats from database
    await load_stats();

    console.log(`Loaded ${stats.size} stats from database.`);

    // load config value "readonly" from database if it exists
    // default to false if not set
    try {
        const res = await pool.query("SELECT value FROM config WHERE key = 'readonly'");
        if (res.rows.length > 0) {
            readonly = res.rows[0].value === 'true';
        } else {
            readonly = false;
        }
        console.log(`Readonly mode is ${readonly ? "enabled" : "disabled"}.`);
    } catch (db_error) {
        console.error("Database error during loading config, defaulting to readonly = false:", db_error);
        readonly = false;
    }

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
        if (!socket.user) {
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
        });

        // send updated connected users list to admin room
        io.to("admin").emit("connected_users", Array.from(connected_users));

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
                        typeof x === "number" && x >= 0 && x < GRID_WIDTH &&
                        typeof y === "number" && y >= 0 && y < GRID_HEIGHT &&
                        typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
                    )
                ) {
                    return;
                }

                if (readonly) {
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
                if (timeouts[user_id] && timeouts[user_id] > current_time) {
                    // user is still in timeout period
                    const wait_time = Math.ceil((timeouts[user_id] - current_time) / 1000);
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
                timeouts[user_id] = current_time + PIXEL_TIMEOUT_MS;

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
            if (timeout && timeout > current_time) {
                const remaining = timeouts[user.sub] - current_time;
                const elapsed = PIXEL_TIMEOUT_MS - remaining;
                socket.emit("timeout_info", {
                    started: current_time - elapsed, // this does it backwards as we don't store when it was started, assumed the PIXEL_TIMEOUT_MS doesnt change
                    remaining,
                    elapsed,
                    ends: timeout,
                    checked_at: current_time
                });
            }
        });

        socket.on("check_readonly", () => {
            socket.emit("readonly", readonly);
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
                // clear grid and author data
                grid_data = initialise_grid_data();
                author_data = initialise_author_data();

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

            readonly = payload;
            console.log(`Readonly mode set to ${readonly}`);

            // broadcast the new readonly value to all clients
            io.emit("readonly", readonly);

            // persist to database
            try {
                await pool.query(
                    `INSERT INTO config (key, value) VALUES ('readonly', $1)
                     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                    [readonly ? "true" : "false"]
                );
                console.log(`Readonly mode persisted to database as ${readonly}`);
            } catch (db_error) {
                console.error("Database error during setting readonly mode, please set in DB manually to ensure the setting is kept:", db_error);
            }
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

// TODO: unique users stat
