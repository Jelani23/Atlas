const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function compare(graph, output) {
    if (!Array.isArray(output.modules)) throw new Error('Invalid dependency-cruiser output.');
    const edges = [], unresolved = [];
    for (const module of output.modules) for (const dep of module.dependencies || []) {
        if (dep.couldNotResolve) unresolved.push({ from: module.source, specifier: dep.module });
        if (graph.snapshot.files[module.source] && graph.snapshot.files[dep.resolved]) edges.push({ from: module.source, to: dep.resolved });
    }
    const key = e => JSON.stringify([e.from, e.to]);
    const compiler = new Set(graph.links.filter(e => e.kind === 'module').map(key));
    const cruiser = new Set(edges.map(key));
    return { tool: 'dependency-cruiser', version: '18.5.0', status: 'compared', edges, unresolved,
        agreed: [...compiler].filter(e => cruiser.has(e)).length,
        compilerOnly: [...compiler].filter(e => !cruiser.has(e)).map(JSON.parse),
        cruiserOnly: [...cruiser].filter(e => !compiler.has(e)).map(JSON.parse),
        interpretation: 'Module graph comparison only. Agreement is not proof of runtime dispatch or correct behavior.' };
}

async function cruiseSnapshot(graph, directory) {
    const started = Date.now();
    const temp = directory || await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-cruise-'));
    try {
        const inputs = [];
        for (const [name, file] of Object.entries(graph.snapshot.files)) {
            if (!/^(src|tests)\//.test(name)) continue;
            const destination = path.resolve(temp, name);
            if (!destination.startsWith(temp + path.sep)) throw new Error('Invalid snapshot path.');
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, file.source);
            if (/\.[cm]?[jt]sx?$/.test(name)) inputs.push(name);
        }
        const { cruise } = await import('dependency-cruiser');
        // Only copied source data; no project config discovery, plugins, test execution or node_modules traversal.
        const result = await cruise(inputs, { baseDir: temp, includeOnly: '^(src|tests)/',
            doNotFollow: 'node_modules', tsPreCompilationDeps: true, cache: false, outputType: 'json' });
        const output = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
        return { ...compare(graph, output), elapsedMs: Date.now() - started };
    } finally { if (!directory) await fs.rm(temp, { recursive: true, force: true }); }
}

function affectedTargets(oldGraph, newGraph, changedPaths) {
    // Union both graphs so removed edges still invalidate old dependents.
    const edges = [...(oldGraph?.links || []), ...(newGraph?.links || []),
        ...(oldGraph?.dependencyCruiser?.edges || []), ...(newGraph?.dependencyCruiser?.edges || [])];
    const affected = new Set(changedPaths);
    let size;
    do { size = affected.size; for (const edge of edges) if (affected.has(edge.to)) affected.add(edge.from); } while (size !== affected.size);
    return [...affected].sort();
}
module.exports = { compare, cruiseSnapshot, affectedTargets };
