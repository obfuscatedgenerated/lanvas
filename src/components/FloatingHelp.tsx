const FloatingHelp = () => (
    <div className="fixed bottom-0 pointer-events-none select-none z-9999 w-full pb-2 flex justify-center text-neutral-400 drop-shadow-md font-sans text-balance text-sm break-words text-center px-[7.5vw]">
        <span className="hidden pointer-fine:inline-block">
            {/* desktop help text */}

            Left click: place pixel • Middle click and drag: pan • Scroll: zoom • Right click: live comment
        </span>
        <span className="pointer-fine:hidden">
            {/* mobile help text */}

            Tap: place pixel • Drag: pan • Pinch: zoom • Long press: live comment
        </span>
    </div>
);

export default FloatingHelp;
