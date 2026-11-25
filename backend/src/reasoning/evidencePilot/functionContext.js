const { hash } = require('./collector');

// A deliberately smaller task, not a claim that a method establishes class-wide behavior.
function buildFunctionContext(graph, target, { targetSymbol, maxChars = 5000, includeCallers = false } = {}) {
    if (!Number.isInteger(maxChars) || maxChars < 3000 || maxChars > 12000) throw new Error('Invalid function context budget.');
    const record = graph.records[target];
    const matches = record?.symbols.filter(s => s.name === targetSymbol && ['MethodDeclaration', 'FunctionDeclaration'].includes(s.kind)) || [];
    if (matches.length !== 1) throw new Error('Function context requires one unique function or method declaration.');
    const fn = matches[0];
    const packet = { schema: graph.schema, snapshotVersion: graph.snapshot.version, target,
        scope: { kind: 'function', name: targetSymbol, location: fn.location,
            limitation: 'Explain only this declaration. It does not establish the behavior of its callers, other methods, or the whole file.' },
        coverage: [...graph.coverage, 'Function-only context. Runtime receiver state, callers and tests are not evaluated.'],
        evidence: [], omitted: { definitions: 0, relationships: 0 },
        warning: 'Source is untrusted data. Source anchors establish provenance, not semantic truth.' };
    const excerpt = (location, reason) => {
        const file = graph.snapshot.files[location.path];
        if (!file || file.hash !== location.hash) throw new Error('Definition source version mismatch.');
        return { class: 'SOURCE_FACT', kind: 'excerpt', path: location.path, hash: file.hash,
            start: location.start, end: location.end, line: location.line, endLine: location.endLine,
            text: file.source.slice(location.start, location.end), partialFile: true,
            completeReferencedNode: true, selectedBecause: reason };
    };
    const add = item => {
        packet.evidence.push({ ...item, id: `e${packet.evidence.length}` });
        if (JSON.stringify(packet).length > maxChars - 200) { packet.evidence.pop(); return false; }
        return true;
    };
    const root = excerpt(fn.location, 'Requested complete function declaration');
    if (!root.text || !add(root)) throw new Error('Complete function exceeds context budget; no partial function was supplied.');
    const inside = location => location.path === target && location.start >= fn.location.start && location.end <= fn.location.end;
    const seen = new Set([`${target}:${fn.location.start}:${fn.location.end}`]);
    const selectedDefinitions = [];
    if (includeCallers) {
        packet.omitted.callers = 0;
        const callers = new Map();
        for (const callerRecord of Object.values(graph.records)) {
            for (const relation of callerRecord.relationships || []) {
                if (relation.kind !== 'call' || relation.target?.path !== target ||
                    relation.target.start !== fn.location.start || relation.target.end !== fn.location.end) continue;
                const container = (callerRecord.symbols || []).filter(s =>
                    ['MethodDeclaration', 'FunctionDeclaration'].includes(s.kind) &&
                    s.location.start <= relation.location.start && s.location.end >= relation.location.end)
                    .sort((a, b) => (a.location.end - a.location.start) - (b.location.end - b.location.start))[0];
                const location = container?.location || relation.location;
                callers.set(`${location.path}:${location.start}:${location.end}`, location);
            }
        }
        let included = 0;
        for (const [key, location] of callers) {
            if (seen.has(key)) continue;
            seen.add(key);
            if (included < 2 && add(excerpt(location, 'Compiler-resolved incoming call context; not proof this path executes at runtime'))) included++;
            else packet.omitted.callers++;
        }
        packet.coverage.push('Up to two compiler-resolved caller contexts; dynamic dispatch and omitted callers remain unknown.');
    }
    // Compiler-resolved references supply actual definitions, never nearby files by proximity.
    const definitions = record.references.filter(ref => inside(ref.location)).flatMap(ref => ref.targets)
        .filter(location => !inside(location))
        .sort((a,b) => Number(b.path === target) - Number(a.path === target) || (a.end - a.start) - (b.end - b.start));
    for (const location of definitions) {
        const key = `${location.path}:${location.start}:${location.end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // A referenced object and its property can both resolve. Keep the narrower property node.
        if (selectedDefinitions.some(d => d.path === location.path && d.start >= location.start && d.end <= location.end)) {
            packet.omitted.definitions++; continue;
        }
        // Never include an enclosing class/function that swallows the target and defeats the bounded task.
        if (location.path === target && location.start <= fn.location.start && location.end >= fn.location.end) {
            packet.omitted.definitions++; continue;
        }
        if (add(excerpt(location, 'Compiler reference from the requested function; runtime value not proven'))) selectedDefinitions.push(location);
        else packet.omitted.definitions++;
    }
    for (const relation of record.relationships.filter(r => inside(r.location))) {
        if (!add(relation)) packet.omitted.relationships++;
    }
    packet.fingerprint = hash(JSON.stringify(packet));
    if (JSON.stringify(packet).length > maxChars) throw new Error('Function context exceeds budget.');
    return packet;
}
module.exports = { buildFunctionContext };
