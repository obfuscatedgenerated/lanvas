"use client";

import {useState, useCallback, useEffect, useRef} from "react";
import {Send, X} from "lucide-react";
import CommentBaseTooltip from "@/components/CommentBaseTooltip";

import {socket} from "@/socket";
import {DEFAULT_COMMENT_TIMEOUT_MS, DEFAULT_COMMENTS_ENABLED} from "@/defaults";
import {CONFIG_KEY_COMMENT_TIMEOUT_MS, CONFIG_KEY_COMMENTS_ENABLED, LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER} from "@/consts";

export interface CommentComposerPosition {
    x: number;
    y: number;
    grid_x: number;
    grid_y: number;
}

interface CommentComposerProps {
    position?: CommentComposerPosition;
    on_submitted?: (comment: string, position: CommentComposerPosition) => void;
    on_cancel?: () => void;
    className?: string;
}

const TIMEOUT_STATUS_UPDATE_INTERVAL_MS = 50;
const TimeoutStatus = ({start, until}: {start: number; until: number}) => {
    const [value, setValue] = useState(until - start);

    // update value periodically, counting down
    useEffect(() => {
        const interval = setInterval(() => {
            setValue(Math.max(0, until - Date.now()));
        }, TIMEOUT_STATUS_UPDATE_INTERVAL_MS);

        return () => {
            clearInterval(interval);
        };
    }, [start, until]);

    return (
        <div className="h-6 w-60 flex items-center">
            <progress value={value} max={until - start} className="w-full h-1 progress-white" />
            <span className="ml-2 text-sm text-white">{(value / 1000).toFixed(1)}s</span>
        </div>
    );
}

const CommentComposer = ({position, on_submitted, on_cancel, className = ""}: CommentComposerProps) => {
    const [input_value, setInputValue] = useState("");

    const [comments_enabled, setCommentsEnabled] = useState(DEFAULT_COMMENTS_ENABLED);
    const self_hide_timeout_ref = useRef<NodeJS.Timeout | null>(null);

    const [comment_timeout_ms, setCommentTimeoutMs] = useState(DEFAULT_COMMENT_TIMEOUT_MS);

    const [timeout_started, setTimeoutStarted] = useState<number | null>(null);
    const [timed_out_until, setTimedOutUntil] = useState<number | null>(null);
    const timeout_ref = useRef<NodeJS.Timeout | null>(null);

    // register socket listener
    useEffect(() => {
        socket.on("config_value", (data: {key: string; value: unknown}) => {
            if (data.key === CONFIG_KEY_COMMENT_TIMEOUT_MS) {
                setCommentTimeoutMs(data.value as number);
            } else if (data.key === CONFIG_KEY_COMMENTS_ENABLED) {
                setCommentsEnabled(data.value as boolean);
            }
        });

        socket.on("comment_rejected", ({reason}) => {
            // don't show fallback alert for automod rejections, we have a fancy popup for that
            if (reason !== "automod") {
                alert(`Your comment was rejected! Reason: ${reason}`);
            }

            // clear timeout on rejection
            setTimeoutStarted(null);
            setTimedOutUntil(null);

            if (timeout_ref.current) {
                clearTimeout(timeout_ref.current);
                timeout_ref.current = null;
            }
        });

        socket.on("comment_timeout_info", ({started, ends}: {started: number; ends: number}) => {
            if (localStorage.getItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER) === "true") {
                return;
            }

            const now = Date.now();

            // set timeout data
            setTimeoutStarted(started);
            setTimedOutUntil(ends);

            // and set a js timeout to clear it after the timeout period
            if (timeout_ref.current) {
                clearTimeout(timeout_ref.current);
            }

            timeout_ref.current = setTimeout(() => {
                setTimeoutStarted(null);
                setTimedOutUntil(null);
                timeout_ref.current = null;
            }, ends - now);
        });

        // request initial config values
        socket.emit("get_public_config_value", CONFIG_KEY_COMMENT_TIMEOUT_MS);
        socket.emit("get_public_config_value", CONFIG_KEY_COMMENTS_ENABLED);

        // check for existing timeout
        socket.emit("check_comment_timeout");
    }, []);

    const handle_submit = useCallback(
        () => {
            if (input_value.trim().length === 0 || !position) {
                return;
            }

            // trim the x and y to 3 decimal places to minimise packet size
            const x = Math.round((position.grid_x + Number.EPSILON) * 1000) / 1000;
            const y = Math.round((position.grid_y + Number.EPSILON) * 1000) / 1000;

            console.log("Submitting comment:", input_value.trim(), "x:", x, "y:", y);
            socket.emit("submit_comment", {
                x,
                y,
                comment: input_value.trim(),
            });

            if (localStorage.getItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER) !== "true") {
                // set timeout data
                const now = Date.now();
                setTimeoutStarted(now);
                setTimedOutUntil(now + comment_timeout_ms);

                // and set a js timeout to clear it after the timeout period
                if (timeout_ref.current) {
                    clearTimeout(timeout_ref.current);
                }

                timeout_ref.current = setTimeout(() => {
                    setTimeoutStarted(null);
                    setTimedOutUntil(null);
                    timeout_ref.current = null;
                }, comment_timeout_ms);
            }

            // fire any post submit callback
            if (on_submitted) {
                on_submitted(input_value, position);
            }

            setInputValue("");
        },
        [comment_timeout_ms, input_value, on_submitted, position]
    );

    const handle_cancel = useCallback(
        () => {
            if (on_cancel) {
                on_cancel();
            }

            setInputValue("");
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

    if (!comments_enabled) {
        // hide self after short delay
        if (self_hide_timeout_ref.current) {
            clearTimeout(self_hide_timeout_ref.current);
        }

        self_hide_timeout_ref.current = setTimeout(() => {
            // ensure comments still disabled before hiding
            if (!comments_enabled) {
                handle_cancel();
            }

            self_hide_timeout_ref.current = null;
        }, 1500);

        return (
            <CommentBaseTooltip position={position} className={className} on_blur={handle_blur}>
                <div className="h-6 w-60 flex items-center justify-center">
                    <span className="text-sm text-white">Comments are currently disabled.</span>
                </div>
            </CommentBaseTooltip>
        );
    }

    // if we got here, comments are enabled, clear any self hide timeout
    if (self_hide_timeout_ref.current) {
        clearTimeout(self_hide_timeout_ref.current);
        self_hide_timeout_ref.current = null;
    }

    if (timeout_started && timed_out_until && Date.now() < timed_out_until) {
        return (
            <CommentBaseTooltip position={position} className={className} on_blur={handle_blur}>
                <TimeoutStatus start={timeout_started} until={timed_out_until} />
            </CommentBaseTooltip>
        );
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
                className="h-6 w-48 px-2 py-1 text-sm text-white focus:outline-none"
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

export default CommentComposer;
