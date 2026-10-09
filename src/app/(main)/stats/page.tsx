import type {Metadata} from "next";

import StatsPageInteractivity, {StatsPageInteractivityFallback} from "@/components/StatsPageInteractivity";
import {Suspense} from "react";

export const metadata: Metadata =  {
    title: "Live Statistics"
};

export default function StatsPage() {
    return (
        <Suspense fallback={<StatsPageInteractivityFallback />}>
            <StatsPageInteractivity />
        </Suspense>
    );
}

