import type {Author} from "@/types";
import type {Pool} from "pg";

import {CONFIG_KEY_GRID_HEIGHT, CONFIG_KEY_GRID_WIDTH} from "@/consts";
import {DEFAULT_GRID_COLOR, DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH} from "@/defaults";
import {get_config} from "@/server/config";

const initialise_grid_data = (height: number, width: number) => Array.from({length: height}, () => Array(width).fill(DEFAULT_GRID_COLOR));

const initialise_author_data = (height: number, width: number) => Array.from({length: height}, () => Array(width).fill(null));

// in memory caches with default empty values
let grid_data: string[][] = [];

let author_data: (Author | null)[][] = [];

// TODO: could reduce redundancy further by storing user ids only in author_data and having a separate user map

export const load_pixels = async (pool: Pool): Promise<number> => {
    const grid_height = get_config(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT);
    const grid_width = get_config(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH);

    grid_data = initialise_grid_data(grid_height, grid_width);
    author_data = initialise_author_data(grid_height, grid_width);

    const pixels = await pool.query(`
        SELECT DISTINCT ON (x, y)
            x,
            y,
            color,
            author_id,
            author.username,
            author.avatar_url
        FROM pixels
            LEFT JOIN user_details AS author ON pixels.author_id = author.user_id
        ORDER BY x, y, snowflake DESC
    `);

    let loaded_pixel_count = 0;
    for (const row of pixels.rows) {
        const {x, y, color, author_id, username, avatar_url} = row;

        // load each pixel into the in-memory grids
        if (x >= 0 && x < grid_width && y >= 0 && y < grid_height) {
            grid_data[y][x] = color;
            author_data[y][x] = author_id === null ? null : {
                user_id: author_id,
                name: username,
                avatar_url,
            };

            loaded_pixel_count++;
        }
    }

    return loaded_pixel_count;
}

export const get_grid_data = (clone = false): string[][] => {
    if (clone) {
        return grid_data.map(row => row.slice());
    }

    return grid_data;
}

export const get_author_data = (clone = false): (Author | null)[][] => {
    if (clone) {
        return author_data.map(row => row.slice());
    }

    return author_data;
}

export const get_cell_color = (x: number, y: number): string | undefined => {
    if (y >= 0 && y < grid_data.length && x >= 0 && x < grid_data[0].length) {
        return grid_data[y][x];
    }
    return undefined;
}

export const get_cell_author = (x: number, y: number): Author | null | undefined => {
    if (y >= 0 && y < author_data.length && x >= 0 && x < author_data[0].length) {
        return author_data[y][x];
    }
    return undefined;
}

export const get_cell = (x: number, y: number): {color: string; author: Author | null} | undefined => {
    if (y >= 0 && y < grid_data.length && x >= 0 && x < grid_data[0].length) {
        return {
            color: grid_data[y][x],
            author: author_data[y][x],
        };
    }
    return undefined;
}

export const set_cell_color = (x: number, y: number, color: string): boolean => {
    if (y >= 0 && y < grid_data.length && x >= 0 && x < grid_data[0].length) {
        grid_data[y][x] = color;
        return true;
    }

    return false;
}

export const set_cell_author = (x: number, y: number, author: Author | null): boolean => {
    if (y >= 0 && y < author_data.length && x >= 0 && x < author_data[0].length) {
        author_data[y][x] = author;
        return true;
    }

    return false;
}

export const set_cell = (x: number, y: number, color: string, author: Author | null): boolean => {
    if (y >= 0 && y < grid_data.length && x >= 0 && x < grid_data[0].length) {
        grid_data[y][x] = color;
        author_data[y][x] = author;
        return true;
    }

    return false;
}

export const overwrite_grid_data = (new_grid_data: string[][]): void => {
    grid_data = new_grid_data;
}

export const overwrite_author_data = (new_author_data: (Author | null)[][]): void => {
    author_data = new_author_data;
}

// TODO: move pixel persistence logic to here instead of in pixel_update handler
