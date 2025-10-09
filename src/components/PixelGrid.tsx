"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import { socket } from "@/socket";
import GridCanvas, {type GridCanvasRef} from "@/components/GridCanvas";

const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const PIXEL_SIZE = 10;

const create_empty_grid = () => Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill("#FFFFFF"));

interface PixelGridProps {
    current_color: string;
}

const PixelGrid = ({ current_color }: PixelGridProps) => {
    const [grid_data, setGridData] = useState(create_empty_grid);
    const grid_canvas_ref = useRef<GridCanvasRef>(null);

    // setup socket listeners
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("full_grid", (initial_grid) => {
            setGridData(initial_grid);
            console.log("Initial grid received");
        });

        socket.on("pixel_update", ({ x, y, color }) => {
            setGridData(prev => {
                // update only the changed pixel
                const new_grid = prev.map(row => row.slice());
                if (new_grid[y] && new_grid[y][x] !== undefined) {
                    new_grid[y][x] = color;
                }
                return new_grid;
            });
        });

        // request initial grid
        socket.emit("request_full_grid");

        return () => {
            socket.disconnect();
        }
    }, []);

    // click handler
    const handle_pixel_click = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (!grid_canvas_ref.current || !socket) return;

            const canvas = grid_canvas_ref.current.get_canvas();
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();

            // calculate click position relative to canvas (the bounding rect will move with panning/zooming)
            const click_x = event.clientX - rect.left;
            const click_y = event.clientY - rect.top;

            // adjust for bounding rect scale
            const rect_scale_x = canvas.width / rect.width;
            const rect_scale_y = canvas.height / rect.height;
            const adjusted_x = click_x * rect_scale_x;
            const adjusted_y = click_y * rect_scale_y;

            // get closest pixel
            const pixel_x = Math.floor(adjusted_x / PIXEL_SIZE);
            const pixel_y = Math.floor(adjusted_y / PIXEL_SIZE);

            console.log(`Clicked pixel: (${pixel_x}, ${pixel_y}) with color ${current_color}`);

            // pre-validate
            if (pixel_x < 0 || pixel_x >= GRID_WIDTH || pixel_y < 0 || pixel_y >= GRID_HEIGHT) return;

            // TODO: send token for rate limiting / auth
            socket.emit("pixel_update", { x: pixel_x, y: pixel_y, color: current_color });
        },
        [current_color]
    );

    return (
        <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={25}
            limitToBounds={false}
            panning={{
                allowLeftClickPan: false,
                allowRightClickPan: true,
                allowMiddleClickPan: true,
            }}
        >
            <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%"}}
                contentStyle={{ width: "100%", height: "100%" }}
            >
                <GridCanvas
                    ref={grid_canvas_ref}
                    grid_data={grid_data}
                    on_pixel_click={handle_pixel_click}

                    pixel_size={PIXEL_SIZE}
                    grid_height={GRID_HEIGHT}
                    grid_width={GRID_WIDTH}
                />
            </TransformComponent>
        </TransformWrapper>
    );
};

export default PixelGrid;