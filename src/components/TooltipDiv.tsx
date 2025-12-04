interface TooltipBaseProps {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
    on_blur?: (event: React.FocusEvent<HTMLDivElement>) => void;
}

interface TooltipDivProps extends TooltipBaseProps {
    position?: { x: number; y: number };
    positioning?: "relative" | "absolute" | "fixed";
}


export const TooltipStyleDiv = ({ children, style, className = "" }: TooltipBaseProps) => (
    <div
        className={`px-3 py-2 text-sm text-white bg-neutral-800 rounded-md shadow-lg ${className}`}
        style={style}
    >
        {children}
    </div>
);

const TooltipDiv = ({ children, style, position, className = "", positioning = "fixed" }: TooltipDivProps) => {
    if (!position) {
        return null;
    }

    // TODO memoise, although unlikely to matter
    const merged_style = { ...style };
    merged_style.left = `${position.x}px`;
    merged_style.top = `${position.y}px`;

    return (
        <TooltipStyleDiv
            className={`${positioning} ${className}`}
            style={merged_style}
        >
            {children}
        </TooltipStyleDiv>
    );
};

export default TooltipDiv;