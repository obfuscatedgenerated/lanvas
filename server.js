import "dotenv/config";

import { createServer } from "node:http";
import next from "next";

import { Server } from "socket.io";

import { getToken } from "next-auth/jwt";
import { parse as parse_cookies } from "cookie";

const dev = process.env.NODE_ENV !== "production";

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

if (!NEXTAUTH_SECRET) {
    throw new Error("Missing NEXTAUTH_SECRET");
}

const hostname = process.argv[2] || "localhost";
const port = parseInt(process.argv[3], 10) || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const GRID_WIDTH = process.env.NEXT_PUBLIC_GRID_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GRID_WIDTH) : 100;
const GRID_HEIGHT = process.env.NEXT_PUBLIC_GRID_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GRID_HEIGHT) : 100;
const PIXEL_TIMEOUT_MS = process.env.PIXEL_TIMEOUT_MS ? parseInt(process.env.PIXEL_TIMEOUT_MS) : 30000;

console.log(`Grid size: ${GRID_WIDTH}x${GRID_HEIGHT}`);

// basic test in memory, will switch to database once sockets work
let grid_data = Array.from({ length: GRID_HEIGHT }, () =>
    Array(GRID_WIDTH).fill("#FFFFFF")
);

let author_data = Array.from({ length: GRID_HEIGHT }, () =>
    Array(GRID_WIDTH).fill(null)
);

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

let timeouts = {};

const banned_user_ids = [];

app.prepare().then(() => {
    const http_server = createServer(handler);

    const io = new Server(http_server);

    // jwt validation middleware
    io.use(async (socket, next_handler) => {
        const handshake = socket.handshake;

        if (!handshake.headers.cookie) {
            return next_handler(new Error("Authentication error: No cookies provided."));
        }

        // prepare cookies into format accepted by next-auth
        handshake.cookies = parse_cookies(handshake.headers.cookie || "");

        const token = await getToken({
            req: handshake,
            secret: NEXTAUTH_SECRET,
        });

        if (!token) {
            return next_handler(new Error("Authentication error: Invalid token."));
        }

        socket.user = token;
        next_handler();
    });

    io.on("connection", (socket) => {
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
        socket.on("pixel_update", (payload) => {
            try {
                const { x, y, color } = payload;
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

                // check if user is banned
                const user_id = socket.user.sub;
                if (banned_user_ids.includes(user_id)) {
                    socket.emit("pixel_update_rejected", { reason: "banned" });
                    return;
                }

                // check user isn't in timeout period
                const current_time = Date.now();
                if (timeouts[user_id] && timeouts[user_id] > current_time) {
                    // user is still in timeout period
                    const wait_time = Math.ceil((timeouts[user_id] - current_time) / 1000);
                    socket.emit("pixel_update_rejected", { reason: "timeout", wait_time });
                    return;
                }

                const author = {
                    user_id,
                    name: socket.user.name,
                    avatar_url: socket.user.picture || null,
                };

                grid_data[y][x] = color;
                author_data[y][x] = author;
                console.log(`Pixel updated at (${x}, ${y}) to ${color} by user ${socket.user.name} (id: ${user_id})`);

                // set new timeout for user
                timeouts[user_id] = current_time + PIXEL_TIMEOUT_MS;

                // broadcast the pixel update to all connected clients
                io.emit("pixel_update", { x, y, color, author });
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
});
