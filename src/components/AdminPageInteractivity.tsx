"use client";

import {useEffect, useState, useCallback} from "react";
import {socket} from "@/socket";

import FancyButton from "@/components/FancyButton";
import PrometheusTable from "@/components/PrometheusTable";

import {DEFAULT_GRID_HEIGHT, DEFAULT_GRID_WIDTH, DEFAULT_PIXEL_TIMEOUT_MS} from "@/defaults";
import {
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
    CONFIG_KEY_PIXEL_TIMEOUT_MS,
    CONFIG_KEY_READONLY
} from "@/consts";

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
    context?: string;
}

const ConnectedUserList = ({connected_users}: { connected_users: ConnectedUserDetails[] }) => (
    <table className="table-fixed bg-neutral-900">
        <thead>
        <tr className="border-neutral-600 border-b-1">
            <th className="w-50">Socket ID</th>
            <th className="w-50">User ID</th>
            <th className="w-50">Username</th>
            <th className="w-25">Context</th>
        </tr>
        </thead>
        <tbody>
        {connected_users.map(({socket_id, user_id, username, context}) => (
            <tr key={socket_id}>
                <td className="text-center select-text">{socket_id}</td>
                <td className="text-center select-text">{user_id || "(unknown)"}</td>
                <td className="text-center select-text">{username || "(unknown)"}</td>
                <td className="text-center select-text">{context || "(unknown)"}</td>
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

const PollOptionsList = ({options, editable, on_options_edited, counts}: {options: string[], editable?: boolean, on_options_edited?: (new_options: string[]) => void, counts?: number[]}) => {
    const total_count = counts ? counts.reduce((a, b) => a + b, 0) : 0;

    return (
        <>
            <table className="table-fixed bg-neutral-900 mt-2">
                <thead>
                <tr className="border-neutral-600 border-b-1">
                    <th className="w-200">Option</th>
                    <th className="w-25"></th>
                </tr>
                </thead>
                <tbody>
                {options.map((option, index) => (
                    <tr key={index}>
                        <td className="select-text p-2">
                            {editable ? (
                                <input
                                    type="text"
                                    className="w-full"
                                    value={option}
                                    onChange={(e) => {
                                        const new_options = [...options];
                                        new_options[index] = e.target.value;

                                        if (on_options_edited) {
                                            on_options_edited(new_options);
                                        }
                                    }}
                                />
                            ) : (
                                option
                            )}
                        </td>

                        {editable
                            ? (
                                <td className="p-2">
                                    <FancyButton onClick={() => {
                                        const new_options = options.filter((_, i) => i !== index);

                                        if (on_options_edited) {
                                            on_options_edited(new_options);
                                        }
                                    }}>
                                        Delete
                                    </FancyButton>
                                </td>
                            )
                            : (
                                <td className="text-right select-text p-2">
                                    {counts ? counts[index] : 0} votes ({total_count > 0 ? ((counts ? counts[index] : 0) / total_count * 100).toFixed(2) : "0.00"}%)
                                </td>
                            )
                        }
                    </tr>
                ))}
                </tbody>
            </table>

            {editable && (
                <FancyButton className="mt-2" onClick={() => {
                    const new_options = [...options, ""];

                    if (on_options_edited) {
                        on_options_edited(new_options);
                    }
                }}>
                    Add option
                </FancyButton>
            )}
        </>
    );
};

const PollForm = () => {
    const [poll_started, setPollStarted] = useState(false);

    const [question_input, setQuestionInput] = useState("");
    const [options_input, setOptionsInput] = useState([] as string[]);

    const [running_counts, setRunningCounts] = useState<number[] | null>(null);

    const start_poll = useCallback(
        () => {
            if (question_input.trim().length === 0) {
                alert("Question cannot be empty");
                return;
            }

            if (options_input.length < 2) {
                alert("At least two options are required");
                return;
            }

            socket.emit("admin_start_poll", {question: question_input, options: options_input});
            setPollStarted(true);
        },
        [question_input, options_input]
    );

    const end_poll = useCallback(
        () => {
            socket.emit("admin_end_poll");
            setPollStarted(false);
        },
        []
    );

    // check for existing poll on mount
    useEffect(() => {
        socket.on("poll", ({question, options, counts}: {question: string, options: string[], counts: number[]}) => {
            setQuestionInput(question);
            setOptionsInput(options);
            setPollStarted(true);
            setRunningCounts(counts);
        });

        socket.on("poll_counts", (counts: number[]) => {
            setRunningCounts(counts);
        });

        socket.emit("check_poll");
    }, []);

    // TODO: percentage bars?

    return (
      <div>
          <label>
              Question:
              <input
                  type="text"
                  className="ml-2 bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 w-200"
                  value={question_input}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  disabled={poll_started}
              />
          </label>

          <PollOptionsList options={options_input} editable={!poll_started} on_options_edited={setOptionsInput} counts={running_counts || undefined} />

          <FancyButton className="mt-4" onClick={() => {
              if (poll_started) {
                  const confirmed = confirm("Are you sure want to end the poll?");
                  if (!confirmed) {
                      return;
                  }

                  end_poll();
              } else {
                  const confirmed = confirm("Are you sure want to start the poll?");
                  if (!confirmed) {
                      return;
                  }

                  start_poll();
              }
          }}>
              {poll_started ? "End Poll" : "Start Poll"}
          </FancyButton>
      </div>
    );
}

const PrometheusMetrics = () => {
    const [metrics, setMetrics] = useState<string>("");
    const [poll_interval_ms, setPollIntervalMs] = useState<number>(1000);
    const [last_updated, setLastUpdated] = useState<Date | null>(null);

    const [raw_mode, setRawMode] = useState<boolean>(false);

    const update_metrics = () => {
        socket.emit("admin_telemetry");
    };

    // register socket listener
    useEffect(() => {
        socket.on("metrics", (data: string) => {
            setMetrics(data);
            setLastUpdated(new Date());
        });

        update_metrics();
    }, []);

    useEffect(() => {
        const interval = setInterval(update_metrics, poll_interval_ms);

        return () => {
            clearInterval(interval);
        }
    }, [poll_interval_ms]);

    return (
        <div className="mt-4 w-full">
            <h2 className="text-xl font-medium mb-2">Prometheus Metrics</h2>

            {raw_mode
                ? (
                    <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto">
                        {metrics}
                    </pre>
                )
                : (
                    <div className="max-h-96 overflow-y-auto w-full">
                        <PrometheusTable metrics={metrics} className="w-full select-text" head_className="sticky top-0 bg-neutral-900" />
                    </div>
                )
            }

            <div className="flex items-start gap-2 mt-2">
                <label>
                    Poll interval (ms):
                    <input
                        type="number"
                        className="bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2 mx-2 w-32"
                        value={poll_interval_ms}
                        onChange={(e) => setPollIntervalMs(parseInt(e.target.value, 10))}
                    />
                </label>

                <p className="text-sm text-gray-400 mt-1">Last updated: {last_updated ? last_updated.toLocaleString() : "Never"}</p>
            </div>

            <label>
                Raw mode:

                <input
                    type="checkbox"
                    className="ml-2"
                    checked={raw_mode}
                    onChange={(e) => setRawMode(e.target.checked)}
                />
            </label>
        </div>
    );
}

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

        socket.on("end_poll", ({results, total_votes, winners}: {results: Record<string, number>, total_votes: number, winners: string[]}) => {
            const winner_votes = winners.length > 0 ? results[winners[0]] : 0;
            const winner_percentage = total_votes > 0 ? ((winner_votes / total_votes) * 100).toFixed(2) : "0.00";

            alert(`Poll ended!\nWinner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")} with ${winner_votes} votes${winners.length > 1 ? " each" : ""} (${winner_percentage}%)\n\nResults:\n${JSON.stringify(results, null, 2)}`);
        });

        socket.on("config_value", ({key, value}) => {
            switch (key) {
                case CONFIG_KEY_READONLY:
                    setIsReadonly(!!value);
                    break;
                case CONFIG_KEY_GRID_WIDTH:
                    setWidthInput(value || DEFAULT_GRID_WIDTH);
                    break;
                case CONFIG_KEY_GRID_HEIGHT:
                    setHeightInput(value || DEFAULT_GRID_HEIGHT);
                    break;
                case CONFIG_KEY_PIXEL_TIMEOUT_MS:
                    setPixelTimeoutInput(value || DEFAULT_PIXEL_TIMEOUT_MS);
                    break;
            }
        });

        socket.emit("check_readonly");
        socket.emit("admin_request_banned_users");
        socket.emit("admin_request_connected_users");
        socket.emit("admin_request_manual_stats");

        socket.emit("admin_get_config_value", CONFIG_KEY_GRID_WIDTH);
        socket.emit("admin_get_config_value", CONFIG_KEY_GRID_HEIGHT);
        socket.emit("admin_get_config_value", CONFIG_KEY_PIXEL_TIMEOUT_MS);

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

            // submit unban
            socket.emit("admin_unban_user", {user_id});
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

            // submit ban
            socket.emit("admin_ban_user", {user_id});

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
            socket.emit("admin_set_config_value", {key: CONFIG_KEY_PIXEL_TIMEOUT_MS, value: timeout, is_public: true});
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

            <h2 className="text-xl font-medium mb-2 mt-4">Polls</h2>
            <PollForm />

            <PrometheusMetrics />

            <FancyButton className="mt-4" onClick={() => {
                const confirmed = confirm("Are you sure want to trigger a client reload for all connected users? This will make all users reload their page, and should be used sparingly. It is recommended to inform users beforehand via a broadcast message.");
                if (!confirmed) {
                    return;
                }

                // submit reload
                socket.emit("admin_trigger_reload");
            }}>
                Trigger client reload
            </FancyButton>
        </>
    )
}

export default AdminPageInteractivity;

// TODO: tidy this up into components
