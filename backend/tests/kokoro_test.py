# tests/kokoro_test.py
import time
import soundfile as sf
from kokoro import KPipeline

def main():
    print("Loading Kokoro pipeline...")
    start_time = time.time()
    
    # Initialize pipeline (defaults to English 'a' = American English)
    pipeline = KPipeline(lang='a')
    
    load_time = time.time() - start_time
    print(f"Pipeline loaded in {load_time:.2f}s")

    text = "Hello Jelani. I am Alice, your personal AI companion running on the Atlas operating system."
    voice = "af_heart"
    
    print(f"Generating audio for voice '{voice}'...")
    gen_start = time.time()
    
    # Generate audio
    generator = pipeline(text, voice=voice)
    
    # Kokoro returns a generator of audio chunks
    audio_chunks = []
    for _, _, audio in generator:
        audio_chunks.append(audio)
        
    # Combine chunks (if text was split into multiple sentences)
    import numpy as np
    final_audio = np.concatenate(audio_chunks) if len(audio_chunks) > 1 else audio_chunks[0]
    
    gen_time = time.time() - gen_start
    print(f"Audio generated in {gen_time:.2f}s")

    # Save to WAV file
    output_path = "tests/kokoro_test_output.wav"
    sf.write(output_path, final_audio, 24000)
    print(f"Audio saved to {output_path}")

if __name__ == "__main__":
    main()