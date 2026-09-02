const {
    formatTrustedKnowledge,
    formatProvisionalKnowledge
} = require('../memory/knowledgeRecall');

function classifyUserNote(input) {
    const text = String(input || '').trim();
    if (!text || /\?$/.test(text)) return null;

    if (/\b(?:still need to|need to (?:determine|decide|verify|validate|figure out)|remains? (?:unresolved|to be))\b/i.test(text)) {
        return 'open_loop';
    }

    if (/\b(?:we|i)\s+(?:have\s+)?(?:decided|agreed|selected|chose|prefer)\b/i.test(text)) {
        return 'decision';
    }

    if (/\bi want to (?!know\b|ask\b|understand\b|hear\b|see\b|find out\b)/i.test(text) ||
        /\bi want (?:us|you|alice|atlas|the system)\b/i.test(text)) {
        return 'decision';
    }

    if (/\b(?:should|shouldn't|should not|must|mustn't|must not)\b/i.test(text)) {
        return 'policy';
    }

    return null;
}

function resolveUserNoteReply(input) {
    const type = classifyUserNote(input);
    if (!type) return null;

    if (type === 'open_loop') {
        return "Understood. I'll keep that as unresolved work rather than assume the behavior already exists.";
    }

    if (type === 'policy') {
        return "Understood. I'll treat that as a policy requirement, not as something already implemented.";
    }

    return "Understood. I'll treat that as the current decision, not as proof that the implementation already exists.";
}

function isImplementationQuestion(input) {
    const text = String(input || '').trim();
    const question = /\?$/.test(text) || /^(?:does|do|is|are|has|have|can|what|which|tell me whether)\b/i.test(text);
    const systemArea = /\b(?:database|schema|table|column|field|implementation|implemented|runtime|workflow|automation)\b/i.test(text);
    const stateCheck = /\b(?:current|currently|already|store|track|contain|include|implemented|exist|support)\b/i.test(text);
    return question && systemArea && stateCheck;
}

const IMPLEMENTATION_EVIDENCE_TOOLS = new Set([
    'read_code',
    'readCode',
    'searchCode',
    'fileExists',
    'checkSyntax'
]);

function hasImplementationEvidence({ toolName = null, toolResult = null } = {}) {
    if (!IMPLEMENTATION_EVIDENCE_TOOLS.has(toolName)) return false;
    const result = String(toolResult || '');
    return !!result && !/^(?:error:|tool execution failed:)/i.test(result);
}

function resolveImplementationBoundaryReply(input, evidence = {}) {
    if (!isImplementationQuestion(input) || hasImplementationEvidence(evidence)) return null;
    return "I can't confirm that from verified implementation evidence in this turn. Stored memories and prior discussion aren't enough to establish the current schema or runtime behavior.";
}

function isTrustedKnowledgeQuestion(input) {
    const text = String(input || '').trim();
    const question = /\?$/.test(text) || /^(?:what|which|do|does|is|are|tell me)\b/i.test(text);
    const trustedSource = /\b(?:trusted|verified)\s+(?:stored\s+)?knowledge\b|\bstored knowledge\b|\bknowledge library\b/i.test(text);
    return question && trustedSource;
}

function resolveTrustedKnowledgeBoundaryReply(input, relevantMemory = {}) {
    if (!isTrustedKnowledgeQuestion(input)) return null;
    const trustedReply = formatTrustedKnowledge(relevantMemory.knowledge || []);
    if (trustedReply) return trustedReply;

    const provisionalReply = formatProvisionalKnowledge(
        relevantMemory.quarantinedKnowledge || [],
        input
    );
    if (provisionalReply) return provisionalReply;

    if (/\bwithout\s+(?:using|searching)(?:\s+the)?\s+web\b/i.test(input)) {
        return "I don't have verified stored knowledge for that request. Since you asked me not to search the web, I can't verify a current answer.";
    }

    return "I don't have verified stored knowledge for that request.";
}

module.exports = {
    classifyUserNote,
    resolveUserNoteReply,
    isImplementationQuestion,
    hasImplementationEvidence,
    resolveImplementationBoundaryReply,
    isTrustedKnowledgeQuestion,
    resolveTrustedKnowledgeBoundaryReply
};
