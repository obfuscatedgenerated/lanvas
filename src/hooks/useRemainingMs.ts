import {useEffect, useState} from "react";

const COOLDOWN_UPDATE_INTERVAL_MS = 100;

const useRemainingMs = (start_time: number | null, duration: number | null): number => {
    const [remaining_ms, setRemainingMs] = useState(0);

    useEffect(() => {
        if (start_time === null || duration === null) {
            setRemainingMs(0);
            return;
        }

        const update = () => setRemainingMs(Math.max(0, start_time + duration - Date.now()));
        update();

        const interval = setInterval(update, COOLDOWN_UPDATE_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [start_time, duration]);

    return remaining_ms;
};

export default useRemainingMs;
