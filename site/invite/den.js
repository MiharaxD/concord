// Couch scene copied from the landing (js/site.js): Léo's race streams on the old TV; every overtake makes the mascot jump and spill popcorn.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
