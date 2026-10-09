export class GraphInputError extends Error {
    override readonly name = "GraphInputError";
    constructor(readonly path: string, readonly reason: string) {
        super(`${path}: ${reason}`);
    }
}
