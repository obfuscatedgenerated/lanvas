import "dotenv/config";

import {createServer} from "node:http";
import next from "next";

import {Server} from "socket.io";
import {instrument} from "@socket.io/admin-ui";

import {getToken} from "next-auth/jwt";
import {parse as parse_cookies} from "cookie";

import {Pool} from "pg";

import register from "@/server/prometheus";
import {monitorPgPool} from "@christiangalsterer/node-postgres-prometheus-exporter";

import {
    ConnectedUserDetails,
    SocketWithJWT,
    SocketHandler
} from "@/server/types";

import {
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
} from "@/consts";

import {
    get_config,
    load_config,
} from "@/server/config";

import {load_pixels} from "@/server/grid";
import {load_banned_users} from "@/server/banlist";

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

// monitor pg pool
monitorPgPool(pool, register);
console.log("Prometheus PostgreSQL pool monitoring enabled.");

// TODO: add our own socketio metrics to prometheus register, although may be a bit redundant as we already list active connections in our own stats

const hostname = process.argv[2] || "localhost";
const port = parseInt(process.argv[3], 10) || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({dev, hostname, port});
const req_handler = app.getRequestHandler();

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

const timeouts: {[user_id: string]: {
    started: number;
    ends: number;
}} = {};

// clean up timeouts periodically
setInterval(() => {
    const current_time = Date.now();
    let cleaned_count = 0;
    for (const [user_id, timeout] of Object.entries(timeouts)) {
        if (timeout.ends <= current_time) {
            delete timeouts[user_id];
            cleaned_count++;
        }
    }

    if (cleaned_count > 0) {
        console.log(`Cleaned up ${cleaned_count} expired timeouts.`);
    }
}, 60 * 1000);

const connected_users = new Set<ConnectedUserDetails>();
const unique_connected_user_ids = new Set<string>();

const stats = new Map<string, number>();
const manual_stat_keys = new Set<string>();

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
    const ban_count = await load_banned_users(pool);

    console.log(`Loaded ${ban_count} banned users from database.`);

    // load stats from database
    await load_stats();

    console.log(`Loaded ${stats.size} stats from database.`);
    console.log(`Manual stats keys: ${Array.from(manual_stat_keys).join(", ")}`);

    // load existing pixels from database
    const loaded_pixel_count = await load_pixels(pool);

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

    // ensure admin ui can access the socket in dev mode
    const io_opts = dev ? {
        cors: {
            origin: ["https://admin.socket.io"],
            credentials: true,
        },
    } : {};

    const io = new Server(http_server, io_opts);

    // use admin ui only in dev mode
    if (dev) {
        instrument(io, {
            auth: false,
            mode: "development",
        });

        console.log("Socket.io admin UI enabled - https://admin.socket.io/");
        console.error("WARNING: Admin UI has no authentication. Ensure you use production mode for deployment!");
    }

    // jwt validation middleware
    io.use(async (socket, next_handler) => {
        const handshake = socket.handshake;

        // allow admin ui to connect without auth in dev mode
        if (dev && handshake.headers.origin === "https://admin.socket.io") {
            (socket as SocketWithJWT).user = {
                sub: process.env.DISCORD_ADMIN_USER_ID || "admin",
                name: "Admin UI",
            };

            console.error("Admin UI connected!!!");
            return next_handler();
        }

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

        (socket as SocketWithJWT).user = token;
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

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);

            // remove from connected users set
            for (const user of connected_users) {
                if (user.socket_id === socket.id) {
                    connected_users.delete(user);
                    break;
                }
            }

            // send updated connected users list to admin room
            io.to("admin").emit("connected_users", Array.from(connected_users));

            // determine if user has any other active connections
            let still_connected = false;
            for (const user of connected_users) {
                if (user.user_id === socket.user?.sub) {
                    still_connected = true;
                    break;
                }
            }

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
                    timeouts,
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
