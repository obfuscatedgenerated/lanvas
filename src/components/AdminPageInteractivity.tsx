"use client";

import { useEffect, useState, useCallback } from "react";
import {socket} from "@/socket";

import FancyButton from "@/components/FancyButton";

interface UserListProps {
    user_ids: string[];
    usernames?: {[user_id: string]: string};
    action_text?: string;
    on_action_click?: (user_id: string) => void;
}
const UserList = ({user_ids, usernames = {}, action_text, on_action_click = () => {}}: UserListProps) => {
    return (
        <table className="table-fixed bg-neutral-900">
            <thead>
                <tr className="border-neutral-600 border-b-1">
                    <th className="w-50">User ID</th>
                    <th className="w-50">Username</th>
                </tr>
            </thead>
            <tbody>
                {user_ids.map(user_id => (
                  <tr key={user_id}>
                      <td className="text-center">{user_id}</td>
                      <td className="text-center">{usernames[user_id]}</td>
                      <td>
                          {action_text && (
                              <FancyButton onClick={() => on_action_click(user_id)}>
                                  {action_text}
                              </FancyButton>
                          )}
                      </td>
                  </tr>
                ))}
            </tbody>
        </table>
    )
}

const AdminPageInteractivity = () => {
    const [banned_user_ids, setBannedUserIds] = useState<string[]>([]);
    const [banned_usernames_cache, setBannedUsernamesCache] = useState<{[user_id: string]: string}>({});

    // setup socket
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("banned_user_ids", setBannedUserIds);
        socket.on("banned_usernames_cache", setBannedUsernamesCache);

        // request ban list
        socket.emit("admin_request_banned_users");

        return () => {
            socket.disconnect();
        }
    }, []);

    const on_unban_click = useCallback(
        (user_id: string) => {
            const confirmed = confirm(`Are you sure want to unban user ${user_id} with username ${banned_usernames_cache[user_id]}?`);
            if (!confirmed) {
                return;
            }

            // submit unban and refresh list
            socket.emit("admin_unban_user", {user_id});
            socket.emit("admin_request_banned_users");
        },
        [banned_usernames_cache]
    );

    const [ban_user_id_input, setBanUserIdInput] = useState("");

    const on_ban_click = useCallback(
        () => {
            const user_id = ban_user_id_input;

            // validate bigint
            try {
                if (user_id !== String(BigInt(user_id))) {
                    alert(`Invalid bigint ${user_id}`);
                    return;
                }
            } catch (err) {
                alert(`Invalid bigint ${user_id} with error: ${err}`);
                return;
            }

            const confirmed = confirm(`Are you sure want to ban user ${user_id}?`);
            if (!confirmed) {
                return;
            }

            // submit ban and refresh list
            socket.emit("admin_ban_user", {user_id});
            socket.emit("admin_request_banned_users");

            setBanUserIdInput("");
        },
        [ban_user_id_input]
    );

    // TODO: refreshing ban list, refreshing global grid, clearing global grid
    return (
        <>
            <h2 className="text-xl font-medium mb-2">Banned users</h2>

            <UserList
                user_ids={banned_user_ids}
                usernames={banned_usernames_cache}
                action_text="Unban"
                on_action_click={on_unban_click}
            />

            <div>
                <label>
                    User ID:
                    <input
                        className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 mt-4 mx-2"
                        value={ban_user_id_input}
                        onChange={(e) => setBanUserIdInput(e.target.value)}
                        autoComplete="off"
                    />
                </label>
                <FancyButton onClick={on_ban_click}>
                    Ban user
                </FancyButton>
            </div>
        </>
    )
}

export default AdminPageInteractivity;
