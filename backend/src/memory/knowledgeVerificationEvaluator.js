const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');

const VERIFICATION_SCHEMA = {
    type: 'object',
    properties: {
        verdict: { type: 'string', enum: ['confirmed', 'updated', 'contradicted', 'insufficient'] },
        proposed_value: { type: 'string' },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        supporting_urls: { type: 'array', items: { type: 'string' } }
    },
    required: ['verdict', 'proposed_value', 'confidence', 'reason', 'supporting_urls']
};

function buildVerificationPrompt(record, evidence, now = new Date()) {
    const currentDate = now.toISOString().slice(0, 10);
    return `Evaluate one stored knowledge claim against fresh web evidence.

Runtime current date: ${currentDate}
Treat this as authoritative. A date on or before ${currentDate} is not in the future. For latest/current claims, judge freshness relative to this runtime date rather than the model's training cutoff.

Stored claim:
- category: ${record.category}
- subject: ${record.subject}
- key: ${record.key}
- value: ${record.value}

Fresh evidence:
${String(evidence || '').slice(0, 12000)}

Use only the fresh evidence. Choose confirmed only when it supports the stored value. Choose updated when it supports a clear replacement value, contradicted when it refutes the claim without a supported replacement, or insufficient when the evidence cannot decide. Every supporting URL must appear verbatim in the evidence. Return JSON only. /no_think`;
}

async function evaluateKnowledge(record, evidence, options = {}) {
    const adapter = options.adapter || createModelAdapter();
    const prompt = buildVerificationPrompt(record, evidence, options.now || new Date());

    const messages = [
        { role: 'system', content: 'You are a strict evidence comparison API. Return only valid JSON.' },
        { role: 'user', content: prompt }
    ];
    const run = maxTokens => llmQueue.enqueue(() => adapter.complete(messages, {
        think: false,
        temperature: 0.1,
        maxTokens,
        format: VERIFICATION_SCHEMA
    }));

    let parsed = extractJSON(await run(1200));
    if (!parsed) parsed = extractJSON(await run(2400));
    if (!parsed) throw new Error('The verifier returned invalid JSON twice.');
    return parsed;
}

module.exports = {
    evaluateKnowledge,
    buildVerificationPrompt,
    VERIFICATION_SCHEMA
};
