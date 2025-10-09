"use client";

import LoginStatus from "@/components/LoginStatus";
import {SessionProvider} from "next-auth/react";

const HomepageInteractivity = () => {
    return (
        <SessionProvider>
            <LoginStatus />
        </SessionProvider>
    );
}

export default HomepageInteractivity;