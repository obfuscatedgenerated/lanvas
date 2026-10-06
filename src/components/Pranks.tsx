import {useEffect, useState} from "react";
import type {Author} from "@/types";
import {socket} from "@/socket";
import {AdwarePrank} from "@/components/AdwarePrank";
import {set_page_flipped} from "@/lib/page_flip";

export const Pranks = () => {
    const [adware_render, setAdwareRender] = useState(false);
    const [adware_enabled, setAdwareEnabled] = useState(false);

    useEffect(() => {
        const handle_result = ({outcome_id}: {outcome_id: string;}) => {
            if (outcome_id === "adware") {
                setAdwareRender(true);
                setAdwareEnabled(true);

                // stop spawning new ads after 45 seconds
                setTimeout(() => {
                    setAdwareEnabled(false);
                }, 45000);

                // unrender all ads after 60 seconds
                setTimeout(() => {
                    setAdwareRender(false);
                }, 60000);
            } else if (outcome_id === "upside_down") {
                set_page_flipped(true);
                setTimeout(() => set_page_flipped(false), 60000);
            }
        };

        socket.on("casino_own_result", handle_result);

        return () => {
            socket.off("casino_own_result", handle_result);
        };
    }, []);

    return (
        <>
            {adware_render && <AdwarePrank enabled={adware_enabled} />}
        </>
    );
}
