import os
import subprocess
import numpy as np
import wave
import struct

def generate_background_music(output_wav_path, duration_sec=32, sample_rate=44100):
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    
    chord_duration = 4.0
    num_chords = int(duration_sec / chord_duration)
    
    audio = np.zeros_like(t)
    
    chords = [
        [220.0, 261.63, 329.63, 392.00],   # Am7
        [174.61, 220.00, 261.63, 329.63],  # Fmaj7
        [130.81, 164.81, 196.00, 246.94],  # Cmaj7
        [196.00, 246.94, 293.66, 349.23],  # G7
    ]
    
    bass_notes = [110.0, 87.31, 65.41, 98.0]
    
    bpm = 120
    beat_dur = 60.0 / bpm
    sixteenth_dur = beat_dur / 4.0
    
    for i in range(num_chords):
        c_idx = i % len(chords)
        start_t = i * chord_duration
        end_t = (i + 1) * chord_duration
        mask = (t >= start_t) & (t < end_t)
        local_t = t[mask] - start_t
        
        pad = np.zeros_like(local_t)
        for freq in chords[c_idx]:
            pad += 0.08 * np.sin(2 * np.pi * freq * local_t)
            pad += 0.03 * np.sin(2 * np.pi * freq * 2 * local_t)
            pad += 0.01 * np.sin(2 * np.pi * freq * 3 * local_t)
        
        env = np.ones_like(local_t)
        attack_len = int(sample_rate * 0.4)
        release_len = int(sample_rate * 0.4)
        if len(env) > attack_len + release_len:
            env[:attack_len] = np.linspace(0, 1, attack_len)
            env[-release_len:] = np.linspace(1, 0, release_len)
        
        audio[mask] += pad * env
        
        bass_freq = bass_notes[c_idx]
        bass = 0.18 * np.sin(2 * np.pi * bass_freq * local_t) + 0.05 * np.sin(2 * np.pi * bass_freq * 2 * local_t)
        audio[mask] += bass
        
    arp_notes = [440.0, 523.25, 659.25, 783.99, 880.0, 1046.50]
    for step in range(int(duration_sec / sixteenth_dur)):
        step_start = step * sixteenth_dur
        step_end = (step + 1) * sixteenth_dur
        mask = (t >= step_start) & (t < step_end)
        local_t = t[mask] - step_start
        note_freq = arp_notes[step % len(arp_notes)]
        pluck_env = np.exp(-local_t * 28.0)
        pluck = 0.07 * np.sin(2 * np.pi * note_freq * local_t) * pluck_env
        audio[mask] += pluck

    for beat in range(int(duration_sec / beat_dur)):
        b_start = beat * beat_dur
        b_end = min(b_start + 0.25, duration_sec)
        mask = (t >= b_start) & (t < b_end)
        local_t = t[mask] - b_start
        kick_freq = 150.0 * np.exp(-local_t * 30.0) + 45.0
        kick_env = np.exp(-local_t * 18.0)
        kick = 0.22 * np.sin(2 * np.pi * kick_freq * local_t) * kick_env
        audio[mask] += kick

    master_fade_in = int(sample_rate * 1.5)
    master_fade_out = int(sample_rate * 2.0)
    audio[:master_fade_in] *= np.linspace(0, 1, master_fade_in)
    audio[-master_fade_out:] *= np.linspace(1, 0, master_fade_out)

    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = (audio / max_val) * 0.85

    audio_int16 = (audio * 32767).astype(np.int16)
    with wave.open(output_wav_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_int16.tobytes())
    print(f"Generated background music: {output_wav_path}")

def build_video():
    base_dir = os.path.abspath("gig-images")
    img1 = os.path.join(base_dir, "gig-image-1.jpg")
    img2 = os.path.join(base_dir, "gig-image-2.jpg")
    img3 = os.path.join(base_dir, "gig-image-3.jpg")
    img4 = os.path.join(base_dir, "gig-image-4.jpg")
    
    wav_path = os.path.join(base_dir, "audio.wav")
    output_mp4 = os.path.join(base_dir, "fiverr-gig-video.mp4")
    
    slide_dur = 8.5
    total_dur = 31.0
    generate_background_music(wav_path, duration_sec=total_dur)
    
    fps = 30
    frames_per_slide = int(slide_dur * fps)
    
    filter_complex = (
        f"[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0008,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames_per_slide}:s=1920x1080:fps={fps}[v0]; "
        f"[1:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0006,1.15)':x='(in/255)*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d={frames_per_slide}:s=1920x1080:fps={fps}[v1]; "
        f"[2:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.15-0.0006*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames_per_slide}:s=1920x1080:fps={fps}[v2]; "
        f"[3:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0007,1.2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames_per_slide}:s=1920x1080:fps={fps}[v3]; "
        f"[v0][v1]xfade=transition=fade:duration=1:offset=7.5[xf0]; "
        f"[xf0][v2]xfade=transition=fade:duration=1:offset=15.0[xf1]; "
        f"[xf1][v3]xfade=transition=fade:duration=1:offset=22.5[vfinal]"
    )
    
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-t", str(slide_dur), "-i", img1,
        "-loop", "1", "-t", str(slide_dur), "-i", img2,
        "-loop", "1", "-t", str(slide_dur), "-i", img3,
        "-loop", "1", "-t", str(slide_dur), "-i", img4,
        "-i", wav_path,
        "-filter_complex", filter_complex,
        "-map", "[vfinal]",
        "-map", "4:a",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(fps),
        "-b:v", "3500k",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_mp4
    ]
    
    print("Running FFmpeg rendering pipeline...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("FFmpeg error:", result.stderr)
        return False
    
    file_size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
    print(f"Video created successfully: {output_mp4}")
    print(f"File size: {file_size_mb:.2f} MB (Fiverr limit is 50 MB)")
    return True

if __name__ == "__main__":
    build_video()
