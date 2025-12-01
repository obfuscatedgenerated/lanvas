import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from "prom-client"
import type { Pool, PoolClient, Result } from "pg";

const register = new Registry();
collectDefaultMetrics({ register });

export default register;

const LOG_QUERIES = process.env.LOG_QUERIES === "true";
const LOG_QUERY_TIMES = process.env.LOG_QUERY_TIMES === "true";

const query_histogram = new Histogram({
    name: "pool_query_duration_seconds",
    help: "Duration of PostgreSQL queries in seconds from the main pool",
    labelNames: ["command"] ,
});

const query_peak = new Gauge({
    name: "pool_query_duration_seconds_peak",
    help: "Peak duration of PostgreSQL queries in seconds from the main pool",
    labelNames: ["command"],
});

const query_count = new Counter({
    name: "pool_query_total",
    help: "Total number of PostgreSQL queries executed from the main pool",
    labelNames: ["command"],
});

const query_avg = new Gauge({
    name: "pool_query_duration_seconds_avg",
    help: "Average duration of PostgreSQL queries in seconds from the main pool",
    labelNames: ["command"],
});

export const intercept_pool = (pool: Pool) => {
    // modify pool.query to observe latency
    const original_query = pool.query.bind(pool);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pool.query = async function (this: Pool, ...args: any[]): Promise<Result> {
        if (LOG_QUERIES) {
            console.log("Executing query:", args[0]);
        }

        const command = (args[0] as string).trim().split(" ")[0].toUpperCase();
        const end = query_histogram.startTimer({command});

        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            const res = await original_query(...args);
            const ended = end();

            if (LOG_QUERY_TIMES) {
                console.log(`Query ${command} completed in ${ended} seconds.`);
            }

            query_count.inc({command});

            const peak = await query_peak.get();
            const current_peak = peak?.values.find(v => v.labels.command === command)?.value || 0;
            if (ended > current_peak) {
                query_peak.set({command}, ended);
            }

            const avg = await query_avg.get();
            const current_avg = avg?.values.find(v => v.labels.command === command)?.value || 0;
            const count = await query_count.get();
            const command_count = count?.values.find(v => v.labels.command === command)?.value || 1;
            const new_avg = ((current_avg * (command_count - 1)) + ended) / command_count;
            query_avg.set({command}, new_avg);

            return res;
        } catch (err) {
            end();
            throw err;
        }
    }
}

export const intercept_client = (client: PoolClient) => {
    // modify client.query to observe latency
    const original_query = client.query.bind(client);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.query = async function (this: PoolClient, ...args: any[]): Promise<Result> {
        if (LOG_QUERIES) {
            console.log("Executing query:", args[0]);
        }

        const command = (args[0] as string).trim().split(" ")[0].toUpperCase();
        const end = query_histogram.startTimer({command});

        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //@ts-ignore
            const res = await original_query(...args);
            const ended = end();

            if (LOG_QUERY_TIMES) {
                console.log(`Query ${command} completed in ${ended} seconds.`);
            }

            query_count.inc({command});

            const peak = await query_peak.get();
            const current_peak = peak?.values.find(v => v.labels.command === command)?.value || 0;
            if (ended > current_peak) {
                query_peak.set({command}, ended);
            }

            const avg = await query_avg.get();
            const current_avg = avg?.values.find(v => v.labels.command === command)?.value || 0;
            const count = await query_count.get();
            const command_count = count?.values.find(v => v.labels.command === command)?.value || 1;
            const new_avg = ((current_avg * (command_count - 1)) + ended) / command_count;
            query_avg.set({command}, new_avg);

            return res;
        } catch (err) {
            end();
            throw err;
        }
    }
}

// TODO: unite logic

register.registerMetric(query_histogram);
register.registerMetric(query_peak);
register.registerMetric(query_count);
register.registerMetric(query_avg);
