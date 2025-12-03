import TooltipDiv from "@/components/TooltipDiv";
import {ArrowUpLeft} from "lucide-react";

interface CommentBaseTooltipProps {
    position?: { x: number; y: number };
    className?: string;
    children?: React.ReactNode;
    on_blur?: (event: React.FocusEvent<HTMLDivElement>) => void;
}

const CommentBaseTooltip = ({position, className = "", children, on_blur = () => {}}: CommentBaseTooltipProps) => {
    if (!position) {
        return null;
    }

    return (
        <div className={`absolute z-99 ${className}`} style={{ left: position.x, top: position.y }} onBlur={on_blur}>
            <ArrowUpLeft className="stroke-neutral-800" />

            <TooltipDiv position={{ x: position.x + 15, y: position.y + 15 }} className="flex items-center gap-2">
                {children}
            </TooltipDiv>
        </div>
    )
}

export default CommentBaseTooltip;
