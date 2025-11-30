import {Suspense} from "react";
import LoginStatus from "@/components/LoginStatus";
import Link from "next/link";

const Header = () => {
    const lan_number = process.env.NEXT_PUBLIC_LAN_NUMBER || "";

    return (
        <header className="font-sans p-2 bg-orange-700 text-white flex items-center justify-between">
            <Link href="/" title="Click to return to home">
                <h1 className="text-xl sm:text-2xl font-bold font-doodle">LANvas {lan_number}</h1>
            </Link>

            <Suspense fallback="Loading...">
                <LoginStatus />
            </Suspense>
        </header>
    );
}

export default Header;