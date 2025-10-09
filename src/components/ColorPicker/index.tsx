import { useEffect, useState } from "react";

import Image from "next/image";

import styles from "./ColorPicker.module.css";
import picker_icon from "@/assets/picker.svg";

type HexColor = string;

export interface ColorPickerProps {
    current_color: HexColor;
    on_color_change: (color: HexColor) => void;
}


// excuse the mess!
// i took this from an old wip project because i liked how it looked. this is why this component uses css modules and not tailwind
// tweaks made of course to fit the circular button style

const calculate_luminance = (color: HexColor) => {
    // https://stackoverflow.com/questions/596216/formula-to-determine-brightness-of-rgb-color
    const r = parseInt(color.substring(1, 3), 16) / 255;
    const g = parseInt(color.substring(3, 5), 16) / 255;
    const b = parseInt(color.substring(5, 7), 16) / 255;

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ColorPicker = (props: ColorPickerProps) => {
    // uses separate state so input value can be updated separately from parent component
    const [internal_color, setInternalColor] = useState<HexColor>(props.current_color);

    // TODO:safety: should color be validated? or do we just trust the parent component?
    const picker_invert_value = calculate_luminance(props.current_color) > 0.5 ? "0%" : "100%"; // TODO:lib: configurable threshold + shadow amount.

    // effect: if parent color changes, update internal color
    useEffect(() => {
        setInternalColor(props.current_color);
    }, [props.current_color]);

    return (
        <div
            className={styles.container}
            style={{

                width: "100%",
                height: "100%",
            }}
        >
            <input
                className={styles.input}

                style={{
                    width: "100%",
                    height: "100%",
                }}

                type="color"
                value={internal_color}

                // update internal value every change so input updates properly
                onChange={(e) => {
                    const clr = e.target.value as HexColor; // assumption made

                    if (clr !== internal_color) {
                        setInternalColor(clr);
                    }
                }}

                // update parent value on blur to prevent unnecessary updates / lag
                onBlur={() => { props.on_color_change(internal_color); }}

                aria-label="Select color"
                data-tooltip="Click to select color"
            />
            <Image
                className={styles.overlay}
                style={{
                    width: "50%",
                    height: "auto",

                    objectFit: "contain",

                    userSelect: "none",

                    top: "25%",
                    left: "25%",

                    filter: `invert(${picker_invert_value}) drop-shadow(0px 0px 1px #222)`,
                }}

                // TODO:ux: calculate good render size (width and height props directly on image). or see if it supports svg properly?
                width={250}
                height={250}

                aria-hidden="true"
                alt=""

                draggable={false}

                src={picker_icon}
                priority={true}
            />
        </div>
    );
};

export default ColorPicker;

// TODO:structure: convert other components to directories and replace inline styles with modules
