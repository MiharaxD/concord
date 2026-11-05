// Room join/leave cues, synthesized on the fly (no audio files): a warm two-note "bloop" that rises when someone
// enters and falls lower when someone leaves. Works on any BaseAudioContext, so tests can render it offline.
const SOUNDS = {
  join: [{ freq: 196, at: 0, length: 0.08, level: 0.5 }, { freq: 293.66, at: 0.07, length: 0.34, level: 1, bend: 1.015 }],
  leave: [{ freq: 220, at: 0, length: 0.18, level: 0.85 }, { freq: 146.83, at: 0.17, length: 0.38, level: 1, bend: 0.95 }]
};
export const ROOM_SOUND_LENGTH = 0.56;

function note(context, output, { freq, at, length, level, bend = 1 }, start) {
  const begin = start + at, end = begin + length, filter = context.createBiquadFilter(), body = context.createGain();
  filter.type = 'lowpass'; filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(2600, begin); filter.frequency.exponentialRampToValueAtTime(700, end);
  body.gain.setValueAtTime(0.0001, begin); body.gain.exponentialRampToValueAtTime(level, begin + 0.006);
  body.gain.exponentialRampToValueAtTime(level * 0.6, begin + 0.07); body.gain.exponentialRampToValueAtTime(level * 0.3, Math.max(begin + 0.08, end - 0.07));
  body.gain.exponentialRampToValueAtTime(0.0001, end);
  filter.connect(body).connect(output);
  // Fundamental plus soft 2nd/3rd harmonics; the bend moves the pitch in the note's tail.
  for (const [multiple, type, gain] of [[1, 'sine', 1], [2, 'triangle', 0.42], [3, 'sine', 0.16]]) {
    const tone = context.createOscillator(), amount = context.createGain();
    tone.type = type; tone.frequency.setValueAtTime(freq * multiple, begin);
    tone.frequency.setValueAtTime(freq * multiple, begin + length * 0.45);
    tone.frequency.exponentialRampToValueAtTime(freq * multiple * bend, end);
    amount.gain.value = gain; tone.connect(amount).connect(filter); tone.start(begin); tone.stop(end + 0.02);
  }
  // Short bright tick on the attack so it reads on small laptop speakers.
  const tick = context.createOscillator(), tickGain = context.createGain();
  tick.type = 'sine'; tick.frequency.setValueAtTime(freq * 5.6, begin);
  tickGain.gain.setValueAtTime(0.0001, begin); tickGain.gain.exponentialRampToValueAtTime(0.12 * level, begin + 0.003);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, begin + 0.03);
  tick.connect(tickGain).connect(output); tick.start(begin); tick.stop(begin + 0.04);
}

export function playRoomSound(context, kind, volume = 1, destination = context.destination, start = context.currentTime) {
  const notes = SOUNDS[kind]; if (!notes || !(volume > 0)) return;
  const master = context.createGain(); master.gain.value = 0.2 * Math.min(volume, 1); master.connect(destination);
  for (const item of notes) note(context, master, item, start + 0.005);
}
