"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

export default function SignInForm() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");

    return (
        <div className="bg-neutral-800 rounded-2xl p-5 flex flex-col gap-4">
            {error && (
                <div className="text-red-500">
                    Sign-in failed.
                </div>
            )}

            <button
                onClick={() => signIn("discord")}
                className="cursor-pointer flex items-center justify-center gap-3 font-semibold text-lg font-sans bg-neutral-900 hover:bg-gray-900 transition duration-200 p-4 rounded-xl"
            >
                <Image src="/discord.svg" alt="" width={32} height={32} />
                Sign in with Discord
            </button>

            <details className="flex flex-col w-full px-2">
                <summary className="text-lg font-medium text-center">
                    Privacy Policy
                </summary>

                <p>
                    TODO
                </p>
            </details>
        </div>
    );
}
