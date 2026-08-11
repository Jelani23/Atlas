// backend/src/voice/tts/ttsManager.js
const ttsQueue = require('./ttsQueue');
const { createTtsAdapter } = require('./ttsAdapter');
const config = require('./ttsConfig');

const adapter = createTtsAdapter();
let isHealthy = config.enabled;

async function checkHealth() {
    if (!config.enabled) {
        isHealthy = false;
        return { available: false, reason: 'TTS_DISABLED' };
    }

    if (!adapter.healthCheck) {
        isHealthy = true; // Fallback if provider doesn't implement it
        return { available: true, provider: config.provider };
    }

    const result = await adapter.healthCheck();
    isHealthy = result.available;
    
    if (isHealthy) {
        console.log(`[TTS Manager] Provider ${config.provider} is healthy.`);
    } else {
        console.warn(`[TTS Manager] Provider ${config.provider} unavailable: ${result.error || 'Unknown error'}`);
    }
    
    return result;
}

function markUnhealthy() {
    if (isHealthy) {
        console.warn(`[TTS Manager] Synthesis failed. Marking ${config.provider} as unhealthy until next health check.`);
        isHealthy = false;
    }
}

function enqueue(text, options = {}) {
    if (!config.enabled || !isHealthy) return;
    ttsQueue.enqueue(text, options);
}

function stop() {
    ttsQueue.stop();
}

module.exports = { enqueue, stop, checkHealth, markUnhealthy, isHealthy: () => isHealthy };