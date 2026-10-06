"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {ImagePlus, Eye, EyeOff, Move, Trash2, X} from "lucide-react";

import type {TemplateController} from "@/hooks/useTemplate";
import type {TemplateProgress} from "@/components/TemplateOverlay";
import {MIN_TEMPLATE_WIDTH, type TemplateDisplayMode, type TemplateSampling} from "@/lib/template";

interface TemplatePanelProps {
    template: TemplateController;
    progress: TemplateProgress | null;

    move_mode: boolean;
    set_move_mode: (move_mode: boolean) => void;
}

const INPUT_CLASS = "bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 w-16 text-right";

interface SegmentedOption<ValueType extends string> {
    value: ValueType;
    label: string;
    title: string;
}

const Segmented = <ValueType extends string,>({options, value, on_change}: {options: SegmentedOption<ValueType>[]; value: ValueType; on_change: (value: ValueType) => void}) => (
    <div className="flex rounded-md overflow-hidden border border-neutral-700">
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                title={option.title}
                aria-pressed={option.value === value}
                className={`flex-1 px-2 py-1 cursor-pointer transition-colors ${option.value === value ? "bg-sky-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"}`}
                onClick={() => on_change(option.value)}
            >
                {option.label}
            </button>
        ))}
    </div>
);

const Row = ({label, children}: {label: string; children: ReactNode}) => (
    <div className="flex items-center justify-between gap-3">
        <span className="text-neutral-400">{label}</span>
        {children}
    </div>
);

const SAMPLING_OPTIONS: SegmentedOption<TemplateSampling>[] = [
    {value: "sharp", label: "Sharp", title: "Keeps hard edges, best for pixel art"},
    {value: "smooth", label: "Smooth", title: "Averages colours, best for photos and logos"},
];

const MODE_OPTIONS: SegmentedOption<TemplateDisplayMode>[] = [
    {value: "dots", label: "Dots", title: "A dot per cell, so you can still see the canvas"},
    {value: "solid", label: "Solid", title: "The whole template over the canvas"},
    {value: "mismatches", label: "To do", title: "Only the cells that don't match yet"},
];

const first_image_file = (files: FileList | null | undefined): File | null =>
    Array.from(files ?? []).find((file) => file.type.startsWith("image/")) ?? null;

// floating controls for the personal template, collapsed to a button when not in use
const TemplatePanel = ({template, progress, move_mode, set_move_mode}: TemplatePanelProps) => {
    const {settings, height, error, import_file, update, clear} = template;

    const [open, setOpen] = useState(false);
    const [dragging_file, setDraggingFile] = useState(false);
    const file_input_ref = useRef<HTMLInputElement>(null);

    // pasting an image while the panel is open imports it
    useEffect(() => {
        if (!open) {
            return;
        }

        const handle_paste = (event: ClipboardEvent) => {
            const file = first_image_file(event.clipboardData?.files);

            if (file) {
                event.preventDefault();
                void import_file(file);
            }
        };

        window.addEventListener("paste", handle_paste);
        return () => window.removeEventListener("paste", handle_paste);
    }, [open, import_file]);

    // leaving move mode on after closing the panel would silently block canvas clicks
    useEffect(() => {
        if (!open || !settings) {
            set_move_mode(false);
        }
    }, [open, settings, set_move_mode]);

    const percentage = progress && progress.total > 0 ? Math.floor(100 * progress.matched / progress.total) : 0;

    if (!open) {
        return (
            <button
                type="button"
                className="font-sans fixed left-4 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 bg-neutral-900/70 backdrop-blur-sm border border-neutral-800/70 rounded-lg px-3 py-2 cursor-pointer hover:bg-neutral-800/80 transition-colors"
                title="Template overlay"
                onClick={() => setOpen(true)}
            >
                <ImagePlus size={18} />
                {settings && progress && progress.total > 0 && <span className="text-sm">{percentage}%</span>}
            </button>
        );
    }

    return (
        <div
            className={`font-sans text-sm fixed left-4 top-1/2 -translate-y-1/2 z-40 w-72 max-h-[80vh] overflow-y-auto flex flex-col gap-3 bg-neutral-900/85 backdrop-blur-sm border rounded-lg p-4 ${dragging_file ? "border-sky-400" : "border-neutral-800/70"}`}
            onDragOver={(event) => {
                event.preventDefault();
                setDraggingFile(true);
            }}
            onDragLeave={() => setDraggingFile(false)}
            onDrop={(event) => {
                event.preventDefault();
                setDraggingFile(false);

                const file = first_image_file(event.dataTransfer.files);
                if (file) {
                    void import_file(file);
                }
            }}
        >
            <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base">Template</h2>

                <button type="button" className="cursor-pointer text-neutral-400 hover:text-white" title="Close" onClick={() => setOpen(false)}>
                    <X size={18} />
                </button>
            </div>

            <input
                ref={file_input_ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    const file = first_image_file(event.target.files);
                    if (file) {
                        void import_file(file);
                    }

                    // lets the same file be chosen again after removing it
                    event.target.value = "";
                }}
            />

            {!settings && (
                <button
                    type="button"
                    className="flex flex-col items-center gap-2 border-2 border-dashed border-neutral-700 hover:border-sky-500 rounded-lg p-6 cursor-pointer transition-colors"
                    onClick={() => file_input_ref.current?.click()}
                >
                    <ImagePlus size={28} />
                    <span>Choose an image, drop one here, or paste</span>
                    <span className="text-xs text-neutral-500">It stays on your device and is only shown to you</span>
                </button>
            )}

            {error && <p className="text-rose-400">{error}</p>}

            {settings && (
                <>
                    <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local data url, there's nothing for next/image to optimise */}
                        <img
                            src={settings.source_data_url}
                            alt="Template preview"
                            className="w-14 h-14 object-contain bg-neutral-800 rounded"
                            style={{imageRendering: "pixelated"}}
                        />

                        <div className="flex flex-col gap-1 flex-1">
                            <div className="flex items-center justify-between">
                                <span>{progress ? `${progress.matched} / ${progress.total}` : "..."}</span>
                                <span className="font-semibold">{percentage}%</span>
                            </div>

                            <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                                <div className="h-full bg-emerald-500 transition-[width] duration-300" style={{width: `${percentage}%`}} />
                            </div>
                        </div>
                    </div>

                    <Row label="Size">
                        <span className="flex items-center gap-1">
                            <input
                                type="number"
                                className={INPUT_CLASS}
                                min={MIN_TEMPLATE_WIDTH}
                                max={template.max_width}
                                value={settings.width}
                                onChange={(event) => {
                                    const width = parseInt(event.target.value, 10);
                                    if (!isNaN(width)) {
                                        update({width});
                                    }
                                }}
                            />
                            <span className="text-neutral-400">× {height}</span>
                        </span>
                    </Row>

                    <input
                        type="range"
                        aria-label="Template width"
                        min={MIN_TEMPLATE_WIDTH}
                        max={Math.min(template.max_width, settings.source_width)}
                        value={settings.width}
                        onChange={(event) => update({width: parseInt(event.target.value, 10)})}
                    />

                    <Segmented options={SAMPLING_OPTIONS} value={settings.sampling} on_change={(sampling) => update({sampling})} />

                    <Row label="Position">
                        <span className="flex items-center gap-1">
                            <input
                                type="number"
                                className={INPUT_CLASS}
                                aria-label="Template x"
                                step={settings.grid_align ? 1 : 0.1}
                                value={Number(settings.x.toFixed(2))}
                                onChange={(event) => {
                                    const x = parseFloat(event.target.value);
                                    if (!isNaN(x)) {
                                        update({x});
                                    }
                                }}
                            />
                            <input
                                type="number"
                                className={INPUT_CLASS}
                                aria-label="Template y"
                                step={settings.grid_align ? 1 : 0.1}
                                value={Number(settings.y.toFixed(2))}
                                onChange={(event) => {
                                    const y = parseFloat(event.target.value);
                                    if (!isNaN(y)) {
                                        update({y});
                                    }
                                }}
                            />
                        </span>
                    </Row>

                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            aria-pressed={move_mode}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-colors ${move_mode ? "bg-sky-600 border-sky-500 text-white" : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"}`}
                            onClick={() => set_move_mode(!move_mode)}
                        >
                            <Move size={14} />
                            {move_mode ? "Done moving" : "Move"}
                        </button>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.grid_align}
                                onChange={(event) => update({grid_align: event.target.checked})}
                            />
                            Snap to grid
                        </label>
                    </div>

                    {move_mode && (
                        <p className="text-xs text-sky-300">Drag the template on the canvas. You can&apos;t place pixels until you&apos;re done.</p>
                    )}

                    <Segmented options={MODE_OPTIONS} value={settings.mode} on_change={(mode) => update({mode})} />

                    <Row label="Opacity">
                        <input
                            type="range"
                            aria-label="Template opacity"
                            min={10}
                            max={100}
                            value={Math.round(settings.opacity * 100)}
                            onChange={(event) => update({opacity: parseInt(event.target.value, 10) / 100})}
                        />
                    </Row>

                    <p className="text-xs text-neutral-400">Press <kbd className="px-1 rounded bg-neutral-800 border border-neutral-700">E</kbd> over the template to pick its colour.</p>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-neutral-800 border-neutral-700 hover:bg-neutral-700 cursor-pointer"
                            onClick={() => update({visible: !settings.visible})}
                        >
                            {settings.visible ? <EyeOff size={14} /> : <Eye size={14} />}
                            {settings.visible ? "Hide" : "Show"}
                        </button>

                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-neutral-800 border-neutral-700 hover:bg-neutral-700 cursor-pointer"
                            onClick={() => file_input_ref.current?.click()}
                        >
                            <ImagePlus size={14} />
                            Replace
                        </button>

                        <button
                            type="button"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-neutral-800 border-neutral-700 hover:bg-rose-900 cursor-pointer ml-auto"
                            title="Remove template"
                            onClick={() => {
                                if (confirm("Remove your template?")) {
                                    clear();
                                }
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default TemplatePanel;