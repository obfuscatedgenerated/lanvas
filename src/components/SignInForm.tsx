"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import DiscordLogo from "@/components/DiscordLogo";

export default function SignInForm() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");

    return (
        <div className="bg-neutral-800 rounded-2xl p-5 flex flex-col gap-3 w-9/10 max-w-9/10 sm:w-lg sm:max-w-lg">
            {error && (
                <div className="text-red-500">
                    Sign-in failed.
                </div>
            )}

            <button
                onClick={() => signIn("discord")}
                className="cursor-pointer flex items-center justify-center gap-3 font-semibold text-lg font-sans bg-neutral-900 hover:bg-gray-900 transition duration-200 p-4 rounded-xl"
            >
                <DiscordLogo className="w-8 h-8" />
                Sign in with Discord
            </button>

            <p className="text-center font-semibold font-sans">Disclaimer: This is not an official event</p>

            <details className="flex flex-col w-full px-2">
                <summary className="text-lg font-medium text-center">
                    Privacy Policy
                </summary>

                <div className="flex flex-col gap-3 mt-2 max-h-75 pr-3 overflow-y-scroll">
                    <p>Only the minimum scopes required to operate the service are collected:</p>

                    <ul className="list-disc">
                        <li>
                            <strong>Access your username, avatar and banner (<code>identify</code>)</strong> to get your unique Discord ID, username, and avatar. This information is used to show who placed which pixel.
                        </li>
                        <li>
                            <strong>Know what servers you&apos;re in (<code>guilds</code>)</strong> to verify that you are a member of the required Discord server to gain access. This check is performed when you log in and <strong>your list of servers is never stored</strong>.
                        </li>
                    </ul>

                    <p>At the end of the event, all pixels will be anonymised and all user details on record will be erased.</p>

                    <p>If your account is banned from the service, your user ID will be stored indefinitely to prevent access to the service. For private, internal records, your username as it was at the time of the ban may be stored.</p>

                    <p>To facilitate live previews, the canvas image data may be publicly accessible in certain circumstances.</p>

                    <p>By using the service, you acknowledge the above. You also acknowledge the base <a target="_blank" rel="noreferrer noopener" className="text-blue-500" href="https://ollieg.codes/privacy">ollieg.codes Privacy Policy</a>.</p>
                </div>
            </details>
        </div>
    );
}
