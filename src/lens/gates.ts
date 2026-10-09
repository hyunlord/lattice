import type { JsonObject, JsonValue } from "../core/canonical.js";
import { GraphInputError } from "../core/errors.js";
import type { Finding } from "../core/model.js";

type Gate = NonNullable<Finding["gate"]>;
function isObject(value: JsonValue): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function passes(value: number, gate: Omit<Gate, "status">): boolean {
    switch (gate.comparator) {
        case "eq": return value === gate.threshold;
        case "ne": return value !== gate.threshold;
        case "gt": return value > gate.threshold;
        case "gte": return value >= gate.threshold;
        case "lt": return value < gate.threshold;
        case "lte": return value <= gate.threshold;
        default: {
            const exhaustive: never = gate.comparator;
            return exhaustive;
        }
    }
}
export function evaluateGate(config: JsonValue | undefined, metrics: JsonObject): Gate | undefined {
    if (config === undefined) return undefined;
    if (!isObject(config)) throw new GraphInputError("finding.gate", "Expected an object");
    const metric = config["metric"];
    const comparator = config["comparator"];
    const threshold = config["threshold"];
    if (typeof metric !== "string" || metric.length === 0) throw new GraphInputError("finding.gate.metric", "Expected a nonempty metric name");
    if (comparator !== "eq" && comparator !== "ne" && comparator !== "gt" && comparator !== "gte" && comparator !== "lt" && comparator !== "lte") throw new GraphInputError("finding.gate.comparator", "Expected eq, ne, gt, gte, lt or lte");
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) throw new GraphInputError("finding.gate.threshold", "Expected a finite number");
    const gate: Omit<Gate, "status"> = { metric, comparator, threshold };
    const value = metrics[metric];
    if (typeof value !== "number" || !Number.isFinite(value)) return { ...gate, status: "unknown" };
    return { ...gate, status: passes(value, gate) ? "pass" : "fail" };
}
