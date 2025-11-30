"use client";

import {SessionProvider, signOut, useSession} from "next-auth/react"
import Image from "next/image";
import {UserWithAdminFlag} from "@/auth";
import FancyButton, {fancy_button_class} from "@/components/FancyButton";

const LoginStatusInternal = () => {
    const { data: session, status } = useSession();

    const user = session?.user;
    if (!user) {
        return null;
    }

    if (status === "authenticated") {
        return (
            <div className="flex items-center gap-1 sm:gap-3">
                <Image src={user.image || ''} alt="" draggable="false" width={32} height={32} className="rounded-full" />

                <div className="hidden sm:text-lg sm:flex sm:flex-row sm:items-center sm:gap-1">
                    <span>Signed in as </span>
                    <b>{user.name}</b>
                </div>

                {(user as UserWithAdminFlag).is_admin &&
                    <a href="/admin" className={fancy_button_class}>
                        Admin
                    </a>
                }

                <FancyButton onClick={() => signOut()}>
                    Sign out
                </FancyButton>
            </div>
        )
    }

    return <p className="flex items-center h-8">Loading...</p>;
}

const LoginStatus = () => {
    return (
        <SessionProvider>
            <LoginStatusInternal />
        </SessionProvider>
    );
}

export default LoginStatus
