declare module "parse-prometheus-text-format" {
    export default function parsePrometheusTextFormat(metricsStr: string): MetricFamily[];

    export interface MetricFamily {
        name: string;
        help: string;
        type: MetricType;
        metrics: Metric[];
    }

    export type MetricType = "COUNTER" | "GAUGE" | "SUMMARY" | "HISTOGRAM" | "UNTYPED";

    export interface Metric {
        labels: Record<string, string>;
        value?: string;
        buckets?: Record<string, string>;
        quantiles?: Record<string, string>;
        count?: string;
        sum?: string;
    }
}
