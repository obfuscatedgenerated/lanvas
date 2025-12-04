import {TooltipStyleDiv} from "@/components/TooltipDiv";
import {ArrowUpLeft} from "lucide-react";

interface CommentBaseTooltipProps {
    position?: { x: number; y: number };
    className?: string;
    tooltip_className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
    positioning?: "relative" | "absolute" | "fixed";
    on_blur?: (event: React.FocusEvent<HTMLDivElement>) => void;
}

const CommentBaseTooltip = ({position, className = "", tooltip_className = "", style, children, on_blur = () => {}, positioning = "fixed"}: CommentBaseTooltipProps) => {
    if (!position) {
        return null;
    }

    // TODO memoise, although unlikely to matter
    const merged_style = { ...style };
    merged_style.left = `${position.x}px`;
    merged_style.top = `${position.y}px`;

    return (
        <div className={`${positioning} z-99 ${className}`} style={merged_style} onBlur={on_blur}>
            <ArrowUpLeft className="relative stroke-neutral-800 h-6 w-6" />

            <TooltipStyleDiv className={`relative left-4 -top-2 flex items-center gap-2 ${tooltip_className}`}>
                {children}
            </TooltipStyleDiv>
        </div>
    )
}

export default CommentBaseTooltip;
