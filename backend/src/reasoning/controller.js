// backend/src/reasoning/controller.js
//
// qwen3:4b always performs a reasoning pass. Atlas therefore uses one
// generation contract for every user-facing response: native Ollama thinking
// stays enabled so reasoning arrives on the dedicated `thinking` channel and
// only `content` is eligible for UI/TTS output. Trying to create a "fast"
// think:false path moved the scratchpad into visible content; constraining that
// path with JSON grammar then made the first planning sentence look like the
// answer. Both behaviours are model-level, so routing between them is not a
// reliable latency optimization.

const ReasoningPolicies = {
    NONE: 'NONE',
    LIGHT: 'LIGHT',
    DEEP: 'DEEP'
};

// num_predict is shared by Qwen's thinking and visible answer. These limits
// leave enough room for the model to finish its unavoidable reasoning pass.
// Prompt/retrieval size is controlled separately by contextBuilder and
// contextManager; token starvation must never be used as a thinking control.
const POLICY_OPTIONS = {
    [ReasoningPolicies.NONE]: { think: true, temperature: 0.25, maxTokens: 1800 },
    [ReasoningPolicies.LIGHT]: { think: true, temperature: 0.35, maxTokens: 2400 },
    [ReasoningPolicies.DEEP]: { think: true, temperature: 0.55, maxTokens: 4096 }
};

function needsSynthesis(userInput) {
    return /^\s*(?:briefly\s+)?(?:explain|compare|contrast|summarize|analyze|evaluate)\b/i.test(userInput || '') ||
        /\b(?:difference between|pros and cons|why does|why is|how does|how do)\b/i.test(userInput || '');
}

function baselinePolicy(intentType) {
    if (intentType === 'coding' || intentType === 'planning') {
        return ReasoningPolicies.DEEP;
    }
    if (intentType === 'search' || intentType === 'memory') {
        return ReasoningPolicies.LIGHT;
    }
    return ReasoningPolicies.NONE;
}

function refineWithSemantics(policy, semanticProfile) {
    if (!semanticProfile) return policy;

    const reasoningRequired = semanticProfile.reasoningRequired;
    const ambiguous = semanticProfile.ambiguous === true;

    if (policy === ReasoningPolicies.NONE && (ambiguous || reasoningRequired === 'high')) {
        return ReasoningPolicies.LIGHT;
    }
    if (policy === ReasoningPolicies.LIGHT) {
        if (reasoningRequired === 'high' || ambiguous) return ReasoningPolicies.DEEP;
        if (reasoningRequired === 'low' && !ambiguous) return ReasoningPolicies.NONE;
    }
    return policy;
}

function getReasoningOptions(intent, semanticProfile, userInput = '') {
    const intentType = (intent && intent.intent) || 'conversation';
    let policy = refineWithSemantics(baselinePolicy(intentType), semanticProfile);
    if (policy === ReasoningPolicies.NONE && needsSynthesis(userInput)) {
        policy = ReasoningPolicies.LIGHT;
    }
    return { policy, ...POLICY_OPTIONS[policy] };
}

module.exports = {
    getReasoningOptions,
    needsSynthesis,
    ReasoningPolicies
};
