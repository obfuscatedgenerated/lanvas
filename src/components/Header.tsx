import {Suspense} from "react";
import LoginStatus from "@/components/LoginStatus";

const Header = () => {
    const lan_number = process.env.NEXT_PUBLIC_LAN_NUMBER || "";

    return (
        <header className="font-sans p-2 bg-orange-700 text-white flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold font-doodle">LANvas {lan_number}</h1>

            <Suspense fallback="Loading...">
                <LoginStatus />
            </Suspense>
        </header>
    );
}

export default Header;