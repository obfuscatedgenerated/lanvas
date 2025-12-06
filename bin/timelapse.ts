import "dotenv/config";
import {Client} from "pg";

import {createCanvas} from "canvas";

import * as fs from "fs";
import * as path from "path";
import {fileURLToPath} from "url";
import {spawn} from "child_process";

import ProgressBar from "progress";

import {CONFIG_KEY_GRID_HEIGHT, CONFIG_KEY_GRID_WIDTH} from "@/consts";
import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH} from "@/defaults";

import snowflake_api from "@/snowflake";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const output_dir = path.join(dirname, "..", "timelapse");

if (!fs.existsSync(output_dir)) {
    fs.mkdirSync(output_dir);
}

const normal_output_dir = path.join(output_dir, "normal");
const timestamped_output_dir = path.join(output_dir, "timestamped");

if (!fs.existsSync(normal_output_dir)) {
    fs.mkdirSync(normal_output_dir);
}
if (!fs.existsSync(timestamped_output_dir)) {
    fs.mkdirSync(timestamped_output_dir);
}

// TODO command line args for output dir, pixel size, seconds per pixel, etc

const PIXEL_SIZE = 10; // use slight oversampling. could also instead use pixelated on parent, but that leads to weird subpixel artifacts
const SECONDS_PER_PIXEL = 0.25; // show each new pixel for this many seconds in the video

const client = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
});

let grid_width = DEFAULT_GRID_WIDTH;
let grid_height = DEFAULT_GRID_HEIGHT;
let last_snowflake = "0";

// TODO jump to newest canvas state based on existing files in output dir to speed up process

const ffmpeg = async (args: string[], print_stdout = false, print_stderr = false) => {
    let stdout_data = "";
    let stderr_data = "";

    return new Promise<{stderr: string, stdout: string}>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", args);

        ffmpeg.stdout.on("data", (data) => {
            stdout_data += data.toString();

            if (print_stdout) {
                process.stdout.write(data);
            }
        });

        ffmpeg.stderr.on("data", (data) => {
            stderr_data += data.toString();

            if (print_stderr) {
                process.stderr.write(data);
            }
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                resolve({stdout: stdout_data, stderr: stderr_data});
            } else {
                reject(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr_data}`));
            }
        });
    });
}

const main = async () => {
    await client.connect();

    // get width and size from config
    const res_config = await client.query("SELECT key, value FROM config WHERE key IN ($1, $2)", [CONFIG_KEY_GRID_WIDTH, CONFIG_KEY_GRID_HEIGHT]);

    for (const row of res_config.rows) {
        const {key, value} = row;
        if (key === CONFIG_KEY_GRID_WIDTH) {
            grid_width = parseInt(value, 10);
        } else if (key === CONFIG_KEY_GRID_HEIGHT) {
            grid_height = parseInt(value, 10);
        }
    }

    console.log(`Grid size is set to ${grid_width}x${grid_height}. If grid size has changed over time, images may be truncated or have blank space.`);
    // TODO: log changes to grid size over time to reconstruct accurately?

    // create empty canvases
    const normal_canvas = createCanvas(grid_width * PIXEL_SIZE, grid_height * PIXEL_SIZE);
    const timestamped_canvas = createCanvas(grid_width * PIXEL_SIZE, grid_height * PIXEL_SIZE);

    const normal_ctx = normal_canvas.getContext("2d");
    const timestamped_ctx = timestamped_canvas.getContext("2d");

    if (!normal_ctx) {
        throw new Error("Failed to get canvas context");
    }

    if (!timestamped_ctx) {
        throw new Error("Failed to get canvas context");
    }

    // ensure image smoothing is disabled for pixelated look
    normal_ctx.imageSmoothingEnabled = false;
    timestamped_ctx.imageSmoothingEnabled = false;

    // fill normal canvas with white
    normal_ctx.fillStyle = "#FFFFFF";
    normal_ctx.fillRect(0, 0, normal_canvas.width, normal_canvas.height);

    // create ffmpeg format concat lists
    const normal_list_path = path.join(output_dir, "normal_list.txt");
    const timestamped_list_path = path.join(output_dir, "timestamped_list.txt");

    // remove existing files
    if (fs.existsSync(normal_list_path)) {
        fs.unlinkSync(normal_list_path);
    }
    if (fs.existsSync(timestamped_list_path)) {
        fs.unlinkSync(timestamped_list_path);
    }

    const normal_list_file = fs.createWriteStream(normal_list_path);
    const timestamped_list_file = fs.createWriteStream(timestamped_list_path);

    // count total pixels for progress logging
    const count_res = await client.query("SELECT COUNT(*) FROM pixels");
    const total_pixels = parseInt(count_res.rows[0].count, 10);

    const progress_bar = new ProgressBar("Generating timelapse images [:bar] :current/:total (:percent) :etas", {
        total: total_pixels,
        width: 40,
    });

    // step through each pixel placed in order of snowflake
    let finished = false;
    while (!finished) {
        const pixel_res = await client.query(`
            SELECT
                x,
                y,
                color,
                snowflake
            FROM pixels
            WHERE snowflake > $1
            ORDER BY snowflake ASC
            LIMIT 1
        `, [last_snowflake]);

        if (pixel_res.rows.length === 0) {
            finished = true;
            break;
        }

        const {x, y, color, snowflake} = pixel_res.rows[0];
        last_snowflake = snowflake;

        // draw pixel
        normal_ctx.save()

        normal_ctx.fillStyle = color;

        const draw_x = x * PIXEL_SIZE;
        const draw_y = y * PIXEL_SIZE;
        const draw_size = PIXEL_SIZE;
        normal_ctx.fillRect(draw_x, draw_y, draw_size, draw_size);

        normal_ctx.restore();

        // export normal image
        const normal_buffer = normal_canvas.toBuffer("image/png");
        fs.writeFileSync(path.join(normal_output_dir, `${snowflake}.png`), normal_buffer);

        // overwrite timestamped canvas with normal canvas
        timestamped_ctx.clearRect(0, 0, timestamped_canvas.width, timestamped_canvas.height);
        timestamped_ctx.drawImage(normal_canvas, 0, 0);

        // add timestamp to bottom left
        const timestamp = snowflake_api.deconstruct(snowflake).timestamp;
        const timestamp_num = Number(timestamp);
        const date = new Date(timestamp_num);
        const timestamp_str =  date.toLocaleString();

        timestamped_ctx.save();

        timestamped_ctx.font = "20px sans-serif";
        timestamped_ctx.fillStyle = "rgba(0, 0, 0, 0.5)";

        timestamped_ctx.fillText(timestamp_str, 10, timestamped_canvas.height - 10);

        timestamped_ctx.restore();

        // export timestamped image
        const timestamped_buffer = timestamped_canvas.toBuffer("image/png");
        fs.writeFileSync(path.join(timestamped_output_dir, `${snowflake}.png`), timestamped_buffer);

        // write to ffmpeg concat lists
        normal_list_file.write(`file '${path.join(normal_output_dir, `${snowflake}.png`)}'\n`);
        normal_list_file.write(`duration ${SECONDS_PER_PIXEL}\n`);
        timestamped_list_file.write(`file '${path.join(timestamped_output_dir, `${snowflake}.png`)}'\n`);
        timestamped_list_file.write(`duration ${SECONDS_PER_PIXEL}\n`);

        progress_bar.tick();
    }

    // repeat last frame to ensure it stays for the duration
    normal_list_file.write(`file '${path.join(normal_output_dir, `${last_snowflake}.png`)}'\n`);
    normal_list_file.write(`duration ${SECONDS_PER_PIXEL}\n`);
    timestamped_list_file.write(`file '${path.join(timestamped_output_dir, `${last_snowflake}.png`)}'\n`);
    timestamped_list_file.write(`duration ${SECONDS_PER_PIXEL}\n`);

    // close ffmpeg concat lists
    normal_list_file.end();
    timestamped_list_file.end();

    console.log("Timelapse image sequences generated.");

    // test for ffmpeg with libvpx
    try {
        const version = await ffmpeg(["-version"]);
        if (!version.stdout.includes("--enable-libvpx")) {
            console.error("ffmpeg is not compiled with libvpx support, cannot generate webm videos. Please install a version of ffmpeg with libvpx support.");
            return;
        }
    } catch (_e) {
        console.warn("ffmpeg not found, skipping video generation. Please install ffmpeg to enable video generation.");
        return;
    }

    // generate videos
    const normal_video_path = path.join(output_dir, "timelapse_normal.webm");
    const timestamped_video_path = path.join(output_dir, "timelapse_timestamped.webm");

    console.log("Generating normal timelapse video...");
    await ffmpeg([
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", normal_list_path,
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuv420p",
        normal_video_path,
    ]);

    console.log("Normal timelapse video generated at:", normal_video_path);

    console.log("Generating timestamped timelapse video...");
    await ffmpeg([
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", timestamped_list_path,
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuv420p",
        timestamped_video_path,
    ]);

    console.log("Timestamped timelapse video generated at:", timestamped_video_path);

    console.log("Timelapse generation complete.");
}

main().catch(err => {
    console.error("Error generating timelapse:", err);
}).finally(() => {
    client.end();
});
