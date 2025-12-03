"use client";

import {useState, useCallback} from "react";
import {Send, X} from "lucide-react";
import CommentBaseTooltip from "@/components/CommentBaseTooltip";

interface CommentComposerTooltipProps {
    position?: { x: number; y: number };
    on_submit?: (comment: string, position: { x: number; y: number }) => void;
    on_cancel?: () => void;
    className?: string;
}

const CommentComposerTooltip = ({position, on_submit, on_cancel, className = ""}: CommentComposerTooltipProps) => {
    const [input_value, setInputValue] = useState("");

    const handle_submit = useCallback(
        () => {
            if (on_submit && position) {
                on_submit(input_value, position);
                setInputValue("");
            }
        },
        [input_value, on_submit, position]
    );

    const handle_cancel = useCallback(
        () => {
            if (on_cancel) {
                on_cancel();
                setInputValue("");
            }
        },
        [on_cancel]
    );

    const handle_blur = useCallback(
        (e: React.FocusEvent<HTMLDivElement>) => {
            // check if the new focused element is inside the current target
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                handle_cancel();
            }
        },
        [handle_cancel]
    );

    if (!position) {
        return null;
    }

    return (
        <CommentBaseTooltip position={position} className={className} on_blur={handle_blur}>
            <input
                type="text"
                value={input_value}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        handle_submit();
                    } else if (e.key === "Escape") {
                        handle_cancel();
                    }
                }}
                placeholder="Enter your comment"
                className="w-48 px-2 py-1 text-sm text-white focus:outline-none"
                autoFocus={true}
                maxLength={100}
            />

            <button title="Send comment" className="cursor-pointer" onClick={handle_submit}>
                <Send className="w-4 h-4" />
            </button>

            <button title="Cancel" className="cursor-pointer" onClick={handle_cancel}>
                <X className="w-4 h-4" />
            </button>
        </CommentBaseTooltip>
    )
}

export default CommentComposerTooltip;
