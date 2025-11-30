import {Suspense} from "react";

import LoginStatus from "@/components/LoginStatus";
import ConditionalStatsLink from "@/components/ConditionalStatsLink";
import Image from "next/image";

const Header = () => {
    const lan_number = process.env.NEXT_PUBLIC_LAN_NUMBER || "";

    return (
        <header className="font-sans p-2 bg-orange-700 text-white flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-6">
                {/* see the todo in socket.ts to see why */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" title="Click to return to home">
                    <h1 className="text-xl sm:text-2xl font-bold font-doodle">LANvas {lan_number}</h1>
                </a>

                <Suspense>
                    <ConditionalStatsLink />
                </Suspense>

                <a href="https://github.com/obfuscatedgenerated/lanvas" rel="noreferrer noopener" target="_blank" title="View source on GitHub">
                    <Image src="/github.svg" alt="" height={24} width={24} />
                </a>
            </div>

            <Suspense fallback="Loading...">
                <LoginStatus />
            </Suspense>
        </header>
    );
}

export default Header;