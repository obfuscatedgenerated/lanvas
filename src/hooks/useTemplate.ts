"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import usePublicConfigValue from "@/hooks/usePublicConfigValue";
import {CONFIG_KEY_GRID_WIDTH} from "@/consts";
import {DEFAULT_GRID_WIDTH} from "@/defaults";

import {
    cells_to_data_url,
    decode_data_url,
    download_text_file,
    is_template_file,
    load_template_settings,
    MIN_TEMPLATE_WIDTH,
    normalise_source_file,
    parse_template_file,
    sample_template_cells,
    save_template_settings,
    serialise_template,
    template_height,
    TEMPLATE_FILE_EXTENSION,
    type TemplateCells,
    type TemplateSettings,
} from "@/lib/template";

// imported templates start small enough to be quick to finish, while keeping any smaller pixel art at its true size
const DEFAULT_IMPORT_WIDTH = 64;

export interface TemplateController {
    settings: TemplateSettings | null;
    cells: TemplateCells | null;
    height: number;
    error: string | null;

    // templates can't be wider than the canvas they're laid over
    max_width: number;

    // images and template files both come through here
    import_file: (file: File) => Promise<void>;
    export_file: () => void;

    update: (changes: Partial<TemplateSettings>) => void;
    reset_to_shared_position: () => void;
    clear: () => void;
}

const clamp_width = (width: number, max_width: number): number => Math.min(max_width, Math.max(MIN_TEMPLATE_WIDTH, Math.round(width)));

// display preferences carry over when a template is replaced, so people don't have to set them up again
const carried_display = (previous: TemplateSettings | null) => ({
    mode: previous?.mode ?? "dots",
    opacity: previous?.opacity ?? 0.6,
    visible: true,
}) as const;

// owns the template's settings, its decoded image and the sampled cells, saving settings as they change
const useTemplate = (): TemplateController => {
    const max_width = Math.max(MIN_TEMPLATE_WIDTH, usePublicConfigValue(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH));

    const [settings, setSettings] = useState<TemplateSettings | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [error, setError] = useState<string | null>(null);

    // saving waits until the stored template has been loaded, otherwise the first render would wipe it
    const loaded_ref = useRef(false);

    useEffect(() => {
        const stored = load_template_settings();

        if (!stored) {
            loaded_ref.current = true;
            return;
        }

        decode_data_url(stored.source_data_url)
            .then((decoded) => {
                setImage(decoded);
                setSettings(stored);
            })
            .catch(() => setError("Your saved template couldn't be loaded"))
            .finally(() => {
                loaded_ref.current = true;
            });
    }, []);

    useEffect(() => {
        if (!loaded_ref.current) {
            return;
        }

        if (!save_template_settings(settings) && settings) {
            setError("Your browser storage is full, so this template won't be remembered after a refresh");
        }
    }, [settings]);

    const width = settings?.width ?? 0;
    const sampling = settings?.sampling ?? "sharp";
    const height = settings ? template_height(settings) : 0;

    const cells = useMemo(
        () => image && width > 0 ? sample_template_cells(image, width, height, sampling) : null,
        [image, width, height, sampling]
    );

    const import_image = useCallback(async (file: File) => {
        const source = await normalise_source_file(file);

        setImage(source.image);
        setSettings((previous) => ({
            source_data_url: source.data_url,
            source_width: source.width,
            source_height: source.height,
            width: clamp_width(Math.min(source.width, DEFAULT_IMPORT_WIDTH), max_width),

            // a replacement image stays where the last one was
            x: previous?.x ?? 0,
            y: previous?.y ?? 0,
            grid_align: previous?.grid_align ?? true,
            sampling: previous?.sampling ?? "sharp",
            ...carried_display(previous),
            shared: null,
        }));
    }, [max_width]);

    // a shared template becomes a 1:1 image of its cells, sampled sharp at the same size, so it comes out identical
    const import_shared = useCallback(async (file: File) => {
        const parsed = parse_template_file(await file.text());

        const data_url = cells_to_data_url(parsed.cells);
        const decoded = await decode_data_url(data_url);

        const shared_width = parsed.cells[0].length;
        const shared_height = parsed.cells.length;

        setImage(decoded);
        setSettings((previous) => ({
            source_data_url: data_url,
            source_width: shared_width,
            source_height: shared_height,

            // never clamped, shrinking it would change the cells, and any part off the canvas is simply skipped
            width: shared_width,

            x: parsed.x,
            y: parsed.y,
            grid_align: true,
            sampling: "sharp",
            ...carried_display(previous),
            shared: {x: parsed.x, y: parsed.y},
        }));
    }, []);

    const import_file = useCallback(async (file: File) => {
        setError(null);

        try {
            if (is_template_file(file)) {
                await import_shared(file);
            } else {
                await import_image(file);
            }
        } catch (import_error) {
            setError(import_error instanceof Error ? import_error.message : "That file couldn't be imported");
        }
    }, [import_image, import_shared]);

    const export_file = useCallback(() => {
        if (!settings || !cells) {
            return;
        }

        download_text_file(`template${TEMPLATE_FILE_EXTENSION}`, serialise_template(cells, settings.x, settings.y), "application/json");
    }, [settings, cells]);

    const update = useCallback((changes: Partial<TemplateSettings>) => {
        setSettings((previous) => {
            if (!previous) {
                return previous;
            }

            // a shared template's size and sampling are fixed, re-sampling would make it differ from everyone else's
            const allowed_changes: Partial<TemplateSettings> = previous.shared
                ? {x: changes.x, y: changes.y, mode: changes.mode, opacity: changes.opacity, visible: changes.visible}
                : changes;

            const defined_changes = Object.fromEntries(
                Object.entries(allowed_changes).filter(([, value]) => value !== undefined)
            ) as Partial<TemplateSettings>;

            const next: TemplateSettings = {...previous, ...defined_changes};

            if (allowed_changes.width !== undefined) {
                next.width = clamp_width(allowed_changes.width, max_width);
            }

            // turning alignment on snaps straight to the nearest cell
            if (next.grid_align) {
                next.x = Math.round(next.x);
                next.y = Math.round(next.y);
            }

            return next;
        });
    }, [max_width]);

    const reset_to_shared_position = useCallback(() => {
        setSettings((previous) => previous?.shared ? {...previous, x: previous.shared.x, y: previous.shared.y} : previous);
    }, []);

    const clear = useCallback(() => {
        setSettings(null);
        setImage(null);
        setError(null);
    }, []);

    return {settings, cells, height, error, max_width, import_file, export_file, update, reset_to_shared_position, clear};
};

export default useTemplate;