import NumberFlow from "@number-flow/react";

export interface StatsData {
    total_pixels_placed: number;
    connected_unique_users: number;
    [key: string]: number; // unknown additional stats
}

const known_stat_labels: { [key: string]: string } = {
    total_pixels_placed: "Total pixels placed",
    connected_unique_users: "Connected users",
    active_users: "Active users",
};

const stats_order = [
    "total_pixels_placed",
    "connected_unique_users",
    "active_users",
];

const StatEntry = ({ stat_key, stats, className = "" }: { stat_key: string; stats: StatsData; className?: string }) => (
    <>
        <span className={`break-words ${className}`}>{known_stat_labels[stat_key] || stat_key}:</span>
        <NumberFlow value={stats[stat_key]} />
    </>
);

const StatsList = ({ stats, className = "", entry_className = "" }: { stats: StatsData; className?: string; entry_className?: string }) => (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] max-w-9/10 gap-x-6 gap-y-2 text-xl sm:text-2xl items-center ${className}`}>
        {stats_order.map((key) => {
            // render pre-ordered stats first

            if (key in stats) {
                return <StatEntry key={key} stat_key={key} stats={stats} className={entry_className} />;
            }

            return null;
        })}

        {Object.keys(stats).map((key) => {
            // render any additional stats not in the known order

            if (stats_order.includes(key)) {
                return null; // already rendered
            }

            return <StatEntry key={key} stat_key={key} stats={stats} className={entry_className} />;
        })}
    </div>
);

export default StatsList;
