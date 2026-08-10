// backend/src/reasoning/controller.js

const ReasoningPolicies = {
    NONE: 'NONE',
    LIGHT: 'LIGHT',
    DEEP: 'DEEP'
};

function getReasoningOptions(intent) {
    let policy = ReasoningPolicies.NONE;
    const intentType = intent.intent || 'conversation';
    
    if (intentType === 'coding' || intentType === 'planning') {
        policy = ReasoningPolicies.DEEP;
    } else if (intentType === 'search' || intentType === 'memory') {
        policy = ReasoningPolicies.LIGHT;
    } else if (intentType === 'action') {
        policy = ReasoningPolicies.NONE;
    }

    switch (policy) {
        case ReasoningPolicies.DEEP:
            return { policy, think: true, temperature: 0.7 };
        case ReasoningPolicies.LIGHT:
            return { policy, think: true, temperature: 0.5 };
        case ReasoningPolicies.NONE:
        default:
            return { policy, think: true, temperature: 0.3 };
    }
}

module.exports = { getReasoningOptions, ReasoningPolicies };