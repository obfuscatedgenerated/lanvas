import { useCallback, useState, useRef, useEffect } from "react";

const MAX_AD_ID = 7;

let z_counter = 1000;

type AdwareWindowProps = {
    image_id: number;
    initial_x: number;
    initial_y: number;
    on_close: () => void;
};

const AdwareWindow = ({ image_id, initial_x, initial_y, on_close }: AdwareWindowProps) => {
    const [z_index, setZIndex] = useState(() => z_counter++);
    const window_ref = useRef<HTMLDivElement>(null);

    const bring_to_front = useCallback(() => {
        setZIndex(z_counter++);
    }, []);

    const handle_drag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();

        const node = window_ref.current;
        if (!node) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = node.offsetLeft;
        const startTop = node.offsetTop;

        const handle_mouse_move = (move_event: MouseEvent) => {
            const deltaX = move_event.clientX - startX;
            const deltaY = move_event.clientY - startY;

            node.style.left = `${startLeft + deltaX}px`;
            node.style.top = `${startTop + deltaY}px`;
        };

        const handle_mouse_up = () => {
            document.removeEventListener("mousemove", handle_mouse_move);
            document.removeEventListener("mouseup", handle_mouse_up);
        };

        document.addEventListener("mousemove", handle_mouse_move);
        document.addEventListener("mouseup", handle_mouse_up);
    }, []);

    return (
        <div
            ref={window_ref}
            className="absolute w-fit bg-white border border-black shadow-lg cursor-move select-none"
            style={{
                zIndex: z_index,
                left: `${initial_x}px`,
                top: `${initial_y}px`,
            }}
            onMouseDown={(e) => {
                bring_to_front();
                handle_drag(e);
            }}
        >
            <div className="flex justify-between items-center bg-gray-800 p-1 border-b border-black text-white">
                <span className="font-bold text-xs truncate pr-2">Advertisement</span>
                <button
                    type="button"
                    className="text-red-400 font-bold px-1 cursor-pointer leading-none hover:text-red-300"
                    onClick={(e) => {
                        e.stopPropagation();
                        on_close();
                    }}
                >
                    X
                </button>
            </div>
            <img
                src={`/adware/${image_id}.png`}
                alt=""
                className="block pointer-events-none max-w-[80vw] max-h-[80vh]"
                draggable={false}
            />
        </div>
    );
};

type AdInstance = {
    render_key: number;
    image_id: number;
    x: number;
    y: number;
};

export const AdwarePrank = ({ enabled }: { enabled: boolean }) => {
    const [active_ads, setActiveAds] = useState<AdInstance[]>([]);

    const image_bag = useRef<number[]>([]);
    const render_key_counter = useRef(0);

    const get_next_image_id = useCallback(
        () => {
            if (image_bag.current.length === 0) {
                const full_bag = Array.from({ length: MAX_AD_ID + 1 }, (_, i) => i);

                for (let i = full_bag.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [full_bag[i], full_bag[j]] = [full_bag[j], full_bag[i]];
                }
                image_bag.current = full_bag;
            }
            return image_bag.current.pop()!;
        },
        []
    );

    const get_random_position = useCallback(
        () => {
            const padding = 20;

            const max_left = Math.max(padding, window.innerWidth - 320);
            const max_top = Math.max(padding, window.innerHeight - 280);

            const x = Math.floor(padding + Math.random() * (max_left - padding));
            const y = Math.floor(padding + Math.random() * (max_top - padding));

            return { x, y };
        },
        []
    );

    const spawn_ad = useCallback(
        () => {
            const image_id = get_next_image_id();
            const { x, y } = get_random_position();
            const render_key = ++render_key_counter.current;

            setActiveAds((prev) => [...prev, { render_key, image_id, x, y }]);
        },
        [get_next_image_id, get_random_position]
    );

    useEffect(() => {
        if (!enabled) return;

        let timeout_id: NodeJS.Timeout;

        const schedule_next_spawn = () => {
            const delay = 500 + Math.random() * 3000;

            timeout_id = setTimeout(() => {
                spawn_ad();
                schedule_next_spawn();
            }, delay);
        };

        schedule_next_spawn();

        return () => {
            clearTimeout(timeout_id);
        };
    }, [enabled, spawn_ad]);

    const close_ad = useCallback(
        (render_key: number) => {
            setActiveAds((prev_ads) => prev_ads.filter((ad) => ad.render_key !== render_key));
        },
        []
    );

    return (
        <>
            {active_ads.map((ad) => (
                <AdwareWindow
                    key={ad.render_key}
                    image_id={ad.image_id}
                    initial_x={ad.x}
                    initial_y={ad.y}
                    on_close={() => close_ad(ad.render_key)}
                />
            ))}
        </>
    );
};
