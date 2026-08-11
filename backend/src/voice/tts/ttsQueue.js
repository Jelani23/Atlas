// backend/src/voice/tts/ttsQueue.js
const { createTtsAdapter } = require('./ttsAdapter');
const { eventBus } = require('../../events/eventBus');
const EventTypes = require('../../events/eventTypes');

class TtsQueue {
    constructor() {
        this.adapter = null;
        this.queue = [];
        this.processing = false;
        this.currentRequestId = null;
        this.cancelledRequests = new Set();
    }

    getAdapter() {
        if (!this.adapter) {
            this.adapter = createTtsAdapter();
        }
        return this.adapter;
    }

    enqueue(text, { requestId }) {
        const isEnabled = process.env.TTS_ENABLED === 'true';
        if (!isEnabled || !text || text.trim() === '') return;

        // Phase 11.6: If this request was interrupted, drop the chunk silently
        if (this.cancelledRequests.has(requestId)) return;

        this.currentRequestId = requestId;
        this.queue.push({ text, requestId });
        
        if (!this.processing) {
            this.process();
        }
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            
            if (item.requestId !== this.currentRequestId) continue;

            try {
                console.log(`[TTSQueue] Synthesizing: "${item.text.substring(0, 30)}..."`);
                const result = await this.getAdapter().synthesize(item.text);
                
                if (item.requestId === this.currentRequestId && result) {
                    const audioBase64 = `data:audio/${result.format};base64,${result.buffer.toString('base64')}`;
                    eventBus.emit(EventTypes.TTS_AUDIO_CHUNK, { 
                        requestId: item.requestId, 
                        audio: audioBase64 
                    });
                } else {
                    console.log(`[TTSQueue] Synthesis completed for stale request ${item.requestId}, discarding.`);
                }
            } catch (error) {
                console.error(`[TTSQueue] Synthesis failed:`, error.message);
                const ttsManager = require('./ttsManager'); 
                ttsManager.markUnhealthy();
                this.queue = this.queue.filter(item => item.requestId !== this.currentRequestId);
            }
        }
        
        this.processing = false;
    }

    // Phase 11.6: Updated stop method to permanently blacklist a requestId
    stop(requestId = null) {
        if (requestId) {
            this.cancelledRequests.add(requestId);
            console.log(`[TTSQueue] Request ${requestId} permanently cancelled.`);
            
            // Clean up old requests to prevent memory leak
            if (this.cancelledRequests.size > 10) {
                const arr = Array.from(this.cancelledRequests);
                this.cancelledRequests = new Set(arr.slice(-5));
            }
        }
        this.queue = [];
        this.currentRequestId = null;
        console.log('[TTSQueue] Queue cleared.');
    }
}

module.exports = new TtsQueue();