"use client";

// it's all interactivity anyway, may as well be a client component and we just inline the state here

import {useState, useCallback, useEffect} from "react";

import PixelGrid, {ResolvedPixel} from "@/components/PixelGrid";
import FloatingWidget from "@/components/FloatingWidget";
import FloatingHelp from "@/components/FloatingHelp";
import FloatingAdminMessage from "@/components/FloatingAdminMessage";

import {socket} from "@/socket";
import {DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";
import {CONFIG_KEY_PIXEL_TIMEOUT_MS, LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER} from "@/consts";
import FloatingPoll from "@/components/FloatingPoll";
import CommentComposerTooltip from "@/components/CommentComposerTooltip";
import type {GridCanvasRef} from "@/components/GridCanvas";

interface CommentComposePosition {
    x: number;
    y: number;
    canvas_x: number;
    canvas_y: number;
    rect_x: number;
    rect_y: number;
    source_rect: DOMRect;
}

export default function Home() {
    const [current_color, setCurrentColor] = useState("#000000");

    const [timeout_start_time, setTimeoutStartTime] = useState<number | null>(null);
    const [timeout_end_time, setTimeoutEndTime] = useState<number | null>(null);

    const [is_readonly, setIsReadonly] = useState(false);
    const [pixel_timeout_ms, setPixelTimeoutMs] = useState(DEFAULT_PIXEL_TIMEOUT_MS);

    const [comment_compose_coords, setCommentComposeCoords] = useState<CommentComposePosition | null>(null);
    const [comment_compose_visible, setCommentComposeVisible] = useState(false);

    // when pixel is submitted, switch to show timeout mode for the widget
    const handle_pixel_submitted = useCallback(
        () => {
            if (localStorage.getItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER) === "true") {
                return;
            }

            setTimeoutStartTime(Date.now());
            setTimeoutEndTime(Date.now() + pixel_timeout_ms);

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
                setTimeoutEndTime(null);
            }, pixel_timeout_ms);
        },
        [pixel_timeout_ms]
    );

    // if the update was rejected, undo the timeout state
    const handle_pixel_update_rejected = useCallback(
        () => {
            setTimeoutStartTime(null);
            setTimeoutEndTime(null);
        },
        []
    );

    // use socket to check timeout
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("timeout_info", (info) => {
            // update timeout so far
            setTimeoutStartTime(info.started);
            setTimeoutEndTime(info.ends);

            // adjust remaining for clock sync (could also subtract the checked_at time, but this is simpler)
            const current_time = Date.now();
            const true_remaining = info.ends - current_time;

            // after timeout, switch back to color picker mode
            setTimeout(() => {
                setTimeoutStartTime(null);
                setTimeoutEndTime(null);
            }, true_remaining);
        });

        socket.on("readonly", (readonly) => {
            setIsReadonly(readonly);
            if (readonly) {
                alert("The canvas is now in read only mode. You cannot place pixels at this time.");
            }
        });

        socket.on("config_value", ({key, value}) => {
            console.log("Received config value:", key, value);

            if (key === CONFIG_KEY_PIXEL_TIMEOUT_MS) {
                setPixelTimeoutMs(value);
            }
        });

        socket.on("reload", () => {
            console.log("Received reload command from server, reloading page...");
            window.location.reload();
        });

        socket.on("comment_rejected", ({reason}) => {
            alert(`Your comment was rejected! Reason: ${reason}`);
        });

        // check for any timeouts on page load
        socket.emit("check_timeout");

        // check if the canvas is in readonly mode
        socket.emit("check_readonly");

        // request timeout config value
        socket.emit("get_public_config_value", CONFIG_KEY_PIXEL_TIMEOUT_MS);

        return () => {
            socket.disconnect();
        }
    }, []);

    const prepare_live_comment = useCallback(
        (pixel: ResolvedPixel | null, event: React.MouseEvent) => {
            if (!pixel) {
                return;
            }

            setCommentComposeCoords({
                // absolute screen x and y
                x: event.clientX,
                y: event.clientY,

                // x and y in terms of canvas scale
                canvas_x: pixel.true_x,
                canvas_y: pixel.true_y,

                // x and y in terms of canvas rect (for positioning)
                rect_x: pixel.rect_x,
                rect_y: pixel.rect_y,
                source_rect: pixel.source_rect,
            });
            setCommentComposeVisible(true);
        },
        []
    );

    // update tooltip position on canvas transform
    const on_transform = useCallback(
        ({canvas_ref}: {canvas_ref: GridCanvasRef | null}) => {
            if (!canvas_ref || !comment_compose_coords) {
                return;
            }

            const canvas = canvas_ref.get_canvas();
            if (!canvas) {
                return;
            }

            const old_rect = comment_compose_coords.source_rect;
            const new_rect = canvas.getBoundingClientRect();

            // determine the original ratios of rect_x and rect_y to the source rect
            const ratio_x = comment_compose_coords.rect_x / old_rect.width;
            const ratio_y = comment_compose_coords.rect_y / old_rect.height;

            // apply ratio to calculate new rect_x and rect_y based on new rect size
            const new_rect_x = ratio_x * new_rect.width;
            const new_rect_y = ratio_y * new_rect.height;

            // TODO: could we expose info in the ref of pixelgrid to simplify this significantly?

            setCommentComposeCoords({
                ...comment_compose_coords,
                rect_x: new_rect_x,
                rect_y: new_rect_y,
                x: new_rect_x + new_rect.left,
                y: new_rect_y + new_rect.top,
                source_rect: new_rect,
            });
        },
        [comment_compose_coords]
    );
    // TODO: do we also need to update pos on screen resize?

    const fade_out_comment_compose = useCallback(
        () => {
            setCommentComposeVisible(false);

            setTimeout(() => {
                setCommentComposeCoords(null);
            }, 300);
        },
        []
    );

    const handle_comment_submit = useCallback(
        (comment: string) => {
            if (!comment_compose_coords) {
                return;
            }

            console.log("Submitting comment:", comment, comment_compose_coords.canvas_x, comment_compose_coords.canvas_y);
            socket.emit("submit_comment", {
                x: comment_compose_coords.canvas_x,
                y: comment_compose_coords.canvas_y,
                comment,
            });

            fade_out_comment_compose();
        },
        [comment_compose_coords, fade_out_comment_compose]
    );

    return (
        <>
            <FloatingAdminMessage />
            <FloatingPoll />

            <div className={`z-99 transition-opacity duration-300 ${comment_compose_visible ? "opacity-100" : "opacity-0"}`}>
                <CommentComposerTooltip
                    position={comment_compose_coords || undefined}

                    on_submit={handle_comment_submit}
                    on_cancel={fade_out_comment_compose}
                />
            </div>

            <div className="flex-1">
                <PixelGrid
                    current_color={current_color}

                    // don't allow submitting if readonly or in timeout
                    can_submit={!is_readonly && timeout_start_time === null}

                    on_pixel_submitted={handle_pixel_submitted}
                    on_pixel_update_rejected={handle_pixel_update_rejected}

                    on_right_click={prepare_live_comment}

                    //tooltip={comment_compose_coords === null}

                    on_transformed={on_transform}
                />

                {!is_readonly &&
                    <FloatingWidget
                        mode={timeout_start_time ? "timeout" : "color"}

                        current_color={current_color}
                        on_color_change={setCurrentColor}

                        start_time={timeout_start_time ?? -1}
                        duration={(timeout_end_time && timeout_start_time) ? (timeout_end_time - timeout_start_time) : -1}
                    />
                }
            </div>

            <FloatingHelp />
        </>
    );
}
