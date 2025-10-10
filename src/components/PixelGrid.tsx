"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

import { socket } from "@/socket";
import GridCanvas, {type GridCanvasRef} from "@/components/GridCanvas";
import CursorTooltipWrapper from "@/components/CursorTooltipWrapper";

import type { Author } from "@/types";
import AuthorTooltipContent from "@/components/AuthorTooltipContent";
import useMediaQuery from "@/hooks/useMediaQuery";

const PIXEL_SIZE = 10; // use slight oversampling. could also instead use pixelated on parent, but that leads to weird subpixel artifacts
const GRID_WIDTH = process.env.NEXT_PUBLIC_GRID_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GRID_WIDTH) : 100;
const GRID_HEIGHT = process.env.NEXT_PUBLIC_GRID_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GRID_HEIGHT) : 100;

const create_empty_grid = () => Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill("#FFFFFF"));

interface PixelGridProps {
    current_color: string;
    can_submit?: boolean;

    on_pixel_submitted?: (x: number, y: number, color: string) => void;
    on_pixel_update_rejected?: (reason: string) => void;
}

type AuthorData = (Author | null)[][];

const PixelGrid = ({ current_color, can_submit = true, on_pixel_submitted, on_pixel_update_rejected }: PixelGridProps) => {
    const [grid_data, setGridData] = useState(create_empty_grid);
    const author_data = useRef<AuthorData>([]);

    const grid_canvas_ref = useRef<GridCanvasRef>(null);

    // setup socket listeners
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("full_grid", (initial_grid) => {
            setGridData(initial_grid);
            console.log("Initial grid received");
        });

        socket.on("full_author_data", (data) => {
            author_data.current = data;
            console.log("Initial author data received");
        });

        socket.on("pixel_update", ({ x, y, color, author }) => {
            setGridData(prev => {
                // update only the changed pixel
                const new_grid = prev.map(row => row.slice());
                if (new_grid[y] && new_grid[y][x] !== undefined) {
                    new_grid[y][x] = color;
                }
                return new_grid;
            });

            if (!author_data.current[y]) {
                author_data.current[y] = [];
            }

            author_data.current[y][x] = author;
        });

        socket.on("pixel_update_rejected", (data) => {
            console.log("Pixel update rejected", data);

            if (data.reason === "timeout") {
                // ui should already prevent this, so just ignore in case of any millisecond clock sync moments
                return;
            }

            alert(`Pixel update rejected! Reason: ${data.reason}`);
            if (on_pixel_update_rejected) {
                on_pixel_update_rejected(data);
            }
        });

        // request initial grid and author data
        socket.emit("request_full_grid");
        socket.emit("request_full_author_data");

        return () => {
            socket.disconnect();
        }
    }, [on_pixel_update_rejected]);
    
    const resolve_pixel = useCallback(({clientX, clientY}: {clientX: number, clientY: number}) => {
        if (!grid_canvas_ref.current) return null;
        
        const canvas = grid_canvas_ref.current.get_canvas();
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();

        // calculate click position relative to canvas (the bounding rect will move with panning/zooming)
        const click_x = clientX - rect.left;
        const click_y = clientY - rect.top;

        // adjust for bounding rect scale
        const rect_scale_x = canvas.width / rect.width;
        const rect_scale_y = canvas.height / rect.height;
        const adjusted_x = click_x * rect_scale_x;
        const adjusted_y = click_y * rect_scale_y;

        // get closest pixel
        const pixel_x = Math.floor(adjusted_x / PIXEL_SIZE);
        const pixel_y = Math.floor(adjusted_y / PIXEL_SIZE);

        // validate
        if (pixel_x < 0 || pixel_x >= GRID_WIDTH || pixel_y < 0 || pixel_y >= GRID_HEIGHT) return null;
        
        return { pixel_x, pixel_y };
    }, []);

    // click handler
    const handle_pixel_click = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (!can_submit) {
                console.log("Cannot submit pixel");
                return;
            }

            if (!grid_canvas_ref.current || !socket) return;
            
            const resolved_pixel = resolve_pixel(event);
            if (!resolved_pixel) return;
            
            const { pixel_x, pixel_y } = resolved_pixel;

            console.log(`Clicked pixel: (${pixel_x}, ${pixel_y}) with color ${current_color}`);

            // pre-validate
            if (pixel_x < 0 || pixel_x >= GRID_WIDTH || pixel_y < 0 || pixel_y >= GRID_HEIGHT) return;

            // TODO: send token for rate limiting / auth
            socket.emit("pixel_update", { x: pixel_x, y: pixel_y, color: current_color });

            if (on_pixel_submitted) {
                on_pixel_submitted(pixel_x, pixel_y, current_color);
            }
        },
        [can_submit, resolve_pixel, current_color, on_pixel_submitted]
    );

    const [hovered_author, setHoveredAuthor] = useState<Author | null>(null);
    const handle_mouse_move = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (!grid_canvas_ref.current || !socket) return;

            const resolved_pixel = resolve_pixel(event);
            if (!resolved_pixel) return;

            const { pixel_x, pixel_y } = resolved_pixel;

            const author = author_data.current[pixel_y]?.[pixel_x];
            setHoveredAuthor(author ?? null);
        },
        [resolve_pixel]
    );

    const handle_mouse_leave = useCallback(
        () => {
            setHoveredAuthor(null);
        },
        []
    );

    const can_hover = useMediaQuery("(hover: hover)");

    return (
        <CursorTooltipWrapper
            content={hovered_author && <AuthorTooltipContent author={hovered_author} />}
            visible={can_hover && hovered_author !== null}
        >
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
                    wrapperStyle={{ width: "100%", height: "100%", imageRendering: "crisp-edges", cursor: can_submit ? "crosshair" : "default" }}
                    contentStyle={{ width: "100%", height: "100%" }}
                >
                    <GridCanvas
                        ref={grid_canvas_ref}
                        grid_data={grid_data}

                        on_click={handle_pixel_click}
                        on_mouse_move={handle_mouse_move}
                        on_mouse_leave={handle_mouse_leave}

                        pixel_size={PIXEL_SIZE}
                        grid_height={GRID_HEIGHT}
                        grid_width={GRID_WIDTH}
                    />
                </TransformComponent>
            </TransformWrapper>
        </CursorTooltipWrapper>
    );
};

export default PixelGrid;