"use client";

import {usePathname} from "next/navigation";
import {ChartNoAxesCombined} from "lucide-react";

const ConditionalStatsLink = () => {
    const pathname = usePathname();

    if (pathname === "/stats") {
        return null;
    }

    return (
        <a href="/stats" title="View statistics" target="_blank">
            <ChartNoAxesCombined />
        </a>
    );
}

export default ConditionalStatsLink;

// TODO: refactor stats page to allow it to be shown in a popup here
