// backend/src/voice/stt/providers/fasterWhisper.js
const { spawn } = require('child_process');
const path = require('path');

const PYTHON_SCRIPT_PATH = path.join(__dirname, 'faster_whisper_runner.py');

async function transcribe(audioBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const model = options.model || process.env.STT_MODEL || 'small';
    const language = options.language || process.env.STT_LANGUAGE || 'en';
    
    // We pass config via command line arguments
    const python = spawn('python', [PYTHON_SCRIPT_PATH, '--model', model, '--language', language]);
    
    let resultText = '';
    let errorText = '';

    // Log stderr immediately for debugging
    python.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorText += chunk;
      console.error(`[FasterWhisper Python stderr]: ${chunk}`);
    });

    python.stdout.on('data', (data) => {
      resultText += data.toString();
    });

    python.on('error', (err) => {
      console.error(`[FasterWhisper] Failed to spawn Python process:`, err);
      reject(new Error('Failed to start Python STT process. Is Python installed and in PATH?'));
    });

    python.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`STT transcription failed with code ${code}. Error: ${errorText}`));
      }
      
      try {
        const result = JSON.parse(resultText);
        if (result.error) {
          return reject(new Error(`Python script error: ${result.error}`));
        }
        resolve({
          text: result.text.trim(),
          language: result.language,
          duration: result.duration,
          provider: 'faster-whisper'
        });
      } catch (e) {
        reject(new Error(`Failed to parse STT output. Raw output: ${resultText}`));
      }
    });

    // Send the audio buffer to Python via stdin
    python.stdin.on('error', (err) => {
      console.error(`[FasterWhisper] stdin error:`, err);
    });

    python.stdin.write(audioBuffer);
    python.stdin.end();
  });
}

module.exports = { transcribe };