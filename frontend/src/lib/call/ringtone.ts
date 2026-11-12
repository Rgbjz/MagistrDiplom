'use client';

type AudioContextCtor = typeof AudioContext;

/**
 * Ring / ringback tone synthesized with WebAudio (no audio files).
 * Returns a stop function. Browsers may block audio before the first user
 * gesture — then it simply stays silent.
 */
export function startTone(kind: 'incoming' | 'outgoing'): () => void {
  const Ctor: AudioContextCtor | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
      : undefined;
  if (!Ctor) return () => {};
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return () => {};
  }
  void ctx.resume().catch(() => {});

  const beep = (freqs: number[], start: number, length: number, volume: number) => {
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.03);
      gain.gain.setValueAtTime(volume, start + length - 0.05);
      gain.gain.linearRampToValueAtTime(0, start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + length + 0.02);
    }
  };

  const play = () => {
    const t = ctx.currentTime + 0.05;
    if (kind === 'incoming') {
      beep([523.25, 659.25], t, 0.35, 0.06);
      beep([587.33, 739.99], t + 0.45, 0.35, 0.06);
    } else {
      beep([440, 480], t, 1.2, 0.035);
    }
  };
  play();
  const timer = window.setInterval(play, kind === 'incoming' ? 2000 : 4000);

  return () => {
    window.clearInterval(timer);
    void ctx.close().catch(() => {});
  };
}
