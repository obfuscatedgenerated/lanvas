const FloatingHelp = () => (
    <div className="relative w-full h-0 pointer-events-none select-none z-9999">
        <div className="w-full pt-1 flex justify-center text-neutral-400 drop-shadow-md font-sans">
            <span className="hidden pointer-fine:inline-block">
                {/* desktop help text */}

                Left click: place pixel • Middle click and drag: pan • Scroll: zoom
            </span>
            <span className="pointer-fine:hidden">
                {/* mobile help text */}

                Tap: place pixel • Drag: pan • Pinch: zoom
            </span>
        </div>
    </div>
);

export default FloatingHelp;
