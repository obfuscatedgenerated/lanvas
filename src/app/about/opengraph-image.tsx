import { unstable_cache } from "next/cache";
import {ImageResponse} from "next/og";

import {Client} from "pg";

import {createCanvas} from "canvas";

// Image metadata
export const alt = "LANvas canvas"
export const size = {
    width: 1200,
    height: 630,
}

export const contentType = "image/png"

const PIXEL_SIZE = 10; // use slight oversampling. could also instead use pixelated on parent, but that leads to weird subpixel artifacts
const GRID_WIDTH = process.env.NEXT_PUBLIC_GRID_WIDTH ? parseInt(process.env.NEXT_PUBLIC_GRID_WIDTH) : 100;
const GRID_HEIGHT = process.env.NEXT_PUBLIC_GRID_HEIGHT ? parseInt(process.env.NEXT_PUBLIC_GRID_HEIGHT) : 100;

const draw_pixels_to_data_url = async () => {
    console.log("OpenGraph image redrawing...");

    // get grid data from database
    const client = new Client({
        host: process.env.PGHOST,
        port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    });
    await client.connect();

    const grid_data = Array.from({length: GRID_HEIGHT}, () => Array(GRID_WIDTH).fill("#FFFFFF"));

    const pixels = await client.query("SELECT x, y, color FROM pixels");
    for (const row of pixels.rows) {
        const {x, y, color} = row;

        // load each pixel into the in-memory grids
        if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
            grid_data[y][x] = color;
        }
    }
    client.end();

    // use a node canvas to render the grid! so cool!
    const canvas = createCanvas(GRID_WIDTH * PIXEL_SIZE, GRID_WIDTH * PIXEL_SIZE);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ensure image smoothing is disabled for pixelated look
    ctx.imageSmoothingEnabled = false;

    ctx.save();

    // redraw only changed pixels
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            ctx.fillStyle = grid_data[y][x];

            const draw_x = x * PIXEL_SIZE;
            const draw_y = y * PIXEL_SIZE;
            const draw_size = PIXEL_SIZE;
            ctx.fillRect(draw_x, draw_y, draw_size, draw_size);
        }
    }

    ctx.restore();

    return canvas.toDataURL("image/png");
}

// Image generation
export default async function Image() {
    const get_data_url = unstable_cache(
        draw_pixels_to_data_url,
        ["canvas-data-url"],
        {
            revalidate: 60 // cache for a minute
        }
    );

    return new ImageResponse(
        (
            // ImageResponse JSX element
            <img src={await get_data_url()} />
        ),
        // ImageResponse options
        {
            ...size,
        }
    )
}