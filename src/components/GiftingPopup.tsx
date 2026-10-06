import Image from "next/image";
import {ComponentProps, useEffect, useMemo, useState} from "react";

import Popup from "@/components/Popup";

import {socket} from "@/socket";
import type {OnlineUser} from "@/types";

interface GiftingPopupProps extends ComponentProps<typeof Popup> {
    in_timeout: boolean;
}

export const GiftingPopup = ({in_timeout, ...popup_props}: GiftingPopupProps) => {
    const [online_users, setOnlineUsers] = useState<OnlineUser[]>([]);

    useEffect(() => {
        if (!popup_props.open) {
            return;
        }

        const handle_activity = ({user_id, is_active}: {user_id: string; is_active: boolean}) => {
            setOnlineUsers((previous) => previous.map((online_user) =>
                online_user.user_id === user_id ? {...online_user, is_active} : online_user
            ));
        };

        socket.on("online_users", setOnlineUsers);
        socket.on("online_user_activity", handle_activity);
        socket.emit("request_online_users");

        return () => {
            socket.off("online_users", setOnlineUsers);
            socket.off("online_user_activity", handle_activity);
            socket.emit("stop_online_users");
        };
    }, [popup_props.open]);

    // active users first so the giftable ones aren't buried
    const sorted_users = useMemo(
        () => [...online_users].sort((first, second) => Number(second.is_active) - Number(first.is_active)),
        [online_users]
    );

    return (
        <Popup {...popup_props} title="Gifting">
            Well aren&apos;t you generous? Select who you&apos;d like to gift your pixel to:

            {in_timeout && (
                <p className="text-yellow-400 mt-2">Your pixel isn&apos;t ready yet, wait for your timer to finish to gift it.</p>
            )}

            <div>
                {sorted_users.length === 0 && (
                    <p className="text-gray-500">No other users are currently online.</p>
                )}

                {sorted_users.map((user) => (
                    <div key={user.user_id} className={`flex items-center justify-between p-2 border-b ${user.is_active ? "" : "opacity-75"}`}>
                        <div className="flex items-center space-x-2">
                            {user.avatar_url && (
                                <Image src={user.avatar_url} alt="" draggable={false} width={32} height={32} className="rounded-full" />
                            )}
                            <span>{user.name}</span>
                        </div>

                        {user.is_active ? (
                            <button
                                className="px-3 py-1 rounded cursor-pointer bg-green-500 text-white disabled:bg-gray-300 disabled:text-gray-700 disabled:cursor-not-allowed"
                                disabled={in_timeout}
                                onClick={() => {
                                    socket.emit("gift_pixel", {to_id: user.user_id});
                                    popup_props.on_close();
                                }}
                            >
                                Gift
                            </button>
                        ) : (
                            <span className="text-gray-500">AFK</span>
                        )}
                    </div>
                ))}
            </div>
        </Popup>
    );
};
