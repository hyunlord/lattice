import ts from 'typescript';
import { bundleModules } from './viewer-bundle.mjs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const limit = 256 * 1024;
export function archiveModules(modules, entry = 'app.js') {
  const names = new Set(modules.map(([name]) => name));
  if (names.size !== modules.length) throw new Error('Duplicate viewer module names');
  if (!names.has(entry)) throw new Error(`Missing viewer entry module: ${entry}`);
  const dependencies = new Map();
  const rewritten = modules.map(([name, source]) => {
    if (!/^[a-zA-Z0-9_-]+\.js$/u.test(name)) throw new Error(`Invalid viewer module name: ${name}`);
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits = [], imports = new Set();
    dependencies.set(name, imports);
    const replace = node => {
      if (!ts.isStringLiteral(node) || !node.text.startsWith('./') || !names.has(node.text.slice(2))) throw new Error(`Unsupported viewer import in ${name}: ${node.getText(file)}; use a literal local module`);
      imports.add(node.text.slice(2));
      edits.push([node.getStart(file), node.end, JSON.stringify(`lattice-viewer/${node.text.slice(2)}`)]);
    };
    const visit = node => {
      if (ts.isMetaProperty(node)) throw new Error(`Unsupported import.meta in ${name}; resolve URLs from document.baseURI`);
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier) replace(node.moduleSpecifier); }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !node.arguments[0]) throw new Error(`Unsupported dynamic import in ${name}`);
        replace(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end);
    return [name, source];
  });
  const reachable = new Set(), pending = [entry];
  while (pending.length) {
    const name = pending.pop(); if (reachable.has(name)) continue;
    reachable.add(name); pending.push(...dependencies.get(name));
  }
  const groups = []; let group = [];
  for (const module of rewritten.filter(([name]) => reachable.has(name))) {
    if (Buffer.byteLength(JSON.stringify([module])) > limit) throw new Error(`Viewer module ${module[0]} exceeds 256KiB; split it before packaging`);
    if (Buffer.byteLength(JSON.stringify([...group, module])) > limit) { groups.push(group); group = []; }
    group.push(module);
  }
  if (group.length) groups.push(group);
  return groups.map(records => {
    const decoded = Buffer.from(JSON.stringify(records)); const bytes = gzipSync(decoded, { level: 9 });
    if (bytes.length > limit) throw new Error('Compressed viewer archive exceeds 256KiB');
    const hash = createHash('sha256').update(bytes).digest('hex');
    return { bytes, entry: { path: `${hash}.gz`, hash, encoded: bytes.length, decoded: decoded.length, modules: records.map(([name]) => name) } };
  });
}
export function viewerArchivePlan(modules, entry = 'app.js') {
  const source = bundleModules(modules, entry);
  if (source === null) return { version: 1, packs: archiveModules(modules, entry) };
  const script = Buffer.from(source), packs = [];
  for (let offset = 0; offset < script.length; offset += limit) {
    const decoded = script.subarray(offset, offset + limit), bytes = gzipSync(decoded, { level: 9 });
    if (bytes.length > limit) throw new Error('Compressed viewer bundle exceeds 256KiB');
    const hash = createHash('sha256').update(bytes).digest('hex');
    packs.push({ bytes, entry: { path: `${hash}.gz`, hash, encoded: bytes.length, decoded: decoded.length } });
  }
  return { version: 2, packs };
}
export function bootstrapScript(hashSource, bootstrapSource) {
  const strip = (source, allowImport) => {
    const file = ts.createSourceFile('bootstrap.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); const edits = [];
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (!allowImport || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== './packed-hash.js') throw new Error('Unexpected bootstrap import');
        edits.push([statement.getStart(file), statement.end]);
      }
      for (const modifier of statement.modifiers ?? []) if (modifier.kind === ts.SyntaxKind.ExportKeyword) edits.push([modifier.getStart(file), modifier.end]);
    }
    for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + source.slice(end);
    return source;
  };
  return `{\n${strip(hashSource, false)}\n${strip(bootstrapSource, true)}\n}\n`;
}
export function buildViewerArchives(viewer) {
  const modules = readdirSync(viewer).filter(name => name.endsWith('.js') && name !== 'asset-bootstrap.js').sort().map(name => [name, readFileSync(join(viewer, name), 'utf8')]);
  const { version, packs } = viewerArchivePlan(modules);
  writeFileSync(join(viewer, 'asset-bootstrap.js'), bootstrapScript(readFileSync(join(viewer, 'packed-hash.js'), 'utf8'), readFileSync(join(viewer, 'asset-bootstrap.js'), 'utf8')));
  const output = join(viewer, 'asset-archives');
  rmSync(output, { recursive: true, force: true }); mkdirSync(output, { recursive: true });
  for (const pack of packs) writeFileSync(join(output, pack.entry.path), pack.bytes);
  writeFileSync(join(output, 'manifest.json'), JSON.stringify({ version, entry: 'app.js', packs: packs.map(pack => pack.entry) }));
}
