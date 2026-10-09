"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import DiscordLogo from "@/components/DiscordLogo";
import PrivacyPolicy from "@/components/PrivacyPolicy";

export default function SignInForm() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");
    const callback_error = searchParams.get("callback_error");

    return (
        <div className="bg-neutral-800 rounded-2xl p-5 flex flex-col gap-3 w-9/10 max-w-9/10 sm:w-lg sm:max-w-lg">
            {error && callback_error !== "access_denied" && (
                <div className="text-red-500 text-center">
                    Sign-in failed. Please try again.<br />Error code: {error} {callback_error && `(${callback_error})`}
                </div>
            )}

            {callback_error === "access_denied" && (
                <div className="text-yellow-400 text-center">
                    You must authorise the application to sign in.<br />Please try again.
                </div>
            )}

            <button
                onClick={() => signIn("discord")}
                className="cursor-pointer flex items-center justify-center gap-3 font-semibold text-lg font-sans bg-neutral-900 hover:bg-gray-900 transition duration-200 p-4 rounded-xl"
            >
                <DiscordLogo className="w-8 h-8" />
                Sign in with Discord
            </button>

            <details className="flex flex-col w-full px-2">
                <summary className="text-lg font-medium text-center">
                    Privacy Policy
                </summary>

                <PrivacyPolicy />
            </details>
        </div>
    );
}
