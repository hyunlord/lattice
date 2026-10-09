import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
async function sources(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sources(path));
    else if (/\.(ts|mjs)$/.test(path)) files.push(path);
  }
  return files;
}
const files = (await Promise.all(['src', 'tests'].map(path => sources(resolve(root, path))))).flat();
const texts = new Map(await Promise.all(files.map(async path => [path, await readFile(path, 'utf8')])));
const host = {
  getScriptFileNames: () => files,
  getScriptVersion: () => '0',
  getScriptSnapshot: path => texts.has(path) ? ts.ScriptSnapshot.fromString(texts.get(path)) : undefined,
  getCurrentDirectory: () => root,
  getCompilationSettings: () => ({ allowJs: true }),
  getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
};
const service = ts.createLanguageService(host);
const options = { indentSize: 4, tabSize: 4, convertTabsToSpaces: true, newLineCharacter: '\n', insertSpaceAfterCommaDelimiter: true, insertSpaceAfterSemicolonInForStatements: true, insertSpaceBeforeAndAfterBinaryOperators: true, insertSpaceAfterKeywordsInControlFlowStatements: true, insertSpaceAfterFunctionKeywordForAnonymousFunctions: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true, semicolons: ts.SemicolonPreference.Insert };
const write = process.argv.includes('--write');
let mismatches = 0;
try {
  for (const file of files) {
    const original = texts.get(file);
    let formatted = original;
    for (const edit of service.getFormattingEditsForDocument(file, options).sort((a, b) => b.span.start - a.span.start)) {
      formatted = formatted.slice(0, edit.span.start) + edit.newText + formatted.slice(edit.span.start + edit.span.length);
    }
    formatted = formatted.trimEnd() + '\n';
    if (formatted !== original) {
      if (write) await writeFile(file, formatted);
      else { console.error(`Formatting differs: ${file}`); mismatches++; }
    }
  }
} finally { service.dispose(); }
if (mismatches) process.exitCode = 1;
else console.log(`${write ? 'Formatted' : 'Format checked'} ${files.length} source/test files using TypeScript formatter.`);
