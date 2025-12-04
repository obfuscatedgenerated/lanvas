import {Suspense} from "react";

import LoginStatus from "@/components/LoginStatus";
import HelpButtonAndPopup, {HelpButtonFallback} from "@/components/HelpButtonAndPopup";
import StatsButtonAndPopup, {StatsButtonFallback} from "@/components/StatsButtonAndPopup";

import GithubLogo from "@/components/GithubLogo";

const Header = () => {
    const lan_number = process.env.NEXT_PUBLIC_LAN_NUMBER || "";

    return (
        <header className="font-sans p-2 bg-orange-700 text-white flex items-center justify-between sm:justify-start gap-3 sm:gap-8">
            {/* see the todo in socket.ts to see why */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" title="Click to return to home">
                <h1 className="text-xl sm:text-2xl font-bold font-doodle">LANvas {lan_number}</h1>
            </a>

            <div className="flex items-center gap-6 sm:gap-4">
                <Suspense fallback={<HelpButtonFallback />}>
                    <HelpButtonAndPopup />
                </Suspense>

                <Suspense fallback={<StatsButtonFallback />}>
                    <StatsButtonAndPopup />
                </Suspense>

                <a href="https://github.com/obfuscatedgenerated/lanvas" rel="noreferrer noopener" target="_blank" title="View source on GitHub">
                    <GithubLogo className="h-6 w-6" />
                </a>
            </div>

            <div className="sm:ml-auto">
                <Suspense fallback="Loading...">
                    <LoginStatus />
                </Suspense>
            </div>
        </header>
    );
}

export default Header;