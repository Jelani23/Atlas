const { hash } = require('./collector');

// Pilot-only policies. The explicit summary profile trades native thinking for
// completion; it does not establish semantic accuracy or change chat defaults.
function summarySchema(packet) {
    const citation = { type: 'string' };
    if (packet) {
        citation.enum = packet.evidence.filter(e => e.kind === 'excerpt' && typeof e.text === 'string' && e.text.trim()).map(e => e.id);
        if (!citation.enum.length) throw new Error('No source excerpts available for a summary.');
    }
    return { type: 'object', additionalProperties: false, required: ['claims', 'unknowns'], properties: {
        claims: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false,
            required: ['text', 'evidenceIds'], properties: { text: { type: 'string', minLength: 1, maxLength: 1600 },
                evidenceIds: { type: 'array', minItems: 1, maxItems: 8, items: citation } } } },
        unknowns: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 1600 } }
    } };
}
function generationProfile(name = 'reasoning', packet) {
    if (!['reasoning', 'summary', 'outline'].includes(name)) throw new Error('Unknown connected evidence profile.');
    const generation = { model: 'qwen3.5:4b', stream: false, think: name === 'reasoning', format: name === 'outline' ? require('./outline').schema() : name === 'summary' ? summarySchema() : 'json',
        options: { temperature: 0, seed: 42, num_ctx: 16384, num_predict: 4000 } };
    const summaryKey = hash(JSON.stringify(generation));
    if (name === 'summary' && packet) generation.format = summarySchema(packet);
    if (name === 'outline' && packet) generation.format = require('./outline').schema(packet);
    return { name, generation, summaryKey };
}
module.exports = { generationProfile, summarySchema };
