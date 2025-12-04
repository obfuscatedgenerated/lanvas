import {TooltipStyleDiv} from "@/components/TooltipDiv";
import {ChevronLeft} from "lucide-react";

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
        <div className={`${positioning} -translate-x-2 -translate-y-2 z-99 ${className}`} style={merged_style} onBlur={on_blur}>
            <ChevronLeft className="relative stroke-neutral-800 fill-neutral-800 h-5 w-5 rotate-45 pointer-events-none" />

            <TooltipStyleDiv className={`font-sans relative left-4.25 -top-1.5 flex items-center gap-2 ${tooltip_className}`}>
                {children}
            </TooltipStyleDiv>
        </div>
    )
}

export default CommentBaseTooltip;
