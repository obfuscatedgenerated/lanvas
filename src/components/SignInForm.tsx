"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import DiscordLogo from "@/components/DiscordLogo";

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

                    <p>When you place a pixel, the following data is stored:</p>

                    <ul className="list-disc">
                        <li><strong>Your Discord User ID, username, and avatar URL</strong> to attribute pixel placements to you.</li>
                        <li><strong>The coordinates (x, y) of the pixel</strong> you placed.</li>
                        <li><strong>The color value</strong> of the pixel you placed.</li>
                        <li><strong>A time based identifier</strong> to determine the order of pixel placements.</li>
                    </ul>

                    <p>Historical pixel data is also stored, including the same data as above, in order to facilitate rollbacks and time lapses.</p>

                    <p>At the end of the event, all pixels will be anonymised and all user details on record will be erased.</p>

                    <p>For service integrity, prevent abuse, and facilitate moderation, site administrators have access to real-time session data. This includes your <strong>Socket ID, Discord User ID, username, and the specific page you are currently viewing</strong>.</p>

                    <p><strong>This session data is ephemeral.</strong> It is retained only for the duration of your active WebSocket connection and is immediately discarded when you disconnect or close the page.</p>

                    <p>If your account is banned from the service, your user ID will be stored indefinitely to prevent access to the service. For private, internal records, your username as it was at the time of the ban may be stored.</p>

                    <p>To facilitate live previews, the canvas image data may be publicly accessible in certain circumstances.</p>

                    <p>By using the service, you acknowledge the above. You also acknowledge the base <a target="_blank" rel="noreferrer noopener" className="text-blue-500" href="https://ollieg.codes/privacy">ollieg.codes Privacy Policy</a>.</p>
                </div>
            </details>
        </div>
    );
}
