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

        // Assign the current request ID (used for cancellation later)
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
            
            // If a stop() invalidated this request, skip remaining items
            if (item.requestId !== this.currentRequestId) continue;

            try {
                console.log(`[TTSQueue] Synthesizing: "${item.text.substring(0, 30)}..."`);
                const result = await this.getAdapter().synthesize(item.text);
                
                if (result) {
                    const audioBase64 = `data:audio/${result.format};base64,${result.buffer.toString('base64')}`;
                    // Emit chunk to the UI immediately
                    eventBus.emit(EventTypes.TTS_AUDIO_CHUNK, { 
                        requestId: item.requestId, 
                        audio: audioBase64 
                    });
                }
            } catch (error) {
                console.error(`[TTSQueue] Synthesis failed:`, error.message);
            }
        }
        
        this.processing = false;
    }

    // Phase 10G: Stop/cancel plumbing
    stop() {
        this.queue = [];
        this.currentRequestId = null; // Invalidate current processing
        console.log('[TTSQueue] Queue cleared.');
    }
}

module.exports = new TtsQueue();