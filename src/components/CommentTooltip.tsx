import CommentBaseTooltip from "@/components/CommentBaseTooltip";
import AuthorInfo from "@/components/AuthorInfo";
import {Comment} from "@/types";

interface CommentTooltipProps {
    comment?: Comment;
    className?: string;
}

const CommentTooltip = ({comment, className = ""}: CommentTooltipProps) => {
    if (!comment) {
        return null;
    }

    const position = { x: comment.x, y: comment.y };

    return (
        <CommentBaseTooltip position={position} className={className}>
            <span className="font-semibold flex">
                <div className="flex gap-1">
                    <AuthorInfo author={comment.author} />
                </div>
                :
            </span>

            <span>{comment.comment}</span>
        </CommentBaseTooltip>
    );
}

export default CommentTooltip;
