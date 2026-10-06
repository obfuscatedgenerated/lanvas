import {ComponentProps, useEffect, useMemo, useState} from "react";

import Popup from "@/components/Popup";

import {socket} from "@/socket";
import FancyButton from "@/components/FancyButton";
import RiggedWheel from "@/components/RiggedWheel";

interface CasinoPopupProps extends ComponentProps<typeof Popup> {
    in_timeout: boolean;
}

export const CasinoPopup = ({in_timeout, ...popup_props}: CasinoPopupProps) => {
    const [spin_key, setSpinKey] = useState(0);

    // obviously needs more guard logic and to be decided by the server, just testing the wheel component for now

    return (
        <Popup {...popup_props} className="bg-transparent">
            <div className="flex flex-col items-stretch justify-center gap-8">
                {in_timeout && (
                    <p className="text-yellow-400 mt-2">Your pixel isn&apos;t ready yet, wait for your timer to finish to gift it.</p>
                )}

                <RiggedWheel segments={[{id: "test", label: "test", color: "red"}, {id: "jackpot", label: "win a million quid!!", color: "green"}]} result_id={"test"} spin_key={spin_key} />

                <FancyButton onClick={() => setSpinKey((prev) => prev + 1)}>Spin!</FancyButton>
            </div>
        </Popup>
    );
};
