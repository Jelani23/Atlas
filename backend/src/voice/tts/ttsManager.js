// backend/src/voice/tts/ttsManager.js
const ttsQueue = require('./ttsQueue');
const { createTtsAdapter } = require('./ttsAdapter');
const config = require('./ttsConfig');

const adapter = createTtsAdapter();
let isHealthy = config.enabled;
let retryTimer = null;
let healthObservation = { health: 'unknown', checkedAt: null };

// Read-only snapshot: configuration alone must not masquerade as a completed
// health check. Asking about TTS must not start a server or synthesize audio.
function getStatus() {
    return { enabled: config.enabled, provider: config.provider, voice: config.voice,
        ...healthObservation };
}

async function checkHealth() {
    if (!config.enabled) {
        isHealthy = false;
        healthObservation = { health: 'disabled', checkedAt: new Date().toISOString() };
        return { available: false, reason: 'TTS_DISABLED' };
    }

    if (!adapter.healthCheck) {
        isHealthy = true;
        healthObservation = { health: 'unknown', checkedAt: null };
        return { available: true, provider: config.provider };
    }

    const result = await adapter.healthCheck();
    isHealthy = result.available;
    healthObservation = { health: result.available ? 'available' : 'unavailable', checkedAt: new Date().toISOString() };
    
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
    healthObservation = { health: 'unavailable', checkedAt: new Date().toISOString() };
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

module.exports = { enqueue, stop, checkHealth, markUnhealthy, getStatus, isHealthy: () => isHealthy };
