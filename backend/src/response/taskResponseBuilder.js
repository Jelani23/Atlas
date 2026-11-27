// Backward-compatible entry point; all composition now passes through the shared builder.
const { render } = require('./wordleResponseRenderer');
async function build(options, dependencies = {}) {
    const builder = require('./responseBuilder');
    const response = await builder.compose({ ...options, result: builder.normalizeWordle(options.result, options.fallback) }, dependencies);
    return response.display;
}
module.exports = { build, render };
