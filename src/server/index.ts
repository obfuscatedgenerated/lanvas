import "dotenv/config";

import {createServer} from "node:http";
import next from "next";

import {Server} from "socket.io";
import {instrument} from "@socket.io/admin-ui";

import {getToken} from "next-auth/jwt";
import {parse as parse_cookies} from "cookie";

import {Pool} from "pg";

import register, {intercept_pool, register_intercept_metrics} from "@/server/prometheus";
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
import {cleanup_timeouts} from "@/server/timeouts";

// clean up timeouts periodically
setInterval(() => {
    const cleaned_count = cleanup_timeouts();

    if (cleaned_count > 0) {
        console.log(`Cleaned up ${cleaned_count} expired timeouts.`);
    }
}, 60 * 1000); // every minute

import * as handlers from "@/server/handlers/@ALL";
import {is_automod_supported, preload_model} from "@/server/automod";
import {get_all_stats, load_stats, set_virtual_stat} from "@/server/stats";

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
    min: 2, // keep 2 connections alive to prevent cold start delays
});

// monitor pg pool
monitorPgPool(pool, register);
intercept_pool(pool);
register_intercept_metrics();

console.log("Prometheus PostgreSQL pool monitoring enabled.");

// TODO: add our own socketio metrics to prometheus register, although may be a bit redundant as we already list active connections in our own stats

const hostname = process.argv[2] || "localhost";
const port = parseInt(process.argv[3], 10) || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({dev, hostname, port});
const req_handler = app.getRequestHandler();

const connected_users = new Set<ConnectedUserDetails>();
const unique_connected_user_ids = new Set<string>();

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

    if (is_automod_supported()) {
        console.log("Automod is supported, preloading model in background...");

        preload_model().then((success) => {
            if (success) {
                console.log("Automod model preloaded successfully.");
            } else {
                console.error("Automod model preload failed.");
            }
        });
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
    const stat_key_count = await load_stats(pool);

    console.log(`Loaded ${stat_key_count} stats from database.`);

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
        set_virtual_stat("connected_unique_users", unique_connected_user_ids.size, true);

        // emit updated stats to all clients in stats room
        io.to("stats").emit("stats", Object.fromEntries(get_all_stats()));

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
                set_virtual_stat("connected_unique_users", unique_connected_user_ids.size, true);

                // emit updated stats to all clients in stats room
                io.to("stats").emit("stats", Object.fromEntries(get_all_stats()));
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

                    connected_users,
                    unique_connected_user_ids,
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
// TODO: remove duplication of readonly and set config readonly, as clinets currently only listen when its admin_set_readonly event
