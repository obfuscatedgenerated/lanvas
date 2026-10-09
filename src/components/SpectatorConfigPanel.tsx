"use client";

import {useState} from "react";

export interface SpectatorOptions {
    sidebar: boolean;
    sound: boolean;
    events: boolean;
    poll: boolean;
    chaos: boolean;
    autoscroll: boolean;
}

// encode options into the query string that the spectator view reads back on load
export const build_spectator_query = (options: SpectatorOptions): string =>
    new URLSearchParams({
        sidebar: options.sidebar ? "1" : "0",
        sound: options.sound ? "1" : "0",
        events: options.events ? "1" : "0",
        poll: options.poll ? "1" : "0",
        chaos: options.chaos ? "1" : "0",
        autoscroll: options.autoscroll ? "1" : "0",
    }).toString();

const TOGGLES: {key: keyof SpectatorOptions; label: string; description: string}[] = [
    {key: "sidebar", label: "Stats sidebar", description: "Live stats and leaderboards beside the canvas."},
    {key: "autoscroll", label: "Auto-scroll sidebar", description: "Slowly scroll the sidebar when it overflows. Disable for a manual scrollbar."},
    {key: "sound", label: "Sound", description: "Whether certain effects play sound or are silent."},
    {key: "events", label: "Event banners", description: "Admin announcements, milestones, casino wins and more."},
    {key: "poll", label: "Polls", description: "Show live poll results (view only)."},
    {key: "chaos", label: "Chaos status", description: "Show which chaos effects are currently active."},
];

const SpectatorConfigPanel = ({defaults, onStart}: {defaults: SpectatorOptions; onStart: (options: SpectatorOptions) => void}) => {
    const [draft, setDraft] = useState<SpectatorOptions>(defaults);
    const [copied, setCopied] = useState(false);

    const toggle = (key: keyof SpectatorOptions) => {
        setDraft((previous) => ({...previous, [key]: !previous[key]}));
        setCopied(false);
    };

    const copy_link = async () => {
        const url = `${window.location.origin}${window.location.pathname}?${build_spectator_query(draft)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    return (
        <main className="flex-1 min-h-0 flex items-center justify-center bg-neutral-950 text-white p-6">
            <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-7 shadow-2xl">
                <h1 className="text-2xl font-bold font-doodle">Spectator view</h1>

                <div className="mt-6 flex flex-col gap-3">
                    {TOGGLES.map(({key, label, description}) => (
                        <label key={key} className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 cursor-pointer hover:border-neutral-700 transition-colors">
                            <input
                                type="checkbox"
                                checked={draft[key]}
                                onChange={() => toggle(key)}
                                className="mt-1 h-4 w-4 shrink-0 accent-orange-600"
                            />
                            <span className="min-w-0">
                                <span className="block font-semibold">{label}</span>
                                <span className="block text-xs text-neutral-400">{description}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="mt-6 flex items-center gap-3">
                    <button
                        onClick={() => onStart(draft)}
                        className="flex-1 rounded-lg bg-orange-600 hover:bg-orange-500 transition-colors px-4 py-2.5 font-semibold cursor-pointer"
                    >
                        Start spectating
                    </button>
                    <button
                        onClick={copy_link}
                        className="rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors px-4 py-2.5 text-sm cursor-pointer"
                        title="Copy a bookmarkable link with these options"
                    >
                        {copied ? "Copied!" : "Copy link"}
                    </button>
                </div>

                <p className="mt-4 text-[11px] text-neutral-500">While spectating: s = sidebar · m = sound · f = fullscreen · c = reopen this panel</p>
            </div>
        </main>
    );
};

export default SpectatorConfigPanel;
