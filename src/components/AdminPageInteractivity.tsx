"use client";

import {useEffect, useState, useCallback, useRef, type ReactNode, type ChangeEvent} from "react";
import {socket} from "@/socket";

import parse_prometheus from "parse-prometheus-text-format";

import FancyButton from "@/components/FancyButton";
import PrometheusTable from "@/components/PrometheusTable";

import {X} from "lucide-react";

import {
    DEFAULT_ADMIN_ANONYMOUS,
    DEFAULT_ADMIN_GOD,
    DEFAULT_AUTOMOD_ENABLED,
    DEFAULT_CENSOR_ENABLED,
    DEFAULT_COMMENT_TIMEOUT_MS,
    DEFAULT_COMMENTS_ENABLED,
    DEFAULT_GIFT_BURST_GAP_MS,
    DEFAULT_GIFT_EXPIRY_MS,
    DEFAULT_GIFTING_ENABLED,
    DEFAULT_GRID_HEIGHT,
    DEFAULT_GRID_WIDTH,
    DEFAULT_PIXEL_TIMEOUT_MS,
    DEFAULT_READONLY
} from "@/defaults";
import {
    CONFIG_KEY_ADMIN_ANONYMOUS,
    CONFIG_KEY_ADMIN_GOD,
    CONFIG_KEY_AUTOMOD_ENABLED,
    CONFIG_KEY_CENSOR_ENABLED,
    CONFIG_KEY_COMMENT_TIMEOUT_MS,
    CONFIG_KEY_COMMENTS_ENABLED,
    CONFIG_KEY_GIFT_BURST_GAP_MS,
    CONFIG_KEY_GIFT_EXPIRY_MS,
    CONFIG_KEY_GIFTING_ENABLED,
    CONFIG_KEY_GRID_HEIGHT,
    CONFIG_KEY_GRID_WIDTH,
    CONFIG_KEY_PIXEL_TIMEOUT_MS,
    CONFIG_KEY_READONLY,
    LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER
} from "@/consts";

// ---------------------------------------------------------------------------------------------------------------------
// reusable building blocks
// ---------------------------------------------------------------------------------------------------------------------

const INPUT_CLASS = "bg-gray-700 border border-gray-500 text-gray-100 text-md rounded-lg py-1 px-2";

interface ConfigValueMessage {
    key: string;
    value: unknown;
}

const save_config_value = (config_key: string, value: unknown, is_public: boolean) => {
    socket.emit("admin_set_config_value", {key: config_key, value, is_public});
};

// requests a config key and stays in sync with it, including the server's parrot back after a save
const useAdminConfigValue = <ValueType,>(config_key: string, default_value: ValueType, on_value?: (value: ValueType) => void): ValueType => {
    const [value, setValue] = useState<ValueType>(default_value);

    const on_value_ref = useRef(on_value);
    useEffect(() => {
        on_value_ref.current = on_value;
    }, [on_value]);

    useEffect(() => {
        const handle_config_value = ({key, value: incoming}: ConfigValueMessage) => {
            if (key !== config_key) {
                return;
            }

            const resolved = (incoming === undefined || incoming === null ? default_value : incoming) as ValueType;
            setValue(resolved);
            on_value_ref.current?.(resolved);
        };

        socket.on("config_value", handle_config_value);
        socket.emit("admin_get_config_value", config_key);

        return () => {
            socket.off("config_value", handle_config_value);
        };
    }, [config_key, default_value]);

    return value;
};

// label text with an optional dotted underline hover explanation
const HelpText = ({help, children}: {help?: string; children: ReactNode}) => {
    if (!help) {
        return <>{children}</>;
    }

    return (
        <span className="underline underline-offset-2 decoration-dotted cursor-help" title={help}>
            {children}
        </span>
    );
};

interface AdminSectionProps {
    title: string;
    children: ReactNode;
    row?: boolean;
}

const AdminSection = ({title, children, row = false}: AdminSectionProps) => (
    <section className="mt-4">
        <h2 className="text-xl font-medium mb-2">{title}</h2>
        {row
            ? <div className="flex flex-wrap items-center gap-8">{children}</div>
            : <div className="flex flex-col items-start gap-2">{children}</div>
        }
    </section>
);

interface ConfigCheckboxProps {
    config_key: string;
    default_value: boolean;
    is_public: boolean;
    label: string;
    confirm_name: string; // used as "Are you sure want to turn on <confirm_name>?"
    help?: string;
    disabled?: boolean;
    disabled_reason?: string;
    on_value?: (value: boolean) => void;
}

const ConfigCheckbox = ({config_key, default_value, is_public, label, confirm_name, help, disabled = false, disabled_reason, on_value}: ConfigCheckboxProps) => {
    const value = !!useAdminConfigValue<boolean>(config_key, default_value, on_value);

    const on_change = (event: ChangeEvent<HTMLInputElement>) => {
        const new_value = event.target.checked;

        const confirmed = confirm(`Are you sure want to turn ${new_value ? "on" : "off"} ${confirm_name}?`);
        if (!confirmed) {
            return;
        }

        // checked state follows the server's parrot back, so there's nothing to revert on cancel
        save_config_value(config_key, new_value, is_public);
    };

    return (
        <label>
            <HelpText help={help}>{label}:</HelpText>

            <input
                type="checkbox"
                className="ml-2"
                checked={!disabled && value}
                disabled={disabled}
                title={disabled ? disabled_reason : ""}
                onChange={on_change}
            />
        </label>
    );
};

interface ConfigNumberInputProps {
    config_key: string;
    default_value: number;
    is_public: boolean;
    label: string;
    confirm_name: string; // used as "Are you sure want to change <confirm_name> to ...?"
    help?: string;
    unit?: string;
    min?: number;
    confirm_note?: string;
    width_class?: string;
}

const ConfigNumberInput = ({config_key, default_value, is_public, label, confirm_name, help, unit = "ms", min = 0, confirm_note, width_class = "w-32"}: ConfigNumberInputProps) => {
    const server_value = useAdminConfigValue<number>(config_key, default_value);
    const [input_value, setInputValue] = useState(String(server_value));

    useEffect(() => {
        setInputValue(String(server_value));
    }, [server_value]);

    const on_blur = () => {
        const parsed = parseInt(input_value, 10);

        if (parsed === server_value) {
            setInputValue(String(server_value));
            return;
        }

        if (isNaN(parsed) || parsed < min) {
            alert(`Invalid ${confirm_name}: ${input_value} (minimum ${min}${unit})`);
            setInputValue(String(server_value));
            return;
        }

        const confirmed = confirm(`Are you sure want to change ${confirm_name} to ${parsed}${unit}?${confirm_note ? ` ${confirm_note}` : ""}`);
        if (!confirmed) {
            setInputValue(String(server_value));
            return;
        }

        save_config_value(config_key, parsed, is_public);
    };

    return (
        <label>
            <HelpText help={help}>{label}:</HelpText>

            <input
                type="number"
                className={`${INPUT_CLASS} mx-2 ${width_class}`}
                value={input_value}
                min={min}
                onChange={(event) => setInputValue(event.target.value)}
                onBlur={on_blur}
            />
        </label>
    );
};

// ---------------------------------------------------------------------------------------------------------------------
// tables and lists
// ---------------------------------------------------------------------------------------------------------------------

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
    user_id: string;
    username?: string;
    context?: string;
}

const ConnectedUserList = ({connected_users, active_user_ids }: { connected_users: ConnectedUserDetails[]; active_user_ids: string[] }) => (
    <table className="table-fixed bg-neutral-900">
        <thead>
        <tr className="border-neutral-600 border-b-1">
            <th className="w-50">Socket ID</th>
            <th className="w-50">User ID</th>
            <th className="w-50">Username</th>
            <th className="w-25">Context</th>
            <th className="w-20">Active?</th>
        </tr>
        </thead>
        <tbody>
        {connected_users.map(({socket_id, user_id, username, context}) => (
            <tr key={socket_id}>
                <td className="text-center select-text">{socket_id}</td>
                <td className="text-center select-text">{user_id}</td>
                <td className="text-center select-text">{username || "(unknown)"}</td>
                <td className="text-center select-text">{context || "(unknown)"}</td>
                <td className="text-center">
                    {context === "/"
                        ? (active_user_ids.includes(user_id) ? "✔" : "✘")
                        : ""
                    }
                </td>
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
    const total_count = counts ? counts.reduce((running_total, count) => running_total + count, 0) : 0;

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
                                    onChange={(event) => {
                                        const new_options = [...options];
                                        new_options[index] = event.target.value;

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
                                        const new_options = options.filter((_option, option_index) => option_index !== index);

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

// ---------------------------------------------------------------------------------------------------------------------
// one-off controls that don't fit the generic config inputs
// ---------------------------------------------------------------------------------------------------------------------

const GridSizeForm = () => {
    const server_width = useAdminConfigValue<number>(CONFIG_KEY_GRID_WIDTH, DEFAULT_GRID_WIDTH);
    const server_height = useAdminConfigValue<number>(CONFIG_KEY_GRID_HEIGHT, DEFAULT_GRID_HEIGHT);

    const [width_input, setWidthInput] = useState(String(server_width));
    const [height_input, setHeightInput] = useState(String(server_height));

    useEffect(() => {
        setWidthInput(String(server_width));
    }, [server_width]);

    useEffect(() => {
        setHeightInput(String(server_height));
    }, [server_height]);

    const on_save_click = () => {
        const width = parseInt(width_input, 10);
        if (isNaN(width) || width <= 0) {
            alert(`Invalid width: ${width_input}`);
            return;
        }

        const height = parseInt(height_input, 10);
        if (isNaN(height) || height <= 0) {
            alert(`Invalid height: ${height_input}`);
            return;
        }

        const confirmed = confirm(`Are you sure want to change grid size to ${width}x${height}?`);
        if (!confirmed) {
            return;
        }

        socket.emit("admin_set_grid_size", {width, height});
    };

    return (
        <div className="flex gap-4">
            <label>
                Grid width:
                <input
                    type="number"
                    className={`${INPUT_CLASS} mx-2 w-20`}
                    value={width_input}
                    onChange={(event) => setWidthInput(event.target.value)}
                />
            </label>

            <label>
                Grid height:
                <input
                    type="number"
                    className={`${INPUT_CLASS} mx-2 w-20`}
                    value={height_input}
                    onChange={(event) => setHeightInput(event.target.value)}
                />
            </label>

            <FancyButton onClick={on_save_click}>
                Save grid size
            </FancyButton>
        </div>
    );
};

// readonly has its own event rather than going through set_config_value, so it shows a pending state until the server confirms
const ReadonlyToggle = () => {
    const [is_readonly, setIsReadonly] = useState(DEFAULT_READONLY);
    const [readonly_checkbox, setReadonlyCheckbox] = useState(DEFAULT_READONLY);

    useEffect(() => {
        setReadonlyCheckbox(is_readonly);
    }, [is_readonly]);

    useEffect(() => {
        const handle_readonly = (value: boolean) => setIsReadonly(!!value);

        const handle_config_value = ({key, value}: ConfigValueMessage) => {
            if (key === CONFIG_KEY_READONLY) {
                setIsReadonly(value !== undefined ? !!value : DEFAULT_READONLY);
            }
        };

        socket.on("readonly", handle_readonly);
        socket.on("config_value", handle_config_value);
        socket.emit("check_readonly");

        return () => {
            socket.off("readonly", handle_readonly);
            socket.off("config_value", handle_config_value);
        };
    }, []);

    return (
        <label>
            <input
                type="checkbox"
                checked={readonly_checkbox}
                onChange={(event) => {
                    const new_value = event.target.checked;
                    setReadonlyCheckbox(new_value);

                    const confirmed = confirm(`Are you sure want to turn ${new_value ? "on" : "off"} readonly mode?`);
                    if (!confirmed) {
                        setReadonlyCheckbox(is_readonly);
                        return;
                    }

                    // is_readonly is only updated by the server's parrot back
                    socket.emit("admin_set_readonly", new_value);
                }}
                className="mr-2"
            />
            Read only mode
            {is_readonly !== readonly_checkbox && (
                <span className="text-yellow-400 ml-2">(pending change)</span>
            )}
        </label>
    );
};

const store_skip_client_timer = (god_enabled: boolean) => {
    localStorage.setItem(LOCALSTORAGE_KEY_SKIP_CLIENT_TIMER, god_enabled ? "true" : "false");
};

const AutomodCheckbox = () => {
    const [automod_supported, setAutomodSupported] = useState(false);

    useEffect(() => {
        socket.on("automod_support", setAutomodSupported);
        socket.emit("admin_is_automod_supported");

        return () => {
            socket.off("automod_support", setAutomodSupported);
        };
    }, []);

    return (
        <ConfigCheckbox
            config_key={CONFIG_KEY_AUTOMOD_ENABLED}
            default_value={DEFAULT_AUTOMOD_ENABLED}
            is_public={false}
            label="AutoMod"
            confirm_name="automod"
            help="Uses a local AI model on the server to filter extreme and toxic messages. Note that this does not cover profanity, it is instead primarily sentiment based."
            disabled={!automod_supported}
            disabled_reason="Missing the required dependencies to use AutoMod!"
        />
    );
};

// ---------------------------------------------------------------------------------------------------------------------
// self-contained sections, each owning its own socket listeners
// ---------------------------------------------------------------------------------------------------------------------

const ConnectedUsersSection = () => {
    const [connected_users, setConnectedUsers] = useState<ConnectedUserDetails[]>([]);
    const [active_user_ids, setActiveUserIds] = useState<string[]>([]);

    useEffect(() => {
        const handle_activity_change = ({user_id, is_active}: {user_id: string, is_active: boolean}) => {
            setActiveUserIds((previous) => {
                if (is_active) {
                    return previous.includes(user_id) ? previous : [...previous, user_id];
                }

                return previous.filter((id) => id !== user_id);
            });
        };

        socket.on("connected_users", setConnectedUsers);
        socket.on("active_users", setActiveUserIds);
        socket.on("user_activity_change", handle_activity_change);

        socket.emit("admin_request_connected_users");
        socket.emit("admin_request_active_users");

        return () => {
            socket.off("connected_users", setConnectedUsers);
            socket.off("active_users", setActiveUserIds);
            socket.off("user_activity_change", handle_activity_change);
        };
    }, []);

    return (
        <AdminSection title="Connected users">
            <ConnectedUserList connected_users={connected_users} active_user_ids={active_user_ids} />
        </AdminSection>
    );
};

const BannedUsersSection = () => {
    const [banned_user_ids, setBannedUserIds] = useState<string[]>([]);
    const [banned_usernames_cache, setBannedUsernamesCache] = useState<{ [user_id: string]: string }>({});
    const [ban_user_id_input, setBanUserIdInput] = useState("");

    useEffect(() => {
        socket.on("banned_user_ids", setBannedUserIds);
        socket.on("banned_usernames_cache", setBannedUsernamesCache);
        socket.emit("admin_request_banned_users");

        return () => {
            socket.off("banned_user_ids", setBannedUserIds);
            socket.off("banned_usernames_cache", setBannedUsernamesCache);
        };
    }, []);

    const on_unban_click = useCallback(
        (user_id: string) => {
            const confirmed = confirm(`Are you sure want to unban user ${user_id} with username ${banned_usernames_cache[user_id]}?`);
            if (!confirmed) {
                return;
            }

            socket.emit("admin_unban_user", {user_id});
        },
        [banned_usernames_cache]
    );

    const on_ban_click = () => {
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

        socket.emit("admin_ban_user", {user_id});
        setBanUserIdInput("");
    };

    return (
        <AdminSection title="Banned users">
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
                        className={`${INPUT_CLASS} mt-2 mx-2`}
                        value={ban_user_id_input}
                        onChange={(event) => setBanUserIdInput(event.target.value)}
                        autoComplete="off"
                    />
                </label>
                <FancyButton onClick={on_ban_click}>
                    Ban user
                </FancyButton>
            </div>
        </AdminSection>
    );
};

const ManualStatsSection = () => {
    const [manual_stats, setManualStats] = useState<{[key: string]: number}>({});

    useEffect(() => {
        socket.on("manual_stats", setManualStats);
        socket.emit("admin_request_manual_stats");

        return () => {
            socket.off("manual_stats", setManualStats);
        };
    }, []);

    return (
        <AdminSection title="Manual stats">
            <ManualStatsList manual_stats={manual_stats} />
        </AdminSection>
    );
};

const BroadcastMessageForm = () => {
    const [message_input, setMessageInput] = useState("");
    const [persistent_checkbox, setPersistentCheckbox] = useState(false);
    const [duration_input, setDurationInput] = useState("");

    const on_send_message_click = () => {
        const message = message_input;
        const persist = persistent_checkbox;
        const duration_ms = duration_input === "" ? undefined : parseInt(duration_input, 10);

        if (typeof duration_ms === "number" && (isNaN(duration_ms) || duration_ms < 0)) {
            alert(`Invalid duration_ms: ${duration_input}`);
            return;
        }

        const confirmed = confirm(`Are you sure want to send message "${message}" with persist=${persist};duration_ms=${duration_ms}? This will be shown to all connected users, and overwrite any existing message.`);
        if (!confirmed) {
            return;
        }

        socket.emit("admin_send_message", {message, persist, duration_ms});
        setMessageInput("");
    };

    return (
        <label className="flex items-center justify-center gap-4 my-4">
            Broadcast message (send an empty message to clear):

            <input
                type="text"
                className={`${INPUT_CLASS} w-200`}
                value={message_input}
                onChange={(event) => setMessageInput(event.target.value)}
            />

            <label>
                Persistent?

                <input
                    type="checkbox"
                    className="ml-2"
                    checked={persistent_checkbox}
                    onChange={(event) => setPersistentCheckbox(event.target.checked)}
                />
            </label>

            <label>
                <HelpText help="Leave blank to make persistent messages stay until replaced, or for scrolling messages to use a default of 3.33s per character.">Duration (ms):</HelpText>

                <input
                    type="number"
                    className={`${INPUT_CLASS} ml-2 w-32`}
                    value={duration_input}
                    onChange={(event) => setDurationInput(event.target.value)}
                />
            </label>

            <FancyButton onClick={on_send_message_click}>
                Send message
            </FancyButton>
        </label>
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
        const handle_poll = ({question, options, counts}: {question: string, options: string[], counts: number[]}) => {
            setQuestionInput(question);
            setOptionsInput(options);
            setPollStarted(true);
            setRunningCounts(counts);
        };

        const handle_end_poll = ({results, total_votes, winners}: {results: Record<string, number>, total_votes: number, winners: string[]}) => {
            const winner_votes = winners.length > 0 ? results[winners[0]] : 0;
            const winner_percentage = total_votes > 0 ? ((winner_votes / total_votes) * 100).toFixed(2) : "0.00";

            alert(`Poll ended!\nWinner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")} with ${winner_votes} votes${winners.length > 1 ? " each" : ""} (${winner_percentage}%)\n\nResults:\n${JSON.stringify(results, null, 2)}`);
        };

        socket.on("poll", handle_poll);
        socket.on("poll_counts", setRunningCounts);
        socket.on("end_poll", handle_end_poll);

        socket.emit("check_poll");

        return () => {
            socket.off("poll", handle_poll);
            socket.off("poll_counts", setRunningCounts);
            socket.off("end_poll", handle_end_poll);
        };
    }, []);

    // TODO: percentage bars?

    return (
        <div>
            <label>
                Question:
                <input
                    type="text"
                    className={`${INPUT_CLASS} ml-2 w-200`}
                    value={question_input}
                    onChange={(event) => setQuestionInput(event.target.value)}
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

    const [alarm_list, setAlarmList] = useState<string[]>([]);
    const [severe_alarm_list, setSevereAlarmList] = useState<string[]>([]);

    const add_alarm = useCallback(
        (alarm: string) => {
            setAlarmList((previous) => [...previous, alarm]);
        },
        []
    );

    const has_alarm = useCallback(
        (alarm: string) => {
            return alarm_list.includes(alarm);
        },
        [alarm_list]
    );

    const add_severe_alarm = useCallback(
        (alarm: string) => {
            setSevereAlarmList((previous) => [...previous, alarm]);
        },
        []
    );

    const has_severe_alarm = useCallback(
        (alarm: string) => {
            return severe_alarm_list.includes(alarm);
        },
        [severe_alarm_list]
    );

    const remove_alarm = useCallback(
        (index: number) => {
            setAlarmList((previous) => previous.filter((_alarm, alarm_index) => alarm_index !== index));
        },
        []
    );

    const remove_severe_alarm = useCallback(
        (index: number) => {
            setSevereAlarmList((previous) => previous.filter((_alarm, alarm_index) => alarm_index !== index));
        },
        []
    );

    const remove_alarm_by_text = useCallback(
        (alarm_text: string) => {
            setAlarmList((previous) => previous.filter((alarm) => alarm !== alarm_text));
        },
        []
    );

    const update_metrics = useCallback(
        () => {
            socket.emit("admin_telemetry");
        },
        []
    );

    const evaluate_alarm_conditions = useCallback(
        (metrics_data: string) => {
            const parsed = parse_prometheus(metrics_data);

            for (const family of parsed) {
                if (family.name === "pg_pool_waiting_connections") {
                    for (const metric of family.metrics) {
                        const waiting_connections = parseInt(String(metric.value), 10);

                        if (waiting_connections === 1) {
                            const alarm_text = `A connection in the pool is waiting! (${metric.labels[0]})`;

                            if (!has_alarm(alarm_text)) {
                                add_alarm(alarm_text);
                            }
                        } else if (waiting_connections > 1) {
                            const alarm_text = `Multiple connections (${waiting_connections}) in the pool are waiting! (${metric.labels[0]})`;

                            if (!has_severe_alarm(alarm_text)) {
                                remove_alarm_by_text(`A connection in the pool is waiting! (${metric.labels[0]})`);
                                add_severe_alarm(alarm_text);
                            }
                        }
                    }
                } else if (family.name === "pg_pool_errors_total") {
                    for (const metric of family.metrics) {
                        const error_count = parseInt(String(metric.value), 10);

                        // counter, so can only go up
                        if (error_count > 0) {
                            const alarm_text = `There have been ${error_count} errors reported by the Postgres pool! (${metric.labels[0]})`;

                            if (!has_severe_alarm(alarm_text)) {
                                const previous_alarm_text = `There have been ${error_count - 1} errors reported by the Postgres pool! (${metric.labels[0]})`;
                                remove_alarm_by_text(previous_alarm_text);
                                add_severe_alarm(alarm_text);
                            }
                        }
                    }
                } else if (family.name === "pool_query_duration_seconds_avg") {
                    for (const metric of family.metrics) {
                        const avg_duration = parseFloat(String(metric.value));

                        if (avg_duration > 0.5) {
                            const alarm_text = "High average query duration";

                            if (!has_alarm(alarm_text)) {
                                add_alarm(alarm_text);
                            }
                        }
                    }
                } else if (family.name === "nodejs_eventloop_lag_seconds") {
                    for (const metric of family.metrics) {
                        const lag_seconds = parseFloat(String(metric.value));
                        if (lag_seconds > 1.0) {
                            const alarm_text = "Very high event loop lag";
                            if (!has_severe_alarm(alarm_text)) {
                                add_severe_alarm(alarm_text);
                            }
                        } else if (lag_seconds > 0.5) {
                            const alarm_text = "High event loop lag";

                            if (!has_alarm(alarm_text)) {
                                add_alarm(alarm_text);
                            }
                        }
                    }
                }

                // TODO: memory usage alarms
            }
        },
        [has_alarm, add_alarm, has_severe_alarm, remove_alarm_by_text, add_severe_alarm]
    );

    // register socket listener
    useEffect(() => {
        const handle_metrics = (data: string) => {
            setMetrics(data);
            setLastUpdated(new Date());

            evaluate_alarm_conditions(data);
        };

        socket.on("metrics", handle_metrics);

        return () => {
            socket.off("metrics", handle_metrics);
        }
    }, [evaluate_alarm_conditions]);

    // update once at mount
    useEffect(() => {
        update_metrics();
    }, [update_metrics]);

    useEffect(() => {
        const interval = setInterval(update_metrics, poll_interval_ms);

        return () => {
            clearInterval(interval);
        }
    }, [poll_interval_ms, update_metrics]);

    return (
        <AdminSection title="Prometheus Metrics">
            <div className="w-full">
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
            </div>

            <div className="flex items-start gap-2">
                <label>
                    Poll interval (ms):
                    <input
                        type="number"
                        className={`${INPUT_CLASS} mx-2 w-32`}
                        value={poll_interval_ms}
                        onChange={(event) => setPollIntervalMs(parseInt(event.target.value, 10))}
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
                    onChange={(event) => setRawMode(event.target.checked)}
                />
            </label>

            <div>
                <h3 className="text-lg font-medium mt-2 mb-2">Alarms</h3>

                {alarm_list.length === 0 && severe_alarm_list.length === 0 && (
                    <span>No active alarms</span>
                )}

                <ul className="list-disc list-inside">
                    {severe_alarm_list.map((alarm, index) => (
                        <li key={index} className="text-red-500 flex items-center gap-2">
                            {alarm}

                            <button title="Dismiss severe alarm" className="cursor-pointer" onClick={() => remove_severe_alarm(index)}>
                                <X />
                            </button>
                        </li>
                    ))}

                    {alarm_list.map((alarm, index) => (
                        <li key={index} className="text-yellow-400 flex items-center gap-2">
                            {alarm}

                            <button title="Dismiss alarm" className="cursor-pointer" onClick={() => remove_alarm(index)}>
                                <X />
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </AdminSection>
    );
}

const ReloadClientsButton = () => (
    <FancyButton className="mt-4" onClick={() => {
        const confirmed = confirm("Are you sure want to trigger a client reload for all connected users? This will make all users reload their page, and should be used sparingly. It is recommended to inform users beforehand via a broadcast message.");
        if (!confirmed) {
            return;
        }

        socket.emit("admin_trigger_reload");
    }}>
        Trigger client reload
    </FancyButton>
);

// ---------------------------------------------------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------------------------------------------------

const AdminPageInteractivity = () => {
    useEffect(() => {
        const handle_connect = () => console.log("Connected!", socket.id);
        socket.on("connect", handle_connect);

        return () => {
            socket.off("connect", handle_connect);
            socket.disconnect();
        }
    }, []);

    return (
        <>
            <AdminSection title="Game config">
                <GridSizeForm />

                <ConfigNumberInput
                    config_key={CONFIG_KEY_PIXEL_TIMEOUT_MS}
                    default_value={DEFAULT_PIXEL_TIMEOUT_MS}
                    is_public={true}
                    label="Timeout per pixel (ms)"
                    confirm_name="pixel timeout"
                    confirm_note="This will not affect existing timeouts."
                />

                <ReadonlyToggle />
            </AdminSection>

            <AdminSection title="Admin tools & cheats" row>
                <ConfigCheckbox
                    config_key={CONFIG_KEY_ADMIN_GOD}
                    default_value={DEFAULT_ADMIN_GOD}
                    is_public={false}
                    label="God mode"
                    confirm_name="god mode"
                    help="No timeouts for the admin!"
                    on_value={store_skip_client_timer}
                />

                <ConfigCheckbox
                    config_key={CONFIG_KEY_ADMIN_ANONYMOUS}
                    default_value={DEFAULT_ADMIN_ANONYMOUS}
                    is_public={false}
                    label="Anonymous mode"
                    confirm_name="anonymous mode"
                    help="Hide admin identity when placing pixels."
                />
            </AdminSection>

            <AdminSection title="Commenting settings" row>
                <ConfigCheckbox
                    config_key={CONFIG_KEY_COMMENTS_ENABLED}
                    default_value={DEFAULT_COMMENTS_ENABLED}
                    is_public={true}
                    label="Comments enabled"
                    confirm_name="comments"
                />

                <ConfigCheckbox
                    config_key={CONFIG_KEY_CENSOR_ENABLED}
                    default_value={DEFAULT_CENSOR_ENABLED}
                    is_public={false}
                    label="Censors"
                    confirm_name="censors"
                    help="Replaces profanity to hearts ♥. Please note that this censoring ranges from mild swears, to slurs and sexually explicit language."
                />

                <AutomodCheckbox />

                <ConfigNumberInput
                    config_key={CONFIG_KEY_COMMENT_TIMEOUT_MS}
                    default_value={DEFAULT_COMMENT_TIMEOUT_MS}
                    is_public={true}
                    label="Timeout per message (ms)"
                    confirm_name="chat timeout"
                    confirm_note="This will not affect existing timeouts."
                />
            </AdminSection>

            <AdminSection title="Gifting settings" row>
                <ConfigCheckbox
                    config_key={CONFIG_KEY_GIFTING_ENABLED}
                    default_value={DEFAULT_GIFTING_ENABLED}
                    is_public={true}
                    label="Gifting enabled"
                    confirm_name="gifting"
                />

                <ConfigNumberInput
                    config_key={CONFIG_KEY_GIFT_EXPIRY_MS}
                    default_value={DEFAULT_GIFT_EXPIRY_MS}
                    is_public={false}
                    label="Gift expiry (ms)"
                    confirm_name="gift expiry"
                    help="How long a received gift can be held before it expires."
                    min={1000}
                    confirm_note="This will not affect gifts already held."
                />

                <ConfigNumberInput
                    config_key={CONFIG_KEY_GIFT_BURST_GAP_MS}
                    default_value={DEFAULT_GIFT_BURST_GAP_MS}
                    is_public={false}
                    label="Burst gap (ms)"
                    confirm_name="gift burst gap"
                    help="Minimum time between placements when spending held gifts, so a stack can't be dumped instantly."
                />
            </AdminSection>

            <ConnectedUsersSection />

            <BannedUsersSection />

            <ManualStatsSection />

            <BroadcastMessageForm />

            <AdminSection title="Polls">
                <PollForm />
            </AdminSection>

            <PrometheusMetrics />

            <ReloadClientsButton />
        </>
    )
}

export default AdminPageInteractivity;

// TODO: rollback to previous pixel option
// TODO: give admin ability to purge old pixels from history to reduce db size, but warn them that this means no rollbacks and no per pixel timelapse
