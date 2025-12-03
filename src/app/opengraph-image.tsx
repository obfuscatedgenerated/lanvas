import {ImageResponse} from "next/og";

import {Client} from "pg";

import {createCanvas} from "canvas";

import {CONFIG_KEY_GRID_HEIGHT, CONFIG_KEY_GRID_WIDTH} from "@/consts";
import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH} from "@/defaults";

export const revalidate = 60; // cache the image for 60 seconds
export const alt = "LANvas canvas"
export const contentType = "image/png"

const PIXEL_SIZE = 10; // use slight oversampling. could also instead use pixelated on parent, but that leads to weird subpixel artifacts

const draw_pixels = async () => {
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

    // get width and size from config
    const res_config = await client.query("SELECT key, value FROM config WHERE key IN ($1, $2)", [CONFIG_KEY_GRID_WIDTH, CONFIG_KEY_GRID_HEIGHT]);

    let grid_width = DEFAULT_GRID_WIDTH;
    let grid_height = DEFAULT_GRID_HEIGHT;
    for (const row of res_config.rows) {
        const {key, value} = row;
        if (key === CONFIG_KEY_GRID_WIDTH) {
            grid_width = parseInt(value, 10);
        } else if (key === CONFIG_KEY_GRID_HEIGHT) {
            grid_height = parseInt(value, 10);
        }
    }

    const grid_data = Array.from({length: grid_height}, () => Array(grid_width).fill("#FFFFFF"));

    const pixels = await client.query("SELECT x, y, color FROM pixels");
    for (const row of pixels.rows) {
        const {x, y, color} = row;

        // load each pixel into the in-memory grids
        if (x >= 0 && x < grid_width && y >= 0 && y < grid_height) {
            grid_data[y][x] = color;
        }
    }
    client.end();

    // use a node canvas to render the grid! so cool!
    const canvas = createCanvas(grid_width * PIXEL_SIZE, grid_height * PIXEL_SIZE);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get canvas context");
    }

    // ensure image smoothing is disabled for pixelated look
    ctx.imageSmoothingEnabled = false;

    ctx.save();

    // redraw only changed pixels
    for (let y = 0; y < grid_height; y++) {
        for (let x = 0; x < grid_width; x++) {
            ctx.fillStyle = grid_data[y][x];

            const draw_x = x * PIXEL_SIZE;
            const draw_y = y * PIXEL_SIZE;
            const draw_size = PIXEL_SIZE;
            ctx.fillRect(draw_x, draw_y, draw_size, draw_size);
        }
    }

    ctx.restore();

    return {url: canvas.toDataURL("image/png"), size: {width: grid_width * PIXEL_SIZE, height: grid_height * PIXEL_SIZE}};
}

export default async function Image() {
    const {url, size} = await draw_pixels();

    // export at half size to not be huge
    size.width /= 2;
    size.height /= 2;

    return new ImageResponse(
        (
            // ImageResponse JSX element
            <img src={url} width={size.width} height={size.height} alt="" />
        ),
        // ImageResponse options
        {
            ...size,
        }
    )
}
