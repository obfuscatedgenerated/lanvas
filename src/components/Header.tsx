import {Suspense} from "react";
import LoginStatus from "@/components/LoginStatus";

const Header = () => {
    return (
        <header className="font-sans p-2 bg-orange-700 text-white flex items-center justify-between">
            <h1 className="text-2xl font-bold font-doodle">LANvas</h1>

            <Suspense fallback="Loading...">
                <LoginStatus />
            </Suspense>
        </header>
    );
}

export default Header;