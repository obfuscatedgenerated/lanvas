"use client";

import {Volume2, VolumeX} from "lucide-react";

import {set_sfx_muted, useSfxMuted} from "@/lib/sfx";

const SFXToggle = () => {
    const muted = useSfxMuted();

    return (
        <button
            type="button"
            className="cursor-pointer"
            title={muted ? "Unmute sounds" : "Mute sounds"}
            aria-pressed={muted}
            onClick={() => set_sfx_muted(!muted)}
        >
            {muted ? <VolumeX /> : <Volume2 />}
        </button>
    );
};

export default SFXToggle;
