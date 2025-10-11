"use client";

import {useEffect, useState, useCallback} from "react";
import {socket} from "@/socket";

import FancyButton from "@/components/FancyButton";

interface UserListProps {
    user_ids: string[];
    usernames?: { [user_id: string]: string };
    action_text?: string;
    on_action_click?: (user_id: string) => void;
}

const UserList = ({
    user_ids, usernames = {}, action_text, on_action_click = () => {}
}: UserListProps) => (
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
                <td className="text-center select-text">{user_id}</td>
                <td className="text-center select-text">{usernames[user_id]}</td>
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
);

interface ConnectedUserDetails {
    socket_id: string;
    user_id?: string;
    username?: string;
}

const ConnectedUserList = ({connected_users}: { connected_users: ConnectedUserDetails[] }) => (
    <table className="table-fixed bg-neutral-900">
        <thead>
        <tr className="border-neutral-600 border-b-1">
            <th className="w-50">Socket ID</th>
            <th className="w-50">User ID</th>
            <th className="w-50">Username</th>
        </tr>
        </thead>
        <tbody>
        {connected_users.map(({socket_id, user_id, username}) => (
            <tr key={socket_id}>
                <td className="text-center select-text">{socket_id}</td>
                <td className="text-center select-text">{user_id || "(unknown)"}</td>
                <td className="text-center select-text">{username || "(unknown)"}</td>
            </tr>
        ))}
        </tbody>
    </table>
);

const AdminPageInteractivity = () => {
    const [banned_user_ids, setBannedUserIds] = useState<string[]>([]);
    const [banned_usernames_cache, setBannedUsernamesCache] = useState<{ [user_id: string]: string }>({});

    const [connected_users, setConnectedUsers] = useState<ConnectedUserDetails[]>([]);

    const [is_readonly, setIsReadonly] = useState(false);
    const [readonly_checkbox, setReadonlyCheckbox] = useState(is_readonly);

    // keep checkbox in sync with actual readonly state
    useEffect(() => {
        setReadonlyCheckbox(is_readonly);
    }, [is_readonly]);

    // setup socket
    useEffect(() => {
        socket.on("connect", () => console.log("Connected!", socket.id));

        socket.on("banned_user_ids", setBannedUserIds);
        socket.on("banned_usernames_cache", setBannedUsernamesCache);
        socket.on("connected_users", setConnectedUsers);
        socket.on("readonly", setIsReadonly);

        // request readonly state, ban list and connected users on load
        socket.emit("check_readonly");
        socket.emit("admin_request_banned_users");
        socket.emit("admin_request_connected_users");

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
            <h2 className="text-xl font-medium mb-2">Connected users</h2>

            <ConnectedUserList connected_users={connected_users} />

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

            <label>
                <input
                    type="checkbox"
                    checked={readonly_checkbox}
                    onChange={(e) => {
                        const new_value = e.target.checked;
                        setReadonlyCheckbox(new_value);

                        const confirmed = confirm(`Are you sure want to turn ${new_value ? "on" : "off"} readonly mode?`);
                        if (!confirmed) {
                            // revert checkbox
                            setReadonlyCheckbox(is_readonly);
                            return;
                        }

                        // submit change
                        socket.emit("admin_set_readonly", new_value);

                        // we don't update the is_readonly state here, we wait for the server to confirm the change and rely on the parrot back
                    }}
                    className="mr-2"
                />
                Read only mode
                {is_readonly !== readonly_checkbox && (
                    <span className="text-yellow-400 ml-2">(pending change)</span>
                )}
            </label>
        </>
    )
}

export default AdminPageInteractivity;
