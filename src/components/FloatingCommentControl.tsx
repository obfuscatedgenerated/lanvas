"use client";

import {useState, useEffect} from "react";

import AuthorInfo from "@/components/AuthorInfo";
import type {Comment} from "@/types";

import {socket} from "@/socket";

const MAX_RECENT_COMMENTS = 50;

const CommentLine = ({comment}: {comment: Comment}) => (
    <div className="flex gap-2 items-start max-w-full">
        <span className="font-semibold flex shrink-0">
            <div className="flex items-center gap-2">
                <AuthorInfo author={comment.author} />
            </div>

            :
        </span>

        <p className="text-neutral-300 text-sm max-w-full break-all">{comment.comment}</p>
    </div>
);

// TODO: separate out author data for space efficiency, maybe even combine with pixel author data

interface FloatingCommentControlProps {
    comments_on_canvas: boolean;
    setCommentsOnCanvas: (enabled: boolean) => void;
}

const FloatingCommentControl = ({comments_on_canvas, setCommentsOnCanvas}: FloatingCommentControlProps) => {
    const [recent_comments, setRecentComments] = useState<Comment[]>([]);

    // register socket listener
    useEffect(() => {
        socket.on("comment", (comment: Comment)=> {
            setRecentComments((prev_comments) => {
                const updated_comments = [comment, ...prev_comments];
                if (updated_comments.length > MAX_RECENT_COMMENTS) {
                    updated_comments.pop();
                }

                return updated_comments;
            });
        });
    }, []);

    return (
        <details className="group font-sans text-sm fixed bottom-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-4 bg-neutral-900/70 backdrop-blur-sm rounded-lg p-4 max-w-[95vw] sm:max-w-md w-full space-y-2">
            <summary title="Click to expand" className="cursor-pointer">
                <div className="inline-flex justify-between w-[95%] items-center">
                    <span className="text-white font-semibold">Recent comments</span>

                    <label title="" className="cursor-pointer">
                        <input
                            type="checkbox"
                            className="mr-2"

                            checked={comments_on_canvas}
                            onChange={(e) => setCommentsOnCanvas(e.target.checked)}
                        />

                        Comments on canvas
                    </label>
                </div>

                <span className="group-open:hidden mt-2 block">
                    {recent_comments.length !== 0 && <CommentLine comment={recent_comments[0]} />}
                </span>
            </summary>

            <div className="min-h-48 max-h-48 overflow-y-auto minimal-scrollbar px-2 flex flex-col-reverse gap-2">
                {recent_comments.length === 0 ? (
                    <p className="text-gray-300 h-48 flex items-center justify-center">No comments yet.</p>
                ) : (
                    recent_comments.map((comment, index) => (
                        <CommentLine key={index} comment={comment} />
                    ))
                )}
            </div>
        </details>
    );
}

export default FloatingCommentControl;
