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

console.log(`Grid size: ${GRID_WIDTH}x${GRID_HEIGHT}`);

// basic test in memory, will switch to database once sockets work
let grid_data = Array.from({ length: GRID_HEIGHT }, () =>
    Array(GRID_WIDTH).fill("#FFFFFF")
);

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

        // handle pixel updates from clients
        socket.on("pixel_update", (payload) => {
            try {
                const { x, y, color } = payload;
                //console.log(`Received pixel_update from ${socket.id}:`, payload);
                
                if (
                    // basic validation of incoming data
                    // TODO: handle auth tokens
                    typeof x === "number" && x >= 0 && x < GRID_WIDTH &&
                    typeof y === "number" && y >= 0 && y < GRID_HEIGHT &&
                    typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
                ) {
                    grid_data[y][x] = color;
                    console.log(`Pixel updated at (${x}, ${y}) to ${color} by user ${socket.user.name} (id: ${socket.user.sub})`);

                    // broadcast the pixel update to all connected clients
                    io.emit("pixel_update", { x, y, color });
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
});
