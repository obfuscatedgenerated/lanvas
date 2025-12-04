"use client";

import {useState} from "react";
import {usePathname} from "next/navigation";

import {CircleQuestionMark} from "lucide-react";
import Popup from "@/components/Popup";

interface HelpTableProps {
    entries: { action: string; description: string }[];
    className?: string;
}

const HelpTable = ({ entries, className = "" }: HelpTableProps) => (
    <table className={`w-full text-left border-spacing-x-4 border-separate ${className}`}>
        <tbody className="[&>tr>td]:font-bold [&>tr>td:last-child]:font-normal">
            {entries.map((entry, index) => (
                <tr key={index}>
                    <td>{entry.action}</td>
                    <td>{entry.description}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

interface HelpPopupProps {
    open: boolean;
    on_close: () => void;
}


const HelpPopup = ({ open, on_close }: HelpPopupProps) => (
    <Popup
        open={open}
        on_close={on_close}

        title="Help"
        close_tooltip="Close help"

        className="bg-neutral-700 rounded-lg p-6 overflow-y-auto min-w-[92.5vw] sm:min-w-lg max-w-[92.5vw] sm:max-w-xl"
    >
        {/* desktop help */}
        <HelpTable
            className="hidden pointer-fine:table"
            entries={[
                { action: "Left click", description: "Place pixel" },
                { action: "Middle click and drag", description: "Pan canvas" },
                { action: "Scroll wheel", description: "Zoom in/out" },
                { action: "Right click", description: "Place comment" },
            ]}
        />

        {/* mobile help */}
        <HelpTable
            className="pointer-fine:hidden"
            entries={[
                { action: "Tap", description: "Place pixel" },
                { action: "Drag", description: "Pan canvas" },
                { action: "Pinch", description: "Zoom in/out" },
                { action: "Tap and hold", description: "Place comment" },
            ]}
        />
    </Popup>
);

const HelpButtonAndPopup = () => {
    const pathname = usePathname();

    const [is_popup_open, setIsPopupOpen] = useState(false);

    if (pathname !== "/") {
        return null;
    }

    return (
        <>
            <button title="View help" className="cursor-pointer" onClick={() => setIsPopupOpen(true)}>
                <CircleQuestionMark className="h-6 w-6" />
            </button>

            <HelpPopup open={is_popup_open} on_close={() => setIsPopupOpen(false)} />
        </>
    );
}

export const HelpButtonFallback = () => (
    <CircleQuestionMark className="h-6 w-6 opacity-50" />
);

export default HelpButtonAndPopup;
