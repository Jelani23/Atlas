// backend/src/memory/memoryEligibility.js

const SIGNALS = {
    explicit_memory: {
        weight: 5,
        phrases: ['remember', 'don\'t forget', 'keep in mind', 'from now on', 'note that']
    },
    identity: {
        weight: 5,
        phrases: ['my name', 'i live', 'my birthday', 'i am', 'i\'m', 'my favorite', 'i usually']
    },
    preference: {
        weight: 4,
        phrases: ['i prefer', 'i like', 'i hate', 'i love', 'i enjoy', 'i dislike']
    },
    state_change: {
        weight: 4,
        phrases: ['currently', 'right now', 'i\'m working on', 'we\'re working on', 'switch to', 'move to', 'go back to', 'the current', 'we\'re on']
    },
    decision: {
        weight: 4,
        phrases: ['let\'s use', 'we\'ll use', 'we decided', 'i decided', 'let\'s go with', 'the plan is', 'we\'re going to']
    },
    project_reference: {
        weight: 2,
        phrases: ['atlas', 'bindex', 'project', 'subsynq'] // Add more project names here as they exist
    }
};

const THRESHOLD = 4; // Minimum score to be considered eligible

function checkEligibility(message) {
    if (!message) return { eligible: false, score: 0, reason: 'Empty message' };
    
    const lowerMsg = message.toLowerCase();
    let score = 0;
    const matchedSignals = [];

    for (const [signalName, config] of Object.entries(SIGNALS)) {
        for (const phrase of config.phrases) {
            if (lowerMsg.includes(phrase)) {
                score += config.weight;
                matchedSignals.push(signalName);
                break; // Only count each signal category once
            }
        }
    }

    // Simple heuristic: questions are rarely memories
    if (lowerMsg.includes('?') && score < 6) {
        return { eligible: false, score, reason: 'Question with low confidence' };
    }

    const eligible = score >= THRESHOLD;
    return {
        eligible,
        score,
        reason: eligible ? 'Matched memory signals' : 'Below threshold',
        matchedSignals
    };
}

module.exports = { checkEligibility };