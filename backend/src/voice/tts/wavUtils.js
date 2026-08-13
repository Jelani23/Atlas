// backend/src/voice/tts/wavUtils.js
// Minimal RIFF/WAVE chunk scanner. Only used to figure out how many
// seconds a synthesized chunk actually plays for, so the phoneme-timeline
// estimator (see phonemeEstimator.js) can scale its estimated timings to
// match real audio instead of guessing from text length alone.

/**
 * Returns the duration in seconds of a WAV buffer, or null if it can't be
 * parsed (caller should treat that as "no timeline data" rather than throw
 * — a failed duration guess should never break audio playback).
 */
function getWavDurationSeconds(buffer) {
    try {
        if (!buffer || buffer.length < 44) return null;
        if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
            return null;
        }

        let offset = 12;
        let sampleRate = null;
        let channels = null;
        let bitsPerSample = null;
        let dataBytes = null;

        while (offset + 8 <= buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            const chunkStart = offset + 8;

            if (chunkId === 'fmt ') {
                channels = buffer.readUInt16LE(chunkStart + 2);
                sampleRate = buffer.readUInt32LE(chunkStart + 4);
                bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
            } else if (chunkId === 'data') {
                dataBytes = chunkSize;
            }

            // Chunks are word-aligned (padded to even byte count).
            offset = chunkStart + chunkSize + (chunkSize % 2);
        }

        if (!sampleRate || !channels || !bitsPerSample || !dataBytes) return null;

        const bytesPerSample = bitsPerSample / 8;
        const frames = dataBytes / (bytesPerSample * channels);
        const seconds = frames / sampleRate;
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } catch (e) {
        return null;
    }
}

module.exports = { getWavDurationSeconds };
