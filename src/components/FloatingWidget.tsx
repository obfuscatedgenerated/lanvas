"use client";

import { useState, useEffect } from "react";

import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import colors from "tailwindcss/colors";
import ColorPicker from "@/components/ColorPicker";
import {Gift} from "lucide-react";
import {GiftingPopup} from "@/components/GiftingPopup";
import usePublicConfigValue from "@/hooks/usePublicConfigValue";
import {CONFIG_KEY_GIFTING_ENABLED} from "@/consts";
import {DEFAULT_GIFTING_ENABLED} from "@/defaults";

const TIMEOUT_UPDATE_INTERVAL_MS = 100;

interface GridLinesToggleProps {
    grid_lines_enabled: boolean;
    set_grid_lines_enabled: (enabled: boolean) => void;
}

interface ColorPickerContentProps {
    current_color: string;
    on_color_change: (color: string) => void;
}

interface TimeoutContentProps {
    start_time: number;
    duration: number;
}

interface FloatingWidgetPropsTimeout extends TimeoutContentProps {
    mode: "timeout";
}

interface FloatingWidgetPropsColorPicker extends ColorPickerContentProps {
    mode: "color";
}

type FloatingWidgetPropsUnified = {type: "timeout" | "color"} & FloatingWidgetPropsTimeout & FloatingWidgetPropsColorPicker;

type FloatingWidgetProps = FloatingWidgetPropsTimeout | FloatingWidgetPropsColorPicker | FloatingWidgetPropsUnified;

type FloatingWidgetPropsWithGridLinesToggle = FloatingWidgetProps & GridLinesToggleProps;

const ColorPickerContent = ({ current_color, on_color_change }: ColorPickerContentProps) => {
    return <ColorPicker current_color={current_color} on_color_change={on_color_change} />;
}

const TimeoutContent = ({ start_time, duration }: TimeoutContentProps) => {
    const [percentage, setPercentage] = useState(100 * (1 - (Date.now() - start_time) / duration));

    // update percentage on interval
    useEffect(() => {
        const interval = setInterval(() => {
            const new_percentage = 100 * (1 - (Date.now() - start_time) / duration);
            setPercentage(new_percentage > 0 ? new_percentage : 0);
        }, TIMEOUT_UPDATE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [start_time, duration]);

    return (
        <CircularProgressbar
            value={percentage}
            text={((start_time + duration - Date.now()) / 1000).toFixed(0)}
            className="font-sans"
            styles={{
                text: { fill: "#fff", fontSize: "1.75rem" },
                trail: { stroke: "transparent" },
                path: { stroke: colors.rose[400] },
            }}
        />
    );
}

const GiftingButton = () => {
    const [popup_open, setPopupOpen] = useState(false);

    return (
        <>
            <button
                className="w-full h-full flex items-center justify-center text-white outline-yellow-300 outline-1 cursor-pointer text-sm font-semibold hover:bg-yellow-600 hover:drop-shadow-[0_0_10px_rgba(207,170,11,0.9)] transition-colors rounded-full"
                title="Gift this pixel to another user..."
                onClick={() => setPopupOpen(true)}
            >
                <Gift />
            </button>

            <GiftingPopup open={popup_open} on_close={() => setPopupOpen(false)} />
        </>
    );
}

const FloatingWidget = (props: FloatingWidgetPropsWithGridLinesToggle) => {
    const gifting_enabled = usePublicConfigValue(CONFIG_KEY_GIFTING_ENABLED, DEFAULT_GIFTING_ENABLED);

    return (
        <>
            {gifting_enabled && props.mode === "color" && (
                <div className="fixed bottom-55 sm:bottom-22.5 right-25 sm:right-30 w-15 h-15 rounded-full bg-neutral-700">
                    <GiftingButton />
                </div>
            )}

            <div className="fixed bottom-55 sm:bottom-22.5 right-7.5 sm:right-10 w-15 h-15 rounded-full bg-neutral-700">
                {props.mode === "timeout" && <TimeoutContent start_time={props.start_time} duration={props.duration} />}
                {props.mode === "color" && <ColorPickerContent current_color={props.current_color} on_color_change={props.on_color_change} />}
            </div>

            <div className="font-sans fixed bottom-35 sm:bottom-7.5 right-7.5 sm:right-10 bg-neutral-900/70 backdrop-blur-sm border border-neutral-800/70 rounded-lg px-4 py-2">
                <label className="cursor-pointer flex items-center gap-2" title="Shortcut: G">
                    <input
                        type="checkbox"
                        checked={props.grid_lines_enabled}
                        onChange={(e) => props.set_grid_lines_enabled(e.target.checked)}
                    />

                    Grid lines
                </label>
            </div>
        </>
    );
}

export default FloatingWidget;
