"use client";

import {useState, useEffect} from "react";
import {usePathname} from "next/navigation";

import {socket} from "@/socket";

import StatsList, {StatsData} from "@/components/StatsList";

import {ChartNoAxesCombined, SquareArrowOutUpRight} from "lucide-react";
import Popup from "@/components/Popup";

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
        <Popup
            open={open}
            on_close={on_close}

            title="Live statistics"
            close_tooltip="Close statistics"

            additional_buttons={
                <a title="Pop out statistics" className="cursor-pointer" onClick={on_close} href="/stats" target="_blank" rel="noopener noreferrer">
                    <SquareArrowOutUpRight className="h-6 w-6" />
                </a>
            }
        >
                {stats ? <StatsList stats={stats} /> : <p className="text-lg text-center">Loading stats...</p>}
        </Popup>
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

export const StatsButtonFallback = () => (
    <ChartNoAxesCombined className="h-6 w-6 opacity-50" />
);

export default StatsButtonAndPopup;
