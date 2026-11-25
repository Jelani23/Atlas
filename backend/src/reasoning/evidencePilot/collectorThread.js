const { parentPort, workerData } = require('node:worker_threads');
const { snapshot, collect } = require('./collector');
(async () => { try {
    const input = snapshot(workerData.root);
    if (input.version === workerData.previousVersion) { parentPort.postMessage({ unchanged: true, version: input.version }); return; }
    if (workerData.checkOnly) { parentPort.postMessage({ unchanged: false, version: input.version }); return; }
    const graph = collect(input);
    try { graph.dependencyCruiser = await require('./dependencies').cruiseSnapshot(graph, workerData.scratch); }
    catch (error) { graph.dependencyCruiser = { status: 'unavailable', error: error.message }; }
    const packets = {};
    for (const target of workerData.targets || []) if (graph.records[target]) packets[target] = require('./context').buildContext(graph, target, workerData.contextOptions);
    graph.metrics.workerHeapMb = Math.round(process.memoryUsage().heapUsed / 1048576);
    // Keep the large original evidence on disk and off the conversation event loop.
    await require('node:fs/promises').writeFile(require('node:path').join(workerData.scratch, 'evidence-snapshot.json'), JSON.stringify(graph));
    parentPort.postMessage({ graph: { schema: graph.schema, snapshot: { version: input.version, manifest: input.manifest }, packets,
        contextKey: workerData.contextKey, metrics: graph.metrics,
        links: graph.links.map(({ from, to, kind }) => ({ from, to, kind })), dependencyCruiser: graph.dependencyCruiser } });
} catch (error) { parentPort.postMessage({ error: error.message }); } })();
