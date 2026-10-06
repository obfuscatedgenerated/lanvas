"use client";

import {useEffect, useRef} from "react";

import type {PixelGridRef} from "@/components/PixelGrid";
import {colours_match, type TemplateCells, type TemplateSettings} from "@/lib/template";

// dots cover this fraction of a cell, leaving the real canvas visible around them
const DOT_FRACTION = 0.4;

const MISMATCH_OUTLINE = "rgba(255, 59, 92, 0.95)";
const DOT_OUTLINE = "rgba(0, 0, 0, 0.55)";

export interface TemplateProgress {
    matched: number;
    total: number;
}

interface TemplateOverlayProps {
    settings: TemplateSettings;
    cells: TemplateCells;

    grid_data: string[][];
    grid_width: number;
    grid_height: number;
    pixel_size: number;
    api: PixelGridRef;

    // while true the template can be dragged around and the canvas underneath can't be clicked
    move_mode: boolean;

    on_move: (x: number, y: number) => void;
    on_progress: (progress: TemplateProgress) => void;
    on_pick_colour: (colour: string) => void;
}

// screen position to fractional grid cells, unbounded so dragging past the canvas edge still works
const screen_to_grid = (api: PixelGridRef, pixel_size: number, screen_x: number, screen_y: number) => {
    const {rect_x, rect_y} = api.screen_to_rect_space(screen_x, screen_y);
    const {canvas_x, canvas_y} = api.rect_to_canvas_space(rect_x, rect_y);

    return {grid_x: canvas_x / pixel_size, grid_y: canvas_y / pixel_size};
};

const is_typing_target = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// draws the template over its own patch of the canvas, so moving it is just a css change
const TemplateOverlay = ({settings, cells, grid_data, grid_width, grid_height, pixel_size, api, move_mode, on_move, on_progress, on_pick_colour}: TemplateOverlayProps) => {
    const canvas_ref = useRef<HTMLCanvasElement>(null);

    const template_width = cells[0]?.length ?? 0;
    const template_height = cells.length;

    // comparisons always use whole cells, even when the drawing sits between them
    const origin_x = Math.round(settings.x);
    const origin_y = Math.round(settings.y);

    useEffect(() => {
        const canvas = canvas_ref.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
            return;
        }

        canvas.width = template_width * pixel_size;
        canvas.height = template_height * pixel_size;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const dot_size = Math.max(2, Math.round(pixel_size * DOT_FRACTION));
        const dot_offset = (pixel_size - dot_size) / 2;

        let matched = 0;
        let total = 0;

        for (let row = 0; row < template_height; row++) {
            for (let column = 0; column < template_width; column++) {
                const colour = cells[row][column];
                if (!colour) {
                    continue;
                }

                const grid_x = origin_x + column;
                const grid_y = origin_y + row;
                const on_canvas = grid_x >= 0 && grid_x < grid_width && grid_y >= 0 && grid_y < grid_height;

                const is_match = on_canvas && grid_data[grid_y]?.[grid_x] !== undefined && colours_match(grid_data[grid_y][grid_x], colour);

                if (on_canvas) {
                    total++;

                    if (is_match) {
                        matched++;
                    }
                }

                const left = column * pixel_size;
                const top = row * pixel_size;

                if (settings.mode === "solid") {
                    context.fillStyle = colour;
                    context.fillRect(left, top, pixel_size, pixel_size);
                    continue;
                }

                if (settings.mode === "mismatches" && is_match) {
                    continue;
                }

                context.fillStyle = colour;
                context.fillRect(left + dot_offset, top + dot_offset, dot_size, dot_size);

                context.lineWidth = 1;
                context.strokeStyle = DOT_OUTLINE;
                context.strokeRect(left + dot_offset + 0.5, top + dot_offset + 0.5, dot_size - 1, dot_size - 1);

                if (settings.mode === "mismatches") {
                    context.lineWidth = 1.5;
                    context.strokeStyle = MISMATCH_OUTLINE;
                    context.strokeRect(left + 1, top + 1, pixel_size - 2, pixel_size - 2);
                }
            }
        }

        on_progress({matched, total});
    }, [cells, grid_data, grid_width, grid_height, pixel_size, template_width, template_height, origin_x, origin_y, settings.mode, on_progress]);

    // press e over the template to pick up the colour it wants there
    const last_pointer_ref = useRef<{x: number; y: number} | null>(null);

    useEffect(() => {
        const handle_pointer_move = (event: PointerEvent) => {
            last_pointer_ref.current = {x: event.clientX, y: event.clientY};
        };

        const handle_key_down = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== "e" || event.ctrlKey || event.metaKey || event.altKey || is_typing_target(event.target)) {
                return;
            }

            const pointer = last_pointer_ref.current;
            if (!pointer) {
                return;
            }

            const {grid_x, grid_y} = screen_to_grid(api, pixel_size, pointer.x, pointer.y);
            const column = Math.floor(grid_x) - origin_x;
            const row = Math.floor(grid_y) - origin_y;

            const colour = cells[row]?.[column];
            if (colour) {
                on_pick_colour(colour);
            }
        };

        window.addEventListener("pointermove", handle_pointer_move, {passive: true});
        window.addEventListener("keydown", handle_key_down);

        return () => {
            window.removeEventListener("pointermove", handle_pointer_move);
            window.removeEventListener("keydown", handle_key_down);
        };
    }, [api, pixel_size, cells, origin_x, origin_y, on_pick_colour]);

    // dragging keeps the grab point under the cursor rather than jumping the corner to it
    const drag_ref = useRef<{start_grid_x: number; start_grid_y: number; start_x: number; start_y: number} | null>(null);

    const handle_pointer_down = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!move_mode || event.button !== 0) {
            return;
        }

        const {grid_x, grid_y} = screen_to_grid(api, pixel_size, event.clientX, event.clientY);
        drag_ref.current = {start_grid_x: grid_x, start_grid_y: grid_y, start_x: settings.x, start_y: settings.y};

        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handle_pointer_move = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = drag_ref.current;
        if (!drag) {
            return;
        }

        const {grid_x, grid_y} = screen_to_grid(api, pixel_size, event.clientX, event.clientY);
        const next_x = drag.start_x + grid_x - drag.start_grid_x;
        const next_y = drag.start_y + grid_y - drag.start_grid_y;

        on_move(settings.grid_align ? Math.round(next_x) : next_x, settings.grid_align ? Math.round(next_y) : next_y);
    };

    const handle_pointer_up = (event: React.PointerEvent<HTMLCanvasElement>) => {
        drag_ref.current = null;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    return (
        <canvas
            ref={canvas_ref}
            className={`absolute top-0 left-0 ${move_mode ? "cursor-move outline-2 outline-dashed outline-sky-400" : "pointer-events-none"}`}
            style={{
                width: template_width * pixel_size,
                height: template_height * pixel_size,
                transform: `translate(${settings.x * pixel_size}px, ${settings.y * pixel_size}px)`,
                opacity: settings.opacity,
                imageRendering: "pixelated",
            }}
            onPointerDown={handle_pointer_down}
            onPointerMove={handle_pointer_move}
            onPointerUp={handle_pointer_up}
            onPointerCancel={handle_pointer_up}
            aria-hidden
        />
    );
};

export default TemplateOverlay;