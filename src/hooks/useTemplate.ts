"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import {
    decode_data_url,
    load_template_settings,
    MIN_TEMPLATE_WIDTH,
    normalise_source_file,
    sample_template_cells,
    save_template_settings,
    template_height,
    type TemplateCells,
    type TemplateSettings,
} from "@/lib/template";
import {CONFIG_KEY_GRID_WIDTH} from "@/consts";
import usePublicConfigValue from "@/hooks/usePublicConfigValue";
import {DEFAULT_GRID_WIDTH} from "@/defaults";

// imported templates start small enough to be quick to finish, while keeping any smaller pixel art at its true size
const DEFAULT_IMPORT_WIDTH = 32;

export interface TemplateController {
    settings: TemplateSettings | null;
    cells: TemplateCells | null;
    height: number;
    max_width: number;
    error: string | null;

    import_file: (file: File) => Promise<void>;
    update: (changes: Partial<TemplateSettings>) => void;
    clear: () => void;
}

const clamp_width = (width: number, max_width: number): number => Math.min(max_width, Math.max(MIN_TEMPLATE_WIDTH, Math.round(width)));

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

    const import_file = useCallback(async (file: File) => {
        setError(null);

        try {
            const source = await normalise_source_file(file);

            setImage(source.image);
            setSettings((previous) => ({
                source_data_url: source.data_url,
                source_width: source.width,
                source_height: source.height,
                width: clamp_width(Math.min(source.width, DEFAULT_IMPORT_WIDTH), max_width),

                // a replacement keeps where the last one was and how it was shown
                x: previous?.x ?? 0,
                y: previous?.y ?? 0,
                grid_align: previous?.grid_align ?? true,
                sampling: previous?.sampling ?? "sharp",
                mode: previous?.mode ?? "dots",
                opacity: previous?.opacity ?? 0.6,
                visible: true,
            }));
        } catch (import_error) {
            setError(import_error instanceof Error ? import_error.message : "That image couldn't be imported");
        }
    }, [max_width]);

    const update = useCallback((changes: Partial<TemplateSettings>) => {
        setSettings((previous) => {
            if (!previous) {
                return previous;
            }

            const next = {...previous, ...changes};

            if (changes.width !== undefined) {
                next.width = clamp_width(changes.width, max_width);
            }

            // turning alignment on snaps straight to the nearest cell
            if (next.grid_align) {
                next.x = Math.round(next.x);
                next.y = Math.round(next.y);
            }

            return next;
        });
    }, [max_width]);

    const clear = useCallback(() => {
        setSettings(null);
        setImage(null);
        setError(null);
    }, []);

    return {settings, cells, height, error, import_file, update, clear, max_width};
};

export default useTemplate;