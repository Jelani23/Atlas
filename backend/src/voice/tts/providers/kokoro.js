// backend/src/voice/tts/providers/kokoro.js
const fs = require('fs');

const GRADIO_URL = "http://localhost:7860";
const ENDPOINT = "/gradio_api/call/generate_speech";

async function synthesize(text, options = {}) {
    const voice = options.voice || process.env.TTS_VOICE || 'af_heart';
    const speed = options.speed || Number(process.env.TTS_SPEED) || 1.0;

    // Step 1: POST to start generation
    const postRes = await fetch(`${GRADIO_URL}${ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [text, voice, speed] })
    });

    if (!postRes.ok) throw new Error(`Kokoro POST failed: ${postRes.status}`);
    
    const postData = await postRes.json();
    const eventId = postData.event_id;
    if (!eventId) throw new Error("Kokoro did not return an event_id");

    // Step 2: GET to stream the result
    const getRes = await fetch(`${GRADIO_URL}${ENDPOINT}/${eventId}`);
    if (!getRes.ok || !getRes.body) throw new Error(`Kokoro GET failed: ${getRes.status}`);

    const reader = getRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let audioPath = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonString = line.slice(6).trim();
                if (jsonString === '' || jsonString === 'null') continue;
                
                try {
                    const jsonData = JSON.parse(jsonString);
                    if (Array.isArray(jsonData)) {
                        const audioData = jsonData.find(item => item && typeof item === 'object' && item.path);
                        if (audioData && !audioPath) {
                            audioPath = audioData.path;
                        }
                    }
                } catch (e) {}
            }
        }
    }

    if (!audioPath) throw new Error("Did not find audio path in Kokoro response");

    // Step 3: Read from local disk
    if (!fs.existsSync(audioPath)) throw new Error(`Kokoro audio file not found at: ${audioPath}`);
    
    const audioBuffer = fs.readFileSync(audioPath);
    return {
        buffer: audioBuffer,
        format: 'wav'
    };
}

module.exports = { synthesize };