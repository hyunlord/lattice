import type { Options } from './types.mjs';
import { errorCode } from './types.mjs';
import type { ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { rm } from 'node:fs/promises';
import type { ServeCommand, ServeUpdate } from './serve-worker.mjs';
import { createReadStream, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDirectory } from './storage.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
export async function serve(options: Options) {
    const port = options.port === undefined ? 4173 : Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535');
    if (options.output !== undefined || options.force) throw new Error('serve accepts --root, --lens, --cache-dir, --port and --json');
    const cache = cacheDirectory(options.root, options.cacheDir);
    const generations = new Map<string, string>();
    const mediaFiles = new Map<string, { bytes: Buffer; mimeType: string; }>();
    const clients = new Set<ServerResponse>();
    const assets = new Map(readdirSync(join(packageRoot, 'viewer')).filter(file => file.endsWith('.js') || file.endsWith('.css')).map(file => [`/${file}`, readFileSync(join(packageRoot, 'viewer', file))]));
    assets.set('/__lattice/live-client.js', readFileSync(join(packageRoot, 'bin/live-client.js')));
    const template = readFileSync(join(packageRoot, 'viewer/index.html'), 'utf8');
    mkdirSync(cache, { recursive: true });
    const liveDirectory = mkdtempSync(join(cache, 'serve-'));
    const producer = new Worker(new URL('./serve-worker.mjs', import.meta.url));
    let ready = false, generation = 0, checks = 0, builds = 0, closing = false;
    let graphHash: string | null = null, error: string | null = null;
    let latestBuild: ServeUpdate['build'];
    let failure: Error | undefined;
    const emit = (event: string, extra: object = {}) => { if (options.json && ready) console.log(JSON.stringify({ schemaVersion: 1, command: 'serve', event, generation: String(generation), hash: graphHash, ...extra })); };
    const status = () => ({ generation: String(generation), checks, builds, error, mode: 'strict-content-polling' });
    const publish = () => { for (const client of clients) client.write(`event: status\ndata: ${JSON.stringify(status())}\n\n`); };
    let initialize: (() => void) | undefined;
    const initialized = new Promise<void>(resolve => { initialize = resolve; });
    producer.on('message', (update: ServeUpdate) => {
        const previousError = error;
        generation = update.generation; checks = update.checks; builds = update.builds; error = update.error; graphHash = update.hash;
        const retained = new Set(update.generations.map(([, directory]) => directory));
        const retire = [...generations.values()].filter(directory => !retained.has(directory));
        generations.clear(); for (const [version, directory] of update.generations) generations.set(version, directory);
        if (retire.length) producer.postMessage({ retire } satisfies ServeCommand);
        for (const file of update.media) mediaFiles.set('/' + file.path, { bytes: Buffer.from(file.bytes), mimeType: file.mimeType });
        if (update.build) { latestBuild = update.build; publish(); emit('rebuilt', latestBuild); }
        if (error !== previousError) {
            if (error) { if (!options.json) console.error(`lattice serve: ${error}`); emit('error', { ok: false, error: { message: error } }); }
            else emit('recovered');
            publish();
        }
        initialize?.(); initialize = undefined;
    });
    const server = createServer((request, response) => {
        const send = (code: number, type: string, body: string | Buffer) => { response.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(request.method === 'HEAD' ? undefined : body); };
        if (request.method !== 'GET' && request.method !== 'HEAD') { send(405, 'text/plain', 'Method not allowed'); return; }
        if (!/^(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$/u.test(request.headers.host ?? '')) { send(403, 'text/plain', 'Loopback host required'); return; }
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname === '/__lattice/events' && request.method === 'GET') {
            response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
            response.write(`event: status\ndata: ${JSON.stringify(status())}\n\n`);
            clients.add(response); response.on('close', () => clients.delete(response)); return;
        }
        if (url.pathname === '/__lattice/status') { send(200, 'application/json', JSON.stringify(status())); return; }
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const config = `<meta name="lattice-generation" content="${generation}"><script type="module" src="/__lattice/live-client.js"></script>`;
            send(200, 'text/html; charset=utf-8', template.replace('</head>', `${config}</head>`)); return;
        }
        const mediaFile = mediaFiles.get(url.pathname);
        if (mediaFile) { send(200, mediaFile.mimeType, mediaFile.bytes); return; }
        const asset = assets.get(url.pathname);
        if (asset) { send(200, url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', asset); return; }
        if (error && !url.searchParams.has('generation') && ['/overview.json', '/graph.json', '/presentation.json', '/snapshots.json'].includes(url.pathname)) { send(503, 'application/json', JSON.stringify({ error })); return; }
        const version = url.searchParams.get('generation') ?? String(generation);
        const files = generations.get(version);
        if (!files && ['/overview.json', '/graph.json', '/presentation.json', '/snapshots.json'].includes(url.pathname)) { send(503, 'application/json', JSON.stringify({ error: error ?? 'Generation expired; reload the page' })); return; }
        const relativePath = url.pathname.slice(1);
        const path = files && /^[A-Za-z0-9._/-]+$/u.test(relativePath) && relativePath.split('/').every(part => part && part !== '.' && part !== '..') ? join(files, relativePath) : undefined;
        try {
            const stat = path ? lstatSync(path, { throwIfNoEntry: false }) : undefined;
            if (path && stat?.isFile()) {
                if (request.method === 'HEAD') { send(200, 'application/json', ''); return; }
                const stream = createReadStream(path, { fd: openSync(path, 'r'), autoClose: true });
                response.writeHead(200, { 'Content-Type': relativePath.endsWith('.gz') ? 'application/gzip' : 'application/json', 'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
                stream.on('error', failure => response.destroy(failure)); response.on('close', () => stream.destroy()); stream.pipe(response); return;
            }
        } catch (failure) {
            const code = errorCode(failure);
            if (code !== 'ENOENT' && code !== 'ENOTDIR') { send(500, 'text/plain', 'Artifact unavailable'); return; }
        }
        send(404, 'text/plain', 'Not found');
    });
    const close = () => {
        if (closing) return;
        closing = true;
        for (const client of clients) client.end();
        server.close(); server.closeAllConnections();
        producer.postMessage('stop');
    };
    const exited = new Promise<void>(resolve => {
        producer.once('error', cause => { failure = cause; error = cause.message; publish(); close(); });
        producer.once('exit', code => {
            if (!closing) { failure ??= new Error(`Live producer exited unexpectedly (${code})`); error = failure.message; publish(); close(); }
            initialize?.(); initialize = undefined; resolve();
        });
    });
    process.once('SIGINT', close); process.once('SIGTERM', close);
    try {
        producer.postMessage({ options, liveDirectory });
        await initialized;
        if (failure) throw failure;
        if (closing) return;
        if (error !== null) throw new Error(error);
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('Server did not bind a TCP address');
        ready = true;
        if (options.json) emit('ready', { url: `http://127.0.0.1:${address.port}/`, ...latestBuild });
        else console.log(`Lattice serving http://127.0.0.1:${address.port}/`);
        await exited;
        if (failure) throw failure;
    } finally {
        close(); await exited;
        process.removeListener('SIGINT', close); process.removeListener('SIGTERM', close);
        await rm(liveDirectory, { recursive: true, force: true });
        emit('stopped');
    }
}
