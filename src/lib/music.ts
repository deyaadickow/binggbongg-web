// The music chosen for an editor video, a Text post or a Photo slideshow: the sound row, its
// decoded samples (exact start times, and the beat finder needs them) and its beats.
import { useCallback, useState } from "react";
import { mediaUrl, type Sound } from "./api";
import { detectBeats, loadAudioBuffer } from "./videoKit";

export interface Music { sound: Sound; buffer: AudioBuffer; beats: number[]; period: number; bpm: number }

export function useMusic() {
  const [music, setMusic] = useState<Music | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const choose = useCallback(async (sound: Sound) => {
    if (!sound.sound) return;
    setLoading(true);
    setError("");
    try {
      const ac = new OfflineAudioContext(2, 44100, 44100);
      const buffer = await loadAudioBuffer(ac, mediaUrl(sound.sound));
      const { beats, period, bpm } = detectBeats(buffer);
      setMusic({ sound, buffer, beats, period, bpm });
    } catch {
      setError("That sound couldn't be loaded. Please pick another.");
    } finally {
      setLoading(false);
    }
  }, []);
  const clear = useCallback(() => setMusic(null), []);
  return { music, loading, error, choose, clear };
}

/** Start `buf` in `ac` going only into `dest` (never the speakers), at `offset` seconds. */
export function startMusic(ac: AudioContext, buf: AudioBuffer, dest: AudioNode, volume = 1, fadeOutAt?: number): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = volume;
  if (fadeOutAt && fadeOutAt > 1) {
    g.gain.setValueAtTime(volume, ac.currentTime + fadeOutAt - 0.8);
    g.gain.linearRampToValueAtTime(0, ac.currentTime + fadeOutAt);
  }
  src.connect(g);
  g.connect(dest);
  src.start();
  return src;
}
