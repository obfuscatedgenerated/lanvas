import {useEffect, useState} from "react";
import type {Author} from "@/types";
import {socket} from "@/socket";
import {AdwarePrank} from "@/components/AdwarePrank";

export const Pranks = () => {
    const [adware_render, setAdwareRender] = useState(false);
    const [adware_enabled, setAdwareEnabled] = useState(false);

    // TODO: if upside down doesnt use this then could just inline into the adware prank

    useEffect(() => {
        const handle_result = ({outcome_id}: {outcome_id: string;}) => {
            if (outcome_id !== "adware") {
                return;
            }

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
