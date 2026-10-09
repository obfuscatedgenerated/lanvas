"use client";

import {useEffect, useState} from "react";

import {socket} from "@/socket";
import {is_sfx_muted, set_sfx_muted} from "@/lib/sfx";
import {usePublicConfigState} from "@/hooks/usePublicConfigValue";

import SpectatorCanvas from "@/components/SpectatorCanvas";
import SpectatorConfigPanel, {type SpectatorOptions, build_spectator_query} from "@/components/SpectatorConfigPanel";
import AutoScroll from "@/components/AutoScroll";
import StatsList, {type StatsData} from "@/components/StatsList";
import Leaderboards from "@/components/Leaderboards";
import FloatingAdminMessage from "@/components/FloatingAdminMessage";
import FloatingPoll from "@/components/FloatingPoll";
import CasinoAnnouncements from "@/components/CasinoAnnouncements";
import DuckParade from "@/components/DuckParade";
import ClownTracker from "@/components/ClownTracker";
import ChaosEffects from "@/components/ChaosEffects";

import type {Leaderboard} from "@/types";

const LAN_NUMBER = process.env.NEXT_PUBLIC_LAN_NUMBER || "";

const DEFAULTS: SpectatorOptions = {sidebar: true, sound: false, events: true, poll: true, chaos: true, autoscroll: true};

const parse_options = (search: string): SpectatorOptions => {
    const params = new URLSearchParams(search);
    return {
        sidebar: params.get("sidebar") !== "0",
        sound: params.get("sound") === "1",
        events: params.get("events") !== "0",
        poll: params.get("poll") !== "0",
        chaos: params.get("chaos") !== "0",
        autoscroll: params.get("autoscroll") !== "0",
    };
};

interface ViewState {
    ready: boolean;
    configured: boolean;
    options: SpectatorOptions;
}

const SpectatorView = () => {
    const [view, setView] = useState<ViewState>({ready: false, configured: false, options: DEFAULTS});

    const [stats, setStats] = useState<StatsData | null>(null);
    const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);

    // only show feature overlays when that feature is actually enabled, like the main page does
    const {value: casino_value, loaded: casino_loaded} = usePublicConfigState("casino_enabled");
    const {value: chaos_value, loaded: chaos_loaded} = usePublicConfigState("chaos_enabled");
    const casino_enabled = casino_loaded && casino_value;
    const chaos_enabled = chaos_loaded && chaos_value;

    // decide on mount whether we're configured (any query present) or should show the setup panel
    useEffect(() => {
        const search = window.location.search;
        const configured = search.length > 0;
        const options = configured ? parse_options(search) : DEFAULTS;

        if (configured) {
            set_sfx_muted(!options.sound);
        }

        // one-time init from the client-only URL; not a cascading-render source
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setView({ready: true, configured, options});
    }, []);

    // stats/leaderboards wiring, same as the stats page
    useEffect(() => {
        const handle_stats = (data: StatsData) => setStats(data);
        const handle_leaderboards = (data: Leaderboard[]) => setLeaderboards(data);
        const handle_reload = () => window.location.reload();

        socket.on("stats", handle_stats);
        socket.on("leaderboards", handle_leaderboards);
        socket.on("reload", handle_reload);

        socket.emit("join_stats");

        return () => {
            socket.off("stats", handle_stats);
            socket.off("leaderboards", handle_leaderboards);
            socket.off("reload", handle_reload);
        };
    }, []);

    // keybinds for the running view (s sidebar, m sound, f fullscreen, c reopen panel)
    useEffect(() => {
        if (!view.configured) {
            return;
        }

        const on_key = (event: KeyboardEvent) => {
            if (event.key === "s") {
                setView((previous) => ({...previous, options: {...previous.options, sidebar: !previous.options.sidebar}}));
            } else if (event.key === "m") {
                const now_muted = is_sfx_muted();
                set_sfx_muted(!now_muted);
                setView((previous) => ({...previous, options: {...previous.options, sound: now_muted}}));
            } else if (event.key === "f") {
                if (document.fullscreenElement) {
                    void document.exitFullscreen();
                } else {
                    void document.documentElement.requestFullscreen();
                }
            } else if (event.key === "c") {
                setView((previous) => ({...previous, configured: false}));
            }
        };

        window.addEventListener("keydown", on_key);
        return () => window.removeEventListener("keydown", on_key);
    }, [view.configured]);

    const start = (options: SpectatorOptions) => {
        // write the choices into the URL (no reload, so the socket stays up) and run
        window.history.replaceState(null, "", `${window.location.pathname}?${build_spectator_query(options)}`);
        set_sfx_muted(!options.sound);
        setView({ready: true, configured: true, options});
    };

    if (!view.ready) {
        return <main className="flex-1 min-h-0 bg-neutral-950" />;
    }

    if (!view.configured) {
        return <SpectatorConfigPanel defaults={view.options} onStart={start} />;
    }

    const {options} = view;

    return (
        <main className="flex-1 min-h-0 relative bg-neutral-950 text-white">
            {/* overlays: kept out of the layout row so in-flow banners (admin messages) can't resize the canvas */}
            {options.events && <FloatingAdminMessage />}
            {options.events && casino_enabled && (
                <>
                    <CasinoAnnouncements />
                    <DuckParade />
                    <ClownTracker />
                </>
            )}
            {options.poll && <FloatingPoll read_only position_class="bottom-8 left-1/2 -translate-x-1/2" />}
            {options.chaos && chaos_enabled && <ChaosEffects />}

            {/* the actual canvas + sidebar layout, isolated from the overlays above */}
            <div className="absolute inset-0 flex">
            <SpectatorCanvas className="flex-1 min-w-0 p-6 sm:p-10" />

            {options.sidebar && (
                <aside className="w-80 lg:w-96 shrink-0 h-full flex flex-col border-l border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
                    <h1 className="shrink-0 text-3xl font-bold font-doodle text-center px-6 pt-8 pb-3">LANvas {LAN_NUMBER}</h1>

                    {/* stats take their natural height, capped so they can't crowd out the boards; scroll only if they outgrow it */}
                    <h2 className="shrink-0 text-sm font-semibold uppercase tracking-wider text-neutral-400 text-center pb-3">Live stats</h2>
                    <AutoScroll
                        enabled={options.autoscroll}
                        className={`${leaderboards.length > 0 ? "shrink-0 max-h-[45%]" : "flex-1 min-h-0"} px-6 flex flex-col items-center`}
                    >
                        {stats
                            ? <StatsList stats={stats} entry_className="font-semibold" />
                            : <p className="text-neutral-400">Loading stats…</p>
                        }
                    </AutoScroll>

                    {/* leaderboards fill the rest and scroll independently */}
                    {leaderboards.length > 0 && (
                        <div className="flex-1 min-h-0 flex flex-col mt-6 border-t border-neutral-800/60 pt-5">
                            <h2 className="shrink-0 text-2xl font-semibold text-center pb-4">Leaderboards</h2>
                            <AutoScroll enabled={options.autoscroll} className="flex-1 min-h-0 px-6 pb-8 flex flex-col items-center">
                                <Leaderboards leaderboards={leaderboards} />
                            </AutoScroll>
                        </div>
                    )}
                </aside>
            )}
            </div>

            <p className="fixed bottom-2 left-3 text-[11px] text-white/25 pointer-events-none select-none">
                s: sidebar · m: sound · f: fullscreen · c: options
            </p>
        </main>
    );
};

export default SpectatorView;
