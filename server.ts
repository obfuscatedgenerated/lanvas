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

// in memory caches with default empty values
const grid_data = Array.from({length: GRID_HEIGHT}, () =>
    Array(GRID_WIDTH).fill("#FFFFFF")
);

const author_data = Array.from({length: GRID_HEIGHT}, () =>
    Array(GRID_WIDTH).fill(null)
);

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

const timeouts: {[user_id: string]: number} = {};

const banned_user_ids: string[] = [];

interface SocketWithJWT extends Socket {
    user?: JWT
}

const main = async () => {
    await app.prepare();

    // load existing pixels from database
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

    console.log(`Loaded ${loaded_pixel_count} pixels from database.`);

    // load banned users from database
    const banned_users_res = await pool.query("SELECT user_id FROM banned_user_ids");
    for (const row of banned_users_res.rows) {
        banned_user_ids.push(row.user_id);
    }

    console.log(`Loaded ${banned_user_ids.length} banned users from database.`);

    // TODO: a way to sync bans or add them in a way that this cache is kept up to date without restarting the server

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
