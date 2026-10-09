import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepository } from './build.mjs';
import { observeRepository } from './observation.mjs';
import { cacheDirectory, persistBuild, readGraph, withCacheLock } from './storage.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
export async function serve(options) {
  const port = options.port === undefined ? 4173 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535');
  if (options.output !== undefined || options.force) throw new Error('serve accepts --root, --lens, --cache-dir, --port and --json');
  const cache = cacheDirectory(options.root, options.cacheDir);
  const generations = new Map();
  const clients = new Set();
  const assets = new Map(['app.js', 'styles.css'].map(file => [`/${file}`, readFileSync(join(packageRoot, 'viewer', file))]));
  assets.set('/__lattice/live-client.js', readFileSync(join(packageRoot, 'bin/live-client.js')));
  const template = readFileSync(join(packageRoot, 'viewer/index.html'), 'utf8');
  let ready = false, graphHash = null, latestBuild;
  const emit = (event, extra = {}) => { if (options.json && ready) console.log(JSON.stringify({ schemaVersion: 1, command: 'serve', event, generation: String(generation), hash: graphHash, ...extra })); };
  let fingerprint, generation = 0, checks = 0, builds = 0, error = null, timer, closing = false;
  const status = () => ({ generation: String(generation), checks, builds, error, mode: 'strict-content-polling' });
  const publish = () => { for (const client of clients) client.write(`event: status\ndata: ${JSON.stringify(status())}\n\n`); };
  const refresh = () => {
    checks++;
    try {
      const observed = observeRepository(options);
      if (observed.fingerprint !== fingerprint) {
        const startedAt = performance.now();
        const next = withCacheLock(options.root, () => {
          const result = buildRepository(options, undefined, observed);
          const graph = persistBuild(options.root, result, options.cacheDir);
          const files = new Map([['/graph.json', JSON.stringify(graph)], ['/presentation.json', JSON.stringify(result.presentation)], ['/snapshots.json', JSON.stringify(graph.snapshots)]]);
          for (const snapshot of graph.snapshots) files.set(`/${snapshot.artifactPath}`, JSON.stringify(readGraph(join(cache, snapshot.artifactPath))));
          return { files, graph, result };
        }, options.cacheDir);
        generation++; builds++;
        generations.set(String(generation), next.files);
        graphHash = next.graph.hash;
        while (generations.size > 4) generations.delete(generations.keys().next().value);
        fingerprint = observed.fingerprint;
        const recovered = error !== null;
        error = null;
        publish();
        latestBuild = { extraction: next.result.extraction.stats, diagnostics: next.result.diagnostics, durationMs: performance.now() - startedAt };
        emit('rebuilt', latestBuild);
        if (recovered) emit('recovered');
      } else if (error !== null) { error = null; publish(); emit('recovered'); }
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      if (message !== error) { error = message; if (!options.json) console.error(`lattice serve: ${message}`); emit('error', { ok: false, error: { message } }); publish(); }
    }
  };
  refresh();
  if (error !== null) throw new Error(error);
  const server = createServer((request, response) => {
    const send = (code, type, body) => { response.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(request.method === 'HEAD' ? undefined : body); };
    if (request.method !== 'GET' && request.method !== 'HEAD') { send(405, 'text/plain', 'Method not allowed'); return; }
    if (!/^(?:127\.0\.0\.1|localhost)(?::[0-9]+)?$/u.test(request.headers.host ?? '')) { send(403, 'text/plain', 'Loopback host required'); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
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
    const asset = assets.get(url.pathname);
    if (asset) { send(200, url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', asset); return; }
    if (error && !url.searchParams.has('generation') && ['/graph.json', '/presentation.json', '/snapshots.json'].includes(url.pathname)) { send(503, 'application/json', JSON.stringify({ error })); return; }
    const version = url.searchParams.get('generation') ?? String(generation);
    const files = generations.get(version);
    if (!files && ['/graph.json', '/presentation.json', '/snapshots.json'].includes(url.pathname)) { send(503, 'application/json', JSON.stringify({ error: error ?? 'Generation expired; reload the page' })); return; }
    const data = files?.get(url.pathname);
    if (data !== undefined) { send(200, 'application/json', data); return; }
    send(404, 'text/plain', 'Not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address();
  const poll = () => { if (!closing) { refresh(); timer = setTimeout(poll, 500); } };
  timer = setTimeout(poll, 500);
  await new Promise(resolve => {
    const close = () => {
      if (closing) return;
      closing = true; clearTimeout(timer);
      for (const client of clients) client.end();
      server.close(resolve); server.closeAllConnections();
    };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    ready = true;
    if (options.json) emit('ready', { url: `http://127.0.0.1:${address.port}/`, ...latestBuild });
    else console.log(`Lattice serving http://127.0.0.1:${address.port}/`);
    server.once('close', () => { emit('stopped'); process.removeListener('SIGINT', close); process.removeListener('SIGTERM', close); });
  });
}
