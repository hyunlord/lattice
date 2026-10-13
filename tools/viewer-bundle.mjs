import ts from 'typescript';

function bundleRuntime(register, entry, stages) {
  const script = document.currentScript;
  try {
    const modules = new Map();
    const canonical = name => name.replace(/^\.\//u, '').replace(/\.js$/u, '');
    let deferredLoader, deferredPromise;
    const define = (name, dependencies, factory) => {
      if (modules.has(name)) throw new Error(`Duplicate viewer module: ${name}`);
      modules.set(name, { dependencies, factory, exports: Object.create(null), state: 0, error: undefined });
    };
    const load = name => {
      const module = modules.get(canonical(name));
      if (!module) throw new Error(`Missing viewer module: ${name}`);
      if (module.state === 3) throw module.error;
      if (module.state === 2) return module.exports;
      if (module.state === 1) throw new Error(`Unexpected viewer module cycle: ${name}`);
      module.state = 1;
      try {
        const require = (names, resolve, reject) => {
          Promise.resolve().then(() => {
            if (stages && names.some(name => !modules.has(canonical(name)))) {
              deferredPromise ??= Promise.resolve().then(() => deferredLoader()).then(registerBatch => {
                const batch = new Map(), expected = new Set(stages.deferred);
                if (typeof registerBatch !== 'function') throw new Error('Invalid viewer deferred batch');
                registerBatch((name, dependencies, factory) => {
                  if (typeof name !== 'string' || canonical(name) !== name || !expected.has(name) || modules.has(name) || batch.has(name) || !Array.isArray(dependencies) || !dependencies.every(value => typeof value === 'string') || typeof factory !== 'function') throw new Error('Invalid or duplicate viewer deferred module');
                  batch.set(name, { dependencies, factory, exports: Object.create(null), state: 0, error: undefined });
                });
                if (batch.size !== expected.size) throw new Error('Incomplete viewer deferred batch');
                for (const [name, module] of batch) modules.set(name, module);
              });
              return deferredPromise.then(() => names.map(load));
            }
            return names.map(load);
          }).then(values => resolve(...values), reject);
        };
        Reflect.apply(module.factory, undefined, module.dependencies.map(dependency => dependency === 'require' ? require : dependency === 'exports' ? module.exports : load(dependency)));
        Object.defineProperty(module.exports, Symbol.toStringTag, { value: 'Module' });
        Object.freeze(module.exports);
        module.state = 2;
        return module.exports;
      } catch (error) { module.error = error; module.state = 3; throw error; }
    };
    register(define);
    if (stages && (modules.size !== stages.initial.length || stages.initial.some(name => !modules.has(name)))) throw new Error('Invalid viewer initial batch');
    load(script.dataset?.['latticeEntry'] ?? entry);
    if (stages) {
      const install = loader => {
        if (deferredLoader || typeof loader !== 'function') throw new Error('Invalid viewer deferred loader handoff');
        deferredLoader = loader;
      };
      script.dispatchEvent(new CustomEvent('lattice-assets-ready', { detail: install }));
      if (!deferredLoader) throw new Error('Missing viewer deferred loader handoff');
    } else script.dispatchEvent(new Event('lattice-assets-ready'));
  } catch (error) { script.dispatchEvent(new CustomEvent('lattice-assets-error', { detail: error })); }
}

/** Only the supported static DAG uses compiler factories; other graphs retain native ESM. */
export function bundleModules(modules, entry = 'app.js') {
  const sources = new Map(modules);
  if (sources.size !== modules.length || !sources.has(entry)) return null;
  const graph = new Map(), staticGraph = new Map(); let supported = true;
  for (const [name, source] of modules) {
    if (!/^[a-zA-Z0-9_-]+\.js$/u.test(name)) return null;
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (file.parseDiagnostics.length) return null;
    if (file.statements.filter(statement => ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.exportClause).length > 1) return null;
    const all = new Set(), direct = new Set(), mutable = new Set(), exported = new Set();
    const bindingNames = name => ts.isIdentifier(name) ? [name.text] : name.elements.flatMap(element => ts.isBindingElement(element) ? bindingNames(element.name) : []);
    for (const statement of file.statements) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exported.add(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          if (!(statement.declarationList.flags & ts.NodeFlags.Const)) mutable.add(name);
          if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exported.add(name);
        }
      }
      if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) exported.add((item.propertyName ?? item.name).text);
      }
    }
    if ([...exported].some(name => mutable.has(name))) supported = false;
    const target = node => {
      if (!node || !ts.isStringLiteral(node) || !node.text.startsWith('./') || !sources.has(node.text.slice(2))) { supported = false; return undefined; }
      const dependency = node.text.slice(2); all.add(dependency); return dependency;
    };
    const visit = (node, functions = 0) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(node.left) && exported.has(node.left.text)) supported = false;
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand) && exported.has(node.operand.text)) supported = false;
      if (ts.isMetaProperty(node) || (ts.isAwaitExpression(node) && functions === 0) || (ts.isForOfStatement(node) && node.awaitModifier && functions === 0)) supported = false;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.attributes) supported = false;
        if (node.moduleSpecifier) { const dependency = target(node.moduleSpecifier); if (dependency) direct.add(dependency); }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1) supported = false;
        target(node.arguments[0]);
      }
      ts.forEachChild(node, child => visit(child, functions + (ts.isFunctionLike(node) ? 1 : 0)));
    };
    visit(file); graph.set(name, all); staticGraph.set(name, direct);
  }
  if (!supported) return null;
  const reachable = new Set(), pending = [entry];
  while (pending.length) { const name = pending.pop(); if (reachable.has(name)) continue; reachable.add(name); pending.push(...graph.get(name)); }
  const active = new Set(), done = new Set();
  const acyclic = name => {
    if (active.has(name)) return false;
    if (done.has(name)) return true;
    active.add(name);
    for (const dependency of staticGraph.get(name)) if (!acyclic(dependency)) return false;
    active.delete(name); done.add(name); return true;
  };
  if ([...reachable].some(name => !acyclic(name))) return null;
  const files = new Map([...reachable].sort().map(name => [`/viewer/${name}`, `${sources.get(name)}\nexport {};\n`]));
  let emitted = '';
  const options = { allowJs: true, checkJs: false, noCheck: true, noLib: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.AMD, rootDir: '/viewer', outFile: '/bundle.js', newLine: ts.NewLineKind.LineFeed };
  const host = {
    getSourceFile: name => files.has(name) ? ts.createSourceFile(name, files.get(name), options.target, true, ts.ScriptKind.JS) : undefined,
    getDefaultLibFileName: () => '', writeFile: (name, text) => { if (name === '/bundle.js') emitted = text; },
    getCurrentDirectory: () => '/', getDirectories: () => [], fileExists: name => files.has(name), readFile: name => files.get(name),
    resolveModuleNames: names => names.map(name => files.has(`/viewer/${name.replace(/^\.\//u, '')}`) ? { resolvedFileName: `/viewer/${name.replace(/^\.\//u, '')}`, extension: ts.Extension.Js } : undefined),
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const program = ts.createProgram([...files.keys()], options, host);
  const checker = program.getTypeChecker();
  const namespace = name => {
    const file = program.getSourceFile(name), symbol = file && checker.getSymbolAtLocation(file);
    return symbol ? new Set(checker.getExportsOfModule(symbol).map(item => item.getName())) : new Set();
  };
  for (const [name] of files) {
    const file = program.getSourceFile(name);
    for (const statement of file.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier) continue;
      const names = namespace(`/viewer/${statement.moduleSpecifier.text.slice(2)}`);
      if (ts.isImportDeclaration(statement)) {
        if (statement.importClause?.name && !names.has('default')) return null;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(item => !names.has((item.propertyName ?? item.name).text))) return null;
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some(item => !names.has((item.propertyName ?? item.name).text))) return null;
    }
  }
  const result = program.emit();
  const errors = [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics(), ...result.diagnostics].filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (result.emitSkipped || errors.length || !emitted) throw new Error(`Viewer bundle compiler failed: ${errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; ')}`);
  return `(${bundleRuntime.toString()})(function(define){\n${emitted}\n},${JSON.stringify(entry)});\n`;
}

/** Split only self-contained compiler factories; lexical compiler helpers retain v2. */
export function stageBundleModules(source, entry = 'app.js') {
  const file = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const call = file.statements[0]?.expression;
  const register = call && ts.isCallExpression(call) ? call.arguments[0] : undefined;
  if (!register || !ts.isFunctionExpression(register)) return null;
  const definitions = new Map();
  for (const statement of register.body.statements) {
    const expression = ts.isExpressionStatement(statement) ? statement.expression : undefined;
    if (!expression || !ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== 'define' || expression.arguments.length !== 3) return null;
    const [name, deps, factory] = expression.arguments;
    if (!ts.isStringLiteral(name) || !/^[a-zA-Z0-9_-]+$/u.test(name.text) || definitions.has(name.text) || !ts.isArrayLiteralExpression(deps) || !deps.elements.every(ts.isStringLiteral) || !ts.isFunctionExpression(factory)) return null;
    definitions.set(name.text, { text: statement.getText(file), dependencies: deps.elements.map(node => node.text).filter(name => name !== 'require' && name !== 'exports') });
  }
  const canonical = name => name.replace(/^\.\//u, '').replace(/\.js$/u, '');
  const eager = new Set(), pending = [canonical(entry)];
  while (pending.length) {
    const name = pending.pop(); if (eager.has(name)) continue;
    const definition = definitions.get(name); if (!definition) return null;
    eager.add(name); pending.push(...definition.dependencies.map(canonical));
  }
  const initial = [...definitions.keys()].filter(name => eager.has(name));
  const deferred = [...definitions.keys()].filter(name => !eager.has(name));
  if (!deferred.length) return null;
  const body = names => names.map(name => definitions.get(name).text).join('\n');
  return {
    initial: initial.map(name => name + '.js').sort(), deferred: deferred.map(name => name + '.js').sort(),
    initialSource: '(' + bundleRuntime.toString() + ')(function(define){\n' + body(initial) + '\n},' + JSON.stringify(entry) + ',' + JSON.stringify({ initial, deferred }) + ');\n',
    deferredSource: 'document.currentScript.dispatchEvent(new CustomEvent("lattice-assets-register",{detail:function(define){\n' + body(deferred) + '\n}}));\n',
  };
}
