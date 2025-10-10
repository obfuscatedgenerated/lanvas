"use client";

import { useEffect, useState, useCallback } from "react";
import {socket} from "@/socket";

interface UserListProps {
    user_ids: string[];
    usernames?: {[user_id: string]: string};
    action_text?: string;
    on_action_click?: (user_id: string) => void;
}

const UserList = ({user_ids, usernames = {}, action_text, on_action_click = () => {}}: UserListProps) => {
    return (
        <table className="table-fixed">
            <thead>
                <tr>
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
                              <button onClick={() => on_action_click(user_id)} className="cursor-pointer ml-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-900 transition duration-300">
                                  {action_text}
                              </button>
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

    // TODO: adding bans, refreshing ban list, refreshing global grid
    return (
        <>
            <h2 className="text-xl font-medium mb-2">Banned users</h2>

            <UserList
                user_ids={banned_user_ids}
                usernames={banned_usernames_cache}
                action_text="Unban"
                on_action_click={on_unban_click}
            />
        </>
    )
}

export default AdminPageInteractivity;
