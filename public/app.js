import { qualityPreset, videoBitrate, formatMbps } from './stream-settings.js';
import { parseInvite } from './invites.js';
import { RoomMedia } from './room-media.js';
import { connectRoom, P2PHost } from './p2p.js';
import { RoomChat } from './chat.js';
import { AudioMeter } from './audio-meter.js';
import { visualProfile } from './profile.js';
const $ = id => document.getElementById(id);
const native = window.concord, video = $('screen-video');
let config, role = null, socket, target, reconnectTimer, terminal = false, retries = 0, processing = Promise.resolve();
let media, self = '', members = [], focus = null, muted = false;
let viewedMember = null, profilePointerOutside = false;
let discordPending = false;
let discordFriends = [], friendsGeneration = 0, friendsInvite = '', friendPhotoObserver;
const friendInvites = new Map();
const tiles = new Map();
let stream, display, microphone, audioContext, mixDestination, selectedSource, starting = false, liveSince = 0, sideHidden = false;
let selectedAudioSource, appAudioContext, appAudioNode, unsubscribeAppAudio, unsubscribeAppAudioError;
let invite, inviteGeneration = 0, invitePending = false, inviteRetryAt = 0;
let ownInviteMessage = '', currentInvite = '', joining = false, joinTimer, uiReady = false, queuedInvite;
let p2pHost, hosting = false, hostGeneration = 0, accessClosed = false, p2pOffline = false, fallbackPromise;
let audioPreviewTrack, testingAudio = false, audioGeneration = 0, captureGeneration = 0;
let cameraStream, cameraStarting = false, cameraGeneration = 0, roomCamera = false, relayStream = 'screen';
const cameraViews = new Map(), cameraModes = new Map();
const meter = new AudioMeter($('audio-level'), $('audio-level-label'));
const chat = new RoomChat({ root: $('chat-root'), send: value => send(value), notice: (text, error) => notice(text, error),
  onUnread: count => { $('chat-badge').hidden = !count; $('chat-badge').textContent = count > 9 ? '9+' : String(count); } });
let noticeTimer;
// Confirmations fade after a few seconds; errors stay until replaced.
function notice(text, error = false) {
  clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = !text;
  if (text && !error) noticeTimer = setTimeout(() => notice(''), 4000);
}
function status(text, online = false) {
  document.body.dataset.connected = String(online); document.body.dataset.connectionState = text;
  updateRoomMessage();
}
function updateRoomMessage() {
  const state = document.body.dataset.connectionState;
  const relay = [...tiles.values()].some(item => !item.own && item.video.dataset.transport === 'relay') || (stream && media?.targets.size);
  $('room-status').textContent = state === 'Reconectando' ? 'A conexão caiu. Tentando voltar à sala…' : state === 'Conectando' ? 'Conectando à sala…'
    : document.body.dataset.connected === 'true' && relay ? 'Usando o modo de compatibilidade para manter a transmissão. Pode haver um pouco mais de atraso.' : '';
  $('room-status').hidden = !$('room-status').textContent;
}
function inviteStatus(text) { ownInviteMessage = text; renderInvite(); }
function renderInvite() {
  const guest = role === 'viewer', code = guest ? currentInvite : accessClosed ? '' : invite?.p2pInvite;
  const message = p2pOffline && !accessClosed ? 'Sem acesso ao serviço de conexão. Convidados podem não conseguir entrar até a internet voltar.' : ownInviteMessage;
  $('own-invite-controls').hidden = guest;
  $('invite-result').hidden = !code; $('invite-link').value = code || '';
  $('invite-status').textContent = guest ? '' : message;
  $('invite-status').hidden = guest || !message;
  $('invite-button').hidden = !accessClosed;
  $('cancel-invite').hidden = !invitePending;
  document.querySelector('.invite-manage').hidden = !code;
}
function showView(view) {
  document.body.dataset.view = view; $('home-view').hidden = view !== 'home'; $('room-view').hidden = view !== 'room';
  $('home-tab').classList.toggle('selected', view === 'home'); $('host-tab').classList.toggle('selected', view === 'room');
  $('host-tab').hidden = !target; $('resume-room').hidden = !target; $('room-people').hidden = view !== 'room';
  $('room-name').textContent = role === 'viewer' ? 'Sala atual' : 'Minha sala'; renderInvite(); renderTiles();
}
function createRoom() {
  const creating = role !== 'host' || !target;
  if (creating) { stopSharing(); stopCamera(); connect(config.address, config.hostToken, 'host'); }
  showView('room');
  if (!hosting && !accessClosed) void startHosting();
}
// The room is reachable directly through P2PHost; Cloudflare starts only when a guest asks for it.
async function startHosting(data) {
  const generation = ++hostGeneration; hosting = true; p2pHost?.stop('Convite substituído'); p2pHost = undefined; p2pOffline = false;
  try { data ||= await native.session(); }
  catch { if (generation === hostGeneration) { hosting = false; inviteStatus('Não consegui preparar o convite. Crie a sala novamente.'); } return; }
  if (generation !== hostGeneration) return;
  showInvite(data);
  const host = new P2PHost({ key: data.inviteKey, address: config.address, tunnel: fallbackInvite,
    onState: online => { if (p2pHost === host) { p2pOffline = !online; renderInvite(); } } });
  p2pHost = host;
  void host.start().catch(() => { if (p2pHost === host) { p2pOffline = true; renderInvite(); } });
  setTimeout(() => { if (p2pHost === host && !host.signal?.connected.size) { p2pOffline = true; renderInvite(); } }, 12000);
}
function stopHosting(reason) { ++hostGeneration; hosting = false; p2pHost?.stop(reason); p2pHost = undefined; p2pOffline = false; }
function fallbackInvite() {
  if (invite?.public) return Promise.resolve(invite.guestInvite);
  fallbackPromise ||= makeInvite().finally(() => { fallbackPromise = undefined; });
  return fallbackPromise;
}
function openJoin(value) {
  if (!uiReady) { if (value) queuedInvite = value; return; }
  if (joining) cancelJoin();
  $('join-error').textContent = ''; if (value !== undefined) $('join-input').value = value;
  $('join-hint').textContent = stream || cameraStream ? 'Confirme para trocar de sala e encerrar sua transmissão atual.' : 'Cole o convite e confirme para entrar.';
  if (!$('join-picker').open) $('join-picker').showModal();
  if (value !== undefined) { try { parseInvite(value); } catch (error) { $('join-error').textContent = error.message; } }
  $('join-input').focus();
}
// Links opened from the invite page join at once when nothing would be interrupted;
// inside a room or while sharing they still ask, so a link never ends the current session.
function receiveInvite(value) {
  if (uiReady && !target && !stream && !cameraStream && !joining) {
    try { parseInvite(value); openJoin(value); $('join-form').requestSubmit(); return; } catch {}
  }
  openJoin(value);
}
function joinFailure(text) {
  clearTimeout(joinTimer); joining = false; disconnect(); target = null; role = null; status('Não conectado'); showView('home');
  $('join-button').disabled = false; $('join-input').disabled = false; $('join-button').textContent = 'Entrar na sala';
  $('join-error').textContent = text;
}
function cancelJoin() {
  if (joining) { joining = false; disconnect(); target = null; role = null; status('Não conectado'); showView('home'); }
  $('join-button').disabled = false; $('join-input').disabled = false; $('join-button').textContent = 'Entrar na sala'; $('join-picker').close();
}
function preferenceValues() {
  return { resolution: $('quality').value, fps: $('fps').value, bitrateMode: $('bitrate-mode').value,
    bitrateMbps: Number($('bitrate-value').value), audioMode: $('audio-mode').value, audioEnabled: $('system-audio').checked, audioVersion: 2 };
}
function savePreferences() {
  if (!$('bitrate-value').validity.valid) return;
  void native.savePreferences(preferenceValues()).catch(() => notice('Não consegui salvar suas preferências neste PC.', true));
}
function applyPreferences(saved) {
  $('quality').value = saved.resolution; $('fps').value = saved.fps; $('bitrate-mode').value = saved.bitrateMode;
  $('bitrate-value').value = $('bitrate-slider').value = saved.bitrateMbps;
  $('audio-mode').value = saved.audioMode; $('system-audio').checked = saved.audioEnabled;
  updateBitrateControls(); updateAudioControls();
}
function qualityKey() { return $('quality').value + ':' + $('fps').value; }
function renderUpdate(state) {
  $('update-panel').hidden = !state.enabled;
  const messages = {
    checking: state.manual ? 'Verificando atualizações...' : '',
    idle: state.manual ? 'Você já está na versão mais recente.' : '',
    available: 'Nova versão disponível. Preparando download...',
    downloading: `Baixando atualização... ${Math.floor(state.percent)}%`,
    ready: 'Atualização pronta para instalar',
    installing: 'Encerrando a sala e atualizando...',
    error: state.manual ? 'Não consegui verificar agora. Tente novamente mais tarde.' : ''
  };
  $('update-label').textContent = messages[state.phase] || ''; $('update-label').hidden = !$('update-label').textContent;
  $('update-progress').hidden = state.phase !== 'downloading'; $('update-progress').value = state.percent;
  $('check-updates').hidden = ['available', 'downloading', 'ready', 'installing'].includes(state.phase);
  $('check-updates').disabled = state.phase === 'checking';
  $('install-update').hidden = !['ready', 'installing'].includes(state.phase);
  $('install-update').disabled = state.phase === 'installing';
  $('install-update').title = 'Encerra sua sala e reabre o Concord atualizado.';
}
$('check-updates').onclick = () => { void native.checkUpdates().then(renderUpdate).catch(() => {}); };
$('install-update').onclick = () => { void native.installUpdate().catch(() => {}); };
function send(value) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); }
// Relay chunks of the screen and camera encoders share the socket; a marker selects the stream.
function sendBytes(blob, kind = 'screen') {
  if (socket?.readyState !== WebSocket.OPEN) return true;
  if (socket.bufferedAmount + blob.size > 32 * 1024 * 1024) return false;
  if (kind !== relayStream) { relayStream = kind; socket.send(JSON.stringify({ type: 'relay-stream', stream: kind })); }
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) socket.send(blob.slice(offset, offset + 1024 * 1024));
  return true;
}
function avatar(profile, className = '') {
  profile = visualProfile(profile);
  const element = document.createElement(profile.photo ? 'img' : 'span'); element.className = 'avatar ' + className;
  if (profile.photo) { element.src = profile.photo; element.alt = ''; }
  else element.textContent = (profile.name || 'A').slice(0, 2).toUpperCase();
  return element;
}
function renderBanner(element, profile) {
  const safe = visualProfile(profile);
  element.style.backgroundColor = safe.accentColor || '';
  element.style.backgroundImage = safe.accentColor ? 'none' : '';
  if (element.id === 'name-banner') element.hidden = !safe.banner && !safe.accentColor;
  element.replaceChildren();
  if (safe.banner) { const image = document.createElement('img'); image.src = safe.banner; image.alt = ''; element.append(image); }
}
function tile(member, own = false) {
  let item = tiles.get(member.id);
  if (!item) {
    const element = document.createElement('div'); element.className = 'stream-tile'; element.dataset.member = member.id; element.tabIndex = 0; element.setAttribute('role', 'button');
    element.onkeydown = event => { if (event.target === element && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); element.click(); } };
    const player = own ? video : document.createElement('video'); player.autoplay = true; player.playsInline = true; player.className = 'call-video'; player.dataset.publisher = member.id;
    const placeholder = document.createElement('div'); placeholder.className = 'tile-placeholder';
    const label = document.createElement('span'); label.className = 'tile-label';
    const pip = document.createElement('div'); pip.className = 'camera-pip'; pip.hidden = true;
    // In picture-in-picture the camera has its own buttons; clicks there do not change focus.
    pip.onclick = event => { if (!element.classList.contains('camera-only')) event.stopPropagation(); };
    element.append(placeholder, player, pip, label); element.onclick = () => { focus = focus === member.id ? null : member.id; renderTiles(); };
    player.addEventListener('playing', () => { if (player.videoWidth) element.classList.add('playing'); renderTiles(); });
    player.addEventListener('emptied', () => element.classList.remove('playing'));
    player.addEventListener('canplay', () => media?.play(player));
    player.addEventListener('error', () => { if (media?.receivers.has(member.id)) media.recover(member.id); });
    item = { element, video: player, placeholder, label, own, member, pip }; tiles.set(member.id, item); $('streams-grid').append(element);
  }
  item.member = member; item.placeholder.replaceChildren(avatar(member, 'tile-avatar'));
  item.label.textContent = member.name + (own ? ' · você' : '');
  applyAudio(); return item.video;
}
function localTile() {
  if (!self || (!stream && !cameraStream)) return;
  tile({ id: self, ...config.profile, stream: { active: true } }, true);
  if (cameraStream) { const view = cameraView(self); if (view.video.srcObject !== cameraStream) view.video.srcObject = cameraStream; placeCamera(self); }
}
const ICONS = { full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', split: 'M3 5h11v8H3zM10 13v6h11v-8h-4', join: 'M3 4h18v16H3zM12 11h7v7h-7' };
function iconButton(className, label, icon, action) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'camera-action ' + className; button.title = label; button.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('d', ICONS[icon]); svg.append(path); button.append(svg);
  button.onclick = event => { event.stopPropagation(); action(); };
  return button;
}
// One camera view per publisher; the same element moves between the corner, its own tile or the whole tile.
function cameraView(id) {
  let view = cameraViews.get(id);
  if (!view) {
    const box = document.createElement('div'); box.className = 'camera-box'; box.dataset.camera = id;
    const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.muted = true; video.className = 'camera-video';
    const actions = document.createElement('div'); actions.className = 'camera-actions';
    actions.append(
      iconButton('camera-fullscreen', 'Câmera em tela cheia', 'full', () => { (document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen()).catch(error => notice(error.message, true)); }),
      iconButton('camera-detach', 'Separar a câmera em outro quadro', 'split', () => { cameraModes.set(id, 'tile'); placeCamera(id); }),
      iconButton('camera-attach', 'Voltar a câmera para o canto', 'join', () => { cameraModes.delete(id); placeCamera(id); }));
    box.append(video, actions);
    video.addEventListener('canplay', () => media?.play(video));
    video.addEventListener('error', () => { if (media?.receivers.has(id + ':camera')) media.recover(id + ':camera'); });
    view = { box, video }; cameraViews.set(id, view);
  }
  return view;
}
function cameraState(id) {
  if (id === self) return { camera: Boolean(cameraStream), screen: Boolean(stream), member: { id: self, ...config.profile } };
  const member = members.find(person => person.id === id);
  return { camera: Boolean(member?.stream.camera), screen: member?.stream.screen !== false, member };
}
function placeCamera(id) {
  const view = cameraViews.get(id), state = cameraState(id), main = tiles.get(id);
  if (!view) return;
  if (!state.camera || !main) { removeCamera(id); return; }
  const detached = state.screen && cameraModes.get(id) === 'tile';
  main.element.classList.toggle('camera-only', !state.screen);
  if (detached) { const item = cameraTile(id, state.member); if (view.box.parentElement !== item.slot) item.slot.append(view.box); main.pip.hidden = true; }
  else { removeCameraTile(id); if (view.box.parentElement !== main.pip) main.pip.append(view.box); main.pip.hidden = false; }
  view.box.dataset.mode = detached ? 'tile' : state.screen ? 'pip' : 'full';
  media?.play(view.video); renderTiles();
}
function cameraTile(id, member) {
  const key = id + ':camera'; let item = tiles.get(key);
  if (!item) {
    const element = document.createElement('div'); element.className = 'stream-tile camera-tile playing'; element.dataset.member = key; element.tabIndex = 0; element.setAttribute('role', 'button');
    const slot = document.createElement('div'); slot.className = 'camera-slot';
    const label = document.createElement('span'); label.className = 'tile-label';
    element.append(slot, label); element.onclick = () => { focus = focus === key ? null : key; renderTiles(); };
    element.onkeydown = event => { if (event.target === element && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); element.click(); } };
    item = { element, video: cameraViews.get(id).video, label, own: id === self, member: null, slot, camera: true }; tiles.set(key, item);
    const main = tiles.get(id)?.element; if (main) main.after(element); else $('streams-grid').append(element);
  }
  item.member = { ...member, id: key, name: member.name + ' · câmera' };
  item.label.textContent = item.member.name + (item.own ? ' · você' : '');
  return item;
}
function removeCameraTile(id) {
  const key = id + ':camera', item = tiles.get(key); if (!item) return;
  item.element.remove(); tiles.delete(key); if (focus === key) focus = null;
}
function removeCamera(id) {
  removeCameraTile(id); cameraModes.delete(id);
  const view = cameraViews.get(id);
  if (view) {
    cameraViews.delete(id); if (document.fullscreenElement === view.box) document.exitFullscreen().catch(() => {});
    view.video.pause(); view.video.srcObject = null; view.video.removeAttribute('src'); view.video.load(); view.box.remove();
  }
  const main = tiles.get(id); if (main) { main.pip.hidden = true; main.element.classList.remove('camera-only'); }
  renderTiles();
}
function cameraPlayer(member) { tile(member); cameraView(member.id); placeCamera(member.id); return cameraViews.get(member.id)?.video; }
function removeTile(id) {
  const item = tiles.get(id); if (!item) return;
  if (!item.own) { item.video.pause(); item.video.srcObject = null; item.video.removeAttribute('src'); item.video.load(); }
  item.element.remove(); tiles.delete(id); if (focus === id) focus = null; renderTiles();
}
function applyAudio() {
  for (const item of tiles.values()) {
    item.video.defaultMuted = item.own; item.video.muted = item.own || muted || (focus !== null && focus !== item.member.id);
    item.video.volume = Number($('volume').value);
  }
  $('sound-button').textContent = muted ? 'Ativar som' : 'Silenciar';
}
function renderTiles() {
  if (focus && !tiles.has(focus)) focus = null;
  for (const [id, item] of tiles) {
    item.element.hidden = focus !== null && id !== focus;
    item.element.setAttribute('aria-pressed', String(focus === id));
    item.element.setAttribute('aria-label', focus === id ? 'Voltar para todas as telas' : 'Focar transmissão de ' + item.member.name);
  }
  const count = focus ? 1 : tiles.size, grid = $('streams-grid'), bounds = grid.getBoundingClientRect();
  let columns = 1, best = 0;
  for (let c = 1; c <= Math.max(count, 1); c++) {
    const rows = Math.ceil(count / c) || 1;
    const width = (bounds.width - (c - 1) * 6) / c, height = (bounds.height - (rows - 1) * 6) / rows;
    const fit = Math.min(width, height * 16 / 9); if (fit > best) { best = fit; columns = c; }
  }
  grid.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0,1fr))';
  grid.style.gridTemplateRows = 'repeat(' + (Math.ceil(count / columns) || 1) + ', minmax(0,1fr))';
  $('stage').classList.toggle('has-video', count > 0); $('empty-stage').hidden = count > 0; $('grid-button').hidden = !focus;
  $('stage-label').textContent = focus ? tiles.get(focus).member.name + ' · em foco' : 'Todas as telas';
  const selected = focus ? [tiles.get(focus)] : [...tiles.values()];
  const routes = new Set(selected.filter(item => !item.own).map(item => item.video.dataset.transport).filter(Boolean));
  $('transport-label').textContent = routes.has('relay') ? 'Modo de compatibilidade' : routes.has('direct') ? 'Conexão direta' : 'Aguardando transmissão';
  $('stream-quality').textContent = count ? count + (count === 1 ? ' tela' : ' telas') : 'Nenhuma transmissão ativa';
  applyAudio(); updateRoomMessage();
}
function renderMembers() {
  const others = members.filter(member => member.id !== self);
  $('friend-label').textContent = others.length ? others.length + (others.length === 1 ? ' pessoa na sala' : ' pessoas na sala') : 'Nenhum outro participante';
  $('friend-dot').classList.toggle('green', others.length > 0); $('audience-list').replaceChildren();
  for (const member of others) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'audience-person'; row.dataset.member = member.id;
    row.setAttribute('aria-label', 'Abrir perfil de ' + member.name); row.setAttribute('aria-haspopup', 'dialog');
    row.setAttribute('aria-controls', 'member-profile'); row.setAttribute('aria-expanded', String(viewedMember === member.id));
    row.onclick = () => openMemberProfile(member.id);
    const text = document.createElement('span'); text.textContent = member.name;
    const state = document.createElement('small'); state.textContent = member.stream.active ? 'Compartilhando' : 'Assistindo';
    row.append(avatar(member), text, state); $('audience-list').append(row);
    const item = tiles.get(member.id); if (item) tile(member);
    if (cameraViews.has(member.id)) placeCamera(member.id);
  }
  localTile(); renderTiles(); renderMemberProfile();
}
function renderMemberProfile() {
  if (!viewedMember) return;
  const member = members.find(person => person.id === viewedMember && person.id !== self);
  if (!member || !self || document.body.dataset.view !== 'room') { closeMemberProfile(); return; }
  $('member-profile-photo').replaceChildren(avatar(member, 'member-card-avatar'));
  $('member-profile-name').textContent = member.name;
  renderBanner($('member-profile-banner'), member);
}
function openMemberProfile(id) {
  if (document.body.dataset.view !== 'room' || socket?.readyState !== WebSocket.OPEN || !members.some(person => person.id === id && person.id !== self)) return;
  viewedMember = id; profilePointerOutside = false; renderMemberProfile();
  for (const row of $('audience-list').children) row.setAttribute('aria-expanded', String(row.dataset.member === id));
  if (!$('member-profile').open) $('member-profile').showModal();
}
function closeMemberProfile() {
  const dialog = $('member-profile');
  if (!viewedMember && !dialog.open) return;
  const id = viewedMember; viewedMember = null;
  if (dialog.open) dialog.close();
  $('member-profile-photo').replaceChildren(); $('member-profile-name').textContent = '';
  renderBanner($('member-profile-banner'), {});
  for (const row of $('audience-list').children) row.setAttribute('aria-expanded', 'false');
  if (document.body.dataset.view === 'room') {
    const origin = [...$('audience-list').children].find(row => row.dataset.member === id);
    (origin || $('host-tab')).focus({ preventScroll: true });
  }
}
function outsideMemberProfile(event) {
  const box = $('member-profile').getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
function setLive(active) {
  $('live-dot').classList.toggle('red', active); document.title = active ? 'Concord · AO VIVO' : 'Concord'; liveSince = active ? Date.now() : 0;
  $('stream-clock').hidden = !active; $('stream-clock').textContent = active ? '00:00:00' : '';
}
function showVideo() { renderTiles(); }
function lockSettings(locked) {
  for (const id of ['choose-source', 'choose-audio-source', 'audio-mode', 'quality', 'fps', 'bitrate-mode', 'bitrate-value', 'bitrate-slider', 'system-audio']) $(id).disabled = locked;
  $('test-audio').hidden = Boolean(stream) || starting || audioMode() !== 'application';
  $('start-button').hidden = Boolean(stream); $('stop-button').hidden = !stream;
  $('start-button').disabled = locked || !selectedSource || socket?.readyState !== WebSocket.OPEN;
  $('camera-button').disabled = cameraStarting || socket?.readyState !== WebSocket.OPEN;
  $('camera-button').textContent = cameraStream ? 'Desligar câmera' : cameraStarting ? 'Ligando câmera…' : 'Ligar câmera';
  $('camera-device').disabled = Boolean(cameraStream) || cameraStarting;
  renderCallBar();
}
// Discord-style call bar: quick toggles; the full sharing menu opens in #share-dialog.
function renderCallBar() {
  const connected = socket?.readyState === WebSocket.OPEN, mic = $('microphone').checked;
  const state = (id, on, title) => { $(id).setAttribute('aria-pressed', String(on)); $(id).title = title; };
  state('bar-screen', Boolean(stream), stream ? 'Transmitindo a tela: abrir opções ou encerrar' : 'Transmitir tela');
  state('bar-camera', Boolean(cameraStream), cameraStream ? 'Desligar câmera' : 'Ligar câmera');
  state('bar-mic', mic, mic ? 'Desligar microfone' : 'Ligar microfone');
  state('bar-chat', !sideHidden, sideHidden ? 'Mostrar chat e convite' : 'Esconder chat e convite (mais espaço para o vídeo)');
  $('bar-screen').disabled = !connected; $('bar-camera').disabled = !connected || cameraStarting;
}
function setSide(hidden) { sideHidden = hidden; document.body.classList.toggle('side-hidden', hidden); chat.setVisible(!hidden); renderCallBar(); renderTiles(); }
// The microphone can be turned on/off mid-stream: muting keeps the track, and a mic added later is mixed in.
async function setMicrophone(on) {
  $('microphone').checked = on; renderCallBar();
  if (!stream) return;
  if (microphone) { for (const track of microphone.getAudioTracks()) track.enabled = on; return; }
  if (!on) return;
  const generation = captureGeneration;
  try {
    const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (generation !== captureGeneration || !stream || !$('microphone').checked) { captured.getTracks().forEach(track => track.stop()); return; }
    microphone = captured;
    if (!audioContext) {
      audioContext = new AudioContext(); await audioContext.resume(); mixDestination = audioContext.createMediaStreamDestination();
      for (const track of stream.getAudioTracks()) { audioContext.createMediaStreamSource(new MediaStream([track])).connect(mixDestination); stream.removeTrack(track); }
      stream.addTrack(mixDestination.stream.getAudioTracks()[0]);
    }
    audioContext.createMediaStreamSource(microphone).connect(mixDestination);
    await media?.setStream(stream);
  } catch { $('microphone').checked = false; renderCallBar(); notice('O microfone não ficou disponível. Confira as configurações de privacidade do Windows.', true); }
}
function bitrate() { return videoBitrate(qualityKey(), $('bitrate-mode').value === 'manual' ? $('bitrate-value').value : null); }
function qualityLabel() { return $('quality').selectedOptions[0].textContent + ' · ' + $('fps').value + ' FPS · ' + formatMbps(bitrate()) + ' Mbps'; }
function updateBitrateControls() {
  const manual = $('bitrate-mode').value === 'manual'; $('manual-bitrate').hidden = !manual;
  const recommended = formatMbps(videoBitrate(qualityKey()));
  $('bitrate-mode').options[0].textContent = 'Automática · ' + recommended + ' Mbps';
  $('bitrate-hint').textContent = manual ? 'Referência: ' + recommended + ' Mbps. Ajuste antes de transmitir.' : 'Mais bitrate preserva detalhes e usa mais upload.';
}
function publishState() {
  send({ type: 'stream-state', active: Boolean(stream || cameraStream), screen: Boolean(stream), camera: Boolean(cameraStream), label: stream ? selectedSource?.name || '' : cameraStream ? 'Câmera' : '', quality: stream ? qualityLabel() : '', relay: false });
}
function disconnect() {
  closeDiscordFriends(); chat.clear();
  terminal = true; clearTimeout(reconnectTimer); clearTimeout(joinTimer); const previous = socket; socket = undefined; previous?.close();
  media?.close(); media = null; for (const id of [...cameraViews.keys()]) removeCamera(id); self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers();
}
function connect(address, token, connectionRole, p2p = false) {
  disconnect(); role = connectionRole; terminal = false; retries = 0; target = { address, token, role: connectionRole, p2p }; openSocket();
}
function joinStage(stage) {
  document.body.dataset.route = stage;
  if (joining) $('join-button').textContent = stage === 'tunnel' ? 'Preparando compatibilidade…' : 'Conectando…';
}
function openSocket() {
  if (terminal || !target) return;
  const ws = target.p2p ? connectRoom(target.token, { parseInvite, onStage: joinStage }) : new WebSocket(target.address.replace(/^http/, 'ws') + '/socket');
  socket = ws; ws.binaryType = 'arraybuffer'; relayStream = 'screen'; status('Conectando');
  media = new RoomMedia({ send, sendBytes, options: () => ({ relay: false, bitrate: bitrate(), fps: qualityPreset(qualityKey()).fps }),
    player: member => tile(member), cameraPlayer, removeCamera, remove: removeTile, update: renderTiles,
    compatibility: updateRoomMessage,
    error: text => notice(text, true), fatal: text => { stopSharing(); notice(text, true); } });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: target.token, role: target.role, profile: config.profile, features: ['camera'] }));
  ws.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== ws) return;
      if (typeof event.data !== 'string') { media.binary(event.data); return; }
      const msg = JSON.parse(event.data);
      if (chat.message(msg)) return;
      if (msg.type === 'welcome' || msg.type === 'room') {
        if (msg.type === 'welcome') {
          self = msg.self; retries = 0; notice(''); status('Sala conectada', true); $('viewer-controls').hidden = false; document.body.dataset.route = ws.route || 'socket';
          if (joining) { clearTimeout(joinTimer); joining = false; $('join-button').disabled = false; $('join-input').disabled = false; $('join-button').textContent = 'Entrar na sala'; $('join-picker').close(); showView('room'); }
          roomCamera = Array.isArray(msg.features) && msg.features.includes('camera');
          chat.setEnabled(Array.isArray(msg.features) && msg.features.includes('chat')); chat.setSelf(msg.self, config.profile); chat.setVisible(!sideHidden); if (cameraStream && !roomCamera) stopCamera();
          renderInvite(); lockSettings(Boolean(stream)); publishState(); await media.setStream(stream); await media.setCamera(cameraStream?.getVideoTracks()[0] || null);
        }
        members = msg.members; chat.setMembers(members); await media.roster(self, members); renderMembers();
      } else if (msg.type === 'tunnel-closed') { if (invite) invite = { ...invite, public: false }; }
      else await media.message(msg);
    }).catch(error => notice('A conexão encontrou um problema: ' + error.message, true));
  };
  ws.onerror = () => {};
  ws.onclose = event => {
    if (socket !== ws) return;
    socket = undefined; media?.close(); for (const id of [...cameraViews.keys()]) removeCamera(id); self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers(); lockSettings(Boolean(stream));
    if (terminal) return;
    if (joining && [4001,4002,4003,4005].includes(event.code)) { joinFailure(event.reason || 'Convite inválido. Confira o código.'); return; }
    if ([4001,4002,4003].includes(event.code)) { terminal = true; stopSharing(); stopCamera(); status('Não conectado'); notice(event.reason || 'Convite inválido.', true); return; }
    status('Reconectando'); retries++; reconnectTimer = setTimeout(openSocket, Math.min(1000 * 2 ** Math.min(retries-1,4),15000));
  };
}
// Automatic audio follows the shared source: a window sends only that app; a whole screen sends the whole PC
// (Windows has no per-monitor audio). Opções avançadas can pick another app or the whole PC explicitly.
function audioMode() {
  const mode = $('audio-mode').value;
  return mode !== 'auto' ? mode : selectedSource?.id.startsWith('window:') ? 'application' : 'system';
}
function updateAudioControls() {
  const appOnly = audioMode() === 'application', manual = $('audio-mode').value === 'application';
  $('audio-settings').hidden = !$('system-audio').checked;
  $('audio-meter-panel').hidden = !$('system-audio').checked;
  $('test-audio').hidden = !appOnly || Boolean(stream) || starting;
  $('test-audio').disabled = !selectedAudioSource;
  $('test-audio').textContent = audioPreviewTrack || testingAudio ? 'Parar teste de áudio' : 'Testar áudio do app';
  $('choose-audio-source').hidden = !manual;
  $('audio-summary').textContent = !$('system-audio').checked ? 'Sem som na transmissão.'
    : appOnly ? (selectedAudioSource ? 'Som de ' + selectedAudioSource.name + ', sem outros apps.' : 'Escolha o jogo / app em Opções avançadas.')
    : $('audio-mode').value === 'system' || selectedSource ? 'Som de todo o computador.' : 'Automático: janela usa o som do app; tela inteira usa o som do computador.';
  $('audio-source-name').textContent = selectedAudioSource?.name || 'Escolher jogo / app';
  $('audio-source-hint').textContent = appOnly ? 'Só o app escolhido e seus processos. Outros apps ficam de fora.' : 'Inclui Discord, notificações e os sons de todos os apps.';
}
async function chooseSource(audioOnly = false) {
  if (!native || stream) return;
  $('choose-source').disabled = true; notice('');
  try {
    const sources = (await native.sources()).filter(source => !audioOnly || source.id.startsWith('window:')); $('source-list').replaceChildren();
    if (!sources.length) throw new Error('Nenhuma tela ou janela disponível.');
    for (const source of sources) {
      const button = document.createElement('button'); button.className = 'source-choice';
      const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
      const label = document.createElement('span'); label.textContent = source.name;
      button.append(image, label);
      button.onclick = () => {
        stopAudioPreview();
        if (audioOnly) selectedAudioSource = source;
        else {
          selectedSource = source; $('source-name').textContent = source.name; $('source-description').textContent = source.id.startsWith('screen:') ? 'Tudo nesse monitor será mostrado.' : 'Somente essa janela será mostrada.';
          if (source.id.startsWith('window:')) selectedAudioSource = source;
        }
        updateAudioControls(); $('source-picker').close(); lockSettings(false);
      };
      $('source-list').append(button);
    }
    $('source-picker').showModal();
  } catch (error) { notice(`Não consegui listar as telas: ${error.message}`, true); }
  finally { $('choose-source').disabled = false; }
}
async function captureAppAudio() {
  const context = new AudioContext({ sampleRate: 48000 }); appAudioContext = context;
  await context.audioWorklet.addModule('/app-audio-worklet.js');
  if (context !== appAudioContext) throw new DOMException('Teste cancelado', 'AbortError');
  appAudioNode = new AudioWorkletNode(appAudioContext, 'concord-app-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  const destination = appAudioContext.createMediaStreamDestination(); appAudioNode.connect(destination);
  unsubscribeAppAudio = native.onAppAudio(bytes => appAudioNode?.port.postMessage(new Uint8Array(bytes)));
  unsubscribeAppAudioError = native.onAppAudioError(message => { stopSharing(); notice(`Áudio do app interrompido: ${message}`, true); });
  await native.startAppAudio(selectedAudioSource.id);
  if (context !== appAudioContext) throw new DOMException('Teste cancelado', 'AbortError');
  await context.resume();
  return destination.stream.getAudioTracks()[0];
}
function stopAppAudioResources() {
  unsubscribeAppAudio?.(); unsubscribeAppAudioError?.(); unsubscribeAppAudio = unsubscribeAppAudioError = undefined;
  appAudioNode?.disconnect(); appAudioNode = undefined;
  appAudioContext?.close().catch(() => {}); appAudioContext = undefined; void native?.stopAppAudio().catch(() => {});
}
function stopAudioPreview() {
  ++audioGeneration;
  if (audioPreviewTrack || testingAudio) { audioPreviewTrack?.stop(); audioPreviewTrack = undefined; testingAudio = false; meter.stop(); stopAppAudioResources(); }
  updateAudioControls();
}
async function testAudio() {
  if (stream || starting || audioMode() !== 'application' || !$('system-audio').checked || !selectedAudioSource) return;
  if (audioPreviewTrack || testingAudio) { stopAudioPreview(); return; }
  const generation = ++audioGeneration; testingAudio = true; updateAudioControls();
  $('audio-level-label').textContent = 'Iniciando teste do app escolhido…';
  try {
    const track = await captureAppAudio();
    if (generation !== audioGeneration) { track.stop(); return; }
    audioPreviewTrack = track; testingAudio = false; updateAudioControls(); await meter.watch(track);
  } catch (error) {
    if (generation !== audioGeneration) return;
    stopAudioPreview(); notice('Não consegui testar o áudio desse app. Escolha a janela novamente e tente de novo.', true);
  }
}
async function startSharing() {
  if (starting || stream || !selectedSource) return;
  if ($('bitrate-mode').value === 'manual' && !$('bitrate-value').validity.valid) { $('advanced-options').open = true; $('bitrate-value').reportValidity(); return; }
  const appOnly = $('system-audio').checked && audioMode() === 'application';
  if (appOnly && !selectedAudioSource) { $('advanced-options').open = true; notice('Escolha o jogo/app em Opções avançadas › Fonte do áudio. Você pode compartilhar um monitor inteiro e ouvir só esse app.', true); return; }
  stopAudioPreview(); const generation = ++captureGeneration;
  starting = true; lockSettings(true); notice('');
  try {
    await native.selectSource(selectedSource.id);
    if (generation !== captureGeneration) return;
    const { width, height, fps } = qualityPreset(qualityKey());
    const captured = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } }, audio: $('system-audio').checked && !appOnly });
    if (generation !== captureGeneration) { captured.getTracks().forEach(track => track.stop()); return; }
    display = captured;
    const track = display.getVideoTracks()[0];
    await track.applyConstraints({ width: { max: width }, height: { max: height }, frameRate: { max: fps } });
    track.contentHint = fps === 60 ? 'motion' : 'detail';
    const audio = display.getAudioTracks();
    if (appOnly) audio.push(await captureAppAudio());
    if (generation !== captureGeneration) { audio.forEach(track => track.stop()); return; }
    void meter.watch(audio[0]);
    if ($('microphone').checked) {
      try {
        const capturedMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (generation !== captureGeneration) { capturedMic.getTracks().forEach(track => track.stop()); return; }
        microphone = capturedMic;
        audio.push(...microphone.getAudioTracks());
      } catch { notice('O microfone não ficou disponível. A transmissão continua sem ele.'); }
    }
    stream = new MediaStream([track]);
    if (audio.length > 1) {
      audioContext = new AudioContext(); await audioContext.resume();
      const destination = mixDestination = audioContext.createMediaStreamDestination();
      for (const audioTrack of audio) audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(destination);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (audio.length) stream.addTrack(audio[0]);
    track.onended = () => stopSharing();
    video.srcObject = display; video.muted = true; video.play().catch(() => {});
    showVideo(true); if (!liveSince) setLive(true); $('stream-quality').textContent = qualityLabel();
    publishState(); await media.setStream(stream); localTile(); renderTiles();
    if ($('share-dialog').open) $('share-dialog').close();
  } catch (error) {
    if (generation === captureGeneration) { stopSharing(); notice(error.name === 'NotAllowedError' ? 'A captura não foi autorizada. Escolha a tela e tente novamente.' : `Não consegui iniciar a captura: ${error.message}`, true); }
  } finally { starting = false; lockSettings(Boolean(stream)); }
}
function stopSharing() {
  ++captureGeneration; stopAudioPreview(); meter.stop();
  void media?.setStream(null);
  for (const item of [stream, display, microphone]) for (const track of item?.getTracks() || []) { track.onended = null; track.stop(); }
  audioContext?.close().catch(() => {}); stream = display = microphone = audioContext = mixDestination = undefined;
  stopAppAudioResources();
  video.srcObject = null; if (!cameraStream) setLive(false);
  publishState(); if (cameraStream) localTile(); else removeTile(self); lockSettings(false); renderTiles();
}
async function fillCameraDevices() {
  const devices = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(device => device.kind === 'videoinput' && device.deviceId);
  const current = cameraStream?.getVideoTracks()[0]?.getSettings().deviceId || $('camera-device').value;
  $('camera-device').replaceChildren(new Option('Câmera padrão', ''), ...devices.map((device, index) => new Option(device.label || 'Câmera ' + (index + 1), device.deviceId)));
  $('camera-device').value = [...$('camera-device').options].some(option => option.value === current) ? current : '';
}
// Camera is a separate, explicit capture: video only, granted once per click by the main process.
async function startCamera() {
  if (cameraStream || cameraStarting) return;
  if (!roomCamera) { notice('Quem criou a sala precisa estar no Concord 0.7.0 ou mais novo para usar a câmera.', true); return; }
  const generation = ++cameraGeneration; cameraStarting = true; lockSettings(Boolean(stream)); notice('');
  try {
    await native.allowCamera();
    const id = $('camera-device').value;
    const captured = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
    if (generation !== cameraGeneration || socket?.readyState !== WebSocket.OPEN) { captured.getTracks().forEach(track => track.stop()); return; }
    cameraStream = captured; const track = captured.getVideoTracks()[0]; track.contentHint = 'motion'; track.onended = () => stopCamera();
    void fillCameraDevices(); if (!liveSince) setLive(true);
    publishState(); await media?.setCamera(track); localTile(); renderTiles();
  } catch (error) {
    if (generation === cameraGeneration) notice(error.name === 'NotAllowedError' ? 'A câmera não foi autorizada. Confira se o acesso à câmera está liberado nas configurações de privacidade do Windows.'
      : ['NotFoundError', 'OverconstrainedError'].includes(error.name) ? 'Nenhuma câmera encontrada neste PC.'
      : error.name === 'NotReadableError' ? 'A câmera está em uso por outro aplicativo.' : 'Não consegui ligar a câmera: ' + error.message, true);
  } finally { if (generation === cameraGeneration) cameraStarting = false; lockSettings(Boolean(stream)); }
}
function stopCamera() {
  ++cameraGeneration; cameraStarting = false;
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) { track.onended = null; track.stop(); }
    cameraStream = undefined; void media?.setCamera(null); removeCamera(self);
    if (!stream) { setLive(false); removeTile(self); }
    publishState(); renderTiles();
  }
  lockSettings(Boolean(stream));
}
function showInvite(data) {
  invite = data;
  inviteStatus('');
}
// Cloudflare fallback for a guest whose direct connection failed. Returns the tunnel invite or throws a safe message.
async function makeInvite() {
  if (Date.now() < inviteRetryAt) throw new Error(ownInviteMessage || 'O modo de compatibilidade está temporariamente indisponível. Tente novamente em alguns minutos.');
  const generation = ++inviteGeneration; invitePending = true;
  inviteStatus('Preparando o modo de compatibilidade para quem não conseguiu conexão direta…');
  try {
    const data = await native.tunnel();
    if (generation !== inviteGeneration) throw new Error('A preparação do modo de compatibilidade foi cancelada.');
    inviteRetryAt = 0; showInvite(data); return data.guestInvite;
  } catch (error) {
    if (generation !== inviteGeneration) throw new Error('A preparação do modo de compatibilidade foi cancelada.');
    const state = await native.session().catch(() => null), message = state?.inviteError?.message || 'Não consegui preparar o modo de compatibilidade. Tente novamente em instantes.';
    if (generation === inviteGeneration) { inviteRetryAt = state?.inviteError?.retryAt || 0; inviteStatus(message); }
    throw new Error(message);
  } finally { if (generation === inviteGeneration) { invitePending = false; renderInvite(); } }
}
function cancelFallback() {
  ++inviteGeneration; invitePending = false; inviteStatus('Preparação do modo de compatibilidade cancelada.');
  void native.closeTunnel().catch(() => {});
}
async function closeInvite() {
  ++inviteGeneration; invitePending = false; accessClosed = true; stopHosting('Convite substituído'); renderInvite();
  try {
    await native.closeTunnel(); invite = await native.renewInvite();
    inviteStatus('Acesso fechado. Gere um novo convite quando quiser.');
  } catch (error) { notice(error.message, true); }
}
function reopenAccess() { accessClosed = false; inviteStatus(''); void startHosting(); }
function renderProfile() {
  if (self) chat.setSelf(self, config.profile);
  $('profile-name').textContent = config.profile.name || 'Escolha seu nome';
  $('profile-avatar').replaceChildren(avatar(config.profile)); $('name-avatar').replaceChildren(avatar(config.profile, 'tile-avatar'));
  renderBanner($('name-banner'), config.profile); renderDiscord();
  $('remove-banner').hidden = !config.profile.banner;
}
function renderDiscord() {
  const state = config.discord || {};
  $('link-discord').hidden = Boolean(state.linked); $('link-discord').disabled = discordPending || !state.configured;
  $('refresh-discord').hidden = $('unlink-discord').hidden = !state.linked;
  $('refresh-discord').disabled = $('unlink-discord').disabled = discordPending;
  $('cancel-discord').hidden = !discordPending;
  $('discord-status').textContent = discordPending ? 'Conclua a autorização no navegador e volte ao Concord.' : state.linked ? 'Vinculado como ' + state.name : 'Use seu perfil do Discord ou escolha nome e foto aqui.';
  for (const id of ['photo-button', 'remove-photo', 'banner-button', 'remove-banner', 'display-name', 'save-name']) $(id).disabled = discordPending;
}
async function discordAction(action) {
  if (discordPending) return;
  discordPending = true; $('name-error').textContent = ''; renderDiscord();
  try {
    const result = await action(); config.profile = result.profile; config.discord = result.discord;
    if (!result.error) { $('display-name').value = config.profile.name; send({ type: 'profile', ...visualProfile(config.profile) }); }
    $('name-error').textContent = result.error || result.warning || '';
  } catch { $('name-error').textContent = 'Não consegui concluir a operação do Discord. Tente novamente.'; }
  finally { discordPending = false; renderProfile(); }
}
async function chooseName() {
  $('display-name').value = config.profile.name; $('name-error').textContent = ''; $('cancel-name').hidden = !config.profile.name; renderProfile();
  $('name-picker').showModal(); $('display-name').focus();
  return new Promise(resolve => { $('name-picker').addEventListener('close', () => resolve(), { once: true }); });
}
$('name-picker').addEventListener('cancel', event => { if (!config?.profile.name) event.preventDefault(); });
$('cancel-name').onclick = () => $('name-picker').close();
$('name-form').onsubmit = async event => {
  event.preventDefault(); $('save-name').disabled = true;
  try { config.profile = await native.setName($('display-name').value); renderProfile(); send({ type: 'profile', ...config.profile }); $('name-picker').close(); }
  catch (error) { $('name-error').textContent = error.message; }
  finally { $('save-name').disabled = false; }
};
$('photo-button').onclick = async () => {
  $('photo-button').disabled = true;
  try { config.profile = await native.choosePhoto(); renderProfile(); send({ type: 'profile', ...config.profile }); }
  catch (error) { $('name-error').textContent = error.message; }
  finally { $('photo-button').disabled = false; }
};
$('remove-photo').onclick = async () => { config.profile = await native.removePhoto(); renderProfile(); send({ type: 'profile', ...config.profile }); };
async function changeBanner(action) {
  $('banner-button').disabled = $('remove-banner').disabled = true;
  try { config.profile = await action(); renderProfile(); send({ type: 'profile', ...visualProfile(config.profile) }); $('name-error').textContent = ''; }
  catch (error) { $('name-error').textContent = error.message; }
  finally { $('banner-button').disabled = $('remove-banner').disabled = false; }
}
$('banner-button').onclick = () => void changeBanner(() => native.chooseBanner());
$('remove-banner').onclick = () => void changeBanner(() => native.removeBanner());
$('profile-button').onclick = () => void chooseName();
$('link-discord').onclick = () => void discordAction(() => native.linkDiscord());
$('refresh-discord').onclick = () => void discordAction(() => native.refreshDiscord());
$('unlink-discord').onclick = () => void discordAction(() => native.unlinkDiscord());
$('cancel-discord').onclick = () => void native.cancelDiscord();
$('name-picker').addEventListener('close', () => { if (discordPending) void native.cancelDiscord(); });
function closeDiscordFriends() {
  ++friendsGeneration; friendPhotoObserver?.disconnect(); discordFriends = []; friendsInvite = ''; friendInvites.clear();
  if ($('discord-friends').open) { $('discord-friends').close(); $('discord-friend-list').replaceChildren(); $('invite-discord-button').focus({ preventScroll: true }); }
}
function renderDiscordFriends() {
  const generation = friendsGeneration, query = $('discord-friend-search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = discordFriends.filter(friend => (friend.name + ' ' + friend.username).toLocaleLowerCase('pt-BR').includes(query));
  $('discord-friend-list').replaceChildren(); friendPhotoObserver?.disconnect();
  $('discord-friends-status').textContent = filtered.length ? filtered.length + (filtered.length === 1 ? ' amigo' : ' amigos') : 'Nenhum amigo encontrado.';
  friendPhotoObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      friendPhotoObserver.unobserve(entry.target); const id = entry.target.dataset.friend;
      void native.discordFriendPhoto(id).then(photo => {
        if (generation !== friendsGeneration || !entry.target.isConnected || !photo) return;
        const friend = discordFriends.find(value => value.id === id); if (!friend) return;
        friend.photo = photo; entry.target.querySelector('.friend-avatar').replaceChildren(avatar(friend));
      }).catch(() => {});
    }
  }, { root: $('discord-friend-list') });
  for (const friend of filtered) {
    const row = document.createElement('div'); row.className = 'discord-friend'; row.dataset.friend = friend.id;
    const icon = document.createElement('span'); icon.className = 'friend-avatar'; icon.append(avatar(friend));
    const text = document.createElement('span'); text.className = 'discord-friend-name';
    const name = document.createElement('strong'); name.textContent = friend.name;
    const username = document.createElement('small'); username.textContent = friend.username;
    const state = friendInvites.get(friend.id), error = document.createElement('small'); error.className = 'form-error'; error.textContent = state?.error || '';
    text.append(name, username, error);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary';
    button.textContent = state?.phase === 'sent' ? 'Enviado' : state?.phase === 'pending' ? 'Enviando…' : 'Convidar'; button.disabled = Boolean(state?.phase);
    button.setAttribute('aria-label', 'Convidar ' + friend.name);
    button.onclick = async () => {
      if (!friendsInvite || socket?.readyState !== WebSocket.OPEN || friendInvites.get(friend.id)?.phase) return;
      const code = friendsInvite; friendInvites.set(friend.id, { phase: 'pending' }); renderDiscordFriends();
      try {
        const result = await native.sendDiscordInvite(friend.id, code);
        if (result.error) throw new Error(result.error);
        if (result.value !== true) throw new Error('O Discord não confirmou o envio.');
        if (generation === friendsGeneration) friendInvites.set(friend.id, { phase: 'sent' });
        notice('Convite enviado.');
      } catch (error) { if (generation === friendsGeneration) friendInvites.set(friend.id, { error: error.message }); }
      if (generation === friendsGeneration) renderDiscordFriends();
    };
    row.append(icon, text, button); $('discord-friend-list').append(row); if (!friend.photo) friendPhotoObserver.observe(row);
  }
}
async function openDiscordFriends() {
  const code = $('invite-link').value; if (!code || socket?.readyState !== WebSocket.OPEN) return;
  const generation = ++friendsGeneration; friendsInvite = code; discordFriends = []; friendInvites.clear();
  $('discord-friend-list').replaceChildren(); $('discord-friend-search').value = ''; $('discord-friend-search').disabled = true;
  $('discord-friends-authorize').hidden = $('discord-friends-retry').hidden = true;
  if (!$('discord-friends').open) $('discord-friends').showModal();
  $('discord-friends-status').textContent = 'Carregando amigos do Discord…';
  if (!config.discord?.social) {
    $('discord-friends-status').textContent = 'Autorize o acesso aos amigos no Discord para usar os convites.'; $('discord-friends-authorize').hidden = false; return;
  }
  try {
    const result = await native.discordFriends(); if (generation !== friendsGeneration) return;
    if (result.error) { $('discord-friends-status').textContent = result.error; $('discord-friends-authorize').hidden = result.code !== 'RELINK'; $('discord-friends-retry').hidden = result.code === 'RELINK'; return; }
    discordFriends = result.value; $('discord-friend-search').disabled = false; renderDiscordFriends(); $('discord-friend-search').focus();
  } catch { if (generation === friendsGeneration) { $('discord-friends-status').textContent = 'Não foi possível carregar os amigos do Discord.'; $('discord-friends-retry').hidden = false; } }
}
$('invite-discord-button').onclick = () => void openDiscordFriends();
$('close-discord-friends').onclick = closeDiscordFriends;
$('discord-friends').addEventListener('cancel', event => { event.preventDefault(); closeDiscordFriends(); });
$('discord-friends').addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
$('discord-friend-search').oninput = renderDiscordFriends;
$('discord-friends-retry').onclick = () => void openDiscordFriends();
$('discord-friends-authorize').onclick = async () => {
  closeDiscordFriends(); const done = chooseName(); await discordAction(() => native.linkDiscord()); await done;
  if (config.discord?.social) void openDiscordFriends();
};
$('close-member-profile').onclick = closeMemberProfile;
$('member-profile').addEventListener('cancel', event => { event.preventDefault(); closeMemberProfile(); });
$('member-profile').addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
$('member-profile').addEventListener('pointerdown', event => { profilePointerOutside = event.target === $('member-profile') && outsideMemberProfile(event); });
$('member-profile').addEventListener('click', event => {
  if (profilePointerOutside && event.target === $('member-profile') && outsideMemberProfile(event)) closeMemberProfile();
});
$('member-profile').addEventListener('close', () => { if (!$('member-profile').open) closeMemberProfile(); });

$('home-tab').onclick = () => { stopAudioPreview(); showView('home'); };
$('create-room').onclick = createRoom;
$('resume-room').onclick = $('host-tab').onclick = () => { if (target) showView('room'); };
$('join-room').onclick = $('join-room-nav').onclick = () => openJoin();
$('cancel-join').onclick = cancelJoin;
$('join-picker').addEventListener('cancel', event => { event.preventDefault(); cancelJoin(); });
$('choose-source').onclick = () => chooseSource(); $('choose-audio-source').onclick = () => chooseSource(true);
$('audio-mode').onchange = $('system-audio').onchange = () => { stopAudioPreview(); updateAudioControls(); savePreferences(); };
$('test-audio').onclick = testAudio; updateAudioControls();
$('quality').onchange = $('fps').onchange = $('bitrate-mode').onchange = () => { updateBitrateControls(); savePreferences(); }; updateBitrateControls();
$('bitrate-slider').oninput = () => { $('bitrate-value').value = $('bitrate-slider').value; savePreferences(); };
$('bitrate-value').oninput = () => { if ($('bitrate-value').validity.valid) { $('bitrate-slider').value = $('bitrate-value').value; savePreferences(); } };
$('camera-button').onclick = $('bar-camera').onclick = () => { if (cameraStream) stopCamera(); else void startCamera(); };
$('bar-screen').onclick = () => { if (!$('share-dialog').open) $('share-dialog').showModal(); };
$('close-share').onclick = () => $('share-dialog').close();
$('bar-mic').onclick = () => void setMicrophone(!$('microphone').checked);
$('microphone').onchange = () => void setMicrophone($('microphone').checked);
$('bar-chat').onclick = () => setSide(!sideHidden);
$('close-picker').onclick = () => $('source-picker').close(); $('start-button').onclick = startSharing; $('stop-button').onclick = () => { stopSharing(); notice(''); if ($('share-dialog').open) $('share-dialog').close(); };
$('invite-button').onclick = reopenAccess; $('close-invite').onclick = closeInvite; $('cancel-invite').onclick = cancelFallback;
$('copy-link-button').onclick = async () => {
  try { await native.copyLink($('invite-link').value); notice('Link copiado.'); }
  catch { notice('Não consegui copiar o link. Tente novamente.', true); }
};
$('renew-button').onclick = async () => {
  try { const data = await native.renewInvite(); accessClosed = false; await startHosting(data); notice('Convite trocado. O anterior não funciona mais.'); }
  catch (error) { notice(error.message, true); }
};
$('join-form').onsubmit = event => {
  event.preventDefault(); if (joining) return;
  try {
    const value = $('join-input').value.trim(), parsed = parseInvite(value);
    stopSharing(); stopCamera(); currentInvite = value; joining = true; connect(parsed.address, parsed.token, 'viewer', Boolean(parsed.p2p));
    $('join-error').textContent = ''; $('join-button').disabled = true; $('join-input').disabled = true; $('join-button').textContent = 'Entrando…';
    // P2P may need the Cloudflare fallback, which can take up to 150 s to publish.
    joinTimer = setTimeout(() => joinFailure('Não consegui entrar. Confira o convite e tente novamente.'), parsed.p2p ? 210000 : 15000);
  } catch (error) { $('join-error').textContent = error.message; }
};
$('leave-button').onclick = () => { stopSharing(); stopCamera(); disconnect(); target = null; role = null; status('Não conectado'); showView('home'); notice('Você saiu da sala.'); };
$('grid-button').onclick = () => { focus = null; renderTiles(); };
$('sound-button').onclick = () => { muted = !muted; applyAudio(); for (const item of tiles.values()) media?.play(item.video); };
$('volume').oninput = () => { muted = Number($('volume').value) === 0; applyAudio(); };
$('fullscreen-button').onclick = () => { const action = document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen(); action.catch(error => notice(error.message, true)); };
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.body.dataset.view !== 'room' || document.querySelector('dialog[open]')) return;
  if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'm') { event.preventDefault(); $('sound-button').click(); }
  else if (key === 'f') { event.preventDefault(); $('fullscreen-button').click(); }
  else if (key === 'escape' && focus) { event.preventDefault(); $('grid-button').click(); }
});
new ResizeObserver(renderTiles).observe($('stage'));
setInterval(() => { if (liveSince) { const elapsed = Math.floor((Date.now()-liveSince)/1000); $('stream-clock').textContent = String(Math.floor(elapsed/3600)).padStart(2,'0') + ':' + String(Math.floor(elapsed/60)%60).padStart(2,'0') + ':' + String(elapsed%60).padStart(2,'0'); } }, 1000);
setInterval(() => { if (inviteRetryAt && Date.now() >= inviteRetryAt) { inviteRetryAt = 0; if (!invitePending) inviteStatus(''); } }, 1000);
window.addEventListener('beforeunload', () => { terminal = true; clearTimeout(reconnectTimer); stopSharing(); stopCamera(); media?.close(); socket?.close(); stopHosting(); });
try {
  if (!native) throw new Error('Abra o executável do Concord.');
  config = await native.bootstrap(); $('app-version').textContent = 'Concord ' + config.version; renderProfile(); applyPreferences(config.preferences);
  native.onInvite(value => receiveInvite(value));
  native.onUpdate(renderUpdate); renderUpdate(await native.updatesReady());
  const session = await native.session(); if (session.public) showInvite(session);
  if (!config.profile.name) await chooseName();
  uiReady = true; status('Esperando sala'); showView('home');
  for (const id of ['create-room', 'join-room', 'join-room-nav']) $(id).disabled = false;
  const launchInvite = await native.invitesReady();
  if (queuedInvite || launchInvite) receiveInvite(queuedInvite || launchInvite);
  if (config.preferencesWarning) notice('Não consegui ler suas preferências. Usei as opções padrão.', true);
} catch (error) { notice(error.message, true); status('Não consegui abrir'); }
