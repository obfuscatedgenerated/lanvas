"use client";

import {LOCALSTORAGE_KEY_TEMPLATE} from "@/consts";

// a personal reference image laid over the canvas, never uploaded anywhere

export type TemplateSampling = "sharp" | "smooth";
export type TemplateDisplayMode = "solid" | "dots" | "mismatches";

export interface TemplateSettings {
    // stored downscaled so it fits comfortably in localStorage
    source_data_url: string;
    source_width: number;
    source_height: number;

    // size in canvas cells, height follows the image's aspect ratio
    width: number;

    // top-left corner in canvas cells, whole numbers while grid aligned
    x: number;
    y: number;
    grid_align: boolean;

    sampling: TemplateSampling;
    mode: TemplateDisplayMode;
    opacity: number; // 0 to 1
    visible: boolean;
}

// rows of hex colours, null where the image is transparent
export type TemplateCells = (string | null)[][];

export const MIN_TEMPLATE_WIDTH = 1;
export const MAX_TEMPLATE_WIDTH = 512;

// larger sources are shrunk before storing, nobody needs more detail than the widest template allows
const MAX_STORED_SOURCE_SIZE = MAX_TEMPLATE_WIDTH;

// pixels more transparent than this count as empty, so transparent pngs leave gaps
const ALPHA_THRESHOLD = 128;

// colours within this much per channel count as matching, absorbing tiny rounding differences
const MATCH_TOLERANCE = 6;

// how far each smooth downscaling step shrinks the image, halving keeps averaging accurate
const SMOOTH_STEP_FACTOR = 0.5;

export const template_height = (settings: Pick<TemplateSettings, "width" | "source_width" | "source_height">): number =>
    Math.max(1, Math.round(settings.width * settings.source_height / settings.source_width));

const decode_image = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file couldn't be read as an image"));
    image.src = source;
});

export const decode_data_url = decode_image;

const read_file_as_data_url = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file couldn't be read"));
    reader.readAsDataURL(file);
});

const create_canvas_context = (width: number, height: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) {
        throw new Error("Your browser couldn't create a canvas to process the image");
    }

    return {canvas, context};
};

export interface NormalisedSource {
    data_url: string;
    width: number;
    height: number;
    image: HTMLImageElement;
}

// re-encodes any image as a png, shrinking it first if it's bigger than any template could use
export const normalise_source_file = async (file: File): Promise<NormalisedSource> => {
    if (!file.type.startsWith("image/")) {
        throw new Error("That isn't an image");
    }

    const original = await decode_image(await read_file_as_data_url(file));

    const shrink = Math.min(1, MAX_STORED_SOURCE_SIZE / Math.max(original.naturalWidth, original.naturalHeight));
    const width = Math.max(1, Math.round(original.naturalWidth * shrink));
    const height = Math.max(1, Math.round(original.naturalHeight * shrink));

    const {canvas, context} = create_canvas_context(width, height);
    context.imageSmoothingEnabled = shrink < 1;
    context.imageSmoothingQuality = "high";
    context.drawImage(original, 0, 0, width, height);

    const data_url = canvas.toDataURL("image/png");

    return {data_url, width, height, image: await decode_image(data_url)};
};

const to_hex_channel = (value: number): string => value.toString(16).padStart(2, "0");

// shrinks to the template's size: nearest neighbour keeps pixel art crisp, repeated halving averages photos properly
export const sample_template_cells = (image: HTMLImageElement, width: number, height: number, sampling: TemplateSampling): TemplateCells => {
    let source: CanvasImageSource = image;
    let source_width = image.naturalWidth;
    let source_height = image.naturalHeight;

    if (sampling === "smooth") {
        while (source_width * SMOOTH_STEP_FACTOR > width && source_height * SMOOTH_STEP_FACTOR > height) {
            const step_width = Math.max(width, Math.round(source_width * SMOOTH_STEP_FACTOR));
            const step_height = Math.max(height, Math.round(source_height * SMOOTH_STEP_FACTOR));

            const {canvas, context} = create_canvas_context(step_width, step_height);
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(source, 0, 0, step_width, step_height);

            source = canvas;
            source_width = step_width;
            source_height = step_height;
        }
    }

    const {context} = create_canvas_context(width, height);
    context.imageSmoothingEnabled = sampling === "smooth";
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const cells: TemplateCells = [];

    for (let row = 0; row < height; row++) {
        const cell_row: (string | null)[] = [];

        for (let column = 0; column < width; column++) {
            const offset = (row * width + column) * 4;

            if (pixels[offset + 3] < ALPHA_THRESHOLD) {
                cell_row.push(null);
                continue;
            }

            cell_row.push(`#${to_hex_channel(pixels[offset])}${to_hex_channel(pixels[offset + 1])}${to_hex_channel(pixels[offset + 2])}`);
        }

        cells.push(cell_row);
    }

    return cells;
};

const parse_hex = (hex: string): [number, number, number] | null => {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) {
        return null;
    }

    const value = parseInt(match[1], 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

export const colours_match = (first: string, second: string): boolean => {
    const first_rgb = parse_hex(first);
    const second_rgb = parse_hex(second);

    if (!first_rgb || !second_rgb) {
        return first.toLowerCase() === second.toLowerCase();
    }

    return first_rgb.every((channel, index) => Math.abs(channel - second_rgb[index]) <= MATCH_TOLERANCE);
};

// returns false if the browser refused, usually because storage is full
export const save_template_settings = (settings: TemplateSettings | null): boolean => {
    try {
        if (settings) {
            localStorage.setItem(LOCALSTORAGE_KEY_TEMPLATE, JSON.stringify(settings));
        } else {
            localStorage.removeItem(LOCALSTORAGE_KEY_TEMPLATE);
        }

        return true;
    } catch (storage_error) {
        console.warn("Couldn't save the template:", storage_error);
        return false;
    }
};

export const load_template_settings = (): TemplateSettings | null => {
    try {
        const stored = localStorage.getItem(LOCALSTORAGE_KEY_TEMPLATE);
        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored) as Partial<TemplateSettings>;

        if (typeof parsed.source_data_url !== "string" || typeof parsed.source_width !== "number" || typeof parsed.source_height !== "number") {
            return null;
        }

        return {
            source_data_url: parsed.source_data_url,
            source_width: parsed.source_width,
            source_height: parsed.source_height,
            width: typeof parsed.width === "number" ? parsed.width : Math.min(parsed.source_width, 64),
            x: typeof parsed.x === "number" ? parsed.x : 0,
            y: typeof parsed.y === "number" ? parsed.y : 0,
            grid_align: parsed.grid_align ?? true,
            sampling: parsed.sampling === "smooth" ? "smooth" : "sharp",
            mode: parsed.mode === "solid" || parsed.mode === "mismatches" ? parsed.mode : "dots",
            opacity: typeof parsed.opacity === "number" ? parsed.opacity : 0.6,
            visible: parsed.visible ?? true,
        };
    } catch (storage_error) {
        console.warn("Couldn't load the saved template:", storage_error);
        return null;
    }
};