import parse_prometheus, {type Metric, type MetricFamily, type MetricType} from "parse-prometheus-text-format";
import {Fragment} from "react";

const PrometheusValueCounterOrGauge = ({value}: { value: string }) => {
    return <>{value}</>;
}

const PrometheusValueHistogram = ({metric}: { metric: Metric }) => {
    return (
        <div>
            <div>Count: {metric.count || "N/A"}</div>
            <div>Sum: {metric.sum || "N/A"}</div>
            <div>
                Buckets:
                <ul>
                    {metric.buckets
                        ? Object.entries(metric.buckets).map(([bound, count]) => (
                            <li key={bound}>
                                &le; {bound}: {count}
                            </li>
                        ))
                        : " N/A"}
                </ul>
            </div>
        </div>
    );
}

const PrometheusValueSummary = ({metric}: { metric: Metric }) => {
    return (
        <div>
            <div>Count: {metric.count || "N/A"}</div>
            <div>Sum: {metric.sum || "N/A"}</div>
            <div>
                Quantiles:
                <ul>
                    {metric.quantiles
                        ? Object.entries(metric.quantiles).map(([quantile, value]) => (
                            <li key={quantile}>
                                {quantile}: {value}
                            </li>
                        ))
                        : " N/A"}
                </ul>
            </div>
        </div>
    );
}

const PrometheusValue = ({metric, type}: { metric: Metric; type: MetricType }) => {
    switch (type) {
        case "COUNTER":
        case "GAUGE":
        case "UNTYPED":
            return <PrometheusValueCounterOrGauge value={metric.value || "N/A"} />;
        case "HISTOGRAM":
            return <PrometheusValueHistogram metric={metric} />;
        case "SUMMARY":
            return <PrometheusValueSummary metric={metric} />;
        default:
            return <>N/A</>;
    }
}

const PrometheusMetricRow = ({metric, type}: { metric: Metric; type: MetricType }) => {
    const label_string = metric.labels ? Object.entries(metric.labels)
        .map(([key, value]) => `${key}="${value}"`)
        .join(", ") : "";

    return (
        <tr className="border-neutral-600 border-b-1">
            <td className="w-200 align-top">
                {metric.labels && Object.keys(metric.labels).length > 0
                    ? `${label_string}`
                    : ""
                }
            </td>
            <td className="w-50 align-top">
                <PrometheusValue metric={metric} type={type} />
            </td>
        </tr>
    );
}

const PrometheusTable = ({metrics, className = "", body_className = "", head_className = ""}: { metrics: string; className?: string; body_className?: string; head_className?: string }) => {
    const parsed_metrics = parse_prometheus(metrics);

    return (
        <table className={`table-fixed bg-neutral-900 mt-2 ${className}`}>
            <thead className={head_className}>
            <tr className="border-neutral-600 border-b-1">
                <th className="w-200">Metric Family</th>
                <th className="w-50">Value</th>
            </tr>
            </thead>
            <tbody className={body_className}>
            {parsed_metrics.map((family: MetricFamily) =>
                (
                    <Fragment key={family.name}>
                        <tr>
                            <td colSpan={2} className="bg-neutral-800 text-left px-2 py-1 border-neutral-600 border-b-1">
                                <strong>{family.name}</strong> - {family.help} <i>({family.type})</i>
                            </td>
                        </tr>

                        {family.metrics.length === 0 && (
                            <tr className="border-neutral-600 border-b-1">
                                <td colSpan={2} className="text-center italic">
                                    (empty)
                                </td>
                            </tr>
                        )}

                        {family.metrics.map((metric: Metric, index: number) => (
                            <PrometheusMetricRow key={index} metric={metric} type={family.type} />
                        ))}
                    </Fragment>
                )
            )}
            </tbody>
        </table>
    );
};

export default PrometheusTable;
