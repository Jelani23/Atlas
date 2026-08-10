// tests/kokoroApiTest.js
const fs = require('fs');
const path = require('path');

const GRADIO_URL = "http://localhost:7860";
const ENDPOINT = "/gradio_api/call/generate_speech";

async function testKokoro() {
    console.log("🚀 STARTING KOKORO API TEST\n");
    
    const text = "Hello Jelani. I am Alice, your personal AI companion running on the Atlas operating system.";
    const voice = "af_heart"; // Standard female voice
    const speed = 1.0;

    // Step 1: POST request to start generation and get Event ID
    console.log(`Sending text to Kokoro: "${text}"`);
    const postRes = await fetch(`${GRADIO_URL}${ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: [text, voice, speed]
        })
    });

    if (!postRes.ok) {
        console.error(`❌ POST request failed: ${postRes.status} ${postRes.statusText}`);
        const errText = await postRes.text();
        console.error(errText);
        process.exit(1);
    }

    const postData = await postRes.json();
    const eventId = postData.event_id;

    if (!eventId) {
        console.error("❌ Did not receive event_id from Gradio.");
        console.error(postData);
        process.exit(1);
    }

    console.log(`Generation queued. Event ID: ${eventId}`);

    // Step 2: GET request to stream the result
    console.log("Waiting for generation to complete...");
    const getRes = await fetch(`${GRADIO_URL}${ENDPOINT}/${eventId}`);

    if (!getRes.ok || !getRes.body) {
        console.error(`❌ GET request failed: ${getRes.status}`);
        process.exit(1);
    }

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
                    
                    // Gradio returns an array like [progress, { audio_data }]
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

    if (!audioPath) {
        console.error("❌ Did not find audio path in Gradio response.");
        process.exit(1);
    }

    console.log("Audio generated! Reading from local disk:", audioPath);

    // Step 3: Read the audio file directly from the local file system
    if (!fs.existsSync(audioPath)) {
        console.error(`❌ Audio file not found at path: ${audioPath}`);
        process.exit(1);
    }

    const bufferData = fs.readFileSync(audioPath);

    const outputPath = path.join(__dirname, 'kokoro_test_output.wav');
    fs.writeFileSync(outputPath, bufferData);

    console.log('\n=========================================');
    console.log('📊 KOKORO API TEST COMPLETE');
    console.log('=========================================');
    console.log(`Audio saved to: ${outputPath}`);
    console.log(`File size: ${(bufferData.length / 1024).toFixed(2)} KB`);
    console.log('=========================================\n');
}

testKokoro().catch(err => {
    console.error("❌ Test failed with error:", err);
    process.exit(1);
});