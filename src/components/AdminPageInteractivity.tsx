"use client";

import {useEffect, useState, useCallback} from "react";
import {socket} from "@/socket";

import FancyButton from "@/components/FancyButton";
import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH, DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";

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

const ManualStatsList = ({manual_stats}: { manual_stats: {[key: string]: number} }) => (
    <div className="flex gap-8 items-start">
        <table className="table-fixed bg-neutral-900">
            <thead>
            <tr className="border-neutral-600 border-b-1">
                <th className="w-50">Key</th>
                <th className="w-50">Value</th>
                <th className="w-15"></th>
                <th className="w-15"></th>
            </tr>
            </thead>
            <tbody>
            {Object.entries(manual_stats).map(([key, value]) => (
                <tr key={key}>
                    <td className="text-center select-text">{key}</td>
                    <td className="text-center select-text">{value}</td>
                    <td className="p-2">
                        <FancyButton onClick={() => {
                            const new_value = prompt(`Enter new value for stat ${key}:`, String(value));
                            if (new_value === null) {
                                return;
                            }

                            const new_value_num = parseInt(new_value, 10);
                            if (isNaN(new_value_num)) {
                                alert(`Invalid number: ${new_value}`);
                                return;
                            }

                            const confirmed = confirm(`Are you sure want to set stat ${key} to value ${new_value_num}?`);
                            if (!confirmed) {
                                return;
                            }

                            // submit change
                            socket.emit("admin_update_manual_stat", {key, value: new_value_num});
                        }}>
                            Edit
                        </FancyButton>
                    </td>
                    <td className="p-2 pl-0">
                        <FancyButton onClick={() => {
                            const confirmed = confirm(`Are you sure want to delete manual stat ${key}? This action cannot be undone.`);
                            if (!confirmed) {
                                return;
                            }

                            // submit change
                            socket.emit("admin_delete_manual_stat", key);
                        }}>
                            Delete
                        </FancyButton>
                    </td>
                </tr>
            ))}
            </tbody>
        </table>

        <FancyButton onClick={() => {
            const key = prompt("Enter key for new manual stat:");
            if (!key) {
                return;
            }

            if (key.length > 200) {
                alert("Key too long! Max length is 200 characters.");
                return;
            }

            // check key doesn't already exist
            if (manual_stats[key] !== undefined) {
                alert(`Stat with key ${key} already exists!`);
                return;
            }

            const value_str = prompt("Enter initial value for new manual stat (number):", "0");
            if (value_str === null) {
                return;
            }

            const value = parseInt(value_str, 10);
            if (isNaN(value)) {
                alert(`Invalid number: ${value_str}`);
                return;
            }

            const confirmed = confirm(`Are you sure want to create new manual stat ${key} with value ${value}?`);
            if (!confirmed) {
                return;
            }

            // submit creation
            socket.emit("admin_update_manual_stat", {key, value});
        }}>
            Create new manual stat
        </FancyButton>
    </div>
);

const AdminPageInteractivity = () => {
    const [banned_user_ids, setBannedUserIds] = useState<string[]>([]);
    const [banned_usernames_cache, setBannedUsernamesCache] = useState<{ [user_id: string]: string }>({});

    const [connected_users, setConnectedUsers] = useState<ConnectedUserDetails[]>([]);

    const [manual_stats, setManualStats] = useState<{[key: string]: number}>({});

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
        socket.on("manual_stats", setManualStats);

        socket.on("config_value", ({key, value}) => {
            switch (key) {
                case "readonly":
                    setIsReadonly(!!value);
                    break;
                case "grid_width":
                    setWidthInput(value || DEFAULT_GRID_WIDTH);
                    break;
                case "grid_height":
                    setHeightInput(value || DEFAULT_GRID_HEIGHT);
                    break;
                case "pixel_timeout_ms":
                    setPixelTimeoutInput(value || DEFAULT_PIXEL_TIMEOUT_MS);
                    break;
            }
        });

        socket.emit("check_readonly");
        socket.emit("admin_request_banned_users");
        socket.emit("admin_request_connected_users");
        socket.emit("admin_request_manual_stats");

        socket.emit("admin_get_config_value", "grid_width");
        socket.emit("admin_get_config_value", "grid_height");
        socket.emit("admin_get_config_value", "pixel_timeout_ms");

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

    const [message_input, setMessageInput] = useState("");
    const [persistent_checkbox, setPersistentCheckbox] = useState(false);

    const on_send_message_click = useCallback(
        () => {
            const message = message_input;
            const persist = persistent_checkbox;

            const confirmed = confirm(`Are you sure want to send message "${message}" with persist=${persist}? This will be shown to all connected users, and overwrite any existing message.`);
            if (!confirmed) {
                return;
            }

            // submit message
            socket.emit("admin_send_message", {message, persist});
            setMessageInput("");
        },
        [message_input, persistent_checkbox]
    );

    const [width_input, setWidthInput] = useState("");
    const [height_input, setHeightInput] = useState("");

    const on_save_grid_size_click = useCallback(
        () => {
            const width = parseInt(String(width_input), 10);

            if (isNaN(width) || width <= 0) {
                alert(`Invalid width: ${width_input}`);
                return;
            }

            const height = parseInt(String(height_input), 10);

            if (isNaN(height) || height <= 0) {
                alert(`Invalid height: ${height_input}`);
                return;
            }

            const confirmed = confirm(`Are you sure want to change grid size to ${width}x${height}?`);
            if (!confirmed) {
                return;
            }

            // submit change
            socket.emit("admin_set_grid_size", {width, height});
        },
        [width_input, height_input]
    );

    const [pixel_timeout_input, setPixelTimeoutInput] = useState("");

    const on_save_pixel_timeout_click = useCallback(
        () => {
            const timeout = parseInt(String(pixel_timeout_input), 10);

            if (isNaN(timeout) || timeout < 0) {
                alert(`Invalid timeout: ${pixel_timeout_input}`);
                return;
            }

            const confirmed = confirm(`Are you sure want to change pixel timeout to ${timeout}ms? This will not affect existing timeouts.`);
            if (!confirmed) {
                return;
            }

            // submit change
            socket.emit("admin_set_config_value", {key: "pixel_timeout_ms", value: timeout, is_public: true});
        },
        [pixel_timeout_input]
    );

    // TODO: refreshing ban list, refreshing global grid, clearing global grid
    return (
        <>
            <h2 className="text-xl font-medium mb-2">Game config</h2>
            <div className="flex gap-4">
                <label>
                    Grid width:
                    <input
                        type="number"
                        className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 mx-2 w-20"
                        value={width_input}
                        onChange={(e) => setWidthInput(e.target.value)}
                    />
                </label>

                <label>
                    Grid height:
                    <input
                        type="number"
                        className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 mx-2 w-20"
                        value={height_input}
                        onChange={(e) => setHeightInput(e.target.value)}
                    />
                </label>

                <FancyButton onClick={on_save_grid_size_click}>
                    Save grid size
                </FancyButton>
            </div>

            <label>
                Timeout per pixel (ms):
                <input
                    type="number"
                    className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 mx-2 w-32"
                    value={pixel_timeout_input}
                    onChange={(e) => setPixelTimeoutInput(e.target.value)}
                />

                <FancyButton onClick={on_save_pixel_timeout_click}>
                    Save pixel timeout
                </FancyButton>
            </label>

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

            <h2 className="text-xl font-medium mb-2 mt-4">Manual stats</h2>
            <ManualStatsList manual_stats={manual_stats} />

            <label className="flex items-center justify-center gap-4 my-4">
                Broadcast message (send an empty message to clear):

                <input
                    type="text"
                    className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 w-200"
                    value={message_input}
                    onChange={(e) => setMessageInput(e.target.value)}
                />

                <label>
                    Persistent?

                    <input
                        type="checkbox"
                        className="ml-2"
                        checked={persistent_checkbox}
                        onChange={(e) => setPersistentCheckbox(e.target.checked)}
                    />
                </label>

                <FancyButton onClick={on_send_message_click}>
                    Send message
                </FancyButton>
            </label>
        </>
    )
}

export default AdminPageInteractivity;

// TODO: tidy this up into components
