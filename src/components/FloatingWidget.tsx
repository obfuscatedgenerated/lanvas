"use client";

import { useState, useEffect } from "react";

import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import colors from "tailwindcss/colors";
import ColorPicker from "@/components/ColorPicker";

const TIMEOUT_UPDATE_INTERVAL_MS = 100;

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

const FloatingWidget = (props: FloatingWidgetProps) => {
    return (
        <div className="absolute bottom-7.5 right-10 w-15 h-15 rounded-full bg-neutral-700">
            {props.mode === "timeout" && <TimeoutContent start_time={props.start_time} duration={props.duration} />}
            {props.mode === "color" && <ColorPickerContent current_color={props.current_color} on_color_change={props.on_color_change} />}
        </div>
    )
}

export default FloatingWidget;
