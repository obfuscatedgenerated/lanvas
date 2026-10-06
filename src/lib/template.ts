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

    // set when loaded from someone's template file: its size is locked so everyone's cells stay identical,
    // and this remembers where it was meant to go
    shared: {x: number; y: number} | null;
}

// rows of hex colours, null where the image is transparent
export type TemplateCells = (string | null)[][];

export const MIN_TEMPLATE_WIDTH = 1;

// larger sources are shrunk before storing, keeping localStorage small, templates are capped at the grid width separately
const MAX_STORED_SOURCE_SIZE = 512;

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
            shared: parsed.shared && typeof parsed.shared.x === "number" && typeof parsed.shared.y === "number"
                ? {x: parsed.shared.x, y: parsed.shared.y}
                : null,
        };
    } catch (storage_error) {
        console.warn("Couldn't load the saved template:", storage_error);
        return null;
    }
};

// ---------------------------------------------------------------------------------------------------------------------
// template files, for sharing an exact template with other players
// ---------------------------------------------------------------------------------------------------------------------

const TEMPLATE_FILE_VERSION = 1;

// generous, files are only ever made by this site, this just stops a bad file hanging the tab
const MAX_FILE_DIMENSION = 4096;

export const TEMPLATE_FILE_EXTENSION = ".lanvas.json";

interface TemplateFile {
    lanvas_template: number;
    x: number;
    y: number;
    width: number;
    height: number;

    // each colour once, cells refer to them by index, -1 for empty
    palette: string[];
    cells: number[];
}

export interface ParsedTemplateFile {
    cells: TemplateCells;
    x: number;
    y: number;
}

export const is_template_file = (file: File): boolean =>
    file.name.toLowerCase().endsWith(".json") || file.type === "application/json";

export const serialise_template = (cells: TemplateCells, x: number, y: number): string => {
    const palette: string[] = [];
    const palette_indices = new Map<string, number>();
    const indexed_cells: number[] = [];

    for (const row of cells) {
        for (const cell of row) {
            // case differences would otherwise become separate palette entries
            const colour = cell?.toLowerCase() ?? null;

            if (colour === null) {
                indexed_cells.push(-1);
                continue;
            }

            let palette_index = palette_indices.get(colour);

            if (palette_index === undefined) {
                palette_index = palette.length;
                palette.push(colour);
                palette_indices.set(colour, palette_index);
            }

            indexed_cells.push(palette_index);
        }
    }

    const file: TemplateFile = {
        lanvas_template: TEMPLATE_FILE_VERSION,
        x: Math.round(x),
        y: Math.round(y),
        width: cells[0]?.length ?? 0,
        height: cells.length,
        palette,
        cells: indexed_cells,
    };

    return JSON.stringify(file);
};

const is_whole_number = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

export const parse_template_file = (text: string): ParsedTemplateFile => {
    let parsed: Partial<TemplateFile>;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("That file isn't a lanvas template");
    }

    if (typeof parsed !== "object" || parsed === null || parsed.lanvas_template === undefined) {
        throw new Error("That file isn't a lanvas template");
    }

    if (parsed.lanvas_template !== TEMPLATE_FILE_VERSION) {
        throw new Error("That template was made by a different version of lanvas");
    }

    const {x, y, width, height, palette, cells} = parsed;

    if (!is_whole_number(x) || !is_whole_number(y) || !is_whole_number(width) || !is_whole_number(height)) {
        throw new Error("That template file is damaged");
    }

    if (width < 1 || height < 1 || width > MAX_FILE_DIMENSION || height > MAX_FILE_DIMENSION) {
        throw new Error("That template is an impossible size");
    }

    if (!Array.isArray(palette) || !palette.every((colour) => typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour))) {
        throw new Error("That template file has broken colours");
    }

    if (!Array.isArray(cells) || cells.length !== width * height) {
        throw new Error("That template file is damaged");
    }

    const rows: TemplateCells = [];

    for (let row = 0; row < height; row++) {
        const cell_row: (string | null)[] = [];

        for (let column = 0; column < width; column++) {
            const palette_index = cells[row * width + column];

            if (palette_index === -1) {
                cell_row.push(null);
                continue;
            }

            if (!is_whole_number(palette_index) || palette_index < 0 || palette_index >= palette.length) {
                throw new Error("That template file is damaged");
            }

            cell_row.push(palette[palette_index].toLowerCase());
        }

        rows.push(cell_row);
    }

    return {cells: rows, x, y};
};

// draws cells at one pixel each, so sampling it sharp at the same size gives back exactly the same cells
export const cells_to_data_url = (cells: TemplateCells): string => {
    const width = cells[0]?.length ?? 0;
    const height = cells.length;

    const {canvas, context} = create_canvas_context(width, height);
    const image_data = context.createImageData(width, height);

    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const colour = cells[row][column];
            const rgb = colour ? parse_hex(colour) : null;
            const offset = (row * width + column) * 4;

            // left fully transparent when empty
            if (!rgb) {
                continue;
            }

            image_data.data[offset] = rgb[0];
            image_data.data[offset + 1] = rgb[1];
            image_data.data[offset + 2] = rgb[2];
            image_data.data[offset + 3] = 255;
        }
    }

    context.putImageData(image_data, 0, 0);
    return canvas.toDataURL("image/png");
};

export const download_text_file = (filename: string, text: string, mime_type: string): void => {
    const url = URL.createObjectURL(new Blob([text], {type: mime_type}));

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    // after the click has been handled, so the download has started
    setTimeout(() => URL.revokeObjectURL(url), 0);
};