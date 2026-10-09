# Structured CLI output

Use `lattice <command> ... --json` or `lattice --json <command> ...`. JSON mode writes no human prose to stdout. Normal human output remains the default.

`init`, `build`, `check`, `export` and `help` write one JSON object:

```json
{"schemaVersion":1,"command":"check","ok":true,"result":{}}
```

The result fields depend on the command:

| Command | Result |
| --- | --- |
| init | `lensPath`, `ignorePath`, `cachePath`, `globalConfigurationChanged` (false in L1) |
| build/check | `graph` with hash, repository metadata and collection counts; `extraction` counters; `diagnostics`; `coverage`; `cachePath`; `gates` |
| export | `outputPath`, `hash` identifying the exported graph |
| help | `text` containing usage instructions |

Each result also includes nonnegative `durationMs`, measured for this invocation and excluded from graph identity. A gate entry contains `findingId`, `ruleId`, metric, comparator, threshold, status and observed value. No configured gates is an empty array and a successful check. Build success means construction succeeded, even if the graph contains failed gates. Check reports `ok:false` and exit 1 for either failed or unknown gates; successful operations exit 0.

Invalid configuration, malformed input and operational errors produce one object with `schemaVersion`, `command`, `ok:false`, and `error.message`, then exit 2. This includes option parsing errors. There is no partial success object before an error. Error messages can include source paths and lens pointers.

`diff --json` retains its existing deterministic top-level `schemaVersion`, `before`, `after`, and collection changes. It does not add a result envelope or elapsed timing, preserving existing exact-output consumers and reproducible comparisons. Operational errors still use the error object described above.

## Live server events

`serve --json` is newline-delimited JSON for a long-running process. Each record has `schemaVersion:1`, `command:"serve"` and `event`:

| Event | Meaning |
| --- | --- |
| ready | Listener is bound; includes the actual `url`, generation, graph hash, initial extraction counters, diagnostics and build duration |
| rebuilt | Changed inputs produced a new generation/hash; includes extraction counters, diagnostics and build duration |
| error | Refresh failed; `ok:false` and `error.message`; previous generation/hash remain identified |
| recovered | Refresh error cleared; identifies the currently usable generation/hash |
| stopped | SIGINT/SIGTERM shutdown closed the server |

Ready is the first successful startup event. Startup failure instead emits one error object and exits 2; no URL or generation is claimed. Unchanged polling emits nothing. A refresh failure keeps the server alive and makes an unversioned graph request return HTTP 503 until recovery. An error followed by restored original content can recover without a new generation. These events report local CLI/server state, not MCP protocol messages.
