let context: AudioContext | null = null;

function getContext() {
  if (typeof window === "undefined") return null;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function note(frequency: number, duration: number, at: number, volume: number, wave: OscillatorType = "sine") {
  const audio = getContext();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

export function unlockTrailAudio() { getContext(); }

export function playLanding(score = 0.7) {
  const audio = getContext();
  if (!audio) return;
  const pitch = [261.63, 293.66, 329.63, 392, 440, 523.25][Math.min(5, Math.max(0, Math.floor(score * 6)))]!;
  note(pitch, 0.28, audio.currentTime, 0.055);
}

export function playSnap() {
  const audio = getContext();
  if (!audio) return;
  note(130.81, 0.22, audio.currentTime, 0.08, "triangle");
  note(65.41, 0.3, audio.currentTime + 0.04, 0.035, "sawtooth");
}

export function replayTrailMelody(scores: (number | null)[]) {
  const audio = getContext();
  if (!audio) return;
  scores.forEach((score, index) => {
    const value = score ?? 0.5;
    const pitch = [261.63, 293.66, 329.63, 392, 440, 523.25][Math.min(5, Math.max(0, Math.floor(value * 6)))]!;
    note(pitch, 0.35, audio.currentTime + index * 0.36, 0.055);
  });
}
