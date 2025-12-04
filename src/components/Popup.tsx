import {X} from "lucide-react";

interface PopupProps {
    open: boolean;
    on_close: () => void;
    title?: string;
    additional_buttons?: React.ReactNode;
    children?: React.ReactNode;
    close_tooltip?: string;
    className?: string;
}

const Popup = ({ className = "bg-neutral-700 rounded-lg p-6 max-w-3xl w-11/12 max-h-4/5 overflow-y-auto", open, on_close, additional_buttons, children, title, close_tooltip = "Close popup" }: PopupProps) => (
    <div className={`fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center z-50 transition-opacity ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={on_close} aria-modal={open} role="dialog">
        <div className={className} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">{title}</h2>

                <div className="flex items-center gap-4">
                    {additional_buttons}

                    <button title={close_tooltip} className="cursor-pointer" onClick={on_close}>
                        <X className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {children}
        </div>
    </div>
);

export default Popup;
