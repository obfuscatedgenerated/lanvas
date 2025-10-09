"use client";

import {signOut, useSession} from "next-auth/react"
import Image from "next/image";

const LoginStatus = () => {
    const { data: session, status } = useSession();

    if (status === "authenticated") {
        return (
            <div className="flex items-center gap-3">
                <Image src={session.user?.image || ''} alt="User Avatar" width={32} height={32} className="rounded-full" />

                <span>Signed in as <b>{session.user?.name}</b></span>

                <button onClick={() => signOut()} className="cursor-pointer ml-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-red-700 transition duration-300">
                    Sign out
                </button>
            </div>
        )
    }

    return <p>Loading...</p>;
}

export default LoginStatus
