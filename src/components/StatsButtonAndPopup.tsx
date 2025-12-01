"use client";

import {useState, useEffect} from "react";
import {usePathname} from "next/navigation";

import {socket} from "@/socket";

import StatsList, {StatsData} from "@/components/StatsList";

import {ChartNoAxesCombined, SquareArrowOutUpRight, X} from "lucide-react";

interface StatsPopupProps {
    open: boolean;
    on_close: () => void;
}

const StatsPopup = ({ open, on_close }: StatsPopupProps) => {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [prev_open, setPrevOpen] = useState(open);

    // register socket listener
    useEffect(() => {
        socket.on("stats", (data) => {
            setStats(data);
        });
    }, []);

    // when the popup is opened for the first time, join the stats room
    useEffect(() => {
        if (open && !prev_open) {
            socket.emit("join_stats");
        }

        setPrevOpen(open);
    }, [open, prev_open]);

    return (
        <div className={`fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center z-50 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={on_close} aria-modal={open} role="dialog">
            <div className="bg-neutral-700 rounded-lg p-6 max-w-3xl w-11/12 max-h-4/5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold">Live Statistics</h2>

                    <div className="flex items-center gap-4">
                        <a title="Pop out statistics" className="cursor-pointer" onClick={on_close} href="/stats" target="_blank" rel="noopener noreferrer">
                            <SquareArrowOutUpRight className="h-6 w-6" />
                        </a>

                        <button title="Close statistics" className="cursor-pointer" onClick={on_close}>
                            <X className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {stats ? <StatsList stats={stats} /> : <p className="text-lg text-center">Loading stats...</p>}
            </div>
        </div>
    )
}

const StatsButtonAndPopup = () => {
    const pathname = usePathname();

    const [is_popup_open, setIsPopupOpen] = useState(false);

    if (pathname === "/stats") {
        return null;
    }

    return (
        <>
            <button title="View statistics" className="cursor-pointer" onClick={() => setIsPopupOpen(true)}>
                <ChartNoAxesCombined className="h-6 w-6" />
            </button>

            <StatsPopup open={is_popup_open} on_close={() => setIsPopupOpen(false)} />
        </>
    );
}

export default StatsButtonAndPopup;
