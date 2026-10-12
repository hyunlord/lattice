# L10 bounded packed transport

The canonical cache graph and graph hash are unchanged. Static export and each immutable live generation use the same version-2 transport writer. This is an artifact encoding, not another analysis model. No model, service API, repository-name branch, or dependency was added.

## Files and version dispatch

`overview.json`, `presentation.json`, `snapshots.json`, media and viewer assets remain ordinary files. The first overview does not request the transport index or import its decoder. `graph.json` and `snapshots/<id>.json` are small manifests containing `transportVersion: 2`, the virtual `document` path, original `hash`, full `repository`, `lensDigest`, and collection counts. Consumers that only inspect commit/hash can continue reading these directly.

`transport.json` contains `transportVersion: 2`, `packPageSize: 256`, `packCount`, and `fileCount`. A reader hashes the virtual path with the existing unsigned multiply-by-31 bucket convention. `transport/files-<two-hex-digits>.json` contains sorted inclusive path ranges, each pointing to a bounded `transport/files-<bucket>-<page>.json` array of `[path, reference]` rows. `transport/packs-<page>.json` contains at most 256 pack paths in ordinal order.

The browser `createPackedLoader(base, suffix)` exposes asynchronous `json(path)` and `text(path)`. `readPackedArtifact(directory, path)` is its synchronous Node counterpart for offline tools. Only a 404 for `transport.json` selects legacy ordinary JSON. Invalid manifests, missing records, HTTP failures and corrupt data fail visibly; they do not select another graph. The new viewer can read old exports. Old viewers do not decode new manifests.

## Records and bounds

A pack is a gzip-compressed JSON array at `packs/<sha256-of-compressed-bytes>.json.gz`. Both compressed bytes and decompressed UTF-8 bytes are at most 262,144 bytes. The producer targets 240,000 bytes, leaving room for incompressible gzip framing. Node's built-in gzip and the browser's `DecompressionStream('gzip')` perform compression/decompression. Serve these gzip files as binary files without adding HTTP `Content-Encoding: gzip`; the loader decompresses the stored artifact itself.

A reference is `["r", packOrdinal, recordIndex]`. Scalar JSON values remain scalars; arrays use `["a", values]`, objects use `["o", [[key, value], ...]]`. This explicit tagging preserves literal arrays, reserved-looking object keys and own `__proto__` fields. `["j", references]` joins string fragments, parses the resulting encoded JSON, then decodes it. Oversized records split at surrogate-safe boundaries before packing. `["s", value]` reconstructs an embedded JSON string; it permits sharing canonical graph records inside existing detail transport fragments without changing their logical contract.

Exact graph records and exact source records are interned by the SHA-256 of their encoded payload. Records retain source paths, pointers, lines, revisions, URLs, content hashes, attributes and order. Equal semantic graph hashes do not authorize aliasing different repository/snapshot bindings. Root graph metadata is retained independently, and changed source revision/URL creates a distinct record. Repeated exact/all logic adjacency payloads and repeated snapshot records can therefore share storage without changing the query result.

The writer keeps only one pending pack and spills the virtual-file catalogue into 256 temporary buckets. It does not concatenate a full canonical graph JSON document. The encoded root reference tree and the digest-to-reference deduplication table still grow with graph size; their peak memory must be measured on the frozen large corpus. Gzip size savings alone are not acceptance evidence.

## Integrity and publication

Before publishing `transport.json`, the writer rereads persisted packs, verifies their compressed-byte SHA-256, bounds decompression and checks direct reference ordinals. Construction produces references only to existing records; fragmented encoded values are assembled from those validated records. Static export retains its staging/backup/rename transaction, so a snapshot or pack failure leaves the prior site intact. The live worker finishes the same store before publishing a generation; retained generations keep their own ordinal catalogues and source-bound documents.

Readers bound both fetched and decompressed pack bytes, verify compressed SHA-256, check tags/indices, reject cycles and prototype-key duplicates, and retain at most 32 cached index/pack responses per loader. Failed requests are evicted for retry. Browser hashing uses SubtleCrypto when available and a locally implemented SHA-256 fallback for ordinary HTTP; padding-boundary and maximum-pack tests compare the fallback with Node crypto. The existing detail/logic/overview parsers continue validating reconstructed graph/repository binding and requested record identity. Generation suffixes apply to every pack/index request.

## Navigation and validation

The initial overview remains separate from packed artifacts. A projected-out default function has a source-bound focus packet. A different selected function loads its own bounded exact incoming/outgoing call pages from the existing logic transport and builds its own focus model. Displayed/total call counts disclose truncation; following a neighbor does not silently reuse that neighbor's incomplete relation list from the prior card.

Regression coverage includes HTTP and offline roundtrips, source binding with equal semantic graph hashes, oversized Unicode, content-address corruption and retry, missing-pack publication failure, old export fallback, lazy evidence ordering, exact query parity, snapshot tampering rollback, retained live generations, worker responsiveness and clean shutdown. The frozen L10 byte budgets, first-display comparison and large-corpus memory/runtime gates remain separate measurements; small fixtures do not establish those gates.
