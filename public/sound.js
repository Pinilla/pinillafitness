const CUES = {
  countdown: () => beep(520, 0, 0.08),
  hold: () => {
    beep(660, 0, 0.6);
    vibrate([400]);
  },
  next: () => beeps(2),
  done: () => beeps(3),
};

let context = null;

export function unlockSound() {
  context ??= new AudioContext();
  if (context.state === "suspended") {
    context.resume();
  }
}

export function playCue(cue) {
  CUES[cue]();
}

function beeps(count) {
  for (let index = 0; index < count; index++) {
    beep(880, index * 0.25, 0.18);
  }
  vibrate(Array.from({ length: count * 2 - 1 }, () => 150));
}

function beep(frequency, startSeconds, lengthSeconds) {
  if (!context) {
    return;
  }
  const start = context.currentTime + startSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.25, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + lengthSeconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + lengthSeconds);
}

function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}
