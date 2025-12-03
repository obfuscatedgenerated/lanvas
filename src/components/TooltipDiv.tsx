interface CommentTooltipProps {
    children: React.ReactNode;
    position?: { x: number; y: number };
    className?: string;
}

const TooltipDiv = ({ children, position, className = "" }: CommentTooltipProps) => {
    if (!position) {
        return null;
    }

    return (
        <div
            className={`fixed z-50 px-3 py-2 text-sm text-white bg-neutral-800 rounded-md shadow-lg whitespace-nowrap ${className}`}
            style={{
                top: `${position.y}px`,
                left: `${position.x}px`,
            }}
        >
            {children}
        </div>
    );
};

export default TooltipDiv;