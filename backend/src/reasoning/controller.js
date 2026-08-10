// backend/src/reasoning/controller.js

const ReasoningPolicies = {
    NONE: 'NONE',
    LIGHT: 'LIGHT',
    DEEP: 'DEEP'
};

function getReasoningOptions(intent) {
    // 8G.2: Establish Reasoning Policy Architecture
    // Default to NONE to prevent unnecessary 8-second thinking delays on simple chat.
    let policy = ReasoningPolicies.NONE;

    // Use the resolved intent to determine the required depth
    const intentType = intent.intent || 'conversation';
    
    if (intentType === 'coding' || intentType === 'planning') {
        // Complex tasks require deep reasoning
        policy = ReasoningPolicies.DEEP;
    } else if (intentType === 'search' || intentType === 'memory') {
        // Search and memory might need a tiny bit of logic to format the answer
        policy = ReasoningPolicies.LIGHT;
    } else if (intentType === 'action') {
        // Actions are usually just executing a tool and reporting back
        policy = ReasoningPolicies.NONE;
    }

    switch (policy) {
        case ReasoningPolicies.DEEP:
            return { policy, think: true, temperature: 0.7 };
        case ReasoningPolicies.LIGHT:
            return { policy, think: true, temperature: 0.5 };
        case ReasoningPolicies.NONE:
        default:
            // think: false tells Ollama to suppress the <think> block entirely
            return { policy, think: false, temperature: 0.3 };
    }
}

module.exports = { getReasoningOptions, ReasoningPolicies };