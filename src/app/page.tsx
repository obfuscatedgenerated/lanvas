"use client";

// it's all interactivity anyway, may as well be a client component and we just inline the state here

import {useState, useCallback, useEffect, useRef} from "react";

import PixelGrid, {type PixelGridRef, type ResolvedPixel} from "@/components/PixelGrid";
import FloatingWidget from "@/components/FloatingWidget";
import FloatingAdminMessage from "@/components/FloatingAdminMessage";
import FloatingPoll from "@/components/FloatingPoll";
import CommentComposer, {type CommentComposerPosition} from "@/components/CommentComposer";
import FloatingCommentControl from "@/components/FloatingCommentControl";

import {socket} from "@/socket";
import {DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";
import {CONFIG_KEY_PIXEL_TIMEOUT_MS, LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER} from "@/consts";
import AutomodPopup from "@/components/AutomodPopup";

export default function Home() {
    const [current_color, setCurrentColor] = useState("#000000");

    const [timeout_start_time, setTimeoutStartTime] = useState<number | null>(null);
    const [timeout_end_time, setTimeoutEndTime] = useState<number | null>(null);

    const [is_readonly, setIsReadonly] = useState(false);
    const [pixel_timeout_ms, setPixelTimeoutMs] = useState(DEFAULT_PIXEL_TIMEOUT_MS);

    const pixel_grid_ref = useRef<PixelGridRef | null>(null);

    const [comment_composer_coords, setCommentComposerCoords] = useState<CommentComposerPosition | null>(null);
    const [comment_composer_visible, setCommentComposerVisible] = useState(false);
    const [automod_to_show, setAutomodToShow] = useState<{violating_labels: string[]; cache_hit: boolean} | null>(null);

    const [comments_on_canvas, setCommentsOnCanvas] = useState<boolean>(true);

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
            if (localStorage.getItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER) === "true") {
                return;
            }

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

        socket.on("comment_rejected", ({reason, labels, cache_hit}) => {
           // we only care about automod rejections here
            if (!reason || reason !== "automod") {
                return;
            }

            setAutomodToShow({violating_labels: labels, cache_hit});
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

            setCommentComposerCoords({
                // absolute screen x and y
                x: event.clientX,
                y: event.clientY,

                // x and y in terms of grid coords
                grid_x: pixel.true_x,
                grid_y: pixel.true_y,
            });
            setCommentComposerVisible(true);
        },
        []
    );

    // update tooltip position on canvas transform
    const on_transform = useCallback(
        () => {
            if (!pixel_grid_ref.current || !comment_composer_coords) {
                return;
            }

            const {grid_x, grid_y} = comment_composer_coords;

            // recalculate screen position of stored coords
            const {canvas_x, canvas_y} = pixel_grid_ref.current.grid_to_canvas_space(grid_x, grid_y);
            const {rect_x, rect_y} = pixel_grid_ref.current.canvas_to_rect_space(canvas_x, canvas_y);
            const {screen_x, screen_y} = pixel_grid_ref.current.rect_to_screen_space(rect_x, rect_y);

            setCommentComposerCoords({
                x: screen_x,
                y: screen_y,
                grid_x,
                grid_y,
            });
        },
        [comment_composer_coords]
    );
    // TODO: just move the overlay handling to be inside the transformwrapper instead of doing all this. only consideration is getting the state there but ig can use context or prop drill
    // TODO: do we also need to update pos on screen resize?

    const fade_out_comment_compose = useCallback(
        () => {
            setCommentComposerVisible(false);

            setTimeout(() => {
                setCommentComposerCoords(null);
            }, 300);
        },
        []
    );

    return (
        <>
            <FloatingAdminMessage />
            <FloatingPoll />

            <AutomodPopup
                open={automod_to_show !== null}
                on_close={() => setAutomodToShow(null)}
                violating_labels={automod_to_show?.violating_labels || []}
                cache_hit={automod_to_show?.cache_hit || false}
            />

            <div className={`z-99 transition-opacity duration-300 ${comment_composer_visible ? "opacity-100" : "opacity-0"}`}>
                <CommentComposer
                    position={comment_composer_coords || undefined}

                    on_submitted={fade_out_comment_compose}
                    on_cancel={fade_out_comment_compose}
                />
            </div>

            <div className="flex-1">
                <PixelGrid
                    ref={pixel_grid_ref}

                    current_color={current_color}

                    // don't allow submitting if readonly or in timeout
                    can_submit={!is_readonly && timeout_start_time === null}

                    on_pixel_submitted={handle_pixel_submitted}
                    on_pixel_update_rejected={handle_pixel_update_rejected}

                    on_right_click={prepare_live_comment}

                    //tooltip={comment_compose_coords === null}

                    on_transformed={on_transform}

                    comments_on_canvas={comments_on_canvas}
                />
            </div>

            <FloatingCommentControl comments_on_canvas={comments_on_canvas} setCommentsOnCanvas={setCommentsOnCanvas} />

            {!is_readonly &&
                <FloatingWidget
                    mode={timeout_start_time ? "timeout" : "color"}

                    current_color={current_color}
                    on_color_change={setCurrentColor}

                    start_time={timeout_start_time ?? -1}
                    duration={(timeout_end_time && timeout_start_time) ? (timeout_end_time - timeout_start_time) : -1}
                />
            }
        </>
    );
}
