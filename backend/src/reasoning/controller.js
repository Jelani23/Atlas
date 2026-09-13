// backend/src/reasoning/controller.js
//
// Only content that passes the response filters is eligible for UI/TTS output.
// Legacy Qwen 3 needed native thinking enabled to keep its scratchpad out of
// visible content. The installed qwen3.5:4b honors native think:false: isolated
// conversation regressions pass without the reasoning-budget exhaustion seen
// with think:true. Keep the legacy contract for models we have not validated.

const ReasoningPolicies = {
    NONE: 'NONE',
    LIGHT: 'LIGHT',
    DEEP: 'DEEP'
};

// num_predict is shared by Qwen's thinking and visible answer. These limits
// leave enough room for the model to finish its enabled reasoning pass.
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

function getReasoningOptions(intent, semanticProfile, userInput = '', modelName = null) {
    const intentType = (intent && intent.intent) || 'conversation';
    let policy = refineWithSemantics(baselinePolicy(intentType), semanticProfile);
    if (policy === ReasoningPolicies.NONE && needsSynthesis(userInput)) {
        policy = ReasoningPolicies.LIGHT;
    }
    const options = { policy, ...POLICY_OPTIONS[policy] };
    if (modelName === 'qwen3.5:4b') options.think = false;
    return options;
}

module.exports = {
    getReasoningOptions,
    needsSynthesis,
    ReasoningPolicies
};
