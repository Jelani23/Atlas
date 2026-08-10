# backend/src/voice/stt/providers/faster_whisper_runner.py
import sys
import json
import argparse
import io
import os
import tempfile

# Prevent Python from outputting unnecessary logs to stdout
import logging
logging.disable(logging.CRITICAL)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='small')
    parser.add_argument('--language', type=str, default='en')
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
        
        # Load model (can be 'tiny', 'base', 'small', 'medium', 'large-v3')
        # device='cuda' uses your RTX 3060 Ti, compute_type='int8' or 'float16' is fastest
        model = WhisperModel(args.model, device="cuda", compute_type="int8_float16")
        
        # Read audio buffer from stdin
        audio_data = sys.stdin.buffer.read()
        
        # Save to a temp file because faster-whisper expects a file path or numpy array
        # For V1, writing to a temp file is the most robust approach
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            temp_audio.write(audio_data)
            temp_path = temp_audio.name

        # Transcribe
        segments, info = model.transcribe(temp_path, language=args.language, beam_size=5)
        
        # Collect segments
        text = " ".join([segment.text for segment in segments])
        
        # Clean up temp file
        os.remove(temp_path)
        
        # Output JSON to stdout
        result = {
            "text": text,
            "language": info.language,
            "duration": info.duration
        }
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()