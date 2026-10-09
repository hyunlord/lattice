import type { Check } from "./schema-shape.js";
import { LensSchema } from "./schema-shape.js";

export function expressionCheck(schema: LensSchema, codeRule: Check): Check {
    const expression: Check = (value, pointer) => {
        if (value === undefined) return schema.fail(pointer, "Expected expression");
        if (value === null || typeof value !== "object") return;
        const record = schema.record(value, pointer);
        const op = record["op"];
        if (typeof op !== "string" || !Object.hasOwn(operators, op)) return schema.fail(`${pointer}/op`, `Unsupported lens expression ${String(op)}`);
        operators[op]?.(value, pointer);
    };
    const operation = (fields: Readonly<Record<string, Check>>, optional: readonly string[] = []): Check => schema.shape({ op: schema.text, ...fields }, Object.keys(fields).filter(key => !optional.includes(key)));
    const unary = operation({ value: expression });
    const binary = operation({ left: expression, right: expression });
    const many = operation({ values: schema.list(expression) });
    const predicate = operation({ input: expression, where: expression });
    const operators: Readonly<Record<string, Check>> = {
        literal: operation({ value: schema.payload }), source: unary,
        codeSupport: operation({ rule: codeRule }),
        get: operation({ from: schema.choice(["node", "item", "vars", "graph"]), path: schema.path }),
        lookup: operation({ kind: schema.id, field: schema.path, equals: expression }),
        at: operation({ object: expression, key: expression }),
        coalesce: many, and: many, or: many, concat: many,
        not: unary, exists: unary, count: unary, flatten: unary, sum: unary, unique: unary,
        eq: binary, ne: binary, gt: binary, gte: binary, lt: binary, lte: binary,
        in: operation({ value: expression, collection: expression }),
        indexOf: operation({ input: expression, value: expression }),
        let: operation({ bindings: schema.entries(expression), value: expression }),
        groupBy: operation({ input: expression, key: expression }),
        join: operation({ input: expression, separator: schema.text }),
        filter: predicate, any: predicate, all: predicate,
        map: operation({ input: expression, value: expression }),
        case: operation({ cases: schema.list(schema.shape({ when: expression, value: expression }, ["when", "value"])), default: expression }, ["default"]),
    };
    return expression;
}
