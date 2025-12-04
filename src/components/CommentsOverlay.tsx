"use client";

import { useState, useEffect } from "react";

import CommentTooltip from "@/components/CommentTooltip";
import type { Comment } from "@/types";

import { socket } from "@/socket";
import type {PixelGridRef} from "@/components/PixelGrid";

export interface CommentWithExpiry extends Comment {
    expiry: Date;
}

const EXPIRY_TIME_MS = 45000; // comments expire after 45 seconds
const FADE_DURATION_MS = 15000; // comments fade out over the last 15 seconds

const ExpiryTransparencyCommentTooltip = ({comment}: {comment: CommentWithExpiry}) => {
    const [opacity_class, setOpacityClass] = useState("opacity-65");
    const [stop_rendering, setStopRendering] = useState(false);

    useEffect(() => {
        // start fading out FADE_DURATION_MS before expiry
        const fade_start_time = comment.expiry.getTime() - FADE_DURATION_MS;
        const now = Date.now();
        const time_until_fade_start = fade_start_time - now;

        const fade_timeout = setTimeout(() => {
            setOpacityClass("opacity-0");
        }, time_until_fade_start > 0 ? time_until_fade_start : 0);

        const stop_rendering_timeout = setTimeout(() => {
            setStopRendering(true);
        }, comment.expiry.getTime() - now);

        return () => {
            clearTimeout(fade_timeout);
            clearTimeout(stop_rendering_timeout);
        };
    }, [comment]);

    if (stop_rendering) {
        return null;
    }

    return <CommentTooltip positioning="absolute" comment={comment} className={`transition-opacity duration-15000 ${opacity_class}`} />;
}

// TODO: separate out author data for space efficiency, maybe even combine with pixel author data

const CommentsOverlay = ({pixel_grid_ref_api, visible = true}: {pixel_grid_ref_api: PixelGridRef; visible?: boolean}) => {
    const [comments, setComments] = useState<CommentWithExpiry[]>([]);

    // register socket listener
    useEffect(() => {
        const handle_new_comment = (comment: Comment) => {
            const comment_with_expiry: CommentWithExpiry = {
                ...comment,
                expiry: new Date(Date.now() + EXPIRY_TIME_MS),
            };

            // transform grid coords to canvas coords
            const {x: grid_x, y: grid_y} = comment;
            const {canvas_x, canvas_y} = pixel_grid_ref_api.grid_to_canvas_space(grid_x, grid_y);

            comment_with_expiry.x = canvas_x;
            comment_with_expiry.y = canvas_y;

            setComments((prev_comments) => [...prev_comments, comment_with_expiry]);
        }

        socket.on("comment", handle_new_comment);

        // periodically clean up expired comments
        const interval = setInterval(() => {
            const now = new Date();

            // TODO: is this culling early somehow?
            setComments((prev_comments) =>
                prev_comments.filter((comment) => comment.expiry > now)
            );
        }, 5000);

        return () => {
            socket.off("comment", handle_new_comment);
            clearInterval(interval);
        };
    }, [pixel_grid_ref_api]);

    return (
        <div className={`absolute transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}>
            {comments.map((comment, index) => (
                <ExpiryTransparencyCommentTooltip key={index} comment={comment} />
            ))}
        </div>
    );
};

export default CommentsOverlay;

// TODO: should the compose tooltip be moved here as well for performance? would be nice to not have it scale down tho, will investigate
// TODO: button to toggle comments visibility
