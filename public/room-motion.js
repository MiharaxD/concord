// Painel ↔ sala with shared elements: Criar sala becomes your tile, your avatar flies in, the ready bar becomes the call bar;
// going to the Painel shrinks the stage into the "Minha sala" card and leaving plays the creation backwards.
// Plain WAAPI over the real DOM; prefers-reduced-motion or a hidden window switches views at once, as before.
const E = { morph: 'cubic-bezier(.76,0,.24,1)', out: 'cubic-bezier(.05,.7,.1,1)', std: 'cubic-bezier(.2,0,0,1)', in: 'cubic-bezier(.4,0,1,1)', pop: 'cubic-bezier(.3,1.6,.5,1)', soft: 'cubic-bezier(.4,0,.2,1)' };
const box = el => { const r = el?.getBoundingClientRect(); return r && r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
const mid = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const at = r => ({ left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
const clear = shadow => !shadow || shadow === 'none' ? 'none' : shadow.replace(/rgba?\([^)]*\)/g, 'rgba(0, 0, 0, 0)');
const alpha = (rgb, a) => rgb.replace(/rgba?\(([^,]+),([^,]+),([^,)]+).*\)/, `rgba($1,$2,$3,${a})`);
const css = el => getComputedStyle(el);
const snap = el => { const s = css(el); return { borderRadius: s.borderRadius, backgroundColor: s.backgroundColor, boxShadow: s.boxShadow }; };
// Both shadow lists get the same outer and inset layers so they interpolate instead of jumping.
function pair(a, b) {
  const split = v => { const all = !v || v === 'none' ? [] : v.split(/,(?![^(]*\))/).map(x => x.trim()); return [all.filter(x => !/inset/.test(x)), all.filter(x => /inset/.test(x))]; };
  const [ao, ai] = split(a.boxShadow), [bo, bi] = split(b.boxShadow), fill = (x, y) => [...x, ...y.slice(x.length).map(clear)];
  const join = (o, i) => [...o, ...i].join(', ') || 'none';
  return [{ ...a, boxShadow: join(fill(ao, bo), fill(ai, bi)) }, { ...b, boxShadow: join(fill(bo, ao), fill(bi, ai)) }];
}

export function createRoomMotion({ self, onEnd }) {
  const still = matchMedia('(prefers-reduced-motion: reduce)'), body = document.body;
  const home = document.getElementById('home-view'), room = document.getElementById('room-view'), $ = id => document.getElementById(id);
  const layer = document.createElement('div'); layer.className = 'motion-layer'; layer.setAttribute('aria-hidden', 'true'); body.append(layer);
  let anims = [], undo = [], raf = 0, sky = false;
  const api = { get sky() { return sky; }, stop, create, minimize, resume, leave, cardLeave };

  // persist(): a finished animation must keep its end state even when a later one on the same property also fills.
  function A(el, kf, t, d, e = 'std', o = {}) { if (!el) return; const a = el.animate(kf, { delay: Math.max(0, t), duration: d, easing: E[e] || e, fill: 'both', ...o }); a.persist?.(); anims.push(a); return a; }
  // Something to do at a point of the timeline, on whatever element exists by then.
  function later(t, fn) { const a = layer.animate([{ opacity: 1 }, { opacity: 1 }], { delay: Math.max(0, t), duration: 1 }); anims.push(a); a.onfinish = () => { if (anims.includes(a)) fn(); }; }
  const hide = (el, until) => A(el, [{ opacity: 0 }, { opacity: 0 }], 0, Math.max(1, until), 'linear', { fill: 'backwards' });
  const fade = (el, t, d, from, to, e = 'std') => A(el, [{ opacity: from }, { opacity: to }], t, d, e);
  const rise = (els, t, step = 40, d = 460) => els.forEach((el, i) => A(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], t + i * step, d, 'out'));
  const sink = (els, t, step = 30, d = 240) => els.forEach((el, i) => A(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px)' }], t + i * step, d, 'in'));
  const shown = el => Boolean(el && box(el) && !el.closest('[hidden]'));
  const kids = el => el ? [...el.children].filter(shown) : [];
  function stop() {
    cancelAnimationFrame(raf); const list = anims; anims = []; list.forEach(a => a.cancel());
    undo.splice(0).reverse().forEach(fn => fn()); layer.replaceChildren();
    if (sky) { sky = false; onEnd?.(); }
  }
  const enabled = () => !still.matches && !document.hidden && typeof Element.prototype.animate === 'function';
  // The end is an animation too, so it follows the same clock as everything it cleans up.
  function finish(total) { const clock = layer.animate([{ opacity: 1 }, { opacity: 1 }], { duration: Math.max(1, total) }); anims.push(clock); clock.onfinish = stop; }
  function ghost(r, style = {}, tag = 'div') { const el = document.createElement(tag); Object.assign(el.style, { position: 'fixed', ...at(r), ...style }); layer.append(el); return el; }
  function tweak(el, key, value) { const old = el.style.getPropertyValue(key); el.style.setProperty(key, value); undo.push(() => old ? el.style.setProperty(key, old) : el.style.removeProperty(key)); }
  function flag(el, name) { if (!el) return; el.classList.add(name); undo.push(() => el.classList.remove(name)); }
  // The view being left stays on screen, pinned where it was, until the animation ends.
  function pin(view, z) {
    const r = box(view), old = view.style.cssText, name = view === home ? 'home' : 'room';
    Object.assign(view.style, { position: 'fixed', ...at(r), margin: '0', maxWidth: 'none', zIndex: z, pointerEvents: 'none' });
    view.inert = true;
    undo.push(() => { view.style.cssText = old; view.inert = false; view.hidden = body.dataset.view !== name; });
    return () => { view.hidden = false; };
  }
  // Frozen copies for content that is about to change; ids move to data-mid so the document never holds two of them.
  function freeze(el) {
    const clone = el.cloneNode(true);
    for (const node of [clone, ...clone.querySelectorAll('[id]')]) if (node.id) { node.dataset.mid = node.id; node.removeAttribute('id'); }
    clone.hidden = false; clone.inert = true; clone.setAttribute('aria-hidden', 'true'); return clone;
  }
  const pick = (root, sel) => root?.querySelector(root.dataset.mid ? sel.replace(/#([\w-]+)/g, '[data-mid="$1"]') : sel);
  function copy(view, z) {
    const r = box(view), clone = freeze(view);
    Object.assign(clone.style, { position: 'fixed', ...at(r), margin: '0', maxWidth: 'none', zIndex: z, pointerEvents: 'none' });
    view.after(clone); undo.push(() => clone.remove()); return clone;
  }
  function snapshot(el) {
    const r = box(el), clone = freeze(el);
    Object.assign(clone.style, { position: 'fixed', ...at(r), margin: '0', zIndex: '0', pointerEvents: 'none' });
    layer.prepend(clone); return clone;
  }
  function front(view) { tweak(view, 'z-index', '2'); }
  // The selected pill in the sidebar slides between Painel and Sala.
  const nav = el => ({ el, r: box(el), look: snap(el) });
  function pill(from, to, t) {
    const a = from.r, b = box(to), look = from.look; if (!a || !b) return;
    const g = ghost(b, { borderRadius: look.borderRadius, background: look.backgroundColor, boxShadow: look.boxShadow });
    flag(body, 'motion-nav'); const dy = a.y - b.y;
    A(g, [{ transform: `translateY(${dy}px)` }, { transform: `translateY(${dy / 2}px) scale(.86,1.45)`, offset: .5 }, { transform: 'none' }], t, 560, 'morph');
  }
  // Avatar flight between a big circle (tile) and a small one (ready bar); X and Y ease apart, so the path arcs.
  function fly(big, small, avatar, t, d, inward) {
    const wrap = ghost(big, { zIndex: 2 }), inner = freeze(avatar), dx = mid(small).x - mid(big).x, dy = mid(small).y - mid(big).y, k = small.w / big.w;
    // The bounce lives on its own layer, so it never competes with the flight for `transform`.
    const face = document.createElement('div'); Object.assign(face.style, { width: '100%', height: '100%' });
    Object.assign(inner.style, { width: '100%', height: '100%', fontSize: css(avatar).fontSize, boxShadow: 'none', animation: 'none' });
    wrap.className = 'motion-fly'; face.append(inner); wrap.append(face);
    const far = [{ transform: `translateX(${dx}px)` }, { transform: `translateY(${dy}px) scale(${k})` }], near = [{ transform: 'none' }, { transform: 'none' }];
    const [x, y] = inward ? [[far[0], near[0]], [far[1], near[1]]] : [[near[0], far[0]], [near[1], far[1]]];
    A(wrap, x, t, d, inward ? 'cubic-bezier(.55,0,.15,1)' : 'cubic-bezier(.15,.6,.25,1)');
    A(face, y, t, d, inward ? 'cubic-bezier(.15,.6,.25,1)' : 'cubic-bezier(.55,0,.15,1)');
    return { wrap, inner };
  }
  function ripple(r, t, accent) {
    [[0, .7, 2.1, 760], [120, .45, 2.7, 900]].forEach(([d, o, s, len]) => {
      const ring = ghost(r, { borderRadius: '50%', boxShadow: `0 0 0 2px ${accent}`, opacity: 0 });
      A(ring, [{ opacity: o, transform: 'scale(1)' }, { opacity: 0, transform: `scale(${s})` }], t + d, len, 'std', { fill: 'forwards' });
    });
  }
  // The pill that holds the call controls, as measured from the real bar.
  const group = view => view.querySelector('.call-group');
  const shared = (view, painel) => [['settings-button', 'ready-settings'], ['bar-mic', 'ready-mic'], ['bar-camera', 'ready-camera']].map(([bar, ready]) => {
    const button = view.querySelector('#' + bar), holder = button?.closest('.device-split') || button;
    // Mic and camera carry an on and an off icon; the one on screen is picked when it is measured, after the view shows.
    const visible = el => el && ([...el.querySelectorAll('svg')].find(svg => box(svg)) || el.querySelector('svg'));
    return { button, holder, get icon() { return visible(button); }, get ready() { return visible(pick(painel, '#' + ready)); } };
  });
  // The bar's background travels under the real buttons, so it lives in the room view, below the call group.
  function shell(view, bar, from, to, fromLook, toLook, t, d) {
    const [a, b] = pair(fromLook, toLook), g = document.createElement('div');
    Object.assign(g.style, { position: 'fixed', zIndex: '0', pointerEvents: 'none', ...at(from) }); view.append(g); undo.push(() => g.remove());
    tweak(bar, 'z-index', '1');
    A(g, [{ ...at(from), ...a }, { ...at(to), ...b }], t, d, 'morph');
  }
  function glow(r, center, accent, t) {
    const g = ghost(r, { background: `radial-gradient(ellipse 40% 55% at ${center.x - r.x}px ${center.y - r.y}px, ${alpha(accent, .22)}, transparent 70%)`, opacity: 0, mixBlendMode: 'screen' });
    A(g, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], t, 1180, 'soft');
  }
  function heroIn(t) {
    [[$('hero-logo'), 0], [home.querySelector('.hero-word'), 50], [$('home-sub'), 90]].forEach(([el, d]) =>
      A(el, [{ opacity: 0, transform: 'translateY(-28px) scale(.92)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], t + d, 560, 'out'));
    A($('hero-glint'), [{ transform: 'translateX(-700px)' }, { transform: 'translateX(1700px)' }], t + 480, 620, 'soft');
    A($('hero-eyes'), [{ transform: 'none' }, { transform: 'scaleY(.08)', offset: .5 }, { transform: 'none' }], t + 620, 200);
    for (const canvas of [$('home-sky'), $('home-sky-front')]) fade(canvas, t - 80, 700, 0, 1, 'soft');
  }
  function headerIn(t) {
    const heading = room.querySelector('.room-heading');
    kids(heading).forEach((el, i) => A(el, [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], t + i * 50, 420, 'out'));
    A($('invite-panel'), [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], t + 300, 480, 'pop');
    fade(room.querySelector('.call-side-end'), t + 460, 300, 0, 1);
    fade(room.querySelector('.chat-panel'), t + 200, 420, 0, 1);
    for (const el of [$('room-status'), $('invite-status')]) if (shown(el)) fade(el, t + 200, 320, 0, 1);
  }
  function headerOut(view, t) {
    A(view.querySelector('.room-header'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }], t, 220, 'in');
    for (const s of ['.call-side-end', '.chat-panel', '.room-status', '.invite-status']) fade(view.querySelector(s), t, 180, 1, 0, 'in');
  }
  const homeCard = () => ({ card: $('room-live'), thumb: home.querySelector('.live-thumb'), text: home.querySelector('.room-live-text'), actions: home.querySelector('.room-live-actions') });
  function cardIn(t, t2) {
    const { card, thumb, text, actions } = homeCard(), look = css(card);
    A(card, [{ backgroundColor: 'rgba(0, 0, 0, 0)', boxShadow: clear(look.boxShadow), transform: 'scale(.96)' }, { backgroundColor: look.backgroundColor, boxShadow: look.boxShadow, transform: 'none' }], t, 460, 'out');
    kids(text).forEach((el, i) => A(el, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], t + 100 + i * 50, 400, 'out'));
    kids(actions).forEach((el, i) => A(el, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], t + 200 + i * 50, 420, 'pop'));
    fade(thumb, t2, 140, 0, 1); A(thumb.querySelector('.live-thumb-icon'), [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], t2 + 40, 360, 'pop');
    rise([...kids(home.querySelector('.home-actions')), ...['clip-invite', 'home-join-hint'].map($).filter(shown)], t + 220);
  }
  function cardOut(view, t) {
    const card = view.querySelector('.room-live'), look = css(card);
    A(card, [{ backgroundColor: look.backgroundColor, boxShadow: look.boxShadow, transform: 'none' }, { backgroundColor: 'rgba(0, 0, 0, 0)', boxShadow: clear(look.boxShadow), transform: 'scale(.97)' }], t + 40, 240, 'in');
    for (const s of ['.room-live-text', '.room-live-actions']) fade(view.querySelector(s), t, 160, 1, 0, 'in');
    sink(kids(view.querySelector('.home-actions')), t, 30, 220);
  }
  // The stage seen as a thumbnail: same corner, uniform scale, centred in the card's thumb.
  function toThumb(stage, s, th) {
    const k = Math.min(th.w / s.w, th.h / s.h), x = th.x + (th.w - s.w * k) / 2 - s.x, y = th.y + (th.h - s.h * k) / 2 - s.y;
    return { transform: `translate(${x}px,${y}px) scale(${k})`, borderRadius: 10 / k + 'px', radius: css(stage).borderRadius };
  }

  /* Criar sala: Painel → sala */
  function create(run) {
    stop(); if (!enabled()) return run();
    // Connecting re-renders the Painel at once, so the one that leaves is a frozen copy taken before the click lands.
    const clock = () => document.timeline.currentTime ?? performance.now(), t0 = clock(), old = copy(home, '1'), q = s => pick(old, s), button = q('#create-room'), readyBar = q('.ready-bar'), avatar = q('#ready-avatar .avatar');
    const src = { btn: box(button), av: shown(avatar) ? box(avatar) : null, bar: shown(readyBar) ? box(readyBar) : null }, barLook = readyBar && snap(readyBar), s = css(button);
    const look = { borderRadius: s.borderRadius, backgroundColor: s.backgroundColor, color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily, gap: s.gap };
    const items = shared(room, old).map(item => Object.assign(item, { from: shown(item.ready) ? box(item.ready) : null }));
    const navFrom = nav($('home-tab'));
    sky = true; run(); front(room); for (const name of ['motion-wait', 'motion-others', 'motion-self', 'motion-name', 'motion-face']) flag(room, name); flag($('room-people'), 'motion-wait');
    if (!src.btn) return stop();
    pill(navFrom, $('host-tab'), 260);
    // The button presses in and takes over from the real one, which stays hidden underneath.
    const g = ghost(src.btn, { zIndex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: look.borderRadius, background: look.backgroundColor, color: look.color, fontSize: look.fontSize, fontWeight: look.fontWeight, fontFamily: look.fontFamily });
    const label = document.createElement('div'); Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: look.gap, whiteSpace: 'nowrap' });
    label.append(...[...button.children].map(freeze));
    const sheen = document.createElement('div'); Object.assign(sheen.style, { position: 'absolute', inset: '0', background: 'linear-gradient(110deg,transparent 35%,#ffffffa0 50%,transparent 65%)', transform: 'translateX(-120%)' });
    g.append(label, sheen); tweak(button, 'visibility', 'hidden');
    A(g, [{ transform: 'scale(1)' }, { transform: 'scale(.955)', offset: .3, easing: E.out }, { transform: 'scale(1)', easing: E.pop }], 0, 360, 'linear');
    A(sheen, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], 0, 520, 'soft');
    A(label.querySelector('svg'), [{ transform: 'none' }, { transform: 'rotate(90deg) scale(.6)' }], 0, 240);
    A(label, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.88)' }], 90, 170, 'in');
    // The Painel leaves, accelerating out, top to bottom.
    [[q('#hero-logo'), 90], [q('.hero-word'), 130], [q('#home-sub'), 170]].forEach(([el, d]) =>
      A(el, [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-34px) scale(.92)', filter: 'blur(8px)' }], d, 340, 'in'));
    A(q('#hero-eyes'), [{ transform: 'none' }, { transform: 'translateY(18px) scaleY(.3)', offset: .5 }, { transform: 'translateY(18px) scaleY(.3)' }], 0, 260);
    sink([...kids(q('.home-actions')).filter(el => el !== button), q('#ready-state'), q('#room-live'), q('#clip-invite')].filter(shown), 60, 30, 260);
    for (const canvas of [$('home-sky'), $('home-sky-front')]) fade(canvas, 200, 500, 1, 0, 'soft');
    if (src.bar) {
      fade(q('#ready-name'), 60, 160, 1, 0, 'in'); fade(readyBar.querySelector('.ready-sep'), 60, 160, 1, 0, 'in');
      for (const el of [avatar, ...items.map(item => item.ready)]) hide(el, 5000);
      flag(readyBar, 'motion-naked');
    } else sink([q('#home-ready')].filter(shown), 60);
    // Your tile, avatar and the call bar exist only once the local server answers; until then the room waits invisible.
    const mine = () => self() && room.querySelector(`#people-grid .person-tile[data-member="${CSS.escape(self())}"]`);
    const settled = () => mine() && shown(group(room)) && (room.querySelector('#people-grid .invite-tile') || clock() - t0 > 500);
    const wait = () => { if (settled() || clock() - t0 > 900) land(clock() - t0); else raf = requestAnimationFrame(wait); };
    raf = requestAnimationFrame(wait);

    function land(late) {
      const T = t => t - late, accent = look.backgroundColor, tile = mine(), bar = group(room), stage = $('stage');
      room.classList.remove('motion-wait'); $('room-people').classList.remove('motion-wait');
      A(stage, [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], T(320), 620, 'out');
      headerIn(T(520));
      // The room re-renders cards while it connects (voice state, invite), so tiles stay hidden by class and each
      // reveal looks up the card that exists at that moment instead of animating one that may be gone.
      const own = () => mine() || room.querySelector('#people-grid .person-tile.own'), others = () => [...room.querySelectorAll('#people-grid > :not(.own), #streams-grid > *')].filter(shown);
      later(T(760), () => {
        room.classList.remove('motion-others');
        others().forEach((el, i) => {
          A(el, [{ opacity: 0, transform: 'translateX(48px) scale(.96)' }, { opacity: 1, transform: 'none' }], i * 60, 560, 'out', { fill: 'backwards' });
          kids(el).forEach((child, j) => A(child, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 120 + i * 60 + j * 45, 360, 'out', { fill: 'backwards' }));
        });
      });
      if (tile) {
        const to = box(tile), tl = css(tile), face = tile.querySelector('.avatar'), end = T(850), big = face && box(face);
        A(g, [{ ...at(src.btn), borderRadius: look.borderRadius, backgroundColor: accent, boxShadow: `0 0 0 0 ${alpha(accent, 0)}, inset 0 0 0 2px ${accent}` },
          { offset: .55, boxShadow: `0 40px 120px -30px ${alpha(accent, .55)}, inset 0 0 0 2px ${accent}`, backgroundColor: alpha(accent, .35) },
          { ...at(to), borderRadius: tl.borderRadius, backgroundColor: '#1f2128', boxShadow: `0 0 0 0 ${alpha(accent, 0)}, inset 0 0 0 2px ${alpha(accent, .8)}` }], T(150), 700, 'morph');
        fade(g, end - 40, 200, 1, 0, 'linear');
        later(end - 60, () => { room.classList.remove('motion-self'); fade(own(), 0, 200, 0, 1, 'linear'); });
        later(T(930), () => { room.classList.remove('motion-name'); A(own()?.querySelector('.person-name'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 0, 360, 'out', { fill: 'backwards' }); });
        glow(box(stage) || to, mid(to), accent, T(620));
        if (big) {
          if (src.av) fly(big, src.av, face, T(260), 780, true);
          later(src.av ? T(1040) : T(900), () => {
            room.classList.remove('motion-face'); const now = own()?.querySelector('.avatar');
            if (!src.av) return A(now, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 0, 460, 'pop', { fill: 'backwards' });
            layer.querySelectorAll('.motion-fly').forEach(el => el.remove());
            A(now, [{ transform: 'none' }, { transform: 'scale(1.08)', offset: .3, easing: E.out }, { transform: 'scale(.98)', offset: .65, easing: E.soft }, { transform: 'none' }], 0, 460, 'linear', { fill: 'none' });
          });
          ripple(big, T(1040), accent);
        } else later(T(900), () => room.classList.remove('motion-face'));
      } else { fade(g, T(150), 300, 1, 0); for (const name of ['motion-self', 'motion-name', 'motion-face']) room.classList.remove(name); }
      if (bar) {
        const ready = new Set(items.map(item => item.holder)), parts = kids(bar).filter(el => !ready.has(el)), center = mid(box(bar)).x;
        if (src.bar) {
          shell(room, bar, src.bar, box(bar), barLook, snap(bar), T(120), 620); flag(bar, 'motion-naked');
          items.forEach(({ holder, button, icon, from: r }, i) => {
            if (!holder) return;
            A(holder, [{ backgroundColor: 'rgba(0, 0, 0, 0)' }, { backgroundColor: css(holder).backgroundColor }], T(640 + i * 30), 420, 'out', { fill: 'backwards' });
            for (const caret of holder.querySelectorAll('.device-caret')) A(caret, [{ opacity: 0, transform: 'translateX(6px)' }, { opacity: 1, transform: 'none' }], T(700 + i * 30), 320, 'out');
            const to = box(icon); if (!r || !to) return fade(holder, T(640), 300, 0, 1);
            A(button, [{ transform: `translate(${mid(r).x - mid(to).x}px,${mid(r).y - mid(to).y}px) scale(${r.w / to.w})` }, { transform: 'none' }], T(140 + i * 30), 640, 'morph');
          });
        } else A(bar, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], T(500), 520, 'out');
        parts.map(el => ({ el, d: Math.abs(mid(box(el)).x - center) })).sort((a, b) => a.d - b.d)
          .forEach(({ el }, i) => A(el, [{ opacity: 0, transform: 'translateY(10px) scale(.6)' }, { opacity: 1, transform: 'none' }], T(620 + i * 34), 440, 'pop'));
        const mic = items[1]?.holder;
        if (mic) A(mic, [{ boxShadow: `0 0 0 0 ${alpha(accent, .9)}` }, { boxShadow: `0 0 0 8px ${alpha(accent, 0)}` }], T(1200), 700, 'std', { fill: 'none' });
      }
      fade($('room-people'), T(1000), 400, 0, 1);
      finish(T(1800));
    }
  }

  /* Painel without leaving: the stage shrinks into the card's thumbnail */
  function minimize(run) {
    stop(); if (!enabled()) return run();
    const stage = $('stage'), s = box(stage), navFrom = nav($('host-tab'));
    const show = pin(room, '3'); run(); show();
    const th = box(homeCard().thumb); if (!s || !th) return stop();
    const end = toThumb(stage, s, th);
    pill(navFrom, $('home-tab'), 80);
    headerOut(room, 0);
    A(room.querySelector('.call-bar'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(26px) scale(.96)' }], 0, 260, 'in');
    tweak(stage, 'transform-origin', '0 0');
    A(stage, [{ transform: 'none', borderRadius: end.radius }, { transform: end.transform, borderRadius: end.borderRadius }], 60, 640, 'morph');
    fade(stage, 640, 140, 1, 0);
    cardIn(400, 640);
    finish(1100);
  }

  /* Voltar à sala: the thumbnail grows back into the stage */
  function resume(run) {
    stop(); if (!enabled()) return run();
    const th = box(homeCard().thumb), navFrom = nav($('home-tab')), view = home;
    const show = pin(home, '1'); run(); show(); front(room);
    const stage = $('stage'), s = box(stage); if (!s || !th) return stop();
    const start = toThumb(stage, s, th);
    pill(navFrom, $('host-tab'), 80);
    tweak(stage, 'transform-origin', '0 0');
    A(stage, [{ transform: start.transform, borderRadius: start.borderRadius }, { transform: 'none', borderRadius: start.radius }], 40, 660, 'morph');
    fade(stage, 0, 140, 0, 1);
    fade(homeCard().thumb, 60, 120, 1, 0);
    cardOut(view, 0);
    headerIn(380);
    A(room.querySelector('.call-bar'), [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], 380, 560, 'out');
    fade($('room-people'), 600, 400, 0, 1);
    finish(1100);
  }

  /* Sair da sala: the creation backwards, a little faster */
  function leave(run) {
    stop(); if (!enabled()) return run();
    // Leaving clears the stage at once, so the stage that leaves is a frozen copy; header and call bar are the real ones.
    const id = self(), stage = $('stage'), mine = root => id && root?.querySelector(`.person-tile[data-member="${CSS.escape(id)}"]`), tile = mine(stage);
    const bar = group(room), items = shared(room, home), from = { tile: shown(tile) ? box(tile) : null, av: shown(tile?.querySelector('.avatar')) ? box(tile.querySelector('.avatar')) : null, bar: shown(bar) ? box(bar) : null };
    const tileLook = tile && snap(tile), barLook = bar && snap(bar), icons = items.map(item => Object.assign(item, { from: shown(item.icon) ? box(item.icon) : null })), navFrom = nav($('host-tab'));
    const old = shown(stage) ? snapshot(stage) : null, ghostTile = mine(old), face = ghostTile?.querySelector('.avatar');
    sky = true; const show = pin(room, '3'); run(); show(); hide(stage, 5000);
    const button = $('create-room'), readyBar = home.querySelector('.ready-bar'), avatar = $('ready-avatar')?.querySelector('.avatar');
    const to = { btn: shown(button) ? box(button) : null, av: shown(avatar) ? box(avatar) : null, bar: shown(readyBar) ? box(readyBar) : null };
    const s = button && css(button), look = s && { borderRadius: s.borderRadius, backgroundColor: s.backgroundColor, color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily, gap: s.gap };
    pill(navFrom, $('home-tab'), 100);
    headerOut(room, 0);
    const others = old ? [...old.querySelectorAll('.people-grid > *, .call-grid > *')].filter(el => el !== ghostTile && shown(el)) : [];
    others.forEach((el, i) => A(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(40px) scale(.96)' }], i * 30, 280, 'in'));
    A(old, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.985)' }], 160, 360, 'in');
    if (from.tile && to.btn) {
      // Your tile shrinks back into Criar sala.
      const accent = look.backgroundColor;
      const g = ghost(from.tile, { zIndex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: look.color, fontSize: look.fontSize, fontWeight: look.fontWeight, fontFamily: look.fontFamily });
      const label = document.createElement('div'); Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: look.gap, whiteSpace: 'nowrap' });
      label.append(...[...button.children].map(freeze)); g.append(label);
      hide(ghostTile, 5000);
      A(g, [{ ...at(from.tile), borderRadius: tileLook.borderRadius, backgroundColor: '#1f2128', boxShadow: `inset 0 0 0 2px ${alpha(accent, .8)}` }, { offset: .6, backgroundColor: alpha(accent, .5) },
        { ...at(to.btn), borderRadius: look.borderRadius, backgroundColor: accent, boxShadow: `inset 0 0 0 2px ${accent}` }], 120, 620, 'morph');
      A(label, [{ opacity: 0, transform: 'scale(.88)' }, { opacity: 1, transform: 'none' }], 600, 260, 'out');
      A(label.querySelector('svg'), [{ transform: 'rotate(90deg) scale(.6)' }, { transform: 'none' }], 600, 420, 'pop');
      hide(button, 740);
    } else if (button) rise([button], 420);
    if (from.av && to.av && face) {
      const { inner } = fly(from.av, to.av, face, 140, 620, false);
      A(inner, [{ transform: 'none' }, { transform: 'scale(1.07)', offset: .5 }, { transform: 'none' }], 0, 220, 'soft');
      hide(avatar, 760);
    }
    if (from.bar && to.bar) {
      shell(room, bar, from.bar, to.bar, barLook, snap(readyBar), 140, 580); flag(bar, 'motion-naked'); flag(readyBar, 'motion-naked');
      const moving = new Set(items.map(item => item.holder)), center = mid(from.bar).x;
      kids(bar).filter(el => !moving.has(el)).map(el => ({ el, d: Math.abs(mid(box(el)).x - center) })).sort((a, b) => b.d - a.d)
        .forEach(({ el }, i) => A(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.6)' }], i * 22, 200, 'in'));
      icons.forEach(({ holder, button, icon, ready, from: r }, i) => {
        A(holder, [{ backgroundColor: css(holder).backgroundColor }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], 60, 200, 'in');
        for (const caret of holder.querySelectorAll('.device-caret')) fade(caret, 40, 140, 1, 0, 'in');
        const target = shown(ready) ? box(ready) : null; if (!r || !target) return fade(holder, 0, 200, 1, 0, 'in');
        A(button, [{ transform: 'none' }, { transform: `translate(${mid(target).x - mid(r).x}px,${mid(target).y - mid(r).y}px) scale(${target.w / r.w})` }], 130 + i * 20, 580, 'morph');
        hide(ready, 760);
      });
      fade(bar, 780, 1, 1, 0, 'linear');
      for (const el of [$('ready-name'), readyBar.querySelector('.ready-sep')]) fade(el, 640, 260, 0, 1);
    } else {
      A(room.querySelector('.call-bar'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(26px)' }], 0, 240, 'in');
      rise([$('home-ready')], 620);
    }
    heroIn(380);
    rise([...kids(home.querySelector('.home-actions')).filter(el => el !== button), $('ready-state')].filter(shown), 620);
    finish(1400);
  }

  /* Sair from the Painel card: the card folds away and the Painel comes back */
  function cardLeave(run) {
    stop(); if (!enabled()) return run();
    const card = $('room-live'), old = shown(card) ? snapshot(card) : null; sky = true; run();
    if (old) {
      A(old.querySelector('.live-thumb'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], 0, 240, 'in');
      for (const s of ['.room-live-text', '.room-live-actions']) fade(old.querySelector(s), 0, 160, 1, 0, 'in');
      A(old, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], 40, 260, 'in');
    }
    heroIn(200);
    rise([...kids(home.querySelector('.home-actions')), $('home-ready')].filter(shown), 360);
    finish(1400);
  }
  return api;
}
