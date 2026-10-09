"use client";

import {useEffect, useRef} from "react";

import {socket} from "@/socket";


const SpectatorCanvas = ({className = ""}: {className?: string}) => {
    const canvas_ref = useRef<HTMLCanvasElement | null>(null);
    const wrapper_ref = useRef<HTMLDivElement | null>(null);

    // latest grid snapshot, kept in a ref so socket handlers can patch it without re-rendering
    const grid_ref = useRef<string[][]>([]);

    useEffect(() => {
        const canvas = canvas_ref.current;
        const wrapper = wrapper_ref.current;
        if (!canvas || !wrapper) {
            return;
        }

        // scale the (grid-resolution) bitmap up to fill the wrapper while preserving aspect ratio
        const fit = () => {
            if (canvas.width === 0 || canvas.height === 0) {
                return;
            }

            const scale = Math.min(wrapper.clientWidth / canvas.width, wrapper.clientHeight / canvas.height);
            canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
            canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
        };

        const redraw_all = () => {
            const grid = grid_ref.current;
            const height = grid.length;
            const width = grid[0]?.length ?? 0;

            if (width === 0 || height === 0) {
                return;
            }

            // one device pixel per cell; CSS scaling (pixelated) blows it up crisply
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }

            for (let y = 0; y < height; y++) {
                const row = grid[y];
                for (let x = 0; x < width; x++) {
                    ctx.fillStyle = row[x];
                    ctx.fillRect(x, y, 1, 1);
                }
            }

            fit();
        };

        // a fresh full_grid also arrives after a grid resize, so this transparently handles size changes
        const handle_full_grid = (grid: string[][]) => {
            grid_ref.current = grid;
            redraw_all();
        };

        const handle_pixel_update = ({x, y, color}: {x: number; y: number; color: string}) => {
            const row = grid_ref.current[y];
            if (!row || x < 0 || x >= row.length) {
                return;
            }

            row[x] = color;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }
        };

        // ask for the current grid on mount, and again if the socket reconnects
        const request_grid = () => socket.emit("request_full_grid");

        socket.on("full_grid", handle_full_grid);
        socket.on("pixel_update", handle_pixel_update);
        socket.on("connect", request_grid);
        request_grid();

        const observer = new ResizeObserver(fit);
        observer.observe(wrapper);

        return () => {
            socket.off("full_grid", handle_full_grid);
            socket.off("pixel_update", handle_pixel_update);
            socket.off("connect", request_grid);
            observer.disconnect();
        };
    }, []);

    return (
        <div ref={wrapper_ref} className={`flex items-center justify-center overflow-hidden ${className}`}>
            <canvas
                ref={canvas_ref}
                style={{imageRendering: "pixelated"}}
                className="rounded-md shadow-2xl ring-1 ring-white/10"
            />
        </div>
    );
};

export default SpectatorCanvas;
