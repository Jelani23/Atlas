// Only read the user-selected file. Never execute model-suggested code or tests.
async function inspectSource(execute, filename, isCancelled = () => false) {
    const pages = [];
    let args = [filename];
    let version;
    let expectedLine = 1;
    let used = 0;
    for (let page = 0; page < 3; page++) {
        if (isCancelled()) throw new Error('Task cancelled before source inspection.');
        const result = await execute('readCode', args);
        if (typeof result !== 'string' || !result.startsWith('Content of ')) throw new Error(`Could not read code for analysis: ${result}`);
        if (used + result.length > 12000) {
            pages.push('[Inspection stopped at the source budget; remaining lines were not supplied to analysis.]');
            break;
        }
        // Metadata is read only from the tool-generated header, never source lines.
        const header = result.split('\n', 2)[1]?.match(/^\[Source coverage: (\{.*\})\]$/);
        if (!header) { pages.push(result); break; } // Older tools: keep explicit preview limitations.
        const coverage = JSON.parse(header[1]);
        if (coverage.startLine !== expectedLine || (version && coverage.version !== version)) {
            throw new Error('Source coverage changed during inspection; restart the analysis.');
        }
        version = coverage.version;
        pages.push(result);
        used += result.length;
        if (!coverage.nextLine) break;
        expectedLine = coverage.nextLine;
        if (page === 2) pages.push(`[Inspection limited to three pages; unread source starts at line ${expectedLine}.]`);
        args = [coverage.path, expectedLine, 80, version];
    }
    return pages.join('\n\n') + '\n[Inspection is static source reading only. No runtime tests or code changes performed.]';
}
module.exports = { inspectSource };
