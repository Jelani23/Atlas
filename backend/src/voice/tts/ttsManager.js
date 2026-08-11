// backend/src/voice/tts/ttsManager.js
const ttsQueue = require('./ttsQueue');
const { createTtsAdapter } = require('./ttsAdapter');
const config = require('./ttsConfig');

const adapter = createTtsAdapter();
let isHealthy = config.enabled;
let retryTimer = null;

async function checkHealth() {
    if (!config.enabled) {
        isHealthy = false;
        return { available: false, reason: 'TTS_DISABLED' };
    }

    if (!adapter.healthCheck) {
        isHealthy = true;
        return { available: true, provider: config.provider };
    }

    const result = await adapter.healthCheck();
    isHealthy = result.available;
    
    if (isHealthy) {
        console.log(`[TTS Manager] Provider ${config.provider} is healthy.`);
        // If it was previously failing, clear the retry timer
        if (retryTimer) {
            console.log(`[TTS Manager] Recovered. Stopping background retries.`);
            clearTimeout(retryTimer);
            retryTimer = null;
        }
    } else {
        console.warn(`[TTS Manager] Provider ${config.provider} unavailable: ${result.error || 'Unknown error'}`);
        scheduleRetry();
    }
    
    return result;
}

function scheduleRetry() {
    // Don't schedule multiple retries
    if (retryTimer) return;

    console.log('[TTS Manager] Scheduling background health check retry in 15 seconds...');
    retryTimer = setTimeout(async () => {
        retryTimer = null; // Clear before attempting so we can reschedule if it fails again
        console.log('[TTS Manager] Running background health check...');
        await checkHealth();
    }, 15000); // 15 second interval
}

function markUnhealthy() {
    if (isHealthy) {
        console.warn(`[TTS Manager] Synthesis failed. Marking ${config.provider} as unhealthy until next health check.`);
        isHealthy = false;
        // If synthesis fails mid-stream, start polling in the background to see if it comes back
        scheduleRetry(); 
    }
}

function enqueue(text, options = {}) {
    if (!config.enabled || !isHealthy) return;
    ttsQueue.enqueue(text, options);
}

function stop(requestId = null) {
    ttsQueue.stop(requestId);
}

module.exports = { enqueue, stop, checkHealth, markUnhealthy, isHealthy: () => isHealthy };