// backend/src/voice/tts/ttsManager.js
const ttsQueue = require('./ttsQueue');

// Pass text to the queue to be synthesized in the background
function enqueue(text, options = {}) {
    ttsQueue.enqueue(text, options);
}

// Clear the queue (used later for interruption)
function stop() {
    ttsQueue.stop();
}

module.exports = { enqueue, stop };