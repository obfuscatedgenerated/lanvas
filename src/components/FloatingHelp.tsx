const FloatingHelp = () => (
    <div className="fixed bottom-0 pointer-events-none select-none z-9999 w-full pb-2 flex justify-center text-neutral-400 drop-shadow-md font-sans">
        <span className="hidden pointer-fine:inline-block">
            {/* desktop help text */}

            Left click: place pixel • Middle click and drag: pan • Scroll: zoom
        </span>
        <span className="pointer-fine:hidden">
            {/* mobile help text */}

            Tap: place pixel • Drag: pan • Pinch: zoom
        </span>
    </div>
);

export default FloatingHelp;
