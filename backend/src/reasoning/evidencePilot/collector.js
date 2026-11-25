// Static, bounded snapshot analysis. No project module, config script or test is executed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const VERSION = `connected-evidence-1/ts-${ts.version}`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const slash = value => value.replace(/\\/g, '/');
const roots = ['src', 'tests', '../docs'];

function snapshot(root) {
    root = fs.realpathSync(root);
    const files = {};
    let bytes = 0;
    function visit(directory) {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
            if (entry.isSymbolicLink()) continue;
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!['node_modules', '.git', '.local'].includes(entry.name)) visit(full);
            } else if (/\.(?:[cm]?js|tsx?|jsx|json|md)$/.test(entry.name)) {
                const size = fs.statSync(full).size;
                if (size > 512000 || bytes + size > 16000000 || Object.keys(files).length >= 1500) throw new Error('Snapshot budget exceeded; narrow the pilot scope.');
                bytes += size;
                const source = fs.readFileSync(full, 'utf8');
                files[slash(path.relative(root, full))] = { hash: hash(source), source };
            }
        }
    }
    for (const dir of roots) {
        const full = path.resolve(root, dir);
        if (fs.existsSync(full) && !fs.lstatSync(full).isSymbolicLink()) visit(full);
    }
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.json']) {
        const full = path.join(root, name);
        if (fs.existsSync(full) && !fs.lstatSync(full).isSymbolicLink()) {
            const source = fs.readFileSync(full, 'utf8');
            if (source.length > 2000000) throw new Error('Configuration budget exceeded.');
            files[name] = { hash: hash(source), source };
        }
    }
    const manifest = Object.fromEntries(Object.keys(files).sort().map(name => [name, files[name].hash]));
    const implementation = fs.readdirSync(__dirname).filter(name => name.endsWith('.js')).sort()
        .map(name => [name, hash(fs.readFileSync(path.join(__dirname, name)))]);
    return { root, files, manifest, version: hash(JSON.stringify({ VERSION, implementation, manifest })) };
}

function collect(input) {
    const started = Date.now();
    const { root, files } = input;
    const absolute = name => slash(path.resolve(root, name));
    const names = new Map(Object.keys(files).map(name => [absolute(name), name]));
    const options = { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, resolveJsonModule: true, skipLibCheck: true, types: [] };
    const host = ts.createCompilerHost(options);
    const libraryRoot = slash(path.dirname(ts.getDefaultLibFilePath(options))) + '/';
    const originalRead = host.readFile;
    host.readFile = file => names.has(slash(file)) ? files[names.get(slash(file))].source
        : slash(file).startsWith(libraryRoot) && /\/lib\.[^/]+\.d\.ts$/.test(slash(file)) ? originalRead(file) : undefined;
    host.fileExists = file => host.readFile(file) !== undefined;
    host.directoryExists = dir => [...names.keys()].some(file => file.startsWith(slash(path.resolve(dir)).replace(/\/$/, '') + '/'));
    host.getSourceFile = (file, languageVersion) => {
        const source = host.readFile(file);
        return source === undefined ? undefined : ts.createSourceFile(file, source, languageVersion, true);
    };
    host.writeFile = () => { throw new Error('Emission is disabled.'); };
    const program = ts.createProgram(Object.keys(files).filter(n => /\.[cm]?[jt]sx?$/.test(n)).map(absolute), options, host);
    const checker = program.getTypeChecker();
    const records = {};
    const location = node => {
        const sf = node.getSourceFile(), name = names.get(slash(sf.fileName));
        if (!name) return null;
        const start = node.getStart(sf), end = node.getEnd();
        return { path: name, hash: files[name].hash, start, end,
            line: sf.getLineAndCharacterOfPosition(start).line + 1, endLine: sf.getLineAndCharacterOfPosition(end).line + 1 };
    };
    const definitions = node => {
        let symbol = checker.getSymbolAtLocation(node);
        if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        return (symbol?.declarations || []).map(location).filter(Boolean);
    };
    for (const sf of program.getSourceFiles()) {
        const name = names.get(slash(sf.fileName));
        if (!name) continue;
        const record = records[name] = { path: name, hash: files[name].hash, symbols: [], exports: [], references: [], relationships: [], diagnostics: [], omitted: 0 };
        // TS gives CommonJS require synthetic declarations. Only actual bindings/writes shadow it.
        let requireShadowed = false;
        const bindsRequire = binding => ts.isIdentifier(binding) ? binding.text === 'require'
            : (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) && binding.elements.some(element => ts.isBindingElement(element) && bindsRequire(element.name));
        function checkRequire(node) {
            if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isImportClause(node)) && node.name && bindsRequire(node.name)) requireShadowed = true;
            if (ts.isBinaryExpression(node) && node.left.getText(sf) === 'require' && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) requireShadowed = true;
            ts.forEachChild(node, checkRequire);
        }
        checkRequire(sf);
        let count = 0;
        const add = (list, item) => { if (count++ < 3000) record[list].push(item); else record.omitted++; };
        const edge = (node, kind, data) => add('relationships', { class: 'TOOL_FINDING', kind, location: location(node), ...data });
        function dependency(node, arg, shadowed = false, kind = 'module') {
            const literal = arg && ts.isStringLiteralLike(arg);
            const specifier = literal ? arg.text : null;
            const resolved = literal && !shadowed && ts.resolveModuleName(specifier, sf.fileName, options, host).resolvedModule;
            const target = resolved && names.get(slash(resolved.resolvedFileName));
            edge(node, kind, { specifier, target: target || null, status: target ? 'compiler_resolved' : 'unresolved',
                reason: target ? undefined : shadowed ? 'require has a local declaration' : !literal ? 'dynamic specifier' : 'outside snapshot or unresolved module' });
        }
        function walk(node) {
            if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name) {
                add('symbols', { class: 'TOOL_FINDING', name: node.name.getText(sf), kind: ts.SyntaxKind[node.kind], location: location(node),
                    inferredType: checker.typeToString(checker.getTypeAtLocation(node.name)).slice(0, 400), typeIsRuntimeProof: false });
            }
            if (ts.isIdentifier(node)) {
                const targets = definitions(node);
                if (targets.length) add('references', { class: 'TOOL_FINDING', name: node.text, location: location(node), targets });
            }
            if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
                if (node.moduleSpecifier) dependency(node, node.moduleSpecifier);
            }
            if (ts.isCallExpression(node)) {
                const expr = node.expression, text = expr.getText(sf);
                if (text === 'require' || expr.kind === ts.SyntaxKind.ImportKeyword) dependency(node, node.arguments[0], text === 'require' && requireShadowed);
                else if (text === 'require.resolve') dependency(node, node.arguments[0], requireShadowed, 'module_resolution_site');
                else {
                    const declaration = checker.getResolvedSignature(node)?.declaration;
                    const target = declaration && location(declaration);
                    edge(node, 'call', { expression: text.slice(0, 180), target: target || null,
                        status: target ? 'compiler_signature' : 'unresolved', runtimeDispatch: 'not_proven' });
                }
                if (ts.isPropertyAccessExpression(expr)) {
                    const method = expr.name.text;
                    if (['emit', 'on', 'once', 'addListener', 'get', 'post', 'put', 'delete', 'use', 'register'].includes(method)) {
                        const arg = node.arguments[0];
                        edge(node, ['emit','on','once','addListener'].includes(method) ? 'event_site' : 'registration_candidate', {
                            method, receiver: expr.expression.getText(sf), key: arg?.getText(sf).slice(0, 180),
                            keyDefinitions: arg ? definitions(ts.isPropertyAccessExpression(arg) ? arg.name : arg) : [],
                            status: 'syntax_candidate', uncertainty: 'Receiver identity, registration lifetime and runtime dispatch not established.' });
                    }
                }
            }
            ts.forEachChild(node, walk);
        }
        walk(sf);
        record.operations = require('./operations').extractOperations(name, files[name].source, files[name].hash);
        const moduleSymbol = checker.getSymbolAtLocation(sf);
        if (moduleSymbol) record.exports = checker.getExportsOfModule(moduleSymbol).map(symbol => ({ name: symbol.name,
            locations: (symbol.declarations || []).map(location).filter(Boolean), class: 'TOOL_FINDING' }));
        const diagnostics = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)];
        record.omittedDiagnostics = Math.max(0, diagnostics.length - 100);
        record.diagnostics = diagnostics.slice(0, 100).map(d => ({
            class: 'TOOL_FINDING', code: d.code, category: ts.DiagnosticCategory[d.category],
            line: d.start === undefined ? null : sf.getLineAndCharacterOfPosition(d.start).line + 1,
            message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
    }
    const links = [];
    for (const record of Object.values(records)) for (const relation of record.relationships) {
        const to = typeof relation.target === 'string' ? relation.target : relation.target?.path;
        if (to && to !== record.path) links.push({ from: record.path, to, kind: relation.kind, location: relation.location });
    }
    const events = Object.values(records).flatMap(record => record.relationships.filter(r => r.kind === 'event_site' && r.keyDefinitions.length));
    const key = site => site.keyDefinitions.map(d => `${d.path}:${d.start}`).sort().join('|');
    let eventCandidates = 0;
    for (const producer of events.filter(e => e.method === 'emit')) for (const listener of events.filter(e => e.method !== 'emit')) {
        if (producer.location.path !== listener.location.path && key(producer) === key(listener) && eventCandidates++ < 1000) {
            links.push({ from: producer.location.path, to: listener.location.path, kind: 'event_key_candidate', location: producer.location,
                relatedLocation: listener.location, status: 'unverified_connection', uncertainty: 'Same compiler key definition; emitter identity and listener lifetime not established.' });
        }
    }
    // Literal full file paths in docs/tests are evidence of a mention, not execution or correctness.
    for (const [name, file] of Object.entries(files)) if (/\.md$/.test(name) || name.startsWith('tests/')) {
        for (const target of Object.keys(records)) if (target !== name && file.source.includes(target)) {
            const offset = file.source.indexOf(target);
            links.push({ from: name, to: target, kind: 'explicit_path_mention', location: { path: name, hash: file.hash,
                start: offset, end: offset + target.length, line: file.source.slice(0, offset).split('\n').length } });
        }
    }
    return { schema: VERSION, snapshot: input, records, links, omittedEventCandidates: Math.max(0, eventCandidates - 1000), metrics: { elapsedMs: Date.now() - started, files: Object.keys(files).length },
        coverage: ['Fixed src/tests/docs snapshot; no runtime execution.', 'Compiler defaults are explicit; project tsconfig and external package declarations are not loaded.',
            'Test source describes intent; no test result is inferred.', 'Calls and inferred types are compiler findings, not runtime or behavior proofs.',
            'Event and registration sites are candidates; dynamic connections remain unresolved.'] };
}
module.exports = { snapshot, collect, hash, VERSION };
