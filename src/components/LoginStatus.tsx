"use client";

import {SessionProvider, signOut, useSession} from "next-auth/react"
import Image from "next/image";

const LoginStatusInternal = () => {
    const { data: session, status } = useSession();

    if (status === "authenticated") {
        return (
            <div className="flex items-center gap-3">
                <Image src={session.user?.image || ''} alt="User Avatar" width={32} height={32} className="rounded-full" />

                <span>Signed in as <b>{session.user?.name}</b></span>

                <button onClick={() => signOut()} className="cursor-pointer ml-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-red-900 transition duration-300">
                    Sign out
                </button>
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
