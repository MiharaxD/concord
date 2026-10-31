const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ransom-note words: each letter is a different magazine scrap.
const looks = ['a', 'b', 'c', 'd', 'e'];
document.querySelectorAll('[data-ransom]').forEach((el, w) => {
  let word, i = 0;
  for (const ch of el.dataset.ransom) {
    if (ch === ' ' || !word) { word = document.createElement('span'); word.className = 'word'; el.append(word); if (ch === ' ') { i++; continue; } }
    const s = document.createElement('span');
    s.className = ch === '.' ? 'dot' : looks[(i * 3 + w * 2 + (i % 2)) % looks.length];
    s.textContent = ch;
    s.style.setProperty('--r', ((i * 37 + w * 11) % 9) - 4);
    s.style.setProperty('--i', i);
    s.setAttribute('aria-hidden', 'true');
    word.append(s); i++;
  }
});

// Torn paper: jagged clip-paths on the requested edges (t, r, b, l).
const jag = (n, amp, seed) => Array.from({ length: n + 1 }, (_, i) => [i / n * 100, (Math.sin(i * 12.9898 + seed) * 43758.5453 % 1 + 1) % 1 * amp]);
document.querySelectorAll('[data-torn]').forEach((el, k) => {
  const e = el.dataset.torn, a = 2.4, flat = [[0, 0], [100, 0]], pts = [];
  const top = e.includes('t') ? jag(24, a, k) : flat, bot = e.includes('b') ? jag(24, a, k + 9) : flat;
  const right = e.includes('r') ? jag(14, a, k + 3) : flat, left = e.includes('l') ? jag(14, a, k + 6) : flat;
  top.forEach(([x, y]) => pts.push(`${x}% ${y}%`));
  right.forEach(([y, x]) => pts.push(`${100 - x}% ${y}%`));
  [...bot].reverse().forEach(([x, y]) => pts.push(`${x}% ${100 - y}%`));
  [...left].reverse().forEach(([y, x]) => pts.push(`${x}% ${y}%`));
  el.style.clipPath = `polygon(${pts.join(',')})`;
});

// Intro rip line: a jagged diagonal, the fringe offset to show torn paper fibres.
const line = Array.from({ length: 31 }, (_, i) => { const x = i / 30 * 100; return [x, 60 - x * .2 + (Math.sin(i * 7.3) * 1.6 + Math.sin(i * 2.1) * 1.1)]; });
document.querySelectorAll('[data-cut]').forEach(el => {
  const off = Number(el.dataset.off || 0), l = line.map(([x, y]) => `${x}% ${y + off}%`);
  el.style.clipPath = el.dataset.cut === 'a' ? `polygon(0 0,100% 0,${[...l].reverse().join(',')})` : `polygon(${l.join(',')},100% 100%,0 100%)`;
});

// Intro timeline: shutter at .6 s, letters from 1 s, rip at 2.4 s, gone at 3.25 s.
const intro = document.getElementById('intro'), tc = document.getElementById('tc'), t0 = performance.now();
let introDone = false;
const tick = () => { if (introDone) return; const ms = performance.now() - t0, f = Math.floor(ms / 1000 * 24) % 24; tc.textContent = `00:00:0${Math.floor(ms / 1000)}:${String(f).padStart(2, '0')}`; requestAnimationFrame(tick); };
const finish = fast => {
  if (introDone) return; introDone = true;
  intro.classList.add('rip'); document.body.classList.remove('locked');
  setTimeout(() => { intro.classList.add('gone'); startStack(); }, fast ? 600 : 850);
};
if (still) { introDone = true; intro.classList.add('gone'); document.body.classList.remove('locked'); }
else { tick(); setTimeout(() => finish(false), 2400); intro.addEventListener('click', () => finish(true)); addEventListener('keydown', () => finish(true), { once: true }); }

// Photo stack: tapes peel, a hand lifts the print off and tosses it, the next one is already taped underneath.
const stack = document.getElementById('stack'), photos = [...stack.querySelectorAll('.photo')], count = document.getElementById('stack-n');
let order = photos.map((_, i) => i), busy = false, timer = 0, shown = 0;
const layer = () => order.forEach((p, depth) => { photos[p].style.zIndex = photos.length - depth; });
layer();
async function peel() {
  if (busy) return; busy = true; clearTimeout(timer);
  const top = photos[order[0]], tapes = [...top.querySelectorAll('.tape')], rot = parseFloat(top.style.getPropertyValue('--rot'));
  if (still) {
    await top.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished;
  } else {
    // 1. fingernail under each tape: it curls up and comes off
    await Promise.all(tapes.map((tape, i) => {
      const base = getComputedStyle(tape).transform, side = tape.classList.contains('tl') ? -1 : 1;
      return tape.animate([
        { transform: base, opacity: 1, offset: 0 },
        { transform: `${base} translateY(-6px) scale(1.06,.92)`, opacity: 1, offset: .35 },
        { transform: `${base} translate(${side * 40}px,-46px) rotate(${side * 28}deg) scale(.9)`, opacity: 0 }
      ], { duration: 420, delay: i * 160, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished;
    }));
    // 2. the print lifts from the corner, bends a little, then gets tossed to the side
    top.classList.add('lift');
    await top.animate([
      { transform: `rotate(${rot}deg)` },
      { transform: `rotate(${rot + 3}deg) translate(10px,-24px) rotateX(10deg) rotateY(14deg) scale(1.04)`, offset: .4 },
      { transform: `rotate(${rot + 20}deg) translate(58%,-62%) rotateX(18deg) rotateY(26deg) scale(.96)`, opacity: 0 }
    ], { duration: 820, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'forwards' }).finished;
  }
  // 3. it goes to the back of the pile, taped again, and fades in underneath
  order.push(order.shift()); layer();
  top.getAnimations().forEach(a => a.cancel()); tapes.forEach(t => t.getAnimations().forEach(a => a.cancel()));
  top.classList.remove('lift');
  top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
  shown = (shown + 1) % photos.length; count.textContent = shown + 1;
  busy = false; schedule();
}
const schedule = () => { clearTimeout(timer); if (!still) timer = setTimeout(() => document.hidden || stack.matches(':hover') ? schedule() : peel(), 3800); };
function startStack() { schedule(); }
stack.addEventListener('click', peel);
if (still) startStack();

// TV news: the mascot reads one benefit per story; channel changes roll the picture through static, and the signal drops now and then.
const screen = document.getElementById('screen'), visuals = [...screen.querySelectorAll('.vis:not([data-tape])')], lessons = [...screen.querySelectorAll('.vis[data-tape]')], anchor = document.getElementById('anchor');
const snow = document.getElementById('snow'), snowCtx = snow.getContext('2d'), noise = snowCtx.createImageData(snow.width, snow.height);
let playing = null, story = 0, changes = 0, tvTimer = 0, glitchTimer = 0, onScreen = false, soundOn = false, audio, channelTurn = 0;
function drawSnow() {
  if (!onScreen || document.hidden) return requestAnimationFrame(drawSnow);
  const d = noise.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  snowCtx.putImageData(noise, 0, 0); requestAnimationFrame(drawSnow);
}
function hiss(ms) {
  if (!soundOn) return;
  audio ||= new AudioContext();
  const len = audio.sampleRate * ms / 1000, buffer = audio.createBuffer(1, len, audio.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), band = audio.createBiquadFilter(), gain = audio.createGain(), now = audio.currentTime;
  band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = .6;
  gain.gain.setValueAtTime(.05, now); gain.gain.exponentialRampToValueAtTime(.0001, now + ms / 1000);
  src.buffer = buffer; src.connect(band).connect(gain).connect(audio.destination); src.start();
}
function showStory(next) {
  const weak = !still && ++changes % 4 === 0;
  screen.classList.add(weak ? 'weak' : 'switching'); hiss(weak ? 900 : 420);
  setTimeout(() => {
    visuals[story].classList.remove('on'); story = (next + visuals.length) % visuals.length;
    const v = visuals[story]; v.classList.add('on');
    document.getElementById('tv-title').textContent = v.dataset.title; document.getElementById('tv-sub').textContent = v.dataset.sub;
    anchor.classList.add('glance'); setTimeout(() => anchor.classList.remove('glance'), 1300);
  }, weak ? 650 : 230);
  setTimeout(() => screen.classList.remove('weak', 'switching'), weak ? 1000 : 520);
}
const tvLoop = () => { clearTimeout(tvTimer); if (!still) tvTimer = setTimeout(() => { if (!playing && onScreen && !document.hidden && !screen.closest('.tv').matches(':hover')) showStory(story + 1); tvLoop(); }, 3400); };
const glitchLoop = () => { glitchTimer = setTimeout(() => { if (onScreen) { screen.classList.add('tear'); hiss(160); setTimeout(() => screen.classList.remove('tear'), 190); } glitchLoop(); }, 2200 + Math.random() * 4200); };
document.getElementById('knob-channel').addEventListener('click', e => { if (playing) return; channelTurn += 45; e.currentTarget.style.setProperty('--turn', channelTurn + 'deg'); showStory(story + 1); tvLoop(); });
document.getElementById('knob-sound').addEventListener('click', e => { soundOn = !soundOn; e.currentTarget.setAttribute('aria-pressed', soundOn); e.currentTarget.style.setProperty('--turn', soundOn ? '120deg' : '0deg'); if (soundOn) hiss(300); });
new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }).observe(screen);
const clock = () => { document.getElementById('tv-clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
clock(); setInterval(clock, 20000);

// Tape deck: any cassette starts the same 3-step tutorial; each step ejects the tape in the slot and flies that step's tape in from the shelf.
const tvset = document.querySelector('.tvset'), slot = document.getElementById('slot'), deck = document.getElementById('deck'), eject = document.getElementById('eject');
const wait = ms => new Promise(r => setTimeout(r, ms)), setText = (id, text) => { document.getElementById(id).textContent = text; };
let run = 0, osdTimer = 0;
async function flyTape(tape, inward) {
  if (still) { tape.classList.toggle('out', inward); return; }
  const box = tvset.getBoundingClientRect(), a = tape.getBoundingClientRect(), b = slot.getBoundingClientRect(), w = tape.offsetWidth, h = tape.offsetHeight;
  const left = a.left + a.width / 2 - box.left - w / 2, top = a.top + a.height / 2 - box.top - h / 2, k = b.width * .92 / w;
  const dx = b.left - box.left + (b.width - w * k) / 2 - left, dy = b.top - box.top + b.height / 2 - h * k - top;
  const ghost = tape.cloneNode(true); ghost.className = 'tape-c tape-ghost'; ghost.removeAttribute('role'); ghost.removeAttribute('tabindex');
  Object.assign(ghost.style, { left: left + 'px', top: top + 'px', width: w + 'px' });
  tvset.append(ghost); tape.classList.add('out');
  const frames = [
    { transform: `translate(0,0) rotate(${tape.style.getPropertyValue('--r')})`, clipPath: 'inset(0 0 0 0)' },
    { transform: `translate(${dx}px,${dy - 40}px) scale(${k})`, clipPath: 'inset(0 0 0 0)', offset: .55 },
    { transform: `translate(${dx}px,${dy}px) scale(${k})`, clipPath: 'inset(0 0 0 0)', offset: .7 },
    { transform: `translate(${dx}px,${dy + h * k}px) scale(${k})`, clipPath: 'inset(0 0 100% 0)' }];
  await ghost.animate(inward ? frames : frames.reverse().map(f => f.offset == null ? f : { ...f, offset: 1 - f.offset }), { duration: 1150, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).finished;
  ghost.remove(); if (!inward) tape.classList.remove('out');
}
async function insertFx(step) {
  setText('mini-label', 'passo ' + (step + 1)); setText('insert-label', 'PLAY ▶');
  screen.classList.remove('inserting'); void screen.offsetWidth; screen.classList.add('inserting'); hiss(500);
  await wait(still ? 300 : 1300); screen.classList.remove('inserting');
}
function showLesson(i) {
  visuals.forEach(v => v.classList.remove('on')); lessons.forEach((v, n) => v.classList.toggle('on', n === i));
  setText('tv-title', lessons[i].dataset.title); setText('tv-sub', lessons[i].dataset.sub);
  anchor.classList.remove('glance'); void anchor.offsetWidth; anchor.classList.add('glance'); setTimeout(() => anchor.classList.remove('glance'), 1400);
}
const tapes = [...document.querySelectorAll('.tape-c')];
let loaded = null;
async function loadTape(tape, my) {
  if (loaded === tape) return;
  screen.classList.add('swapping'); deck.classList.remove('playing'); hiss(400);
  if (loaded) { setText('osd-state', 'EJECT ⏏'); const out = loaded; loaded = null; await flyTape(out, false); if (my !== run) return; }
  setText('osd-state', 'CARREGANDO'); loaded = tape; await flyTape(tape, true);
  if (my === run) { screen.classList.remove('swapping'); deck.classList.add('playing'); }
}
async function playTape() {
  if (playing) return;
  const my = ++run; playing = true; clearTimeout(tvTimer);
  eject.disabled = false; screen.classList.add('vcr');
  const t0 = performance.now(); clearInterval(osdTimer);
  osdTimer = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); setText('osd-time', `0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`); }, 250);
  for (let i = 0; i < lessons.length; i++) {
    await loadTape(tapes[i], my); if (my !== run) return;
    setText('osd-state', 'PLAY ▶'); await insertFx(i); if (my !== run) return;
    showLesson(i); await wait(5600); if (my !== run) return;
  }
  setText('osd-state', 'FIM DA FITA'); await wait(1100); if (my === run) await stopTape();
}
async function stopTape() {
  if (!playing) return;
  run++; clearInterval(osdTimer);
  screen.classList.remove('vcr', 'inserting', 'swapping'); deck.classList.remove('playing'); eject.disabled = true;
  lessons.forEach(v => v.classList.remove('on')); visuals[story].classList.add('on');
  setText('tv-title', visuals[story].dataset.title); setText('tv-sub', visuals[story].dataset.sub); hiss(300);
  const out = loaded; loaded = null; if (out) await flyTape(out, false);
  playing = null; tvLoop();
}
document.querySelectorAll('.tape-c').forEach(tape => {
  tape.addEventListener('click', playTape);
  tape.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playTape(); } });
});
eject.addEventListener('click', stopTape);
if (!still) { drawSnow(); tvLoop(); glitchLoop(); } else { screen.style.setProperty('--snow', '0'); }

// Couch scene: Léo's race streams on the old TV; every overtake makes the mascot jump and spill popcorn.
const den = document.getElementById('den'), game = document.getElementById('den-game'), gx = game.getContext('2d'), denChat = document.getElementById('den-chat');
const peaks = [.05, .1, .06, .13, .07, .11, .04, .09, .06, .12, .05, .08, .06, .1];
const lines = [['ana', 'Ana', 'freia não'], ['mi', 'Bia', 'segura essa curva'], ['ana', 'Ana', 'kkkkk'], ['mi', 'Bia', 'passa a pipoca'], ['ana', 'Ana', 'vai, vai, vai']];
let denOn = false, passed = false, rival = .1, lane = 1, place = 4, raceT = 0, raceLast = 0, chatN = 0;
new IntersectionObserver(([entry]) => { denOn = entry.isIntersecting; }).observe(den);
function say(cls, name, text) {
  const p = document.createElement('p'), b = document.createElement('b');
  p.className = 'cc-msg'; b.className = cls; b.textContent = name; p.append(b, text); denChat.append(p);
  while (denChat.children.length > 4) denChat.firstElementChild.remove();
}
function hype() {
  place = place > 1 ? place - 1 : 4; say('leo', 'Léo', place === 1 ? 'PRIMEIRO!!' : 'passei!');
  den.classList.remove('hype'); void den.offsetWidth; den.classList.add('hype'); setTimeout(() => den.classList.remove('hype'), 1200);
}
function car(x, y, size, body, accent) {
  const w = game.width * .2 * size, h = w * .4;
  gx.fillStyle = '#0009'; gx.beginPath(); gx.ellipse(x, y + h * .08, w * .58, h * .2, 0, 0, 7); gx.fill();
  gx.fillStyle = '#050308'; gx.fillRect(x - w * .48, y - h * .1, w * .2, h * .26); gx.fillRect(x + w * .28, y - h * .1, w * .2, h * .26);
  gx.fillStyle = body; gx.beginPath(); gx.moveTo(x - w * .36, y - h); gx.lineTo(x - w * .25, y - h * 1.6); gx.lineTo(x + w * .25, y - h * 1.6); gx.lineTo(x + w * .36, y - h); gx.fill();
  gx.fillRect(x - w / 2, y - h, w, h * .92);
  gx.fillStyle = '#0b0716'; gx.fillRect(x - w * .21, y - h * 1.48, w * .42, h * .4);
  gx.fillStyle = accent; gx.fillRect(x - w / 2, y - h * .42, w, h * .1);
  gx.shadowColor = '#ff4d6d'; gx.shadowBlur = 8; gx.fillStyle = '#ff4d6d';
  gx.fillRect(x - w * .46, y - h * .78, w * .22, h * .2); gx.fillRect(x + w * .24, y - h * .78, w * .22, h * .2); gx.shadowBlur = 0;
}
function drawRace(dt) {
  const W = game.width, H = game.height, hz = H * .44, t = raceT, vp = W / 2 + Math.sin(t * .35) * W * .14;
  let g = gx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#120a26'); g.addColorStop(1, '#5a3796');
  gx.fillStyle = g; gx.fillRect(0, 0, W, hz);
  const r = W * .15; g = gx.createLinearGradient(0, hz - r, 0, hz); g.addColorStop(0, '#ffd6f5'); g.addColorStop(1, '#b48cff');
  gx.fillStyle = g; gx.beginPath(); gx.arc(vp, hz, r, Math.PI, 0); gx.fill();
  gx.fillStyle = '#4f2f88'; for (let i = 0; i < 5; i++) gx.fillRect(vp - r, hz - r * .12 - i * r * .17, 2 * r, 1.5 + i * .6);
  gx.fillStyle = '#1a1033'; gx.beginPath(); gx.moveTo(0, hz);
  peaks.forEach((p, i) => gx.lineTo(i * W / (peaks.length - 2) - (vp - W / 2) * .25 - W * .05, hz - p * H));
  gx.lineTo(W, hz); gx.fill();
  gx.fillStyle = '#0b0618'; gx.fillRect(0, hz, W, H - hz);
  const depth = H - hz, at = u => hz + depth * u, mid = u => vp + (W / 2 - vp) * u, half = u => W * .36 * u, phase = t * 1.7 % 1;
  gx.strokeStyle = '#9b86ff55'; gx.lineWidth = 1; gx.beginPath();
  for (let k = -9; k <= 9; k++) { gx.moveTo(vp, hz); gx.lineTo(W / 2 + k * W * .17, H); }
  for (let i = 0; i < 12; i++) { const s = (i + phase) / 12, y = at(s * s); gx.moveTo(0, y); gx.lineTo(W, y); }
  gx.stroke();
  gx.fillStyle = '#140c24'; gx.beginPath(); gx.moveTo(vp - 2, hz); gx.lineTo(vp + 2, hz); gx.lineTo(W / 2 + half(1), H); gx.lineTo(W / 2 - half(1), H); gx.fill();
  gx.strokeStyle = '#c9bcff'; gx.lineWidth = 2; gx.beginPath(); gx.moveTo(vp - 2, hz); gx.lineTo(W / 2 - half(1), H); gx.moveTo(vp + 2, hz); gx.lineTo(W / 2 + half(1), H); gx.stroke();
  gx.fillStyle = '#ffd6f5';
  for (let i = 0; i < 10; i += 2) { const s0 = (i + phase * 2) / 10, u0 = s0 * s0, u1 = Math.min(1, (s0 + .07) ** 2), w0 = 1 + 3 * u0;
    gx.beginPath(); gx.moveTo(mid(u0) - w0 / 2, at(u0)); gx.lineTo(mid(u0) + w0 / 2, at(u0)); gx.lineTo(mid(u1) + w0, at(u1)); gx.lineTo(mid(u1) - w0, at(u1)); gx.fill(); }
  const sway = Math.sin(t * 1.3) * W * .06 - (vp - W / 2) * .5, py = H * .9;
  rival += dt * .14; const ru = rival * rival;
  if (!passed && ru > .78) { passed = true; hype(); }
  if (ru > 1.25) { rival = .12; passed = false; lane = Math.random() < .5 ? -1 : 1; }
  const rx = mid(ru) + lane * half(ru) * .5, ry = at(ru);
  if (ry < py) car(rx, ry, .15 + .85 * ru, '#e6e0ee', '#ff4d6d');
  car(W / 2 + sway, py, 1, '#2c2350', '#9b86ff');
  if (ry >= py) car(rx, ry, .15 + .85 * ru, '#e6e0ee', '#ff4d6d');
  gx.fillStyle = '#f1edf6'; gx.textAlign = 'right'; gx.font = `900 ${W * .1}px Archivo, sans-serif`;
  gx.fillText('P' + place, W * .95, H * .16); gx.fillText(170 + Math.sin(t * 2) * 9 | 0, W * .95, H * .86);
  gx.font = `700 ${W * .045}px Archivo, sans-serif`; gx.fillText('km/h', W * .95, H * .94);
}
function race(now) {
  requestAnimationFrame(race);
  if (!denOn || document.hidden) { raceLast = now; return; }
  const dt = Math.min(.05, (now - raceLast) / 1000 || 0); raceLast = now; raceT += dt; drawRace(dt);
}
if (still) { raceT = 2; drawRace(0); } else {
  requestAnimationFrame(race);
  setInterval(() => { if (denOn && !document.hidden) say(...lines[chatN++ % lines.length]); }, 2900);
}

// Download section: the mascot paces along the first line of the heading, eyes on the cursor, and hops while the button is hovered.
const finalH = document.querySelector('.final h2'), walker = finalH.querySelector('.walker'), wEyes = walker.querySelector('.w-eyes'), dlBtn = document.querySelector('.final .btn');
let mouse = null, wx = null, wTarget = 0, wPause = 0, wLast = 0, wOn = false, eager = false;
addEventListener('pointermove', e => { mouse = [e.clientX, e.clientY]; }, { passive: true });
for (const [ev, on] of [['pointerenter', true], ['pointerleave', false], ['focus', true], ['blur', false]]) dlBtn.addEventListener(ev, () => { eager = on; });
new IntersectionObserver(([entry]) => { wOn = entry.isIntersecting; }).observe(finalH);
function perch() {
  const words = [...finalH.querySelectorAll('.word')], top = words[0].offsetTop, row = words.filter(w => w.offsetTop === top), last = row.at(-1);
  return [row[0].offsetLeft, last.offsetLeft + last.offsetWidth - walker.offsetWidth, top + parseFloat(getComputedStyle(finalH).fontSize) * .05 - walker.offsetHeight];
}
function pace(now) {
  requestAnimationFrame(pace);
  const dt = Math.min(.05, (now - wLast) / 1000 || 0); wLast = now;
  if (!wOn) return;
  const [lo, hi, y] = perch(); let moving = false;
  if (wx === null) wx = wTarget = (lo + hi) / 2;
  if (!eager && !still) {
    if (wPause > 0) wPause -= dt;
    else {
      const d = wTarget - wx, step = 160 * dt;
      if (Math.abs(d) <= step) { wx = wTarget; wPause = .5 + Math.random() * 1.5; do wTarget = lo + Math.random() * (hi - lo); while (hi - lo > 240 && Math.abs(wTarget - wx) < 80); }
      else { wx += Math.sign(d) * step; moving = true; walker.classList.toggle('flip', d < 0); }
    }
  }
  wx = Math.min(hi, Math.max(lo, wx));
  walker.style.transform = `translate(${wx}px,${y}px)`; walker.classList.toggle('moving', moving); walker.classList.toggle('excited', eager && !still);
  const flip = walker.classList.contains('flip') ? -1 : 1, r = walker.getBoundingClientRect(), b = dlBtn.getBoundingClientRect();
  const [mx, my] = eager || !mouse ? [b.left + b.width / 2, b.top + b.height / 2] : mouse;
  const dx = mx - (r.left + r.width * (flip > 0 ? .41 : .59)), dy = my - (r.top + r.height * .55), len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / 160);
  wEyes.setAttribute('transform', `translate(${dx / len * 75 * k * flip} ${dy / len * 50 * k})`);
}
requestAnimationFrame(pace);

// Download button points straight at the latest installer; the link above is the fallback if GitHub's API is unreachable.
fetch('https://api.github.com/repos/MiharaxD/concord/releases/latest').then(r => r.ok ? r.json() : null).then(release => {
  const asset = release?.assets?.find(a => /-Setup\.exe$/.test(a.name));
  if (!asset) return;
  document.querySelectorAll('[data-download]').forEach(a => { a.href = asset.browser_download_url; });
  document.querySelectorAll('[data-version]').forEach(v => { v.textContent = release.tag_name; });
}).catch(() => {});
