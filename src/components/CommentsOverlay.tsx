"use client";

import { useState, useEffect } from "react";

import CommentTooltip from "@/components/CommentTooltip";
import type { Comment } from "@/types";

import { socket } from "@/socket";

export interface CommentWithExpiry extends Comment {
    expiry: Date;
}

const EXPIRY_TIME_MS = 45000; // comments expire after 45 seconds
const FADE_DURATION_MS = 15000; // comments fade out over the last 15 seconds

const ExpiryTransparencyCommentTooltip = ({comment}: {comment: CommentWithExpiry}) => {
    const [opacity_class, setOpacityClass] = useState("opacity-65");

    useEffect(() => {
        // start fading out FADE_DURATION_MS before expiry
        const fade_start_time = comment.expiry.getTime() - FADE_DURATION_MS;
        const now = Date.now();
        const time_until_fade_start = fade_start_time - now;

        const fade_timeout = setTimeout(() => {
            setOpacityClass("opacity-0");
        }, time_until_fade_start > 0 ? time_until_fade_start : 0);

        return () => {
            clearTimeout(fade_timeout);
        };
    }, [comment]);

    // TODO: need to translate position from grid coords to rect or maybe canvas coords
    return <CommentTooltip positioning="absolute" comment={comment} className={`transition-opacity duration-15000 ${opacity_class}`} />;
}

const CommentsOverlay = () => {
    const [comments, setComments] = useState<CommentWithExpiry[]>([]);

    // register socket listener
    useEffect(() => {
        socket.on("comment", (comment: Comment) => {
            const comment_with_expiry: CommentWithExpiry = {
                ...comment,
                expiry: new Date(Date.now() + EXPIRY_TIME_MS),
            };

            setComments((prev_comments) => [...prev_comments, comment_with_expiry]);
        });

        // periodically clean up expired comments
        setInterval(() => {
            const now = new Date();
            setComments((prev_comments) =>
                prev_comments.filter((comment) => comment.expiry > now)
            );
        }, 5000);
    }, []);

    return (
        <div className="absolute">
            {comments.map((comment, index) => (
                <ExpiryTransparencyCommentTooltip key={index} comment={comment} />
            ))}
        </div>
    );
};

export default CommentsOverlay;

// TODO: should the compose tooltip be moved here as well for performance? would be nice to not have it scale down tho, will investigate
