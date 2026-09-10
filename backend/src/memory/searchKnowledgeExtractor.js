// backend/src/memory/searchKnowledgeExtractor.js
//
// ============================================================
// SEARCH -> KNOWLEDGE EXTRACTION
// ============================================================
//
// Previously, information Alice found via web search only ever lived
// in the reply she gave back in the moment - nothing from a search
// was ever written into knowledge_library, so she'd have to search
// again for the same thing later, and couldn't build durable
// knowledge from her own research the way she can from things the
// user tells her directly (see memoryExtractor.js /
// deterministicExtractor.js for that conversational path).
//
// This module closes that gap for search specifically. It runs as a
// background task (see core/conversationEngine.js) after a web search
// resolves, and:
//
//   1. Uses raw search-provider material as the evidence authority. The
//      final synthesized answer is supplied only as an organizational aid;
//      it can never make an unsupported claim eligible for storage.
//   2. Extracts only durable, generally-true facts worth remembering
//      later - not the user's question, not conversational filler,
//      not anything that's really a claim/rumor rather than a fact
//      (those still get saved, but tagged with a hedging `type`
//      instead of "fact" - see KNOWN_KNOWLEDGE_TYPES in
//      knowledgeLibrary.js).
//   3. Saves through memoryManager.handleMemoryAction, the same
//      single write path conversational knowledge extraction uses -
//      so identity resolution, deduplication, and conflict handling
//      all behave identically regardless of where the knowledge came
//      from.
//
// Every saved record keeps a source URL from the raw search evidence.
// ============================================================

const { createModelAdapter } = require('../models/modelAdapter');
const { extractJSON, safePreview } = require('../utils/jsonExtractor');
const llmQueue = require('./llmQueue');
const memoryManager = require('./memoryManager');
const { KNOWN_KNOWLEDGE_TYPES } = require('./knowledgeLibrary');
const { hasVerifiedSearchEvidence } = require('../utils/searchEvidence');
const { extractSourceUrls } = require('./knowledgeVerificationPolicy');

const modelAdapter = createModelAdapter();

const EXTRACTION_SCHEMA = {
    type: 'object',
    properties: {
        memories: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    subject: { type: 'string' },
                    // Phase: 'topics' was in `properties` but not `required`.
                    // Ollama's structured-output mode enforces the schema at
                    // the decoding grammar level, and an optional array field
                    // is the path of least resistance for a small model at
                    // low temperature - it satisfies the schema with `[]`
                    // and moves on, rather than actually doing the work the
                    // prompt asked for (2-5 retrieval terms). That's why
                    // topics always came back blank. Making it `required`
                    // with minItems forces the grammar itself to demand at
                    // least 2 entries - it's no longer optional to skip.
                    topics: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
                    knowledge_category: { type: 'string' },
                    type: { type: 'string' },
                    key: { type: 'string' },
                    value: { type: 'string' },
                    confidence: { type: 'number' },
                    supporting_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 }
                },
                required: [
                    'subject', 'topics', 'knowledge_category', 'type',
                    'key', 'value', 'confidence', 'supporting_urls'
                ]
            }
        }
    },
    required: ['memories']
};

// Cheap pre-filter so a failed/empty search doesn't even bother
// queuing an LLM call - there's nothing to extract from "no results".
function hasExtractableContent(summary, rawResults) {
    // The synthesized reply is model output, not evidence. Requiring actual
    // source material prevents a hallucinated fallback answer from becoming
    // durable knowledge when every search provider returned nothing.
    return hasVerifiedSearchEvidence(rawResults);
}

function buildPrompt(query, summary, rawResults) {
    // Raw material can be long (see webSearch.js) - cap what goes into
    // this prompt so extraction stays fast and focused on the clearest
    // signal, not padding out context with redundant scraped HTML text.
    const trimmedRaw = (rawResults || '').slice(0, 6000);

    return `
You are Alice's knowledge extractor for web search results. A search
was just run and answered. Your job is to pull out any DURABLE,
generally-true facts worth remembering permanently - not the
conversation, not the user's question, not anything tied only to this
moment.

SEARCH QUERY: "${query}"
RUNTIME DATE: ${new Date().toISOString().slice(0, 10)}

SYNTHESIZED ANSWER ALICE GAVE (already comprehended and coherent):
"""
${summary || '(none)'}
"""

RAW SOURCE MATERIAL THE SEARCH GATHERED (noisier, but may contain
specific figures/details worth pulling that the summary smoothed
over):
"""
${trimmedRaw || '(none)'}
"""

RAW SOURCE MATERIAL is the authority. The synthesized answer is only
an organizational aid and may contain unsupported model output. Every
fact you extract must be directly supported by the raw source material;
if a claim appears only in the synthesized answer, do not extract it.
Don't extract the same fact twice just because it appears in both.

WHAT COUNTS AS KNOWLEDGE
- Durable facts, definitions, concepts, or relationships that would
  still be true/relevant if asked about again later.
- NOT: the user's question itself, search-engine mechanics, anything
  purely about "what was searched for" rather than what was found.
- If the result was inconclusive, contradictory, or clearly a rumor/
  opinion rather than an established fact, you may still record it -
  but set "type" to "claim", "assumption", or "hypothesis" (never
  "fact") so Alice hedges it appropriately later.
- If truly nothing durable was found (e.g. the search failed, or the
  answer was purely conversational/time-sensitive with no lasting
  fact), return an empty memories array. Do not invent a fact to fill
  the array.
- For latest/current claims, ignore model prior knowledge and use only
  dated facts supported by the raw source material.

FIELDS (all required except topics/confidence)
- subject: the specific entity/concept this fact is about, snake_case
  (e.g. "mariana_trench", "python_3_13"). Never the search query
  itself.
- knowledge_category: ONE broad domain - science, technology,
  history, geography, programming, business, health, general, etc.
- type: one of ${KNOWN_KNOWLEDGE_TYPES.join(', ')} - "fact" for
  something well-established, otherwise the hedged type that actually
  fits (see above). This field is mandatory - never omit it.
- key: concise snake_case identity for WHAT property/fact this is
  (e.g. "max_depth", "release_date") - not prefixed with a verb.
- value: the fact itself, concrete and self-contained (should make
  sense read on its own, without the surrounding conversation).
- topics: 2-5 retrieval terms.
- confidence: 0-1, how well-supported this fact is by the source
  material (a single vague snippet should score lower than a fact
  stated plainly and consistently across sources).
- supporting_urls: 1-4 exact Source URL values from the raw material
  that directly support this fact. Never invent or reconstruct a URL.

Return ONLY valid JSON:

{
    "memories": [
        {
            "subject": "snake_case_subject",
            "knowledge_category": "domain",
            "type": "fact",
            "key": "snake_case_key",
            "value": "the concrete fact",
            "topics": ["topic_1", "topic_2"],
            "confidence": 0.9,
            "supporting_urls": ["https://example.com/source"]
        }
    ]
}

If nothing durable was found:

{ "memories": [] }
`;
}

// Phase: defense-in-depth alongside the schema fix above - if a model
// still returns an empty/missing topics array despite the schema now
// requiring it, derive a minimal-but-real set from fields we already
// have rather than silently persisting []. This only kicks in as a
// fallback; a model that complies with the schema never hits this.
function deriveFallbackTopics(m) {
    const candidates = [m.knowledge_category, m.subject, m.key]
        .filter(Boolean)
        .map(t => String(t).trim().toLowerCase().replace(/\s+/g, '_'))
        .filter(Boolean);
    return [...new Set(candidates)];
}

function prepareExtractedMemories(memories, rawResults) {
    const evidenceUrls = new Set(extractSourceUrls(rawResults));
    return (memories || [])
        .filter(m => m && m.key && m.value && m.subject)
        .map(m => {
            const supportingUrls = [...new Set(m.supporting_urls || [])]
                .filter(url => evidenceUrls.has(url));
            if (supportingUrls.length === 0) return null;
            return {
                category: 'knowledge',
                subject: m.subject,
                topics: Array.isArray(m.topics) && m.topics.length > 0
                    ? m.topics
                    : deriveFallbackTopics(m),
                knowledge_category: m.knowledge_category || 'general',
                type: m.type || 'fact',
                key: m.key,
                value: m.value,
                confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
                source: supportingUrls[0],
                source_type: 'web_search'
            };
        })
        .filter(Boolean);
}

async function extractAndSaveFromSearch({ query, summary, rawResults }) {
    if (!hasExtractableContent(summary, rawResults)) {
        return { saved: 0, reason: 'nothing_extractable' };
    }

    try {
        const prompt = buildPrompt(query, summary, rawResults);

        const response = await llmQueue.enqueue(() =>
            modelAdapter.complete(
                [
                    {
                        role: 'system',
                        content:
                            'You are a JSON API. Output ONLY a single valid JSON object - no explanation, no reasoning, no step-by-step work, nothing before or after it.'
                    },
                    {
                        role: 'user',
                        content: `${prompt}\n\n/no_think`
                    }
                ],
                {
                    think: false,
                    temperature: 0.1,
                    maxTokens: 900,
                    format: EXTRACTION_SCHEMA
                }
            )
        );

        const parsed = extractJSON(response);

        if (!parsed || !Array.isArray(parsed.memories) || parsed.memories.length === 0) {
            console.log(
                '[SearchKnowledgeExtractor] Nothing extractable from response:',
                safePreview(response)
            );
            return { saved: 0, reason: 'no_memories_returned' };
        }

        const memories = prepareExtractedMemories(parsed.memories, rawResults);

        if (memories.length === 0) {
            return { saved: 0, reason: 'no_valid_memories' };
        }

        const saveResult = await memoryManager.handleMemoryAction(memories);

        console.log(
            `[SearchKnowledgeExtractor] Query "${query}" -> ${saveResult.action} ` +
            `(${(saveResult.memories || []).length} saved, ${(saveResult.duplicates || []).length} duplicates, ` +
            `${(saveResult.conflicts || []).length} held for review, ` +
            `${(saveResult.ignored || []).length} ignored)`
        );

        return {
            saved: (saveResult.memories || []).length,
            queuedForReview: (saveResult.conflicts || []).filter(item => item.review_id).length,
            duplicates: (saveResult.duplicates || []).length,
            result: saveResult
        };

    } catch (error) {
        console.error('[SearchKnowledgeExtractor] Extraction failed:', error.message);
        return { saved: 0, error: error.message };
    }
}

module.exports = {
    extractAndSaveFromSearch,
    EXTRACTION_SCHEMA,
    hasExtractableContent,
    prepareExtractedMemories
};
