import { useState, useEffect } from "react";

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
                <div
                    className="fixed z-50 px-3 py-2 text-sm text-white bg-neutral-800 rounded-md shadow-lg whitespace-nowrap pointer-events-none"
                    style={{
                        top: `${position.y + 15}px`,
                        left: `${position.x + 15}px`,
                    }}
                >
                    {content}
                </div>
            )}
        </>
    );
};

export default CursorTooltipWrapper;