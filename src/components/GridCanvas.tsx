"use client";

import React, {useRef, useEffect, useImperativeHandle, useCallback, type RefObject} from "react";

export interface GridCanvasRef {
    update_draw: () => void;
    get_canvas: () => HTMLCanvasElement | null;
}

interface GridCanvasProps {
    grid_data: string[][];
    on_pixel_click: (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
    pixel_size: number;
    grid_height: number;
    grid_width: number;
    clear_color?: string;
    ref: RefObject<GridCanvasRef | null>;
}

const GridCanvas = ({ grid_data, on_pixel_click, pixel_size, grid_height, grid_width, ref}: GridCanvasProps) => {
    const canvas_ref = useRef<HTMLCanvasElement>(null);
    const old_grid_data = useRef<string[][]>([]);
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

    return (
        <canvas
            ref={canvas_ref}
            className="w-full h-full block pixelated"
            onClick={on_pixel_click}
            onContextMenu={(e) => e.preventDefault()}
        />
    );
};

export default GridCanvas;