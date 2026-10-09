"use client";

import React, {useRef, useEffect, useImperativeHandle, useCallback, type RefObject} from "react";

export interface GridCanvasRef {
    update_draw: () => void;
    get_canvas: () => HTMLCanvasElement | null;
}

interface GridCanvasProps {
    grid_data: string[][];

    pixel_size: number;
    grid_height: number;
    grid_width: number;

    ref?: RefObject<GridCanvasRef | null>;

    on_click?: (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
    on_right_click?: (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
    on_mouse_move?: (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
    on_mouse_leave?: (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
}

// touch devices have no right click, so a stationary press that lasts this long stands in for one
const LONG_PRESS_MS = 450;
// finger jitter below this (in px) still counts as a stationary press; past it we assume a pan and bail
const LONG_PRESS_MOVE_CANCEL_PX = 12;

const GridCanvas = ({ grid_data, pixel_size, grid_height, grid_width, ref, on_click, on_mouse_move, on_mouse_leave, on_right_click }: GridCanvasProps) => {
    const canvas_ref = useRef<HTMLCanvasElement>(null);
    const old_grid_data = useRef<string[][]>([]);

    // long press (touch "right click") state
    const long_press_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touch_start = useRef<{ x: number; y: number } | null>(null);
    // set when a long press fires so the tap/click it ends with doesn't also place a pixel
    const suppress_click = useRef(false);
    // set while the long press is handled on touch so the OS context menu event doesn't double fire it
    const touch_long_press_fired = useRef(false);

    // expose methods to parent via ref
    useImperativeHandle(ref, () => ({
        update_draw,
        get_canvas: () => canvas_ref.current,
    }));
    
    const update_draw = useCallback(() => {
        // update the canvas
        if (!canvas_ref.current) return;

        // ensure the canvas is the right size
        if (canvas_ref.current.width !== grid_width * pixel_size || canvas_ref.current.height !== grid_height * pixel_size) {
            canvas_ref.current.width = grid_width * pixel_size;
            canvas_ref.current.height = grid_height * pixel_size;
            old_grid_data.current = []; // force full redraw
        }

        const ctx = canvas_ref.current.getContext("2d");
        if (!ctx) return;

        // ensure image smoothing is disabled for pixelated look
        ctx.imageSmoothingEnabled = false;

        ctx.save();
        
        // redraw only changed pixels
        for (let y = 0; y < grid_height; y++) {
            for (let x = 0; x < grid_width; x++) {
                if (old_grid_data.current[y]?.[x] !== grid_data[y][x]) {
                    ctx.fillStyle = grid_data[y][x];

                    const draw_x = x * pixel_size;
                    const draw_y = y * pixel_size;
                    const draw_size = pixel_size;
                    ctx.fillRect(draw_x, draw_y, draw_size, draw_size);
                }
            }
        }
        
        ctx.restore();

        old_grid_data.current = grid_data.map(row => row.slice()); // deep copy
    }, [grid_data, pixel_size, grid_height, grid_width]);

    // redraw when grid data changes
    useEffect(() => {
        if (grid_data !== old_grid_data.current) {
            update_draw();
        }
    }, [grid_data, update_draw]);

    // don't let a pending long press timer fire after the canvas is gone
    useEffect(() => () => {
        if (long_press_timer.current) {
            clearTimeout(long_press_timer.current);
        }
    }, []);

    const right_clicked = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            e.preventDefault();

            // on touch, the long press timer already handles comments; ignore the OS context menu
            // event that a held finger also raises (during the press, or briefly after it fires)
            if (touch_start.current !== null || touch_long_press_fired.current) {
                return;
            }

            if (on_right_click) {
                on_right_click(e);
            }
        },
        [on_right_click]
    );

    const clear_long_press = useCallback(() => {
        if (long_press_timer.current) {
            clearTimeout(long_press_timer.current);
            long_press_timer.current = null;
        }
    }, []);

    const handle_touch_start = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            clear_long_press();
            touch_long_press_fired.current = false;
            suppress_click.current = false;

            // a second finger means a pinch/zoom, not a press
            if (e.touches.length !== 1) {
                touch_start.current = null;
                return;
            }

            const touch = e.touches[0];
            const { clientX, clientY } = touch;
            touch_start.current = { x: clientX, y: clientY };

            long_press_timer.current = setTimeout(() => {
                long_press_timer.current = null;
                touch_long_press_fired.current = true;
                // swallow the tap that lifting the finger will produce
                suppress_click.current = true;

                // a short haptic tick confirms the press where it's supported (not iOS Safari)
                navigator.vibrate?.(10);

                // only clientX/clientY are read downstream; synthesise the rest of the mouse event shape
                on_right_click?.({
                    clientX,
                    clientY,
                    preventDefault: () => {},
                } as React.MouseEvent<HTMLCanvasElement, MouseEvent>);
            }, LONG_PRESS_MS);
        },
        [clear_long_press, on_right_click]
    );

    const handle_touch_move = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            const start = touch_start.current;
            if (!start || e.touches.length === 0) {
                clear_long_press();
                return;
            }

            const touch = e.touches[0];
            if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > LONG_PRESS_MOVE_CANCEL_PX) {
                // the finger wandered too far, so treat it as a pan and drop the pending press
                clear_long_press();
                touch_start.current = null;
            }
        },
        [clear_long_press]
    );

    const handle_touch_end = useCallback(() => {
        clear_long_press();
        touch_start.current = null;
    }, [clear_long_press]);

    const handle_click = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
            // the tap that ends a long press shouldn't also place a pixel
            if (suppress_click.current) {
                suppress_click.current = false;
                return;
            }

            on_click?.(e);
        },
        [on_click]
    );

    return (
        <canvas
            ref={canvas_ref}
            className="block pixelated select-none"
            style={{
                width: grid_width * pixel_size,
                height: grid_height * pixel_size,
                // stop iOS from hijacking the long press with its own callout / selection menu
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
            }}
            onClick={handle_click}
            onMouseMove={on_mouse_move}
            onMouseLeave={on_mouse_leave}
            onContextMenu={right_clicked}
            onTouchStart={handle_touch_start}
            onTouchMove={handle_touch_move}
            onTouchEnd={handle_touch_end}
            onTouchCancel={handle_touch_end}
        />
    );
};

export default GridCanvas;