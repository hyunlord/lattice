import { createInterface } from 'node:readline';
import { McpArgumentError, isToolName, object, parseArguments, toolDefinitions } from './mcp-schema.mjs';
import type { ToolName } from './mcp-schema.mjs';

const versions = ['2025-11-25', '2025-06-18', '2024-11-05'] as const;
type RequestId = string | number | null;
type Handler = (name: ToolName, args: Record<string, unknown>) => Promise<object> | object;

function send(message: object): Promise<void> {
    return new Promise((resolve, reject) => {
        process.stdout.write(`${JSON.stringify(message)}\n`, error => error ? reject(error) : resolve());
    });
}

function failure(id: RequestId, code: number, message: string): Promise<void> {
    return send({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Serve a fixed tool catalog with per-tool write annotations using the legacy MCP stdio lifecycle. */
export async function runStdio(handler: Handler): Promise<void> {
    let version: string | undefined;
    let initialized = false;
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
        let message: unknown;
        try { message = JSON.parse(line); }
        catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            await failure(null, -32700, 'Invalid JSON');
            continue;
        }
        if (!object(message) || message['jsonrpc'] !== '2.0' || typeof message['method'] !== 'string'
            || ('id' in message && typeof message['id'] !== 'string' && !(typeof message['id'] === 'number' && Number.isInteger(message['id'])))
            || ('params' in message && !object(message['params']))) {
            await failure(null, -32600, 'Invalid JSON-RPC request');
            continue;
        }
        const id = typeof message['id'] === 'string' || typeof message['id'] === 'number' ? message['id'] : undefined;
        if (id === undefined) {
            if (message['method'] === 'notifications/initialized' && version) initialized = true;
            continue;
        }
        const result = (value: object) => send({ jsonrpc: '2.0', id, result: value });
        const params = object(message['params']) ? message['params'] : {};
        if (message['method'] === 'server/discover') {
            await failure(id, -32601, 'Method not found; supported legacy MCP versions: 2025-11-25, 2025-06-18, 2024-11-05');
        } else if (message['method'] === 'initialize') {
            if (version) { await failure(id, -32600, 'Already initialized'); continue; }
            if (typeof params['protocolVersion'] !== 'string' || !object(params['capabilities']) || !object(params['clientInfo'])
                || typeof params['clientInfo']['name'] !== 'string' || typeof params['clientInfo']['version'] !== 'string') {
                await failure(id, -32602, 'initialize requires protocolVersion, capabilities and clientInfo');
                continue;
            }
            version = versions.find(candidate => candidate === params['protocolVersion']) ?? versions[0];
            await result({ protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'lattice', version: '0.0.0' } });
        } else if (message['method'] === 'ping') {
            await result({});
        } else if (!initialized) {
            await failure(id, -32600, 'Send initialize and notifications/initialized before tool requests');
        } else if (message['method'] === 'tools/list') {
            if (params['cursor'] !== undefined) { await failure(id, -32602, 'This fixed catalog has no pagination cursor'); continue; }
            const tools = version === '2024-11-05' ? toolDefinitions.map(({ annotations: _annotations, ...tool }) => tool) : toolDefinitions;
            await result({ tools });
        } else if (message['method'] === 'tools/call') {
            if (!isToolName(params['name']) || (params['arguments'] !== undefined && !object(params['arguments']))) {
                await failure(id, -32602, 'Unknown tool or malformed tools/call arguments');
                continue;
            }
            let payload: object;
            let isError = false;
            try { payload = await handler(params['name'], parseArguments(params['name'], params['arguments'] ?? {})); }
            catch (error) {
                isError = true;
                payload = { error: error instanceof McpArgumentError ? error.message : 'Tool execution failed; verify the repository, graph and request, then retry.', freshness: { status: 'unknown' } };
            }
            const content = [{ type: 'text', text: JSON.stringify(payload) }];
            await result(version === '2024-11-05' ? { content, isError } : { content, structuredContent: payload, isError });
        } else {
            await failure(id, -32601, 'Method not found');
        }
    }
}
