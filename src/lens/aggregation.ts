import type { RuntimeValue } from "./runtime.js";

type NumericAggregation = {
    readonly sum: number | undefined;
    readonly count: number;
    readonly total: number;
    readonly missing: number;
    readonly invalid: number;
    readonly coverage: "complete" | "partial" | "unknown";
};

export function numericAggregate(values: readonly RuntimeValue[]): NumericAggregation {
    let sum = 0, count = 0, missing = 0, invalid = 0;
    for (const value of values) {
        if (value === undefined) missing++;
        else if (typeof value === "number" && Number.isFinite(value)) { sum += value; count++; }
        else invalid++;
    }
    const finite = Number.isFinite(sum);
    const supported = count > 0 || values.length === 0;
    return {
        sum: finite && supported && invalid === 0 ? sum : undefined,
        count, total: values.length, missing, invalid,
        coverage: !finite || !supported ? "unknown" : missing || invalid ? "partial" : "complete",
    };
}
