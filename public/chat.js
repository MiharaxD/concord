// Chat da sala: texto, imagens e arquivos. Nada é guardado fora da memória desta aba.
export const CHAT_MAX_FILE = Infinity;
const SLICE = 512 * 1024, FOLD = 8 * 1024 * 1024, ACK_TIMEOUT = 30000, IDLE_TIMEOUT = 60000, GROUP_MS = 5 * 60 * 1000;
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const VIDEOS = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);
const AUDIOS = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/flac']);
const EXTENSIONS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' };
// Media type shown inline (never SVG/HTML); generic or missing types fall back to the extension.
function previewType(file) {
  const mime = String(file.mime || '').toLowerCase(), byName = EXTENSIONS[String(file.name).split('.').pop().toLowerCase()];
  const type = IMAGES.has(mime) || VIDEOS.has(mime) || AUDIOS.has(mime) ? mime : (!mime || mime === 'application/octet-stream') && byName ? byName : '';
  return type ? { type, kind: IMAGES.has(type) ? 'image' : VIDEOS.has(type) ? 'video' : 'audio' } : null;
}
const RISKY = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jse|wsf|hta|lnk|reg|jar|dll)$/i;
const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const SVG = 'http://www.w3.org/2000/svg';
const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😭', '😡', '😱', '👀', '🙄', '😴', '🤯', '🥳', '🤝', '👍', '👎', '👏', '🙏', '💪', '👋', '✌️', '🤙', '🔥', '❤️', '💜', '💯', '✨', '🎉', '🎮', '🏆', '🍕', '☕', '🎧', '📺', '✅', '❌'];
function icon(...paths) {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    for (const [name, value] of [['d', d], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]) path.setAttribute(name, value);
    svg.append(path);
  }
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const newId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(15)))).replace(/\+/g, '-').replace(/\//g, '_');
const clock = ts => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const number = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const humanSize = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${number(bytes / 1024)} KB` : bytes < 1024 ** 3 ? `${number(bytes / 1024 ** 2)} MB` : `${number(bytes / 1024 ** 3)} GB`;
function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}
function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
function fromBase64(text) {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class RoomChat {
  constructor({ root, send, notice, onUnread, onIncoming }) {
    Object.assign(this, { root, rawSend: send, notice, onUnread, onIncoming, selfId: '', selfProfile: {}, members: new Map(), enabled: true, visible: false, unread: 0, pinned: true });
    this.incoming = new Map(); this.uploads = new Map(); this.acks = new Map(); this.urls = new Set();
    this.queue = Promise.resolve(); this.last = null; this.drag = 0; this.gen = 0;
    this.build();
  }

  build() {
    const { root } = this;
    root.classList.add('chat-root');
    const head = el('div', 'chat-head');
    head.append(el('strong', 'chat-title', 'Chat da sala'), el('small', 'chat-sub', 'As mensagens somem quando a sala fecha.'));
    this.log = el('div', 'chat-log');
    this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-live', 'polite');
    this.log.addEventListener('scroll', () => { this.pinned = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60; });
    this.off = el('p', 'chat-off', 'Quem criou a sala precisa estar no Concord 0.7.2 ou mais novo para usar o chat.');
    this.off.hidden = true;
    this.form = el('form', 'chat-composer');
    const attach = el('div', 'chat-attach');
    this.attach = el('button', 'chat-attach-btn'); this.attach.type = 'button';
    this.attach.title = this.attach.ariaLabel = 'Anexar arquivo ou imagem';
    this.attach.append(icon('M12 5v14M5 12h14'));
    attach.append(this.attach);
    this.picker = el('input'); this.picker.type = 'file'; this.picker.multiple = true; this.picker.hidden = true;
    this.input = el('input', 'chat-input'); this.input.type = 'text'; this.input.maxLength = 2000;
    this.input.placeholder = 'Mensagem para a sala'; this.input.autocomplete = 'off'; this.input.ariaLabel = 'Mensagem para a sala';
    // Discord-style bar: + attaches, Enter sends, the face opens a small emoji panel.
    this.emoji = el('button', 'chat-emoji-btn'); this.emoji.type = 'button'; this.emoji.title = this.emoji.ariaLabel = 'Emojis';
    this.emoji.setAttribute('aria-expanded', 'false'); this.emoji.setAttribute('aria-haspopup', 'true');
    this.emoji.append(icon('M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M8.5 14.5a4.5 4.5 0 0 0 7 0', 'M9 9.5h.01M15 9.5h.01'));
    this.emojis = el('div', 'chat-emoji-panel'); this.emojis.hidden = true; this.emojis.setAttribute('role', 'group'); this.emojis.ariaLabel = 'Emojis';
    for (const value of EMOJIS) {
      const button = el('button', 'chat-emoji', value); button.type = 'button'; button.title = value;
      button.addEventListener('click', () => { this.insert(value); this.toggleEmojis(false); });
      this.emojis.append(button);
    }
    this.form.append(attach, this.picker, this.input, this.emoji);
    root.append(head, this.log, this.off, this.emojis, this.form);

    this.attach.addEventListener('click', () => this.picker.click());
    this.picker.addEventListener('change', () => { const files = [...this.picker.files]; this.picker.value = ''; this.submitAll(files); });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.submitAll([]); });
    this.input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); this.submitAll([]); } });
    this.emoji.addEventListener('click', () => this.toggleEmojis(this.emojis.hidden));
    this.emojis.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.toggleEmojis(false); this.emoji.focus(); } });
    document.addEventListener('pointerdown', event => { if (!this.emojis.hidden && !this.emojis.contains(event.target) && !this.emoji.contains(event.target)) this.toggleEmojis(false); });
    this.input.addEventListener('paste', event => {
      const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); this.submitAll(files); }
    });
    const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
    root.addEventListener('dragenter', event => { if (hasFiles(event)) { event.preventDefault(); this.drag++; root.classList.add('chat-drop'); } });
    root.addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
    root.addEventListener('dragleave', event => { if (hasFiles(event) && --this.drag <= 0) { this.drag = 0; root.classList.remove('chat-drop'); } });
    root.addEventListener('drop', event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); this.drag = 0; root.classList.remove('chat-drop');
      this.submitAll([...event.dataTransfer.files]);
    });
  }

  setSelf(id, profile) { this.selfId = id; this.selfProfile = profile || {}; }
  setMembers(members) { this.members = new Map((members || []).map(member => [member.id, member])); }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.off.hidden = this.enabled;
    for (const control of [this.attach, this.input, this.emoji]) control.disabled = !this.enabled;
    if (!this.enabled) this.toggleEmojis(false);
  }
  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.visible) { this.setUnread(0); this.scroll(true); }
  }
  toggleEmojis(open) {
    this.emojis.hidden = !open; this.emoji.setAttribute('aria-expanded', String(Boolean(open)));
    if (open) this.emojis.firstElementChild?.focus();
  }
  // Puts the emoji where the caret is, so it can go in the middle of a message.
  insert(text) {
    const { input } = this, start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    if (input.value.length - (end - start) + text.length > input.maxLength) return;
    input.setRangeText(text, start, end, 'end'); input.focus();
  }
  setUnread(count) { if (count !== this.unread) { this.unread = count; this.onUnread?.(count); } }

  message(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'chat') { this.receive(msg); return true; }
    if (msg.type === 'chat-chunk') { this.chunk(msg); return true; }
    if (msg.type === 'chat-ack') {
      const wait = this.acks.get(msg.file);
      if (wait && wait.seq === msg.seq) wait.done(true);
      return true;
    }
    return false;
  }

  clear() {
    for (const upload of this.uploads.values()) upload.aborted = true;
    for (const wait of [...this.acks.values()]) wait.done(false);
    for (const entry of this.incoming.values()) clearTimeout(entry.timer);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.incoming.clear(); this.uploads.clear(); this.acks.clear(); this.urls.clear();
    this.last = null; this.pinned = true; this.queue = Promise.resolve(); this.gen++;
    this.log.replaceChildren(); this.input.value = ''; this.toggleEmojis(false);
    this.setUnread(0);
  }

  scroll(force) { if (force || this.pinned) { this.log.scrollTop = this.log.scrollHeight; this.pinned = true; } }

  avatar(name, photo) {
    const box = el('div', 'chat-avatar');
    if (typeof photo === 'string' && PHOTO.test(photo)) { const image = el('img'); image.alt = ''; image.src = photo; box.append(image); }
    else box.textContent = initials(name);
    return box;
  }

  // Returns the entry used to update the file box later.
  render({ from, name, photo, ts, text, file, self }) {
    const group = this.last && this.last.from === from && ts - this.last.ts < GROUP_MS;
    this.last = { from, ts };
    const item = el('div', 'chat-msg' + (self ? ' chat-self' : '') + (group ? ' chat-cont' : ''));
    const body = el('div', 'chat-body');
    if (!group) {
      const meta = el('div', 'chat-meta');
      meta.append(el('span', 'chat-name', name), el('time', 'chat-time', clock(ts)));
      body.append(meta);
    }
    if (text) body.append(el('div', 'chat-text', text));
    item.append(group ? el('div', 'chat-avatar chat-avatar-gap') : this.avatar(name, photo), body);
    const entry = file ? this.fileBox(file) : null;
    if (entry) body.append(entry.box);
    this.log.append(item); this.scroll(self);
    return entry;
  }

  fileBox(file) {
    const box = el('div', 'chat-file'), card = el('div', 'chat-card'), info = el('div', 'chat-info');
    const entry = { box, file, bar: el('div', 'chat-bar'), status: el('div', 'chat-status'), action: el('span', 'chat-action'), slot: el('div', 'chat-preview') };
    const track = el('div', 'chat-progress'); track.append(entry.bar); entry.track = track;
    info.append(el('span', 'chat-fname', file.name), el('span', 'chat-fsize', humanSize(file.size)));
    card.append(info, entry.action); entry.card = card;
    box.append(entry.slot, card, track, entry.status);
    if (RISKY.test(file.name)) box.append(el('div', 'chat-warn', 'Arquivo executável: só abra se confiar em quem enviou.'));
    return entry;
  }

  progress(entry, fraction, bytes = 0) {
    entry.bar.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
    entry.status.classList.remove('chat-error');
    entry.status.textContent = fraction < 1 ? `${humanSize(bytes)} de ${humanSize(entry.file.size)}` : '';
  }
  fail(entry, text) { entry.track.hidden = true; entry.status.textContent = text; entry.status.classList.add('chat-error'); }
  ready(entry, blob) {
    entry.track.hidden = true; entry.status.textContent = '';
    const url = URL.createObjectURL(blob); this.urls.add(url);
    const link = el('a', 'chat-download', 'Baixar'); link.href = url; link.download = entry.file.name;
    entry.action.replaceChildren(link);
    const preview = previewType(entry.file); if (!preview) return;
    // Re-type the blob only for the inline player; the download keeps the original bytes and name.
    const source = blob.type === preview.type ? url : URL.createObjectURL(new Blob([blob], { type: preview.type }));
    if (source !== url) this.urls.add(source);
    if (preview.kind === 'image' || preview.kind === 'video') {
      // Like Discord: only the media; a download icon shows in the corner on hover. Without a decoder, back to the card.
      const frame = el('div', 'chat-media'), save = el('a', 'chat-media-download');
      save.href = url; save.download = entry.file.name; save.title = 'Baixar'; save.setAttribute('aria-label', 'Baixar ' + entry.file.name);
      const icon = document.createElementNS(SVG, 'svg'), path = document.createElementNS(SVG, 'path');
      icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); path.setAttribute('d', 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14'); icon.append(path); save.append(icon);
      const fallback = () => { frame.remove(); entry.card.hidden = false; };
      let media;
      if (preview.kind === 'image') {
        media = el('button', 'chat-img-btn'); const image = el('img', 'chat-img');
        media.type = 'button'; media.ariaLabel = 'Ampliar imagem'; image.alt = entry.file.name;
        image.addEventListener('load', () => this.scroll()); image.addEventListener('error', fallback);
        media.addEventListener('click', () => image.classList.toggle('chat-img-big'));
        image.src = source; media.append(image);
      } else {
        media = el('video', 'chat-video'); media.controls = true; media.preload = 'metadata'; media.playsInline = true;
        media.addEventListener('loadedmetadata', () => this.scroll()); media.addEventListener('error', fallback);
        media.src = source;
      }
      frame.append(media, save); entry.slot.append(frame); entry.card.hidden = true;
      return;
    }
    // Players never autoplay; if this PC cannot decode the format, only Baixar remains.
    const player = el(preview.kind, 'chat-' + preview.kind);
    player.controls = true; player.preload = 'metadata'; player.playsInline = true;
    player.addEventListener('loadedmetadata', () => this.scroll());
    player.addEventListener('error', () => player.remove());
    player.src = source; entry.slot.append(player);
  }

  receive(msg) {
    if (typeof msg.id !== 'string' || typeof msg.from !== 'string' || typeof msg.text !== 'string') return;
    const member = this.members.get(msg.from), name = (typeof msg.name === 'string' && msg.name) || member?.name || 'Amigo';
    const raw = msg.file, ok = raw && typeof raw === 'object' && typeof raw.id === 'string' && typeof raw.name === 'string' && Number.isSafeInteger(raw.size) && raw.size > 0;
    const file = ok ? { id: raw.id, name: raw.name.slice(0, 200), size: raw.size, mime: typeof raw.mime === 'string' ? raw.mime.toLowerCase() : 'application/octet-stream' } : null;
    const ts = Number.isFinite(msg.ts) ? msg.ts : Date.now();
    const entry = this.render({ from: msg.from, name, photo: member?.photo, ts, text: msg.text.slice(0, 2000), file });
    if (!this.visible) { this.setUnread(this.unread + 1); this.onIncoming?.({ from: msg.from, name, text: msg.text.slice(0, 2000), file }); }
    if (!entry) return;
    if (this.incoming.has(file.id)) { this.fail(entry, 'Arquivo não recebido.'); return; }
    const state = { entry, from: msg.from, size: file.size, got: 0, next: 0, parts: [], pending: [], pendingBytes: 0, timer: 0 };
    this.incoming.set(file.id, state); this.touch(state);
  }

  touch(state) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this.abort(state, 'Arquivo incompleto.'), IDLE_TIMEOUT);
  }

  abort(state, text) {
    clearTimeout(state.timer); this.incoming.delete(state.entry.file.id); state.parts = []; state.pending = [];
    this.fail(state.entry, text);
  }

  chunk(msg) {
    const state = this.incoming.get(msg.file);
    if (!state || state.from !== msg.from) return;
    if (!Number.isInteger(msg.seq) || msg.seq !== state.next || typeof msg.data !== 'string') { this.abort(state, 'Arquivo incompleto.'); return; }
    let bytes;
    try { bytes = fromBase64(msg.data); } catch { this.abort(state, 'Arquivo incompleto.'); return; }
    state.got += bytes.length; state.next++;
    if (state.got > state.size) { this.abort(state, 'Arquivo incompleto.'); return; }
    state.pending.push(bytes); state.pendingBytes += bytes.length;
    // Folding into Blobs lets Chromium page large files to disk instead of holding every chunk in the JS heap.
    if (state.pendingBytes >= FOLD) { state.parts.push(new Blob(state.pending)); state.pending = []; state.pendingBytes = 0; }
    this.progress(state.entry, state.got / state.size, state.got); this.touch(state);
    if (!msg.last) return;
    if (state.got !== state.size) { this.abort(state, 'Arquivo incompleto.'); return; }
    clearTimeout(state.timer); this.incoming.delete(state.entry.file.id);
    state.parts.push(new Blob(state.pending));
    this.ready(state.entry, new Blob(state.parts, { type: previewType(state.entry.file)?.type || 'application/octet-stream' }));
    state.parts = []; state.pending = [];
  }

  push(value) { try { this.rawSend(value); } catch { /* socket closed: the ack timeout reports it */ } }

  submitAll(files) {
    if (!this.enabled) return;
    let text = this.input.value.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').slice(0, 2000);
    const valid = [];
    for (const file of files) {
      if (!file.size) this.notice('O arquivo está vazio.', true);
      else valid.push(file);
    }
    if (!valid.length && !text.trim()) return;
    this.input.value = '';
    const self = { from: this.selfId, name: this.selfProfile.name || 'Você', photo: this.selfProfile.photo, self: true };
    if (!valid.length) { this.push({ type: 'chat', id: newId(), text }); this.render({ ...self, ts: Date.now(), text }); return; }
    for (const file of valid) {
      const meta = { id: newId(), name: file.name.replace(/[\u0000-\u001f\u007f-\u009f/\\]/g, '') || 'arquivo', size: file.size, mime: file.type || 'application/octet-stream' };
      const id = newId(), caption = text; text = '';
      const entry = this.render({ ...self, ts: Date.now(), text: caption, file: { ...meta, mime: meta.mime.toLowerCase() } });
      this.ready(entry, file); entry.track.hidden = false; this.progress(entry, 0, 0);
      // Uploads run one at a time so a pasted batch does not exceed the server's open-file limit.
      const gen = this.gen;
      this.queue = this.queue.then(() => gen === this.gen && this.upload(entry, file, meta, id, caption));
    }
  }

  expectAck(file, seq) {
    return new Promise(resolve => {
      const done = value => { clearTimeout(timer); if (this.acks.get(file) === wait) this.acks.delete(file); resolve(value); };
      const timer = setTimeout(() => done(false), ACK_TIMEOUT), wait = { seq, done };
      this.acks.set(file, wait);
    });
  }

  async upload(entry, file, meta, id, text) {
    const state = { aborted: false };
    this.uploads.set(meta.id, state);
    try {
      this.push({ type: 'chat', id, text, file: meta });
      for (let seq = 0, offset = 0; ; seq++) {
        const end = Math.min(offset + SLICE, file.size);
        const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        if (state.aborted) return;
        const ack = this.expectAck(meta.id, seq), last = end >= file.size;
        this.push({ type: 'chat-chunk', file: meta.id, seq, data: toBase64(bytes), last });
        const ok = await ack;
        if (state.aborted) return;
        if (!ok) { this.fail(entry, 'Envio interrompido.'); return; }
        offset = end; this.progress(entry, offset / file.size, offset);
        if (last) { entry.track.hidden = true; entry.status.textContent = ''; return; }
      }
    } catch { if (!state.aborted) this.fail(entry, 'Envio interrompido.'); }
    finally { this.uploads.delete(meta.id); }
  }
}
