// Painel hero: the logo assembles on launch, eight points (one per seat) orbit it and its eyes follow the cursor.
// Runs only on the Painel outside a room with the window visible; prefers-reduced-motion keeps everything static.
const SEATS = 8;
const ease = { out: x => 1 - (1 - x) ** 3, in: x => x * x * x, back: x => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2 };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, k) => a + (b - a) * k;

export function createHomeIntro({ brand, logo, look, eyes, glint, back, front, field, rise }) {
  const body = document.body, still = matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = [back.getContext('2d'), front.getContext('2d')];
  const people = Array.from({ length: SEATS }, (_, i) => ({ a: i / SEATS * Math.PI * 2, far: 520 + Math.random() * 360, wob: Math.random() * 6 }));
  const dust = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * 6 }));
  let W = 0, H = 0, top = 0, raf = 0, last = 0, drawn = 0, active = false, full = false, t0 = 0, orbitAt = 0, glowAt = 0;
  let spin = 0, speed = 1, speedTo = 1, reach = 1, reachTo = 1, rings = [], nextRing = 0, accent = '', rgb = [170, 150, 255];
  let pointer = null, moved = 0, glance = { x: 0, y: 0 }, nextGlance = 0, eye = { x: 0, y: 0 }, timers = [], blinkTimer = 0;
  [...brand.querySelectorAll('.hero-word span')].forEach((span, i) => span.style.setProperty('--i', i));
  rise.forEach((element, i) => element.style.setProperty('--i', i));

  const color = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  function resize() {
    const box = back.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); W = box.width; H = box.height; top = box.top;
    for (const [i, canvas] of [back, front].entries()) { canvas.width = W * dpr; canvas.height = H * dpr; ctx[i].setTransform(dpr, 0, 0, dpr, 0, 0); }
  }
  function dot(c, x, y, size, alpha, you) {
    const glow = c.createRadialGradient(x, y, 0, x, y, size * 6);
    glow.addColorStop(0, you ? `rgba(255,255,255,${alpha * .5})` : color(alpha * .55)); glow.addColorStop(1, color(0));
    c.fillStyle = glow; c.beginPath(); c.arc(x, y, size * 6, 0, 7); c.fill();
    c.fillStyle = you ? `rgba(255,255,255,${alpha})` : `rgba(${rgb.map(v => Math.min(255, v + 60))},${alpha})`;
    c.beginPath(); c.arc(x, y, size, 0, 7); c.fill();
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // Full speed while something moves on purpose; 30 fps idle and 15 fps with the window in the background.
    const budget = full || now - orbitAt < 1200 ? 0 : document.hasFocus() ? 30 : 64;
    if (now - drawn < budget) return;
    const dt = Math.min(64, now - (last || now)); last = drawn = now;
    const value = document.documentElement.style.getPropertyValue('--accent').trim() || '#aa96ff';
    if (value !== accent && /^#[0-9a-f]{6}$/i.test(value)) { accent = value; rgb = [1, 3, 5].map(k => parseInt(value.slice(k, k + 2), 16)); }
    const box = logo.getBoundingClientRect(), c = { x: box.left + box.width / 2, y: box.top + box.height / 2 - top, s: box.width };
    const [b, f] = ctx, t = now - t0, tilt = -.2, cos = Math.cos(tilt), sin = Math.sin(tilt);
    speed = lerp(speed, speedTo, .06); reach = lerp(reach, reachTo, .08); spin += dt * .00032 * speed;
    b.clearRect(0, 0, W, H); f.clearRect(0, 0, W, H);

    const glow = ease.out(clamp((now - glowAt) / 1800));
    for (let i = 0; i < 3; i++) {
      const k = now * .00008 * (i + 1), x = c.x + Math.cos(k + i * 2.1) * W * .32, y = c.y + Math.sin(k * 1.3 + i) * H * .28, r = Math.max(W, H) * (.42 + i * .08);
      const fill = b.createRadialGradient(x, y, 0, x, y, r), tint = i === 1 ? [rgb[2], rgb[0], rgb[1]] : rgb;
      fill.addColorStop(0, `rgba(${tint},${(i === 1 ? .05 : .085) * glow})`); fill.addColorStop(1, `rgba(${tint},0)`);
      b.fillStyle = fill; b.fillRect(0, 0, W, H);
    }
    const px = pointer ? pointer.x / W - .5 : 0, py = pointer ? pointer.y / H - .5 : 0;
    for (const d of dust) {
      b.fillStyle = `rgba(255,255,255,${(.08 + .22 * (.5 + .5 * Math.sin(now * .0012 + d.tw))) * glow * d.z})`;
      b.fillRect(d.x * W - px * d.z * 24, d.y * H - py * d.z * 24, d.z * 1.6, d.z * 1.6);
    }
    if (full) {
      for (const [start, width] of [[1300, 10], [1460, 4]]) {
        const e = (t - start) / 1100; if (e < 0 || e > 1) continue;
        b.strokeStyle = color((1 - e) ** 2 * .55); b.lineWidth = width * (1 - e) + 1;
        b.beginPath(); b.arc(c.x, c.y, c.s * .45 + ease.out(e) * Math.max(W, H) * .55, 0, 7); b.stroke();
      }
      const flash = (t - 1280) / 500;
      if (flash > 0 && flash < 1) { const fill = b.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.s * 3); fill.addColorStop(0, color((1 - flash) ** 2 * .5)); fill.addColorStop(1, color(0)); b.fillStyle = fill; b.fillRect(0, 0, W, H); }
    }

    // The eight seats fly in, merge into the logo and come back out as an orbit.
    const points = [];
    people.forEach((p, i) => {
      let a = p.a + spin, rx, alpha = 1, orbit = false;
      if (full && t < 1000) { const e = ease.out(clamp(t / 1000)); a += (1 - e) * 3.2; rx = lerp(p.far, c.s * 1.25, e); alpha = clamp(t / 300); }
      else if (full && t < 1340) rx = lerp(c.s * 1.25, 0, ease.in(clamp((t - 1000) / 340)));
      else if (now < orbitAt + i * 70) return;
      else { const e = clamp((now - orbitAt - i * 70) / 950); rx = lerp(0, c.s * 1.6 * reach, ease.back(e)) + Math.sin(now * .0011 + p.wob) * 4; orbit = true; alpha = clamp(e * 3); }
      const ry = orbit ? rx * .3 : rx, ox = Math.cos(a) * rx, oy = Math.sin(a) * ry, depth = orbit ? Math.sin(a) : 1;
      points.push({ i, x: c.x + ox * cos - oy * sin, y: c.y + ox * sin + oy * cos, depth, orbit, alpha: alpha * (orbit ? .55 + .45 * (depth + 1) / 2 : 1), size: orbit ? 2.6 + depth * 1.1 : 3.4 });
    });
    const ring = points.filter(p => p.orbit);
    if (ring.length > 1) {
      b.strokeStyle = color(.13); b.lineWidth = 1; b.beginPath();
      ring.forEach((p, k) => k ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y)); if (ring.length === SEATS) b.closePath(); b.stroke();
    }
    // Now and then a seat "talks", like the voice ring in a call.
    if (ring.length === SEATS && now > nextRing) { rings.push({ i: Math.floor(Math.random() * SEATS), start: now }); nextRing = now + 700 + Math.random() * 1100; }
    rings = rings.filter(r => now - r.start < 1000);
    for (const p of points) {
      const c2 = !p.orbit || p.depth > 0 ? f : b;
      dot(c2, p.x, p.y, p.size, p.alpha, p.i === 0);
      for (const r of rings) if (r.i === p.i && now >= r.start) { const e = (now - r.start) / 1000; c2.strokeStyle = color((1 - e) * .7 * p.alpha); c2.lineWidth = 1.5; c2.beginPath(); c2.arc(p.x, p.y, p.size + ease.out(e) * 16, 0, 7); c2.stroke(); }
    }

    // Eyes: the invite being typed, then the cursor, then an idle glance around.
    let tx = 0, ty = 0;
    const aim = (x, y) => { const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260); tx = dx / d * k * 40; ty = dy / d * k * 30; };
    if (document.activeElement === field) { const r = field.getBoundingClientRect(); aim(r.left + Math.min(r.width, 40 + field.value.length * 7), r.top + r.height / 2 - top); }
    else if (pointer && now - moved < 2600) aim(pointer.x, pointer.y);
    else {
      if (now > nextGlance) { glance = Math.random() < .4 ? { x: 0, y: 0 } : { x: (Math.random() * 2 - 1) * 36, y: (Math.random() * 2 - 1) * 24 }; nextGlance = now + 1400 + Math.random() * 2200; }
      tx = glance.x; ty = glance.y;
    }
    eye.x = lerp(eye.x, tx, .14); eye.y = lerp(eye.y, ty, .14);
    look.setAttribute('transform', `translate(${eye.x.toFixed(1)} ${eye.y.toFixed(1)})`);
  }

  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  function blink() { if (eyes.classList.contains('happy')) return; eyes.classList.add('blink'); setTimeout(() => eyes.classList.remove('blink'), 140); }
  function blinkLoop() {
    clearTimeout(blinkTimer); if (!running()) return;
    blinkTimer = setTimeout(() => { blink(); if (Math.random() < .25) setTimeout(blink, 280); blinkLoop(); }, 2400 + Math.random() * 3200);
  }
  function gleam() { glint.classList.remove('run'); void glint.getBoundingClientRect(); glint.classList.add('run'); }
  const running = () => active && !still.matches && !document.hidden;
  function sync() {
    back.hidden = front.hidden = !active;
    if (running() && !raf) { resize(); last = 0; raf = requestAnimationFrame(frame); blinkLoop(); }
    if (!running() && raf) { cancelAnimationFrame(raf); raf = 0; clearTimeout(blinkTimer); look.removeAttribute('transform'); eye = { x: 0, y: 0 }; }
  }
  // Skipping on click (not pointerdown) keeps the layout still until the click has reached its button.
  const skipKeys = ['click', 'keydown', 'wheel'];
  function finish() {
    timers.forEach(clearTimeout); timers = []; skipKeys.forEach(type => removeEventListener(type, finish, true));
    body.classList.remove('intro-wait', 'intro-full', 'intro-short'); brand.classList.remove('settle'); brand.style.transform = '';
    const now = performance.now(); full = false; orbitAt = Math.min(orbitAt, now); glowAt = Math.min(glowAt, now - 900);
  }
  function play(mode) {
    finish();
    if (mode === 'none' || still.matches || !active) return;
    const now = performance.now(); t0 = now; full = mode === 'full';
    skipKeys.forEach(type => addEventListener(type, finish, { capture: true, passive: true }));
    if (!full) { orbitAt = now + 300; glowAt = now; body.classList.add('intro-short'); later(1500, finish); return; }
    // The logo starts at the window centre, larger, and slides into the Painel once it has assembled.
    brand.style.transform = 'none';
    const bar = document.querySelector('.titlebar')?.offsetHeight || 0, box = brand.getBoundingClientRect();
    const dx = innerWidth / 2 - (box.left + box.width / 2), dy = bar + (innerHeight - bar) / 2 - (box.top + box.height / 2);
    brand.style.transform = `translate(${dx}px,${dy}px) scale(1.7)`;
    void brand.offsetWidth; body.classList.add('intro-full'); orbitAt = now + 3750; glowAt = now + 1200; rings = [];
    later(2700, gleam); later(3000, blink);
    later(3450, () => { brand.classList.add('settle'); brand.style.transform = ''; });
    later(5300, finish);
  }

  addEventListener('resize', () => { if (raf) resize(); });
  addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY - top }; moved = performance.now(); }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  document.addEventListener('visibilitychange', sync);
  still.addEventListener('change', () => { if (still.matches) finish(); sync(); });
  return {
    play, skip: finish,
    setActive(value) {
      if (value === active) return;
      active = value; if (value && !full) { orbitAt = performance.now() + 150; glowAt = performance.now() - 600; }
      sync();
    },
    react(kind) {
      if (!running()) return;
      if (kind === 'hover') { speedTo = 3.4; reachTo = .82; gleam(); }
      else if (kind === 'leave') { speedTo = 1; reachTo = 1; }
      else {
        const burst = kind === 'burst'; reachTo = burst ? 2.4 : .2; speedTo = burst ? 6 : 5;
        later(burst ? 520 : 700, () => { reachTo = 1; speedTo = 1; });
        logo.classList.remove('hop'); void logo.getBoundingClientRect(); logo.classList.add('hop');
        eyes.classList.add('happy'); setTimeout(() => eyes.classList.remove('happy'), burst ? 1100 : 900);
        if (burst) for (let i = 0; i < SEATS; i++) rings.push({ i, start: performance.now() + i * 40 });
      }
    }
  };
}
