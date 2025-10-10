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

const GRID_WIDTH = process.env.NEXT_PUBLIC_GRID_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GRID_WIDTH) : 100;
const GRID_HEIGHT = process.env.NEXT_PUBLIC_GRID_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GRID_HEIGHT) : 100;
const PIXEL_TIMEOUT_MS = process.env.PIXEL_TIMEOUT_MS ? parseInt(process.env.PIXEL_TIMEOUT_MS) : 30000;

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

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

const timeouts: {[user_id: string]: number} = {};

let banned_user_ids: string[] = [];
let banned_usernames_cache: {[user_id: string]: string} = {};

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

const main = async () => {
    await app.prepare();

    // load existing pixels from database
    const loaded_pixel_count = await load_pixels();

    console.log(`Loaded ${loaded_pixel_count} pixels from database.`);

    // load banned users from database
    await load_banned_users();

    console.log(`Loaded ${banned_user_ids.length} banned users from database.`);

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

        console.log(`Client connected: ${socket.id}, user ${socket.user.name} (id: ${socket.user.sub})`);

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

                    // then upsert the pixel
                    await pool.query(
                        `INSERT INTO pixels (x, y, color, author_id)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color, author_id = EXCLUDED.author_id`,
                        [x, y, color, user_id]
                    );

                    console.log(`Database updated for pixel at (${x}, ${y})`);
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
                console.error("Invalid pixel_update payload", error);
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

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
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
