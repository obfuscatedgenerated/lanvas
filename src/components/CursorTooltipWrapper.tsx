import { useState, useEffect } from "react";
import TooltipDiv from "@/components/TooltipDiv";

interface CursorTooltipProps {
    children: React.ReactElement;
    content: React.ReactNode;
    visible: boolean;
}

const CursorTooltipWrapper = ({ children, content, visible }: CursorTooltipProps) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        // track mouse position on window
        const handle_mouse_move = (e: MouseEvent) => {
            setPosition({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener("mousemove", handle_mouse_move);

        return () => {
            window.removeEventListener("mousemove", handle_mouse_move);
        };
    }, []);

    return (
        <>
            {children}
            {visible && (
                <TooltipDiv className="pointer-events-none" position={{
                    x: position.x + 15,
                    y: position.y + 15,
                }}>
                    {content}
                </TooltipDiv>
            )}
        </>
    );
};

export default CursorTooltipWrapper;