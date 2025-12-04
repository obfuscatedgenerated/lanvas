import CommentBaseTooltip from "@/components/CommentBaseTooltip";
import AuthorInfo from "@/components/AuthorInfo";
import {Comment} from "@/types";

interface CommentTooltipProps {
    comment?: Comment;
    className?: string;
    style?: React.CSSProperties;
    positioning?: "relative" | "absolute" | "fixed";
}

const CommentTooltip = ({comment, className = "", style, positioning = "fixed"}: CommentTooltipProps) => {
    if (!comment) {
        return null;
    }

    const position = {x: comment.x, y: comment.y};

    // TODO: try hover detection without blocking pointer again

    return (
        <CommentBaseTooltip positioning={positioning} position={position} className={`pointer-events-none ${className}`} tooltip_className="w-max max-w-xs" style={style}>
            <span className="font-semibold flex shrink-0">
                <div className="flex gap-1">
                    <AuthorInfo author={comment.author} />
                </div>
                :
            </span>

            <span className="break-words min-w-0">{comment.comment}</span>
        </CommentBaseTooltip>
    );
}

export default CommentTooltip;
