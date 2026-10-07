"use client";

// it's all interactivity anyway, may as well be a client component and we just inline the state here

import {useState, useCallback, useEffect, useRef} from "react";

import PixelGrid, {type PixelGridRef, type ResolvedPixel} from "@/components/PixelGrid";
import FloatingWidget from "@/components/FloatingWidget";
import FloatingAdminMessage from "@/components/FloatingAdminMessage";
import FloatingPoll from "@/components/FloatingPoll";
import CommentComposer, {type CommentComposerPosition} from "@/components/CommentComposer";
import FloatingCommentControl from "@/components/FloatingCommentControl";
import AutomodPopup from "@/components/AutomodPopup";
import KeyBindings from "@/components/KeyBindings";

import {socket} from "@/socket";
import {LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER} from "@/consts";
import type {GiftInfo} from "@/types";
import usePublicConfigValue, {usePublicConfigState} from "@/hooks/usePublicConfigValue";
import GiftedBanner from "@/components/GiftedBanner";
import {AFKWarning} from "@/components/AFKWarning";
import AFKHeartbeatActivity from "@/components/AFKHeartbeatActivity";
import ClownTracker from "@/components/ClownTracker";
import CasinoAnnouncements from "@/components/CasinoAnnouncements";
import DuckParade from "@/components/DuckParade";
import {Pranks} from "@/components/Pranks";
import {screen_to_page_space} from "@/lib/page_flip";
import useTemplate from "@/hooks/useTemplate";
import TemplateOverlay, {TemplateProgress} from "@/components/TemplateOverlay";
import TemplatePanel from "@/components/TemplatePanel";

export default function Home() {
    const [current_color, setCurrentColor] = useState("#000000");

    const [timeout_start_time, setTimeoutStartTime] = useState<number | null>(null);
    const [timeout_end_time, setTimeoutEndTime] = useState<number | null>(null);

    const [is_readonly, setIsReadonly] = useState(false);
    const pixel_timeout_ms = usePublicConfigValue("pixel_timeout_ms");

    const pixel_grid_ref = useRef<PixelGridRef | null>(null);

    const [comment_composer_coords, setCommentComposerCoords] = useState<CommentComposerPosition | null>(null);
    const [comment_composer_visible, setCommentComposerVisible] = useState(false);
    const [automod_to_show, setAutomodToShow] = useState<{violating_labels: string[]; cache_hit: boolean} | null>(null);

    const [comments_on_canvas, setCommentsOnCanvas] = useState<boolean>(true);

    const [grid_lines_enabled, setGridLinesEnabled] = useState<boolean>(false);

    const template = useTemplate();
    const [template_progress, setTemplateProgress] = useState<TemplateProgress | null>(null);
    const [template_move_mode, setTemplateMoveMode] = useState(false);

    const [gift_info, setGiftInfo] = useState<GiftInfo>({balance: 0, next_expiry: null, gifts: [], burst_remaining_ms: 0, burst_gap_ms: 0});

    // when the burst gap ends on this client's clock, converted on receipt to avoid clock drift
    const [burst_ends_at, setBurstEndsAt] = useState<number | null>(null);

    const in_timeout = timeout_start_time !== null;
    const has_gifts = gift_info.balance > 0;

    // when pixel is submitted, switch to show timeout mode for the widget
    const handle_pixel_submitted = useCallback(
        () => {
            if (localStorage.getItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER) === "true") {
                return;
            }

            // placing while in timeout spends a gift, which doesn't restart the timer
            if (in_timeout) {
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
        [pixel_timeout_ms, in_timeout]
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

        socket.on("gift_info", (info: GiftInfo) => {
            setGiftInfo(info);
            setBurstEndsAt(info.burst_remaining_ms > 0 ? Date.now() + info.burst_remaining_ms : null);
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

        // check for any held gifts on page load
        socket.emit("check_gifts");

        // check if the canvas is in readonly mode
        socket.emit("check_readonly");

        return () => {
            socket.disconnect();
        }
    }, []);

    const prepare_live_comment = useCallback(
        (pixel: ResolvedPixel | null, event: React.MouseEvent) => {
            if (!pixel) {
                return;
            }

            const {page_x, page_y} = screen_to_page_space(event.clientX, event.clientY);

            setCommentComposerCoords({
                // position on the unrotated page, which is what fixed elements use
                x: page_x,
                y: page_y,

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

    const {value: gifting_value, loaded: gifting_loaded} = usePublicConfigState("gifting_enabled");
    const {value: casino_value, loaded: casino_loaded} = usePublicConfigState("casino_enabled");
    const gifting_enabled = gifting_loaded && gifting_value;
    const casino_enabled = casino_loaded && casino_value;

    return (
        <>
            <AFKHeartbeatActivity />

            <KeyBindings
                bindings={{
                    // TODO: open palette with c key, open help with ? or h key, stats with s etc. might have to make enabled flag contextful
                    "g": () => setGridLinesEnabled(prev => !prev),
                    "t": () => {
                        if (template.settings) {
                            template.update({visible: !template.settings.visible});
                        }
                    }
                }}

                enabled={!comment_composer_coords}
            />

            <FloatingAdminMessage />
            {gifting_enabled && (
                <GiftedBanner />
            )}
            {casino_enabled && (
                <>
                    <CasinoAnnouncements />
                    <DuckParade />
                    <ClownTracker />
                </>
            )}
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

            <div className="flex-1 relative">
                <AFKWarning />

                <PixelGrid
                    ref={pixel_grid_ref}

                    current_color={current_color}

                    // don't allow submitting if readonly, or in timeout without a gift to spend
                    can_submit={!is_readonly && (!in_timeout || has_gifts)}

                    on_pixel_submitted={handle_pixel_submitted}
                    on_pixel_update_rejected={handle_pixel_update_rejected}

                    on_right_click={prepare_live_comment}

                    //tooltip={comment_compose_coords === null}

                    on_transformed={on_transform}

                    comments_on_canvas={comments_on_canvas}
                    show_grid_lines={grid_lines_enabled}

                    overlay={(context) => template.settings && template.cells && template.settings.visible && (
                        <TemplateOverlay
                            {...context}
                            settings={template.settings}
                            cells={template.cells}
                            move_mode={template_move_mode}
                            on_move={(x, y) => template.update({x, y})}
                            on_progress={setTemplateProgress}
                            on_pick_colour={setCurrentColor}
                        />
                    )}
                />
            </div>

            <TemplatePanel
                template={template}
                progress={template_progress}
                move_mode={template_move_mode}
                set_move_mode={setTemplateMoveMode}
            />

            <FloatingCommentControl comments_on_canvas={comments_on_canvas} setCommentsOnCanvas={setCommentsOnCanvas} />

            {!is_readonly &&
                <FloatingWidget
                    current_color={current_color}
                    on_color_change={setCurrentColor}

                    cooldown={timeout_start_time !== null && timeout_end_time !== null
                        ? {start_time: timeout_start_time, duration: timeout_end_time - timeout_start_time}
                        : null
                    }

                    grid_lines_enabled={grid_lines_enabled}
                    set_grid_lines_enabled={setGridLinesEnabled}

                    gifts={gift_info.gifts}
                    next_gift_expiry={gift_info.next_expiry}
                    burst={burst_ends_at !== null && gift_info.burst_gap_ms > 0
                        ? {start_time: burst_ends_at - gift_info.burst_gap_ms, duration: gift_info.burst_gap_ms}
                        : null
                    }
                />
            }

            {casino_enabled && <Pranks />}
        </>
    );
}
