"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
    TransformWrapper,
    TransformComponent,
    type ReactZoomPanPinchContentRef,
    type ReactZoomPanPinchRef
} from "react-zoom-pan-pinch";

import { socket } from "@/socket";
import GridCanvas, {type GridCanvasRef} from "@/components/GridCanvas";
import CursorTooltipWrapper from "@/components/CursorTooltipWrapper";

import type { Author } from "@/types";
import PixelTooltipContent from "@/components/PixelTooltipContent";
import useMediaQuery from "@/hooks/useMediaQuery";
import {DEFAULT_GRID_COLOR} from "@/defaults";

const PIXEL_SIZE = 10; // use slight oversampling. could also instead use pixelated on parent, but that leads to weird subpixel artifacts

const create_empty_grid = (height: number, width: number) => Array.from({ length: height }, () => Array(width).fill(DEFAULT_GRID_COLOR));

export interface ResolvedPixel {
    pixel_x: number; // x of the rounded pixel
    pixel_y: number; // y of the rounded pixel
    true_x: number; // exact x in pixel coordinates
    true_y: number; // exact y in pixel coordinates
    rect_x: number; // x relative to the canvas bounding rect
    rect_y: number; // y relative to the canvas bounding rect
    source_rect: DOMRect; // the canvas bounding rect that rect_x and rect_y are relative to
}

interface PixelGridProps {
    current_color: string;
    can_submit?: boolean;

    on_pixel_submitted?: (x: number, y: number, color: string) => void;
    on_pixel_update_rejected?: (reason: string) => void;
    
    on_right_click?: (resolved_pixel: ResolvedPixel | null, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;

    on_transformed?: ({ transform_ref, transform_wrapper_ref, transform_state, canvas_ref }: {
        transform_ref: ReactZoomPanPinchRef | null;
        transform_wrapper_ref: ReactZoomPanPinchContentRef | null;
        transform_state: {
            scale: number;
            positionX: number;
            positionY: number;
        };
        canvas_ref: GridCanvasRef | null;
    }) => void;

    tooltip?: boolean;
}

type AuthorData = (Author | null)[][];

const PixelGrid = ({ current_color, can_submit = true, on_pixel_submitted, on_pixel_update_rejected, on_right_click, tooltip =  true, on_transformed }: PixelGridProps) => {
    const [grid_width, setGridWidth] = useState(0);
    const [grid_height, setGridHeight] = useState(0);

    const [grid_data, setGridData] = useState(create_empty_grid(grid_height, grid_width));
    const author_data = useRef<AuthorData>([]);

    const grid_canvas_ref = useRef<GridCanvasRef>(null);

    const transform_wrapper_ref = useRef<ReactZoomPanPinchContentRef>(null);

    // center transform on mount or size change
    useEffect(() => {
        // this is a hack
        setTimeout(() => {
            if (transform_wrapper_ref.current) {
                transform_wrapper_ref.current.setTransform(
                    window.innerWidth / 2 - (grid_width * PIXEL_SIZE) / 2 * 0.66,
                    window.innerHeight / 2 - (grid_height * PIXEL_SIZE) / 2 * 0.66,
                    0.66,
                    0
                );
            }
        }, 10);
    }, [grid_width, grid_height]);

    // setup socket listeners
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("full_grid", (initial_grid) => {
            // determine grid size
            setGridHeight(initial_grid.length);
            setGridWidth(initial_grid[0].length);

            console.log(`Grid size: ${initial_grid[0].length}x${initial_grid.length}`);

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

    const resolve_pixel = useCallback(({clientX, clientY}: {clientX: number, clientY: number}): ResolvedPixel | null => {
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
        const true_x = adjusted_x / PIXEL_SIZE;
        const true_y = adjusted_y / PIXEL_SIZE;
        const pixel_x = Math.floor(true_x);
        const pixel_y = Math.floor(true_y);

        // validate
        if (pixel_x < 0 || pixel_x >= grid_width || pixel_y < 0 || pixel_y >= grid_height) return null;

        return { pixel_x, pixel_y, true_x, true_y, rect_x: click_x, rect_y: click_y, source_rect: rect };
    }, [grid_width, grid_height]);

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
            if (pixel_x < 0 || pixel_x >= grid_width || pixel_y < 0 || pixel_y >= grid_height) return;

            socket.emit("pixel_update", { x: pixel_x, y: pixel_y, color: current_color });

            if (on_pixel_submitted) {
                on_pixel_submitted(pixel_x, pixel_y, current_color);
            }
        },
        [can_submit, resolve_pixel, current_color, grid_width, grid_height, on_pixel_submitted]
    );

    const handle_right_click = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (!grid_canvas_ref.current) return;

            const resolved_pixel = resolve_pixel(event);

            if (on_right_click) {
                on_right_click(resolved_pixel, event);
            }
        },
        [on_right_click, resolve_pixel]
    );

    const [hovered_pixel, setHoveredPixel] = useState<{author: Author, x: number, y: number} | null>(null);
    const handle_mouse_move = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            if (!grid_canvas_ref.current || !socket) return;

            const resolved_pixel = resolve_pixel(event);
            if (!resolved_pixel) return;

            const { pixel_x, pixel_y } = resolved_pixel;

            const author = author_data.current[pixel_y]?.[pixel_x];
            if (!author) {
                setHoveredPixel(null);
                return;
            }

            setHoveredPixel({ author, x: pixel_x, y: pixel_y });
        },
        [resolve_pixel]
    );

    const handle_mouse_leave = useCallback(
        () => {
            setHoveredPixel(null);
        },
        []
    );

    const handle_transform = useCallback(
        (ref: ReactZoomPanPinchRef | null, state: { scale: number; positionX: number; positionY: number; }) => {
            if (on_transformed) {
                on_transformed({
                    transform_ref: ref,
                    transform_wrapper_ref: transform_wrapper_ref.current,
                    transform_state: {
                        scale: state.scale,
                        positionX: state.positionX,
                        positionY: state.positionY,
                    },
                    canvas_ref: grid_canvas_ref.current,
                });
            }
        },
        [on_transformed]
    );

    const can_hover = useMediaQuery("(hover: hover)");

    return (
        <CursorTooltipWrapper
            content={hovered_pixel && <PixelTooltipContent {...hovered_pixel} />}
            visible={tooltip && can_hover && hovered_pixel !== null}
        >
            <TransformWrapper
                ref={transform_wrapper_ref}
                initialScale={0.66}
                minScale={0.5}
                maxScale={25}
                limitToBounds={false}
                panning={{
                    allowLeftClickPan: false,
                    allowRightClickPan: false,
                    allowMiddleClickPan: true,
                }}
                onTransformed={handle_transform}
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
                        on_right_click={handle_right_click}

                        pixel_size={PIXEL_SIZE}
                        grid_height={grid_height}
                        grid_width={grid_width}
                    />
                </TransformComponent>
            </TransformWrapper>
        </CursorTooltipWrapper>
    );
};

export default PixelGrid;