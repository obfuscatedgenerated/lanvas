import Popup from "@/components/Popup";
import {CircleAlert} from "lucide-react";

interface AutomodPopupProps {
    open: boolean;
    on_close: () => void;

    violating_labels: string[];
    cache_hit: boolean;
}

const AutomodPopup = ({open, on_close, violating_labels, cache_hit}: AutomodPopupProps) => (
    <Popup open={open} on_close={on_close} title="AutoMod" className="bg-neutral-800 rounded-lg p-6 max-w-lg w-full font-sans">
        <div className="flex flex-col gap-4 items-center justify-center">
            <CircleAlert className="h-24 w-24 text-red-500" />

            <p className="text-red-500 text-balance text-center">
                Your comment was flagged by AutoMod for the following reasons:
            </p>

            <ul className="list-disc list-inside text-red-400">
                {violating_labels.map((label, index) => (
                    <li key={index}>{label}</li>
                ))}
            </ul>

            <p className="text-sm w-4/5 mt-2">
                Please remember to be respectful to other participants.
            </p>

            <p className="text-sm w-4/5">
                If you believe this is a mistake, you can try rephrasing your comment, or contacting the admin.
            </p>

            {cache_hit && (
                <p className="text-neutral-500 mt-2">
                    (Cached result)
                </p>
            )}
        </div>
    </Popup>
);

export default AutomodPopup;
