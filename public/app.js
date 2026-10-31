import { qualityPreset, videoBitrate, formatMbps } from './stream-settings.js';
import { parseInvite, webInvite } from './invites.js';
import { RoomMedia } from './room-media.js';
import { connectRoom, P2PHost } from './p2p.js';
import { RoomChat } from './chat.js';
import { AudioMeter } from './audio-meter.js';
import { visualProfile } from './profile.js';
import { createHomeIntro } from './home-intro.js';
const $ = id => document.getElementById(id);
const native = window.concord, video = $('screen-video');
let config, role = null, socket, target, reconnectTimer, terminal = false, retries = 0, processing = Promise.resolve();
let media, self = '', members = [], focus = null, muted = false;
let viewedMember = null, profilePointerOutside = false, profileOpener;
let discordPending = false;
let discordFriends = [], friendsGeneration = 0, friendsInvite = '', friendPhotoObserver, discordFavorites = [], discordRecent = [];
const friendInvites = new Map();
const tiles = new Map(), volumes = new Map(), levels = new Map();
let peopleKey = '', levelContext;
let stream, display, audioContext, mixDestination, selectedSource, starting = false, liveSince = 0, sideHidden = true;
let selectedAudioSource, appAudioContext, appAudioNode, unsubscribeAppAudio, unsubscribeAppAudioError;
let invite, inviteGeneration = 0, invitePending = false, inviteRetryAt = 0;
let ownInviteMessage = '', currentInvite = '', joining = false, joinTimer, uiReady = false, queuedInvite;
let p2pHost, hosting = false, hostGeneration = 0, accessClosed = false, p2pOffline = false, fallbackPromise;
let audioPreviewTrack, testingAudio = false, audioGeneration = 0, captureGeneration = 0;
let cameraStream, cameraStarting = false, cameraGeneration = 0, roomCamera = false, relayStream = 'screen';
const cameraViews = new Map(), cameraModes = new Map(), voices = new Map();
let themeColor = '#aa96ff', introSeen = '', voiceTrack, voiceStarting = false, voiceGeneration = 0, voiceMuted = false, roomVoice = false, devicePrefs = { mic: '', camera: '', speaker: '' };
const meter = new AudioMeter($('audio-level'), $('audio-level-label')), micMeter = new AudioMeter($('mic-test-level'), $('mic-test-label'));
const chat = new RoomChat({ root: $('chat-root'), send: value => send(value), notice: (text, error) => notice(text, error),
  onUnread: count => { $('chat-badge').hidden = !count; $('chat-badge').textContent = count > 9 ? '9+' : String(count); }, onIncoming: message => chatToast(message) });
let noticeTimer;
const homeIntro = createHomeIntro({ brand: $('hero-brand'), logo: $('hero-logo'), look: $('hero-look'), eyes: $('hero-eyes'), glint: $('hero-glint'),
  back: $('home-sky'), front: $('home-sky-front'), field: $('home-join-input'), rise: [$('home-sub'), $('room-live'), $('clip-invite'), document.querySelector('.home-actions'), $('home-ready')] });
// Confirmations fade after a few seconds; errors stay until replaced.
function notice(text, error = false) {
  clearTimeout(noticeTimer); $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = !text;
  if (text && !error) noticeTimer = setTimeout(() => notice(''), 4000);
}
$('notice').onclick = () => notice('');
function status(text, online = false) {
  document.body.dataset.connected = String(online); document.body.dataset.connectionState = text;
  updateRoomMessage(); renderHome();
}
function updateRoomMessage() {
  const state = document.body.dataset.connectionState;
  const relay = [...tiles.values()].some(item => !item.own && item.video.dataset.transport === 'relay') || (stream && media?.targets.size);
  $('room-status').textContent = state === 'Reconectando' ? 'A conexão caiu. Tentando voltar à sala…' : state === 'Conectando' ? 'Conectando à sala…'
    : document.body.dataset.connected === 'true' && relay ? 'Usando o modo de compatibilidade para manter a transmissão. Pode haver um pouco mais de atraso.' : '';
  $('room-status').hidden = !$('room-status').textContent;
  // Sidebar panel above the profile, like Discord's "voice connected" box.
  const online = document.body.dataset.connected === 'true', route = document.body.dataset.route;
  $('connection-panel').hidden = !target; $('connection-panel').dataset.state = online ? (relay ? 'relay' : 'ok') : 'wait';
  $('connection-title').textContent = online ? 'Conectado' : state === 'Reconectando' ? 'Reconectando…' : 'Conectando…';
  $('transport-label').textContent = !online ? 'Aguarde um instante' : relay ? 'Modo de compatibilidade' : role === 'host' ? 'Sala aberta neste PC'
    : route === 'tunnel' ? 'Pela Cloudflare' : route === 'direct' ? 'Conexão direta' : 'Sala conectada';
  $('empty-title').textContent = state === 'Reconectando' ? 'Tentando voltar à sala…' : 'Conectando à sala…';
}
function inviteStatus(text) { ownInviteMessage = text; renderInvite(); }
function renderInvite() {
  const guest = role === 'viewer', code = guest ? currentInvite : accessClosed ? '' : invite?.p2pInvite;
  const message = p2pOffline && !accessClosed ? 'Sem acesso ao serviço de conexão. Convidados podem não conseguir entrar até a internet voltar.' : ownInviteMessage;
  $('own-invite-controls').hidden = guest;
  $('invite-result').hidden = !code; $('invite-link').value = code || '';
  let link = ''; try { link = code ? webInvite(code).replace(/^https:\/\//, '') : ''; } catch {}
  $('invite-url').textContent = link; $('invite-url').title = link;
  $('invite-status').textContent = guest ? '' : message;
  $('invite-status').hidden = guest || !message;
  $('invite-button').hidden = !accessClosed;
  $('cancel-invite').hidden = !invitePending;
  $('invite-manage').hidden = guest || !code;
  if (!code) closeInvitePop();
  renderInviteSlots(); renderTiles();
}
// Invite popover: link, Discord DM, starred Discord friends and the access actions with their consequences.
let favFriends = [], favGeneration = 0, favInvite = '';
const favInvites = new Map();
function renderInviteSlots() {
  const free = Math.max(0, 8 - members.length);
  $('invite-slots').textContent = free ? 'Quem abrir o link entra direto. ' + (free === 1 ? 'Cabe mais 1 pessoa.' : 'Cabem mais ' + free + ' pessoas.') : 'A sala está cheia (8 pessoas).';
}
function closeInvitePop() {
  if ($('invite-pop').hidden) return;
  $('invite-pop').hidden = true; $('invite-menu-button').setAttribute('aria-expanded', 'false'); ++favGeneration;
}
function openInvitePop() {
  closeDeviceMenu(); $('invite-pop').hidden = false; $('invite-menu-button').setAttribute('aria-expanded', 'true');
  renderInviteSlots(); $('copy-link-button').focus({ preventScroll: true }); void loadFavorites();
}
async function loadFavorites() {
  const code = $('invite-link').value, generation = ++favGeneration;
  if (code !== favInvite) { favInvite = code; favInvites.clear(); }
  if (!config.discord?.social || !discordFavorites.length) { favFriends = []; renderFavorites(); return; }
  if (!favFriends.length) {
    // The first friends request can take a few seconds while the Discord SDK starts.
    const loading = document.createElement('p'); loading.className = 'invite-fav-loading is-loading'; loading.textContent = 'Carregando favoritos…';
    $('invite-fav-list').replaceChildren(loading); $('invite-favorites').hidden = false; $('invite-favorites').setAttribute('aria-busy', 'true');
    try { const result = await native.discordFriends(); if (generation !== favGeneration) return; if (!result.error) favFriends = result.value; }
    catch { if (generation !== favGeneration) return; }
  }
  renderFavorites();
}
function renderFavorites() {
  const list = discordFavorites.map(id => favFriends.find(friend => friend.id === id)).filter(Boolean).slice(0, 5);
  $('invite-favorites').hidden = !list.length; $('invite-favorites').removeAttribute('aria-busy');
  $('invite-fav-list').replaceChildren(...list.map(friend => {
    const row = document.createElement('div'); row.className = 'invite-fav'; row.dataset.friend = friend.id;
    const face = document.createElement('span'); face.className = 'friend-avatar'; face.append(avatar(friend));
    const name = document.createElement('span'); name.className = 'invite-fav-name'; name.textContent = friend.name;
    const state = favInvites.get(friend.id), button = document.createElement('button'); button.type = 'button'; button.className = 'button subtle';
    button.textContent = state?.phase === 'sent' ? 'Enviado' : state?.phase === 'pending' ? 'Enviando…' : state?.error ? 'Tentar de novo' : 'Convidar';
    button.disabled = state?.phase === 'pending' || state?.phase === 'sent'; button.setAttribute('aria-label', 'Convidar ' + friend.name + ' por DM');
    if (state?.error) { button.title = state.error; row.classList.add('failed'); }
    button.onclick = () => void inviteFavorite(friend);
    row.append(face, name, button);
    if (!friend.photo) void native.discordFriendPhoto(friend.id).then(photo => { if (photo && row.isConnected) { friend.photo = photo; face.replaceChildren(avatar(friend)); } }).catch(() => {});
    return row;
  }));
}
async function inviteFavorite(friend) {
  const code = $('invite-link').value, phase = favInvites.get(friend.id)?.phase;
  if (!code || phase || socket?.readyState !== WebSocket.OPEN) return;
  favInvites.set(friend.id, { phase: 'pending' }); renderFavorites();
  try {
    const result = await native.sendDiscordInvite(friend.id, code);
    if (result.error) throw new Error(result.error);
    if (result.value !== true) throw new Error('O Discord não confirmou o envio.');
    discordRecent = [friend.id, ...discordRecent.filter(id => id !== friend.id)].slice(0, 8); savePreferences();
    if (code === favInvite) favInvites.set(friend.id, { phase: 'sent' });
    notice('Convite enviado para ' + friend.name + '.');
  } catch (error) { if (code === favInvite) favInvites.set(friend.id, { error: error.message }); }
  if (!$('invite-pop').hidden) renderFavorites();
}
$('invite-menu-button').onclick = () => { if ($('invite-pop').hidden) openInvitePop(); else closeInvitePop(); };
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('invite-pop').hidden || document.querySelector('dialog[open]')) return;
  event.preventDefault(); event.stopPropagation(); closeInvitePop(); $('invite-menu-button').focus();
}, true);
document.addEventListener('pointerdown', event => { if (!$('invite-pop').hidden && !event.target.closest('#invite-pop, #invite-menu-button')) closeInvitePop(); });
// Clipboard invite: offered on the Painel when the window gains focus; own, used and ignored invites are not offered.
const knownInvites = new Set(); let clipInvite = '';
function inviteKey(value) { try { return parseInvite(value).token; } catch { return ''; } }
function hideClip() { clipInvite = ''; $('clip-invite').hidden = true; }
async function checkClipboard() {
  const open = () => uiReady && !target && !joining && document.body.dataset.view === 'home';
  if (!open()) { hideClip(); return; }
  const value = await native.clipboardInvite().catch(() => '');
  if (!open() || !value || knownInvites.has(inviteKey(value))) { hideClip(); return; }
  clipInvite = value; $('clip-invite').hidden = false;
}
$('clip-ignore').onclick = () => { knownInvites.add(inviteKey(clipInvite)); hideClip(); };
$('clip-join').onclick = () => { const value = clipInvite; knownInvites.add(inviteKey(value)); hideClip(); receiveInvite(value); };
addEventListener('focus', () => void checkClipboard());
function showView(view) {
  document.body.dataset.view = view; $('home-view').hidden = view !== 'home'; $('room-view').hidden = view !== 'room';
  $('home-tab').classList.toggle('selected', view === 'home'); $('host-tab').classList.toggle('selected', view === 'room');
  $('host-tab').hidden = !target; $('room-people').hidden = view !== 'room';
  $('room-name').textContent = role === 'viewer' ? 'Sala atual' : 'Minha sala'; renderInvite(); renderTiles(); renderHome();
  if (view === 'home') void checkClipboard(); else hideClip();
  homeIntro.setActive(view === 'home' && !target);
}
// Painel: outside a room, the living logo, Criar sala, the invite field and how you enter; inside, a live card with who is there.
function renderHome() {
  if (document.body.dataset.view !== 'home') return;
  const inRoom = Boolean(target);
  $('room-live').hidden = $('resume-room').hidden = !inRoom; $('home-ready').hidden = inRoom;
  $('home-view').classList.toggle('in-room', inRoom); homeIntro.setActive(!inRoom);
  $('create-room').hidden = $('create-hint').hidden = $('home-or').hidden = inRoom && role === 'host';
  $('create-title').textContent = inRoom ? 'Criar sala sua' : 'Criar sala';
  $('create-hint').textContent = inRoom ? 'Você sai da sala atual e abre uma sala sua.' : 'Link pronto na hora · até 8 pessoas';
  $('home-join-hint').hidden = !inRoom;
  if (inRoom) renderLiveCard(); else renderReady();
}
function renderLiveCard() {
  const live = members.filter(screenLive), count = members.length;
  $('room-live-title').textContent = $('room-title').textContent;
  $('room-live-meta').textContent = (document.body.dataset.connected !== 'true' ? 'Conectando… · ' : '')
    + (live.length ? live.map(member => member.id === self ? 'Você' : member.name).join(', ') + (live.length > 1 ? ' estão transmitindo' : ' está transmitindo') + ' · ' : 'Ninguém transmitindo · ')
    + count + ' de 8 ' + (count === 1 ? 'pessoa' : 'pessoas');
  $('room-live-faces').replaceChildren(...members.slice(0, 6).map(member => { const face = avatar(member, 'live-face'); face.title = member.name; return face; }));
  $('room-live-tag').hidden = !live.length;
  // Snapshot of the first playing stream; the card keeps the room icon when nothing is on screen.
  const playing = [...tiles.values()].find(item => item.video.readyState >= 2 && item.video.videoWidth), canvas = $('room-live-thumb');
  canvas.classList.toggle('filled', Boolean(playing));
  if (playing) {
    const context = canvas.getContext('2d'), { videoWidth: w, videoHeight: h } = playing.video, scale = Math.max(canvas.width / w, canvas.height / h);
    context.drawImage(playing.video, (canvas.width - w * scale) / 2, (canvas.height - h * scale) / 2, w * scale, h * scale);
  }
}
function renderReady() {
  const state = voiceMuted ? 'Você entra mutado' : 'Microfone liga ao entrar';
  $('ready-mic').classList.toggle('off', voiceMuted); $('ready-mic').querySelector('use').setAttribute('href', voiceMuted ? '#icon-mic-off' : '#icon-mic');
  $('ready-mic').title = (devicePrefs.mic || 'Microfone padrão') + ' · ' + state;
  $('ready-mic').setAttribute('aria-label', voiceMuted ? 'Microfone mutado; clique para entrar falando' : 'Microfone ligado ao entrar; clique para entrar mutado');
  $('ready-state').textContent = state;
  $('ready-name').textContent = config?.profile?.name || 'Seu nome';
  $('ready-avatar').replaceChildren(avatar(config?.profile || { name: '?' }));
}
function joinFieldState() {
  const value = $('home-join-input').value.trim(), state = $('home-join-state');
  let valid = false; if (value) { try { parseInvite(value); valid = true; } catch {} }
  state.hidden = !value; state.className = 'join-state ' + (valid ? 'ok' : 'bad');
  state.replaceChildren(...(valid ? [svgIcon('icon-check'), 'Convite reconhecido'] : ['Convite inválido']));
  $('home-join-input').closest('.join-field').dataset.state = !value ? '' : valid ? 'ok' : 'bad';
  $('join-room').classList.toggle('hot', valid); $('create-room').classList.toggle('quiet', valid);
}
$('home-join-input').oninput = joinFieldState;
$('room-live-leave').onclick = () => $('leave-button').click();
async function openSettings(tab) { closeDeviceMenu(); settingsTab(tab); await fillSettings(); if (!$('settings-dialog').open) $('settings-dialog').showModal(); }
$('ready-mic').onclick = () => { setVoiceMuted(!voiceMuted); renderReady(); }; $('ready-camera').onclick = () => void openSettings('video');
$('ready-profile').onclick = () => void chooseName();
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
    bitrateMbps: Number($('bitrate-value').value), audioMode: $('audio-mode').value, audioEnabled: $('system-audio').checked, audioVersion: 2,
    micMuted: voiceMuted, micDevice: devicePrefs.mic, cameraDevice: devicePrefs.camera, speakerDevice: devicePrefs.speaker, themeColor, introSeen, discordFavorites, discordRecent };
}
// Theme: every purple in the CSS derives from --accent; text on it turns dark or white by brightness.
function applyTheme(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  themeColor = color.toLowerCase();
  const [r, g, b] = [1, 3, 5].map(index => parseInt(themeColor.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  document.documentElement.style.setProperty('--accent', themeColor);
  document.documentElement.style.setProperty('--on-accent', .2126 * r + .7152 * g + .0722 * b > .3 ? '#16131f' : '#ffffff');
  const preset = [...document.querySelectorAll('.theme-swatch')].some(button => button.dataset.color === themeColor);
  for (const button of document.querySelectorAll('.theme-swatch')) button.setAttribute('aria-checked', String(button.dataset.color === themeColor));
  $('theme-custom').value = themeColor; $('theme-custom').closest('.theme-custom').classList.toggle('selected', !preset);
}
function savePreferences() {
  if (!$('bitrate-value').validity.valid) return;
  void native.savePreferences(preferenceValues()).catch(() => notice('Não consegui salvar suas preferências neste PC.', true));
}
function applyPreferences(saved) {
  $('quality').value = saved.resolution; $('fps').value = saved.fps; $('bitrate-mode').value = saved.bitrateMode;
  $('bitrate-value').value = $('bitrate-slider').value = saved.bitrateMbps;
  $('audio-mode').value = saved.audioMode; $('system-audio').checked = saved.audioEnabled;
  applyTheme(saved.themeColor || '#aa96ff'); introSeen = saved.introSeen || '';
  voiceMuted = Boolean(saved.micMuted); devicePrefs = { mic: saved.micDevice || '', camera: saved.cameraDevice || '', speaker: saved.speakerDevice || '' };
  discordFavorites = [...(saved.discordFavorites || [])]; discordRecent = [...(saved.discordRecent || [])];
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
  $('settings-update-label').textContent = messages[state.phase] || (state.enabled ? 'Atualizações automáticas pelo GitHub.' : 'Atualizações automáticas só no app instalado.');
  $('settings-check-updates').hidden = !state.enabled || $('check-updates').hidden; $('settings-check-updates').disabled = $('check-updates').disabled;
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
function svgIcon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); if (className) svg.setAttribute('class', className);
  use.setAttribute('href', '#' + name); svg.append(use); return svg;
}
function avatar(profile, className = '') {
  profile = visualProfile(profile);
  const element = document.createElement(profile.photo ? 'img' : 'span'); element.className = 'avatar ' + className;
  if (profile.photo) { element.src = profile.photo; element.alt = ''; }
  else element.textContent = (profile.name || 'A').slice(0, 2).toUpperCase();
  return element;
}
// Chat collapsed: a toast with the message plus a short rising "bounce" blip (synthesized from the user's sample).
let chatToastTimer, pingContext;
function chatToast({ from, name, text, file }) {
  const toast = $('chat-toast'), member = members.find(item => item.id === from) || { name };
  const title = document.createElement('strong'); title.textContent = name;
  const body = document.createElement('span'); body.textContent = text || (file ? 'Enviou ' + file.name : '');
  const copy = document.createElement('span'); copy.className = 'chat-toast-text'; copy.append(title, body);
  toast.replaceChildren(avatar(member, 'chat-toast-avatar'), copy); toast.hidden = false;
  toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
  clearTimeout(chatToastTimer); chatToastTimer = setTimeout(hideChatToast, 6000);
  void playPing();
}
// Room events (someone joined, left or started streaming) stack above the chat toast and fade on their own.
function roomToast(member, title, text, action) {
  const toast = document.createElement('div'); toast.className = 'chat-toast room-toast show';
  const heading = document.createElement('strong'); heading.textContent = title;
  const body = document.createElement('span'); body.textContent = text;
  const copy = document.createElement('span'); copy.className = 'chat-toast-text'; copy.append(heading, ...(text ? [body] : []));
  const dismiss = () => { clearTimeout(timer); toast.classList.add('leaving'); setTimeout(() => toast.remove(), 180); };
  toast.append(avatar(member, 'chat-toast-avatar'), copy);
  if (action) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button primary toast-action'; button.textContent = action.label;
    button.onclick = () => { dismiss(); action.run(); }; toast.append(button);
  }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'toast-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Fechar aviso'); close.onclick = dismiss;
  toast.append(close); $('room-toasts').append(toast);
  while ($('room-toasts').children.length > 3) $('room-toasts').firstElementChild.remove();
  const timer = setTimeout(dismiss, action ? 8000 : 4500);
}
function screenLive(member) { return Boolean(member?.stream?.active && member.stream.screen !== false); }
function roomEvents(previous, next) {
  if (!self) return;
  const before = new Map(previous.map(member => [member.id, member]));
  for (const member of next) {
    if (member.id === self) continue;
    const old = before.get(member.id); before.delete(member.id);
    if (!old) roomToast(member, member.name + ' entrou na sala', '');
    if (screenLive(member) && !screenLive(old)) roomToast(member, member.name + ' começou a transmitir', member.stream.label || '',
      { label: 'Assistir', run: () => { showView('room'); if (tiles.has(member.id)) { focus = member.id; renderTiles(); } } });
  }
  for (const member of before.values()) if (member.id !== self) roomToast(member, member.name + ' saiu da sala', '');
}
function hideChatToast() { clearTimeout(chatToastTimer); $('chat-toast').hidden = true; }
async function playPing() {
  const volume = Number($('volume').value); if (muted || !volume) return;
  pingContext ||= new AudioContext();
  const sink = await deviceId('audiooutput', devicePrefs.speaker);
  if (pingContext.setSinkId && pingContext.sinkId !== sink) await pingContext.setSinkId(sink).catch(() => {});
  if (pingContext.state === 'suspended') await pingContext.resume().catch(() => {});
  const now = pingContext.currentTime, tone = pingContext.createOscillator(), gain = pingContext.createGain();
  tone.type = 'sine'; tone.frequency.setValueAtTime(320, now); tone.frequency.exponentialRampToValueAtTime(1250, now + 0.025);
  gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.3 * volume, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.02 * volume, now + 0.03); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  tone.connect(gain).connect(pingContext.destination); tone.start(now); tone.stop(now + 0.17);
}
function renderBanner(element, profile) {
  const safe = visualProfile(profile);
  element.style.backgroundColor = safe.accentColor || '';
  element.style.backgroundImage = safe.accentColor ? 'none' : '';
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
    const top = document.createElement('div'); top.className = 'tile-top';
    const live = document.createElement('span'); live.className = 'tile-live'; live.textContent = 'AO VIVO'; top.append(live);
    // Per-person volume, multiplied by the room volume; shown on hover like Discord's user volume.
    if (!own) {
      const volume = document.createElement('label'); volume.className = 'tile-volume'; volume.onclick = event => event.stopPropagation();
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.05'; slider.value = String(volumes.get(member.id) ?? 1);
      slider.oninput = () => { volumes.set(member.id, Number(slider.value)); applyAudio(); };
      volume.append(svgIcon('icon-speaker'), slider); top.append(volume);
    }
    const tools = document.createElement('div'); tools.className = 'tile-tools';
    const quality = document.createElement('span'); quality.className = 'tile-quality'; quality.hidden = true;
    const tool = (icon, onclick) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'tile-tool'; button.append(svgIcon(icon)); button.onclick = event => { event.stopPropagation(); onclick(); }; return button; };
    const pin = tool('icon-pin', () => { focus = focus === member.id ? null : member.id; renderTiles(); });
    const full = tool('icon-fullscreen', () => { const action = document.fullscreenElement ? document.exitFullscreen() : element.requestFullscreen(); action.catch(error => notice(error.message, true)); });
    pin.classList.add('tile-pin'); full.title = 'Tela cheia'; full.setAttribute('aria-label', 'Tela cheia');
    tools.append(...(own ? [] : [quality]), pin, full); top.append(tools);
    element.append(placeholder, player, pip, top, label); element.onclick = () => { focus = focus === member.id ? null : member.id; renderTiles(); };
    player.addEventListener('playing', () => { if (player.videoWidth) element.classList.add('playing'); renderTiles(); });
    player.addEventListener('emptied', () => element.classList.remove('playing'));
    player.addEventListener('canplay', () => media?.play(player));
    player.addEventListener('error', () => { if (media?.receivers.has(member.id)) media.recover(member.id); });
    item = { element, video: player, placeholder, label, own, member, pip, top, quality: own ? null : quality, pin }; tiles.set(member.id, item); $('streams-grid').append(element);
  }
  item.member = member; item.placeholder.replaceChildren(avatar(member, 'tile-avatar'));
  const face = avatar(member, 'label-avatar'); face.title = own ? 'Ver seu perfil' : 'Abrir perfil de ' + member.name;
  face.onclick = event => { event.stopPropagation(); openMemberProfile(member.id); };
  item.label.replaceChildren(face, document.createTextNode(member.name), ...(own ? [youTag()] : []));
  item.top.querySelector('.tile-volume')?.setAttribute('title', 'Volume de ' + member.name);
  item.top.querySelector('.tile-volume input')?.setAttribute('aria-label', 'Volume de ' + member.name);
  applyAudio(); return item.video;
}
// Real resolution, frame rate and (on direct routes) bitrate of each received stream, shown on the tile while hovered.
const tileStats = new Map();
async function receivedBytes(pc, track) {
  if (!pc || !track) return undefined;
  const stats = await pc.getStats(track).catch(() => null); if (!stats) return undefined;
  let bytes = 0; stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'video') bytes += report.bytesReceived || 0; }); return bytes;
}
async function updateTileStats() {
  for (const [id, item] of tiles) {
    if (!item.quality) continue;
    const video = item.video, now = performance.now(), frames = video.getVideoPlaybackQuality?.().totalVideoFrames || 0, last = tileStats.get(id);
    const relay = video.dataset.transport === 'relay';
    const bytes = relay ? undefined : await receivedBytes(media?.peers.get(id)?.pc, video.srcObject?.getVideoTracks?.()[0]);
    const span = last ? now - last.time : 0, fps = span > 0 ? Math.max(0, Math.round((frames - last.frames) * 1000 / span)) : 0;
    const rate = span > 0 && bytes !== undefined && last.bytes !== undefined && bytes >= last.bytes ? (bytes - last.bytes) * 8 / (span * 1000) : 0;
    tileStats.set(id, { time: now, frames, bytes });
    if (!video.videoHeight || !last) { item.quality.hidden = true; continue; }
    item.quality.hidden = false; item.quality.classList.toggle('weak', relay || fps < 20);
    item.quality.textContent = video.videoHeight + 'p · ' + fps + ' fps' + (rate ? ' · ' + rate.toFixed(1).replace('.', ',') + ' Mbps' : '') + (relay ? ' · compatibilidade' : '');
  }
  for (const id of tileStats.keys()) if (!tiles.has(id)) tileStats.delete(id);
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
  item.label.replaceChildren(document.createTextNode(item.member.name), ...(item.own ? [youTag()] : []));
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
    item.video.volume = Number($('volume').value) * (volumes.get(item.member.id.replace(/:camera$/, '')) ?? 1);
  }
  for (const [id, audio] of voices) { audio.muted = muted; audio.volume = Number($('volume').value) * (volumes.get(id) ?? 1); }
  void applySpeaker();
  $('sound-label').textContent = muted ? 'Ativar som' : 'Silenciar'; $('sound-button').setAttribute('aria-pressed', String(muted));
  $('sound-button').title = (muted ? 'Ativar som da sala' : 'Silenciar som da sala') + ' (M)';
}
// Picks the column count that gives each 16:9 cell the largest size; `max` caps the cell width (people cards).
function arrange(grid, count, max) {
  const bounds = grid.getBoundingClientRect(), gap = 8;
  let columns = 1, best = 0;
  for (let c = 1; c <= Math.max(count, 1); c++) {
    const rows = Math.ceil(count / c) || 1;
    const width = (bounds.width - 16 - (c - 1) * gap) / c, height = (bounds.height - 16 - (rows - 1) * gap) / rows;
    const fit = Math.min(width, height * 16 / 9); if (fit > best) { best = fit; columns = c; }
  }
  const rows = Math.ceil(count / columns) || 1, width = Math.max(0, Math.floor(Math.min(best, max || best)));
  grid.style.gridTemplateColumns = max ? 'repeat(' + columns + ', ' + width + 'px)' : 'repeat(' + columns + ', minmax(0,1fr))';
  grid.style.gridTemplateRows = max ? 'repeat(' + rows + ', ' + Math.floor(width * 9 / 16) + 'px)' : 'repeat(' + rows + ', minmax(0,1fr))';
}
function youTag() { const tag = document.createElement('span'); tag.className = 'you-tag'; tag.textContent = 'você'; return tag; }
function personCard(member) {
  const own = member.id === self, card = document.createElement('button'); card.type = 'button'; card.className = 'person-tile'; card.dataset.member = member.id;
  card.title = own ? 'Ver seu perfil' : 'Abrir perfil de ' + member.name; card.onclick = () => openMemberProfile(member.id);
  const name = document.createElement('span'); name.className = 'person-name'; name.textContent = member.name; if (own) name.append(youTag());
  if (member.id === 'host') name.prepend(svgIcon('icon-crown', 'crown'));
  if (member.stream?.voice && member.stream.muted) name.append(svgIcon('icon-mic-off', 'muted-icon'));
  card.append(avatar(member, 'person-avatar'), name); return card;
}
function inviteCard() {
  const card = document.createElement('div'); card.className = 'person-tile invite-tile';
  const title = document.createElement('strong'); title.textContent = 'Chame alguém';
  const text = document.createElement('small'); text.textContent = 'Até 7 pessoas entram pelo link.';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button primary'; button.textContent = 'Copiar link';
  button.onclick = () => void copyInvite(button, false);
  card.append(svgIcon('icon-user-plus', 'invite-icon'), title, text, button); return card;
}
// Everyone in the room has a card, Discord style; people without video shrink to a strip under the streams.
function renderPeople() {
  const list = self ? members.filter(member => !tiles.has(member.id)) : [], lonely = Boolean(self) && members.length <= 1 && Boolean($('invite-link').value);
  const key = JSON.stringify([self, lonely, list.map(member => [member.id, member.name, member.photo, member.accentColor, member.stream?.voice && member.stream.muted])]);
  if (key === peopleKey) return;
  peopleKey = key; $('people-grid').replaceChildren(...list.map(personCard), ...(lonely ? [inviteCard()] : []));
}
function renderTiles() {
  if (focus && !tiles.has(focus)) focus = null;
  for (const [id, item] of tiles) {
    item.element.hidden = focus !== null && id !== focus;
    item.element.setAttribute('aria-pressed', String(focus === id));
    item.element.setAttribute('aria-label', focus === id ? 'Voltar para todas as telas' : 'Focar transmissão de ' + item.member.name);
    if (item.pin) { const pinned = focus === id; item.pin.setAttribute('aria-pressed', String(pinned)); item.pin.title = item.pin.ariaLabel = pinned ? 'Voltar para todas as telas' : 'Fixar esta transmissão'; }
  }
  renderPeople();
  const count = focus ? 1 : tiles.size, people = $('people-grid').children.length;
  $('stage').classList.toggle('with-strip', tiles.size > 0 && people > 0); $('streams-grid').hidden = !tiles.size;
  arrange($('streams-grid'), count);
  if (tiles.size) $('people-grid').style.gridTemplateColumns = $('people-grid').style.gridTemplateRows = ''; else arrange($('people-grid'), people, 640);
  $('stage').classList.toggle('has-video', count > 0); $('empty-stage').hidden = count > 0 || people > 0; $('grid-button').hidden = !focus;
  applyAudio(); updateRoomMessage();
}
function renderMembers() {
  const host = members.find(member => member.id === 'host');
  $('people-title').textContent = members.length ? 'Na sala — ' + members.length : 'Na sala';
  $('room-title').textContent = role === 'viewer' ? (host ? 'Sala de ' + host.name : 'Sala atual') : 'Minha sala';
  $('room-count').textContent = members.length ? members.length + ' de 8 pessoas' : '';
  renderInviteSlots(); renderHome();
  $('audience-list').replaceChildren();
  for (const member of members) {
    const own = member.id === self, row = document.createElement('button'); row.type = 'button'; row.className = 'audience-row ' + (own ? 'audience-me' : 'audience-person'); row.dataset.member = member.id;
    row.title = member.name + (member.stream?.active ? ' · transmitindo' : ' · assistindo');
    row.setAttribute('aria-label', own ? 'Ver seu perfil' : 'Abrir perfil de ' + member.name); row.setAttribute('aria-haspopup', 'dialog');
    row.setAttribute('aria-controls', 'member-profile'); row.setAttribute('aria-expanded', String(viewedMember === member.id));
    row.onclick = () => openMemberProfile(member.id);
    const text = document.createElement('span'); text.className = 'audience-name'; text.textContent = member.name + (own ? ' (você)' : '');
    const icons = document.createElement('span'); icons.className = 'row-icons';
    if (member.id === 'host') icons.append(svgIcon('icon-crown', 'crown'));
    if (member.stream?.voice && member.stream.muted) icons.append(svgIcon('icon-mic-off', 'muted-icon'));
    if (member.stream?.camera) icons.append(svgIcon('icon-camera'));
    if (member.stream?.active && member.stream.screen !== false) { const live = document.createElement('span'); live.className = 'live-pill'; live.textContent = 'AO VIVO'; icons.append(live); }
    row.append(avatar(member), text, icons); $('audience-list').append(row);
    if (own) continue;
    const item = tiles.get(member.id); if (item) tile(member);
    if (cameraViews.has(member.id)) placeCamera(member.id);
  }
  localTile(); renderTiles(); renderMemberProfile();
}
// Green pulse on whoever is talking: your own mic and the voice received from each person.
function watchLevels() {
  const sources = new Map();
  if (self && voiceTrack?.enabled && voiceTrack.readyState === 'live') sources.set(self, voiceTrack);
  for (const [id, audio] of voices) { const track = audio.srcObject?.getAudioTracks?.()[0]; if (track?.readyState === 'live') sources.set(id, track); }
  for (const [id, track] of sources) {
    let entry = levels.get(id);
    if (entry?.track !== track) {
      entry?.source.disconnect(); levelContext ||= new AudioContext(); if (levelContext.state === 'suspended') levelContext.resume().catch(() => {});
      const analyser = levelContext.createAnalyser(), source = levelContext.createMediaStreamSource(new MediaStream([track])); analyser.fftSize = 512; source.connect(analyser);
      entry = { track, source, analyser, data: new Uint8Array(512) }; levels.set(id, entry);
    }
    entry.analyser.getByteTimeDomainData(entry.data);
    let peak = 0; for (const value of entry.data) peak = Math.max(peak, Math.abs(value - 128));
    // A short hold keeps the pulse steady between syllables instead of restarting every tick.
    if (peak > 5) entry.until = Date.now() + 700;
    entry.speaking = Date.now() < (entry.until || 0);
  }
  for (const [id, entry] of levels) if (!sources.has(id)) { entry.source.disconnect(); levels.delete(id); }
  const speaking = id => Boolean(levels.get(String(id).replace(/:camera$/, ''))?.speaking);
  for (const [id, item] of tiles) item.element.classList.toggle('speaking', speaking(id));
  for (const element of document.querySelectorAll('#audience-list [data-member], #people-grid [data-member]')) element.classList.toggle('speaking', speaking(element.dataset.member));
}
function renderMemberProfile() {
  if (!viewedMember) return;
  const found = members.find(person => person.id === viewedMember), own = viewedMember === self;
  if (!found || !self || document.body.dataset.view !== 'room') { closeMemberProfile(); return; }
  const member = own ? { ...found, ...visualProfile(config.profile) } : found;
  $('member-profile-edit').hidden = !own; $('member-volume-row').hidden = own;
  $('member-volume').value = String(volumes.get(member.id) ?? 1); $('member-volume').setAttribute('aria-label', 'Volume de ' + member.name);
  $('member-profile-photo').replaceChildren(avatar(member, 'member-card-avatar'));
  $('member-profile-name').textContent = member.name;
  renderBanner($('member-profile-banner'), member);
}
function openMemberProfile(id) {
  if (document.body.dataset.view !== 'room' || socket?.readyState !== WebSocket.OPEN || !members.some(person => person.id === id)) return;
  profileOpener = document.activeElement; viewedMember = id; profilePointerOutside = false; renderMemberProfile();
  for (const row of $('audience-list').children) row.setAttribute('aria-expanded', String(row.dataset.member === id));
  if (!$('member-profile').open) $('member-profile').showModal();
}
function closeMemberProfile() {
  const dialog = $('member-profile');
  if (!viewedMember && !dialog.open) return;
  const id = viewedMember, opener = profileOpener; viewedMember = null;
  if (dialog.open) dialog.close();
  $('member-profile-photo').replaceChildren(); $('member-profile-name').textContent = ''; $('member-profile-edit').hidden = true; profileOpener = undefined;
  renderBanner($('member-profile-banner'), {});
  for (const row of $('audience-list').children) row.setAttribute('aria-expanded', 'false');
  if (document.body.dataset.view === 'room') {
    const origin = opener?.isConnected && opener !== document.body ? opener : [...$('audience-list').children].find(row => row.dataset.member === id);
    (origin || $('host-tab')).focus({ preventScroll: true });
  }
}
function outsideMemberProfile(event) {
  const box = $('member-profile').getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
function setLive(active) {
  $('live-dot').classList.toggle('red', active); $('live-badge').hidden = !active; document.title = $('titlebar-title').textContent = active ? 'Concord · AO VIVO' : 'Concord'; liveSince = active ? Date.now() : 0;
  $('stream-clock').hidden = !active; $('stream-clock').textContent = active ? '00:00:00' : '';
}
function showVideo() { renderTiles(); }
function lockSettings(locked) {
  for (const id of ['choose-source', 'choose-audio-source', 'audio-mode', 'quality', 'fps', 'bitrate-mode', 'bitrate-value', 'bitrate-slider', 'system-audio']) $(id).disabled = locked;
  for (const button of $('share-dialog').querySelectorAll('.seg-option, .share-source')) button.disabled = locked;
  $('test-audio').hidden = Boolean(stream) || starting || audioMode() !== 'application';
  $('start-button').hidden = Boolean(stream); $('stop-button').hidden = !stream;
  $('share-live').hidden = !stream; $('share-live-name').textContent = stream ? 'Transmitindo ' + (selectedSource?.name || 'a tela') : '';
  document.querySelector('.source-bar').hidden = $('share-sources').hidden = Boolean(stream);
  $('start-button').disabled = locked || !selectedSource || socket?.readyState !== WebSocket.OPEN;
  $('start-label').textContent = selectedSource ? 'Compartilhar ' + shortName(selectedSource.name, 22) : 'Compartilhar tela';
  $('start-hint').textContent = stream || starting ? '' : !selectedSource ? 'Escolha uma janela ou tela para começar.' : socket?.readyState !== WebSocket.OPEN ? 'Entre em uma sala para transmitir.' : '';
  $('start-hint').hidden = !$('start-hint').textContent;
  $('settings-quality').disabled = $('settings-fps').disabled = locked; $('settings-video-lock').hidden = !stream;
  renderCallBar();
}
// Discord-style call bar: quick toggles; the full sharing menu opens in #share-dialog.
function renderCallBar() {
  const connected = socket?.readyState === WebSocket.OPEN, mic = Boolean(voiceTrack) && !voiceMuted && !muted;
  const state = (id, on, title) => { $(id).setAttribute('aria-pressed', String(on)); $(id).title = title; };
  state('bar-screen', Boolean(stream), stream ? 'Transmitindo a tela: abrir opções ou encerrar' : 'Transmitir tela'); $('bar-screen-label').textContent = stream ? 'Transmitindo' : 'Transmitir tela';
  state('bar-camera', Boolean(cameraStream), cameraStream ? 'Desligar câmera' : 'Ligar câmera');
  state('bar-mic', mic, connected && !roomVoice ? 'Quem criou a sala precisa do Concord 0.8.3 ou mais novo para usar voz' : voiceStarting ? 'Ligando microfone…'
    : connected && !voiceTrack ? 'Microfone indisponível: clique para tentar de novo' : mic ? 'Mutar microfone' : 'Desmutar microfone');
  $('bar-mic').disabled = !connected || !roomVoice || voiceStarting;
  $('chat-toggle').setAttribute('aria-expanded', String(!sideHidden)); $('chat-toggle').title = 'Esconder chat (C)';
  $('chat-button').setAttribute('aria-expanded', String(!sideHidden)); $('chat-button').title = sideHidden ? 'Abrir chat (C)' : 'Esconder chat (C)';
  $('bar-screen').disabled = !connected; $('bar-camera').disabled = !connected || cameraStarting;
}
function setSide(hidden) { if (!hidden) hideChatToast(); sideHidden = hidden; document.body.classList.toggle('side-hidden', hidden); chat.setVisible(!hidden); renderCallBar(); renderTiles(); }
// Voice works like Discord: the mic opens when you enter a room and the button only mutes it.
// Muting and deafening disable the track (silence is sent); leaving the room stops the capture.
async function deviceId(kind, name) {
  if (!name) return '';
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  return devices.find(device => device.kind === kind && device.label === name)?.deviceId || '';
}
// `replace` swaps the device: the new mic is captured first, so a failure keeps the current one.
async function startVoice(replace = false) {
  if (!roomVoice || socket?.readyState !== WebSocket.OPEN) return;
  if (!replace && voiceTrack?.readyState === 'live') { applyVoice(); publishState(); await media?.setVoice(voiceTrack); return; }
  const generation = ++voiceGeneration; voiceStarting = true; renderCallBar();
  try {
    const id = await deviceId('audioinput', devicePrefs.mic);
    const captured = await navigator.mediaDevices.getUserMedia({ audio: { ...(id ? { deviceId: { exact: id } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    const track = captured.getAudioTracks()[0];
    if (generation !== voiceGeneration || socket?.readyState !== WebSocket.OPEN || !track) { captured.getTracks().forEach(item => item.stop()); return; }
    const previous = voiceTrack; voiceTrack = track; track.contentHint = 'speech';
    if (previous) { previous.onended = null; previous.stop(); }
    track.onended = () => { if (voiceTrack === track) { stopVoice(); notice('O microfone foi desconectado. Clique no microfone para tentar de novo.', true); } };
    applyVoice(); publishState(); await media?.setVoice(track);
  } catch (error) {
    if (generation === voiceGeneration) notice(error.name === 'NotAllowedError' ? 'O microfone não foi liberado. Confira as configurações de privacidade do Windows.'
      : replace && voiceTrack ? 'Não consegui usar esse microfone. Continuo com o anterior.' : 'Não encontrei um microfone disponível. Você continua ouvindo a sala.', true);
  } finally { if (generation === voiceGeneration) { voiceStarting = false; renderCallBar(); } }
}
function stopVoice() {
  ++voiceGeneration; voiceStarting = false;
  if (voiceTrack) { voiceTrack.onended = null; voiceTrack.stop(); voiceTrack = undefined; void media?.setVoice(null); }
  publishState(); renderCallBar();
}
// Deafening also silences your mic, like Discord.
function applyVoice() { if (voiceTrack) voiceTrack.enabled = !voiceMuted && !muted; renderCallBar(); }
function setVoiceMuted(value) {
  voiceMuted = value; if (!value && muted) { muted = false; applyAudio(); }
  applyVoice(); publishState(); savePreferences();
}
function voicePlayer(member) {
  let audio = voices.get(member.id);
  if (!audio) {
    audio = document.createElement('audio'); audio.autoplay = true; audio.dataset.voice = member.id;
    audio.addEventListener('canplay', () => media?.play(audio));
    audio.addEventListener('error', () => { if (media?.receivers.has(member.id + ':voice')) media.recover(member.id + ':voice'); });
    $('voice-audio').append(audio); voices.set(member.id, audio); applyAudio();
  }
  return audio;
}
function removeVoice(id) {
  const audio = voices.get(id); if (!audio) return;
  voices.delete(id); audio.pause(); audio.srcObject = null; audio.removeAttribute('src'); audio.load(); audio.remove();
}
// Device menus (caret beside mic, camera and sound): names are saved, so the choice survives the app port changing.
const deviceKinds = { mic: ['audioinput', 'Microfone', 'Padrão do Windows'], camera: ['videoinput', 'Câmera', 'Padrão do Windows'], speaker: ['audiooutput', 'Saída de áudio', 'Padrão do Windows'] };
let deviceMenuFor = null;
async function applySpeaker() {
  const id = await deviceId('audiooutput', devicePrefs.speaker);
  for (const element of document.querySelectorAll('video, audio')) if (element.setSinkId && element.sinkId !== id) await element.setSinkId(id).catch(() => {});
}
async function chooseDevice(kind, name) {
  closeDeviceMenu(); if (devicePrefs[kind] === name) return;
  devicePrefs[kind] = name; savePreferences();
  if (kind === 'mic' && voiceTrack) await startVoice(true);
  if (kind === 'camera' && cameraStream) { stopCamera(); void startCamera(); }
  if (kind === 'speaker') await applySpeaker();
}
function closeDeviceMenu() {
  const button = deviceMenuFor && $(deviceMenuFor + '-menu-button'); deviceMenuFor = null; $('device-menu').hidden = true;
  for (const caret of document.querySelectorAll('.device-caret')) caret.setAttribute('aria-expanded', 'false');
  return button;
}
function deviceNames(kind, devices) {
  const names = [...new Set(devices.filter(device => device.kind === deviceKinds[kind][0] && device.label && !['default', 'communications'].includes(device.deviceId)).map(device => device.label))];
  if (devicePrefs[kind] && !names.includes(devicePrefs[kind])) names.push(devicePrefs[kind]);
  return names;
}
// Settings (gear in the call bar): the same device choices as the carets, plus a mic test and the default share quality.
let micTest, micTestGeneration = 0;
async function fillSettings() {
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  for (const select of $('settings-dialog').querySelectorAll('select[data-kind]')) {
    const kind = select.dataset.kind, connected = name => devices.some(device => device.kind === deviceKinds[kind][0] && device.label === name);
    select.replaceChildren(...['', ...deviceNames(kind, devices)].map(name => new Option(name ? name + (connected(name) ? '' : ' (desconectado)') : deviceKinds[kind][2], name)));
    select.value = devicePrefs[kind];
  }
  for (const select of $('settings-dialog').querySelectorAll('select[data-mirror]')) {
    const source = $(select.dataset.mirror); select.replaceChildren(...[...source.options].map(option => new Option(option.textContent, option.value))); select.value = source.value;
  }
}
function settingsTab(name) {
  for (const tab of $('settings-dialog').querySelectorAll('.settings-tab')) {
    const selected = tab.id === 'settings-tab-' + name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected; if (selected) $('settings-title').textContent = tab.textContent;
  }
  if (name !== 'voice') stopMicTest();
}
function stopMicTest() {
  ++micTestGeneration; micTest?.getTracks().forEach(track => track.stop()); micTest = undefined; micMeter.stop();
  $('mic-test-label').textContent = 'Fale algo. O teste não envia som para a sala.'; $('mic-test').textContent = 'Testar'; $('mic-test').setAttribute('aria-pressed', 'false');
}
async function startMicTest() {
  stopMicTest(); const generation = micTestGeneration;
  $('mic-test').textContent = 'Parar teste'; $('mic-test').setAttribute('aria-pressed', 'true');
  try {
    const id = await deviceId('audioinput', devicePrefs.mic);
    const captured = await navigator.mediaDevices.getUserMedia({ audio: { ...(id ? { deviceId: { exact: id } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    if (generation !== micTestGeneration || !$('settings-dialog').open) { captured.getTracks().forEach(track => track.stop()); return; }
    micTest = captured; await micMeter.watch(captured.getAudioTracks()[0]);
  } catch { if (generation === micTestGeneration) { stopMicTest(); $('mic-test-label').textContent = 'Não consegui abrir esse microfone.'; } }
}
// Connection details open on hover over the signal in the sidebar.
async function roundTrip(pc) {
  const stats = pc ? await pc.getStats().catch(() => null) : null; let value = null;
  stats?.forEach(report => { if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded' && report.currentRoundTripTime !== undefined) value = Math.round(report.currentRoundTripTime * 1000); });
  return value;
}
let uploadSample, connectionPopTimer;
async function renderConnectionPop() {
  const online = document.body.dataset.connected === 'true', route = document.body.dataset.route, host = members.find(member => member.id === 'host'), rows = [], hints = [];
  const row = (name, value, state, ms) => rows.push({ name, value: value + (ms !== null && ms !== undefined ? ' · ' + ms + ' ms' : ''), state });
  if (role === 'host') row('Sala', 'Aberta neste PC', 'ok');
  else row('Você → ' + (host?.name || 'sala'), !online ? 'Conectando…' : route === 'tunnel' ? 'Pela Cloudflare' : route === 'direct' ? 'Direta' : 'Conectada', !online ? 'wait' : route === 'tunnel' ? 'relay' : 'ok', route === 'direct' ? await roundTrip(socket?.pc) : null);
  if (route === 'tunnel' && role !== 'host') hints.push('A conexão direta falhou, então você entrou pela Cloudflare. Pode haver mais atraso.');
  const relayed = [];
  for (const member of members) {
    if (member.id === self) continue;
    const pc = media?.peers.get(member.id)?.pc, relay = media?.relaying(member.id) || tiles.get(member.id)?.video.dataset.transport === 'relay';
    if (relay) relayed.push(member.name);
    row(member.name, relay ? 'Compatibilidade' : pc?.connectionState === 'connected' ? 'Direta' : 'Conectando…', relay ? 'relay' : pc?.connectionState === 'connected' ? 'ok' : 'wait', relay ? null : await roundTrip(pc));
  }
  if (relayed.length) hints.push('A mídia de ' + relayed.join(', ') + ' passa pelo PC de quem criou a sala, então pode ter mais atraso.');
  if (stream && media) {
    let bytes = 0;
    for (const peer of media.peers.values()) { const stats = await peer.pc?.getStats().catch(() => null); stats?.forEach(report => { if (report.type === 'outbound-rtp' && report.kind === 'video') bytes += report.bytesSent || 0; }); }
    const now = performance.now(), rate = uploadSample && now > uploadSample.time && bytes >= uploadSample.bytes ? (bytes - uploadSample.bytes) * 8 / ((now - uploadSample.time) * 1000) : null;
    uploadSample = { time: now, bytes };
    rows.push({ name: 'Seu envio', value: rate === null ? 'Medindo…' : rate.toFixed(1).replace('.', ',') + ' de ' + formatMbps(bitrate()) + ' Mbps', state: '' });
  } else uploadSample = undefined;
  if ($('connection-pop').hidden) return;
  const title = document.createElement('strong'); title.className = 'pop-title'; title.append(svgIcon('icon-signal'), 'Conexão da sala');
  $('connection-pop').replaceChildren(title, ...rows.map(item => {
    const line = document.createElement('div'); line.className = 'pop-row';
    const name = document.createElement('span'); name.textContent = item.name;
    const value = document.createElement('span'); value.className = 'pop-value'; value.dataset.state = item.state; value.textContent = item.value;
    line.append(name, value); return line;
  }), ...hints.map(text => { const hint = document.createElement('p'); hint.className = 'pop-hint'; hint.textContent = text; return hint; }));
}
function showConnectionPop() {
  const box = $('connection-panel').getBoundingClientRect(), pop = $('connection-pop');
  pop.hidden = false; pop.style.left = (box.right + 12) + 'px'; pop.style.bottom = Math.max(8, innerHeight - box.bottom) + 'px';
  clearInterval(connectionPopTimer); void renderConnectionPop(); connectionPopTimer = setInterval(() => void renderConnectionPop(), 1000);
}
function hideConnectionPop() { clearInterval(connectionPopTimer); $('connection-pop').hidden = true; uploadSample = undefined; }
async function openDeviceMenu(kind) {
  if (deviceMenuFor === kind) { closeDeviceMenu(); return; }
  closeDeviceMenu(); deviceMenuFor = kind;
  const [type, title, fallback] = deviceKinds[kind], chosen = devicePrefs[kind], menu = $('device-menu'), anchor = $(kind + '-menu-button');
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  if (deviceMenuFor !== kind) return;
  const names = deviceNames(kind, devices);
  const heading = document.createElement('p'); heading.className = 'device-menu-title'; heading.textContent = title;
  const items = ['', ...names].map(name => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'device-option'; item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(name === chosen)); item.dataset.device = name;
    item.textContent = name ? name + (devices.some(device => device.kind === type && device.label === name) ? '' : ' (desconectado)') : fallback;
    item.onclick = () => { void chooseDevice(kind, name); anchor.focus(); };
    return item;
  });
  menu.replaceChildren(heading, ...items); menu.setAttribute('aria-label', title); menu.hidden = false; anchor.setAttribute('aria-expanded', 'true');
  const box = anchor.closest('.device-split').getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(box.left, innerWidth - menu.offsetWidth - 8)) + 'px'; menu.style.bottom = (innerHeight - box.top + 8) + 'px';
  (items.find(item => item.getAttribute('aria-checked') === 'true') || items[0]).focus();
}
function bitrate() { return videoBitrate(qualityKey(), $('bitrate-mode').value === 'manual' ? $('bitrate-value').value : null); }
function qualityLabel() { return $('quality').selectedOptions[0].textContent + ' · ' + $('fps').value + ' FPS · ' + formatMbps(bitrate()) + ' Mbps'; }
function updateBitrateControls() {
  const manual = $('bitrate-mode').value === 'manual'; $('manual-bitrate').hidden = !manual;
  const recommended = formatMbps(videoBitrate(qualityKey()));
  $('bitrate-mode').options[0].textContent = 'Automática · ' + recommended + ' Mbps';
  $('bitrate-summary').textContent = manual ? formatMbps(bitrate()) + ' Mbps' : 'Automática · ' + recommended + ' Mbps';
  $('bitrate-hint').textContent = manual ? 'Referência: ' + recommended + ' Mbps. Ajuste antes de transmitir.' : 'Mais bitrate preserva detalhes e usa mais upload.';
  renderQualityPresets();
}
function publishState() {
  send({ type: 'stream-state', active: Boolean(stream || cameraStream), screen: Boolean(stream), camera: Boolean(cameraStream), label: stream ? selectedSource?.name || '' : cameraStream ? 'Câmera' : '', quality: stream ? qualityLabel() : '', relay: false,
    voice: Boolean(voiceTrack), muted: voiceMuted || muted });
}
function disconnect() {
  closeDiscordFriends(); chat.clear(); hideChatToast(); stopVoice(); roomVoice = false; volumes.clear();
  terminal = true; clearTimeout(reconnectTimer); clearTimeout(joinTimer); const previous = socket; socket = undefined; previous?.close();
  $('room-toasts').replaceChildren(); hideConnectionPop(); if ($('settings-dialog').open) $('settings-dialog').close(); media?.close(); media = null; for (const id of [...cameraViews.keys()]) removeCamera(id); self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers(); renderCallBar();
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
    player: member => tile(member), cameraPlayer, removeCamera, voicePlayer, removeVoice, remove: removeTile, update: renderTiles,
    compatibility: updateRoomMessage,
    error: text => notice(text, true), fatal: text => { stopSharing(); notice(text, true); } });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: target.token, role: target.role, profile: config.profile, features: ['camera', 'voice'] }));
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
          roomCamera = Array.isArray(msg.features) && msg.features.includes('camera'); roomVoice = Array.isArray(msg.features) && msg.features.includes('voice');
          chat.setEnabled(Array.isArray(msg.features) && msg.features.includes('chat')); chat.setSelf(msg.self, config.profile); chat.setVisible(!sideHidden); if (cameraStream && !roomCamera) stopCamera();
          renderInvite(); lockSettings(Boolean(stream)); publishState(); await media.setStream(stream); await media.setCamera(cameraStream?.getVideoTracks()[0] || null); void startVoice();
        }
        if (msg.type === 'room') roomEvents(members, msg.members);
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
    if ([4001,4002,4003].includes(event.code)) { terminal = true; stopSharing(); stopCamera(); stopVoice(); status('Não conectado'); notice(event.reason || 'Convite inválido.', true); return; }
    // Out of the room the mic is closed, even while retrying; the next welcome opens it again.
    stopVoice(); status('Reconectando'); retries++; reconnectTimer = setTimeout(openSocket, Math.min(1000 * 2 ** Math.min(retries-1,4),15000));
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
  $('audio-meter-panel').hidden = !$('system-audio').checked || (!stream && !starting && !appOnly);
  if (!stream && !starting && !audioPreviewTrack && !testingAudio) $('audio-level-label').textContent = 'Teste para conferir o som antes de transmitir.';
  $('test-audio').hidden = !appOnly || Boolean(stream) || starting;
  $('test-audio').disabled = !selectedAudioSource;
  $('test-audio').textContent = audioPreviewTrack || testingAudio ? 'Parar teste de áudio' : 'Testar áudio do app';
  $('choose-audio-source').hidden = !manual;
  $('audio-summary').textContent = !$('system-audio').checked ? 'Sem som na transmissão.'
    : appOnly ? (selectedAudioSource ? 'Som de ' + selectedAudioSource.name + ', sem outros apps.' : 'Escolha o jogo / app abaixo.')
    : $('audio-mode').value === 'system' || selectedSource ? 'Som de todo o computador.' : 'Janela: só o som do app. Tela inteira: som do computador.';
  $('audio-source-name').textContent = selectedAudioSource?.name || 'Escolher jogo / app';
  $('audio-source-hint').textContent = appOnly ? 'Só o app escolhido e seus processos. Outros apps ficam de fora.' : 'Inclui Discord, notificações e os sons de todos os apps.';
  const choice = !$('system-audio').checked ? 'off' : $('audio-mode').value === 'application' ? '' : $('audio-mode').value;
  for (const option of document.querySelectorAll('[data-audio]')) option.setAttribute('aria-checked', String(option.dataset.audio === choice));
  $('audio-auto').textContent = selectedSource?.id.startsWith('window:') ? 'Só do app' : 'Automático';
  if (!choice) $('audio-summary').textContent += ' Fonte escolhida em Avançado.';
}
// App audio for "Somente um jogo / app" is picked in its own small list of windows.
async function chooseAudioSource() {
  if (!native || stream) return;
  $('choose-audio-source').disabled = true; notice('');
  try {
    const sources = (await native.sources()).filter(source => source.id.startsWith('window:')); $('source-list').replaceChildren();
    if (!sources.length) throw new Error('Nenhuma janela disponível.');
    for (const source of sources) {
      const button = document.createElement('button'); button.className = 'source-choice';
      const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
      const label = document.createElement('span'); label.textContent = source.name;
      button.append(image, label);
      button.onclick = () => { stopAudioPreview(); selectedAudioSource = source; updateAudioControls(); $('source-picker').close(); lockSettings(false); };
      $('source-list').append(button);
    }
    $('source-picker').showModal();
  } catch (error) { notice(`Não consegui listar as janelas: ${error.message}`, true); }
  finally { $('choose-audio-source').disabled = Boolean(stream) || starting; }
}
// The share dialog lists windows and screens inline; nothing is preselected, the source stays an explicit click.
let shareSources = [], sourceKind = 'window', sourcesGeneration = 0, sourcesError = '';
function shortName(name, max = 26) { return name.length > max ? name.slice(0, max - 1).trimEnd() + '…' : name; }
async function loadShareSources() {
  if (!native || stream) return;
  const generation = ++sourcesGeneration; $('choose-source').disabled = true; sourcesError = '';
  if (!shareSources.length) renderShareSources('Carregando janelas…');
  try {
    const sources = await native.sources(); if (generation !== sourcesGeneration) return;
    shareSources = sources;
    if (selectedSource && !stream) selectedSource = sources.find(source => source.id === selectedSource.id);
    if (!sources.some(source => source.id.startsWith(sourceKind + ':'))) sourceKind = sourceKind === 'window' ? 'screen' : 'window';
    renderShareSources(); updateAudioControls(); lockSettings(Boolean(stream) || starting);
  } catch (error) { if (generation === sourcesGeneration) { shareSources = []; sourcesError = `Não consegui listar as telas: ${error.message}`; renderShareSources(); } }
  finally { if (generation === sourcesGeneration) $('choose-source').disabled = Boolean(stream) || starting; }
}
function renderShareSources(status = '') {
  const list = shareSources.filter(source => source.id.startsWith(sourceKind + ':')), locked = Boolean(stream) || starting;
  for (const tab of document.querySelectorAll('.source-tabs .seg-option')) tab.setAttribute('aria-selected', String(tab.dataset.kind === sourceKind));
  const items = list.map(source => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'share-source'; button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selectedSource?.id === source.id)); button.disabled = locked; button.title = source.name;
    const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
    const label = document.createElement('span'); label.append(svgIcon(source.id.startsWith('screen:') ? 'icon-screen' : 'icon-window')); label.append(source.name);
    button.append(image, label);
    button.onclick = () => { stopAudioPreview(); selectedSource = source; if (source.id.startsWith('window:')) selectedAudioSource = source; renderShareSources(); updateAudioControls(); lockSettings(false); };
    button.ondblclick = () => { if (!$('start-button').disabled) void startSharing(); };
    return button;
  });
  const text = status || sourcesError || (shareSources.length && !list.length ? (sourceKind === 'window' ? 'Nenhuma janela aberta.' : 'Nenhuma tela encontrada.') : '');
  const note = document.createElement('p'); note.className = 'sources-status'; note.textContent = text;
  $('share-sources').replaceChildren(...(text ? [note] : []), ...items);
}
for (const tab of document.querySelectorAll('.source-tabs .seg-option')) tab.onclick = () => { sourceKind = tab.dataset.kind; renderShareSources(); };
function renderQualityPresets() {
  const key = $('quality').value + ':' + $('fps').value, manual = $('bitrate-mode').value === 'manual';
  const options = [...document.querySelectorAll('[data-preset]')], match = !manual && options.some(option => option.dataset.preset === key);
  for (const option of options) option.setAttribute('aria-checked', String(!manual && option.dataset.preset === key));
  $('quality-summary').textContent = qualityLabel() + (match ? '' : ' · personalizada em Avançado');
}
for (const option of document.querySelectorAll('[data-preset]')) option.onclick = () => {
  const [quality, fps] = option.dataset.preset.split(':'); $('quality').value = quality; $('fps').value = fps; $('bitrate-mode').value = 'auto';
  $('quality').dispatchEvent(new Event('change'));
};
for (const option of document.querySelectorAll('[data-audio]')) option.onclick = () => {
  const choice = option.dataset.audio; $('system-audio').checked = choice !== 'off'; if (choice !== 'off') $('audio-mode').value = choice;
  $('audio-mode').dispatchEvent(new Event('change'));
};
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
  if (appOnly && !selectedAudioSource) { notice('Escolha o jogo/app em Áudio › Fonte do áudio. Você pode compartilhar um monitor inteiro e ouvir só esse app.', true); return; }
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
    stream = new MediaStream([track]);
    if (audio.length > 1) {
      audioContext = new AudioContext(); await audioContext.resume();
      const destination = mixDestination = audioContext.createMediaStreamDestination();
      for (const audioTrack of audio) audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(destination);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (audio.length) stream.addTrack(audio[0]);
    track.onended = () => stopSharing();
    video.srcObject = display; video.muted = true; video.play().catch(() => {});
    showVideo(true); if (!liveSince) setLive(true);
    publishState(); await media.setStream(stream); localTile(); renderTiles();
    if ($('share-dialog').open) $('share-dialog').close();
  } catch (error) {
    if (generation === captureGeneration) { stopSharing(); notice(error.name === 'NotAllowedError' ? 'A captura não foi autorizada. Escolha a tela e tente novamente.' : `Não consegui iniciar a captura: ${error.message}`, true); }
  } finally { starting = false; lockSettings(Boolean(stream)); }
}
function stopSharing() {
  ++captureGeneration; stopAudioPreview(); meter.stop();
  void media?.setStream(null);
  for (const item of [stream, display]) for (const track of item?.getTracks() || []) { track.onended = null; track.stop(); }
  audioContext?.close().catch(() => {}); stream = display = audioContext = mixDestination = undefined;
  stopAppAudioResources();
  video.srcObject = null; if (!cameraStream) setLive(false);
  publishState(); if (cameraStream) localTile(); else removeTile(self); lockSettings(false); renderTiles();
}
// Camera is a separate, explicit capture: video only, granted once per click by the main process.
async function startCamera() {
  if (cameraStream || cameraStarting) return;
  if (!roomCamera) { notice('Quem criou a sala precisa estar no Concord 0.7.0 ou mais novo para usar a câmera.', true); return; }
  const generation = ++cameraGeneration; cameraStarting = true; lockSettings(Boolean(stream)); notice('');
  try {
    await native.allowCamera();
    const id = await deviceId('videoinput', devicePrefs.camera);
    const captured = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
    if (generation !== cameraGeneration || socket?.readyState !== WebSocket.OPEN) { captured.getTracks().forEach(track => track.stop()); return; }
    cameraStream = captured; const track = captured.getVideoTracks()[0]; track.contentHint = 'motion'; track.onended = () => stopCamera();
    if (!liveSince) setLive(true);
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
  invite = data; for (const code of [data?.p2pInvite, data?.guestInvite]) if (code) knownInvites.add(inviteKey(code));
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
  $('remove-banner').hidden = !config.profile.banner; $('remove-photo').hidden = !config.profile.photo;
  renderNameDraft(); renderHome();
}
// Live preview of the name being typed; photo/banner/theme are saved on the spot, only the name waits for Salvar.
function renderNameDraft() {
  const draft = $('display-name').value.trim(), saved = config.profile.name || '';
  $('preview-name').textContent = draft || saved || 'Seu nome';
  $('preview-sub').textContent = config.discord?.linked ? 'Vinculado ao Discord' : 'Perfil deste computador';
  $('name-count').textContent = $('display-name').value.length + '/32';
  $('name-dirty').hidden = !saved || !draft || draft === saved;
  if (!config.profile.photo) $('name-avatar').replaceChildren(avatar({ ...config.profile, name: draft || saved }, 'tile-avatar'));
}
function closeProfileMenus(except) {
  for (const button of $('name-picker').querySelectorAll('[aria-haspopup="menu"]')) {
    if (button === except) continue;
    button.setAttribute('aria-expanded', 'false'); $(button.getAttribute('aria-controls')).hidden = true;
  }
}
for (const button of $('name-picker').querySelectorAll('[aria-haspopup="menu"]')) {
  const menu = $(button.getAttribute('aria-controls'));
  button.onclick = () => {
    const open = menu.hidden; closeProfileMenus(button);
    menu.hidden = !open; button.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button:not([hidden])')?.focus();
  };
  menu.addEventListener('click', event => { if (event.target.closest('button')) { closeProfileMenus(); button.focus(); } });
}
$('name-picker').addEventListener('click', event => { if (!event.target.closest('.menu-anchor')) closeProfileMenus(); });
function renderDiscord() {
  const state = config.discord || {};
  $('link-discord').hidden = Boolean(state.linked); $('link-discord').disabled = discordPending || !state.configured;
  $('refresh-discord').hidden = $('unlink-discord').hidden = !state.linked;
  $('refresh-discord').disabled = $('unlink-discord').disabled = discordPending;
  $('cancel-discord').hidden = !discordPending;
  $('discord-status').textContent = discordPending ? 'Conclua a autorização no navegador e volte ao Concord.' : state.linked ? 'Vinculado como ' + state.name : 'Use seu perfil do Discord ou escolha nome e foto aqui.';
  for (const id of ['photo-button', 'remove-photo', 'banner-button', 'remove-banner', 'photo-menu-button', 'banner-menu-button', 'display-name', 'save-name']) $(id).disabled = discordPending;
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
  $('display-name').value = config.profile.name; $('name-error').textContent = ''; $('cancel-name').hidden = $('close-profile').hidden = !config.profile.name; closeProfileMenus(); renderProfile();
  $('name-picker').showModal(); $('display-name').focus();
  return new Promise(resolve => { $('name-picker').addEventListener('close', () => resolve(), { once: true }); });
}
$('name-picker').addEventListener('cancel', event => {
  const menu = $('name-picker').querySelector('.profile-menu:not([hidden])');
  if (menu || !config?.profile.name) event.preventDefault();
  if (menu) { closeProfileMenus(); $('name-picker').querySelector(`[aria-controls="${menu.id}"]`).focus(); }
});
$('cancel-name').onclick = $('close-profile').onclick = () => $('name-picker').close();
$('display-name').oninput = () => { $('name-error').textContent = ''; renderNameDraft(); };
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
$('profile-settings').onclick = () => void openSettings('voice');
for (const button of document.querySelectorAll('.theme-swatch')) { button.style.background = button.dataset.color; button.onclick = () => { applyTheme(button.dataset.color); savePreferences(); }; }
$('theme-custom').oninput = () => applyTheme($('theme-custom').value);
$('theme-custom').onchange = () => { applyTheme($('theme-custom').value); savePreferences(); };
$('link-discord').onclick = () => void discordAction(() => native.linkDiscord());
$('refresh-discord').onclick = () => void discordAction(() => native.refreshDiscord());
$('unlink-discord').onclick = () => void discordAction(() => native.unlinkDiscord());
$('cancel-discord').onclick = () => void native.cancelDiscord();
$('name-picker').addEventListener('close', () => { if (discordPending) void native.cancelDiscord(); });
function closeDiscordFriends() {
  ++friendsGeneration; friendPhotoObserver?.disconnect(); if (discordFriends.length) favFriends = discordFriends; discordFriends = []; friendsInvite = ''; friendInvites.clear();
  if ($('discord-friends').open) { $('discord-friends').close(); $('discord-friend-list').replaceChildren(); $('invite-menu-button').focus({ preventScroll: true }); }
}
// Favorites (starred by the user) come first; without favorites, the friends who recently got an invite.
function renderSlots() {
  const slots = members.slice(0, 8).map(member => { const face = avatar(member, 'slot-avatar'); face.title = member.name; return face; });
  while (slots.length < 8) { const empty = document.createElement('span'); empty.className = 'slot-empty'; slots.push(empty); }
  const label = document.createElement('small'); label.textContent = members.length + ' de 8 na sala';
  $('room-slots').replaceChildren(...slots, label);
}
function renderDiscordFriends() {
  const generation = friendsGeneration, query = $('discord-friend-search').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = discordFriends.filter(friend => (friend.name + ' ' + friend.username).toLocaleLowerCase('pt-BR').includes(query));
  const quickIds = query ? [] : discordFavorites.length ? discordFavorites : discordRecent;
  const quick = quickIds.map(id => filtered.find(friend => friend.id === id)).filter(Boolean);
  $('discord-friend-list').replaceChildren(); $('discord-quick-list').replaceChildren(); friendPhotoObserver?.disconnect();
  $('discord-quick').hidden = $('discord-all-title').hidden = !quick.length;
  $('discord-quick-title').textContent = discordFavorites.length ? 'Favoritos' : 'Enviados recentemente';
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
  });
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
        discordRecent = [friend.id, ...discordRecent.filter(id => id !== friend.id)].slice(0, 8); savePreferences();
        if (generation === friendsGeneration) friendInvites.set(friend.id, { phase: 'sent' });
        notice('Convite enviado.');
      } catch (error) { if (generation === friendsGeneration) friendInvites.set(friend.id, { error: error.message }); }
      if (generation === friendsGeneration) renderDiscordFriends();
    };
    const favorite = discordFavorites.includes(friend.id), star = document.createElement('button'); star.type = 'button'; star.className = 'friend-star';
    star.setAttribute('aria-pressed', String(favorite)); star.title = favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    star.setAttribute('aria-label', (favorite ? 'Remover dos favoritos: ' : 'Favoritar ') + friend.name); star.append(svgIcon('icon-star'));
    star.onclick = () => {
      discordFavorites = favorite ? discordFavorites.filter(id => id !== friend.id) : [...discordFavorites, friend.id].slice(-50);
      savePreferences(); renderDiscordFriends(); $('discord-friends').querySelector(`[data-friend="${friend.id}"] .friend-star`)?.focus();
    };
    row.append(icon, text, star, button); (quick.includes(friend) ? $('discord-quick-list') : $('discord-friend-list')).append(row);
    if (!friend.photo) friendPhotoObserver.observe(row);
  }
}
async function openDiscordFriends() {
  const code = $('invite-link').value; if (!code || socket?.readyState !== WebSocket.OPEN) return;
  const generation = ++friendsGeneration; friendsInvite = code; discordFriends = []; friendInvites.clear();
  $('discord-friend-list').replaceChildren(); $('discord-quick-list').replaceChildren(); $('discord-quick').hidden = $('discord-all-title').hidden = true;
  $('discord-friend-search').value = ''; $('discord-friend-search').disabled = true; renderSlots();
  $('discord-friends-authorize').hidden = $('discord-friends-retry').hidden = true;
  if (!$('discord-friends').open) $('discord-friends').showModal();
  const status = $('discord-friends-status'), loaded = () => { status.classList.remove('is-loading'); $('discord-friend-list').removeAttribute('aria-busy'); };
  if (!config.discord?.social) {
    loaded(); status.textContent = 'Autorize o acesso aos amigos no Discord para usar os convites.'; $('discord-friends-authorize').hidden = false; return;
  }
  status.textContent = 'Carregando amigos do Discord…'; status.classList.add('is-loading'); $('discord-friend-list').setAttribute('aria-busy', 'true');
  try {
    const result = await native.discordFriends(); if (generation !== friendsGeneration) return; loaded();
    if (result.error) { status.textContent = result.error; $('discord-friends-authorize').hidden = result.code !== 'RELINK'; $('discord-friends-retry').hidden = result.code === 'RELINK'; return; }
    discordFriends = result.value; $('discord-friend-search').disabled = false; renderDiscordFriends(); $('discord-friend-search').focus();
  } catch { if (generation === friendsGeneration) { loaded(); status.textContent = 'Não foi possível carregar os amigos do Discord.'; $('discord-friends-retry').hidden = false; } }
}
$('invite-discord-button').onclick = () => { closeInvitePop(); void openDiscordFriends(); };
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
// Per-person volume (voice and stream), the same value as the slider on their stream tile.
$('member-volume').oninput = () => {
  if (!viewedMember) return;
  volumes.set(viewedMember, Number($('member-volume').value)); applyAudio();
  const slider = tiles.get(viewedMember)?.top.querySelector('.tile-volume input'); if (slider) slider.value = $('member-volume').value;
};
$('member-profile-edit').onclick = () => { closeMemberProfile(); void chooseName(); };
$('member-profile').addEventListener('cancel', event => { event.preventDefault(); closeMemberProfile(); });
$('member-profile').addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
$('member-profile').addEventListener('pointerdown', event => { profilePointerOutside = event.target === $('member-profile') && outsideMemberProfile(event); });
$('member-profile').addEventListener('click', event => {
  if (profilePointerOutside && event.target === $('member-profile') && outsideMemberProfile(event)) closeMemberProfile();
});
$('member-profile').addEventListener('close', () => { if (!$('member-profile').open) closeMemberProfile(); });

$('home-tab').onclick = () => { stopAudioPreview(); showView('home'); };
$('create-room').onclick = () => { homeIntro.react('burst'); createRoom(); };
$('create-room').onpointerenter = () => homeIntro.react('hover'); $('create-room').onpointerleave = () => homeIntro.react('leave');
$('resume-room').onclick = $('host-tab').onclick = () => { if (target) showView('room'); };
$('join-room-nav').onclick = () => openJoin();
$('home-join-form').onsubmit = event => {
  event.preventDefault(); const value = $('home-join-input').value.trim();
  if (!value) { openJoin(); return; }
  try { parseInvite(value); homeIntro.react('pull'); } catch {}
  $('home-join-input').value = ''; joinFieldState(); openJoin(value); $('join-form').requestSubmit();
};
$('cancel-join').onclick = cancelJoin;
$('join-picker').addEventListener('cancel', event => { event.preventDefault(); cancelJoin(); });
$('choose-source').onclick = () => void loadShareSources(); $('choose-audio-source').onclick = () => void chooseAudioSource();
$('audio-mode').onchange = $('system-audio').onchange = () => { stopAudioPreview(); updateAudioControls(); savePreferences(); };
$('test-audio').onclick = testAudio; updateAudioControls();
$('quality').onchange = $('fps').onchange = $('bitrate-mode').onchange = () => { updateBitrateControls(); savePreferences(); }; updateBitrateControls();
$('bitrate-slider').oninput = () => { $('bitrate-value').value = $('bitrate-slider').value; updateBitrateControls(); savePreferences(); };
$('bitrate-value').oninput = () => { if ($('bitrate-value').validity.valid) { $('bitrate-slider').value = $('bitrate-value').value; updateBitrateControls(); savePreferences(); } };
$('bar-camera').onclick = () => { if (cameraStream) stopCamera(); else void startCamera(); };
$('bar-screen').onclick = () => { if (!$('share-dialog').open) { $('share-dialog').showModal(); if (!stream) void loadShareSources(); } };
$('close-share').onclick = () => $('share-dialog').close();
$('bar-mic').onclick = () => { if (voiceTrack) setVoiceMuted(!voiceMuted && !muted); else { voiceMuted = false; savePreferences(); void startVoice(); } };
for (const kind of Object.keys(deviceKinds)) $(kind + '-menu-button').onclick = () => void openDeviceMenu(kind);
$('device-menu').addEventListener('keydown', event => {
  const items = [...$('device-menu').querySelectorAll('.device-option')], index = items.indexOf(document.activeElement);
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDeviceMenu()?.focus(); }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
  else if (event.key === 'Tab') closeDeviceMenu();
});
document.addEventListener('pointerdown', event => { if (deviceMenuFor && !event.target.closest('#device-menu, .device-caret')) closeDeviceMenu(); });
$('settings-button').onclick = () => void openSettings('voice');
$('close-settings').onclick = () => $('settings-dialog').close();
$('settings-dialog').addEventListener('close', () => { stopMicTest(); renderHome(); });
for (const tab of $('settings-dialog').querySelectorAll('.settings-tab')) tab.onclick = () => settingsTab(tab.id.replace('settings-tab-', ''));
$('settings-dialog').querySelector('.settings-nav').addEventListener('keydown', event => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const tabs = [...$('settings-dialog').querySelectorAll('.settings-tab')], next = tabs[(tabs.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length];
  event.preventDefault(); next.focus(); next.click();
});
for (const select of $('settings-dialog').querySelectorAll('select[data-kind]')) select.onchange = async () => { await chooseDevice(select.dataset.kind, select.value); if (select.dataset.kind === 'mic' && micTest) void startMicTest(); };
for (const select of $('settings-dialog').querySelectorAll('select[data-mirror]')) select.onchange = () => { const source = $(select.dataset.mirror); source.value = select.value; source.dispatchEvent(new Event('change')); };
$('mic-test').onclick = () => { if (micTest || $('mic-test').getAttribute('aria-pressed') === 'true') stopMicTest(); else void startMicTest(); };
$('settings-check-updates').onclick = () => $('check-updates').click();
$('connection-panel').addEventListener('mouseenter', showConnectionPop); $('connection-panel').addEventListener('mouseleave', hideConnectionPop);
$('connection-panel').addEventListener('focus', showConnectionPop); $('connection-panel').addEventListener('blur', hideConnectionPop);
addEventListener('resize', () => { if (deviceMenuFor) closeDeviceMenu(); });
$('chat-toggle').onclick = $('chat-button').onclick = () => setSide(!sideHidden);
$('chat-toast').onclick = () => setSide(false);
// Collapsed sidebar keeps only the logo, icons and avatars.
$('sidebar-toggle').onclick = () => {
  const collapsed = document.body.classList.toggle('sidebar-collapsed'), label = collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
  $('sidebar-toggle').setAttribute('aria-expanded', String(!collapsed)); $('sidebar-toggle').setAttribute('aria-label', 'Concord: ' + label.toLowerCase()); $('sidebar-toggle').title = label;
  // The video grid re-measures once the width animation settles.
  setTimeout(renderTiles, 320);
};
$('close-picker').onclick = () => $('source-picker').close(); $('start-button').onclick = startSharing; $('stop-button').onclick = () => { stopSharing(); notice(''); if ($('share-dialog').open) $('share-dialog').close(); };
$('invite-button').onclick = reopenAccess; $('close-invite').onclick = () => { closeInvitePop(); void closeInvite(); }; $('cancel-invite').onclick = cancelFallback;
async function copyInvite(button, icon = true) {
  try {
    await native.copyLink($('invite-link').value);
    button.classList.add('copied'); button.replaceChildren(...(icon ? [svgIcon('icon-check', 'button-icon')] : []), 'Link copiado');
    clearTimeout(button.copiedTimer); button.copiedTimer = setTimeout(() => { button.classList.remove('copied'); button.replaceChildren(...(icon ? [svgIcon('icon-user-plus', 'button-icon')] : []), 'Copiar link'); }, 2000);
  }
  catch { notice('Não consegui copiar o link. Tente novamente.', true); }
}
$('copy-link-button').onclick = () => void copyInvite($('copy-link-button'));
$('renew-button').onclick = async () => {
  closeInvitePop();
  try { const data = await native.renewInvite(); accessClosed = false; await startHosting(data); notice('Link trocado. O anterior não funciona mais.'); }
  catch (error) { notice(error.message, true); }
};
$('join-form').onsubmit = event => {
  event.preventDefault(); if (joining) return;
  try {
    const value = $('join-input').value.trim(), parsed = parseInvite(value);
    stopSharing(); stopCamera(); currentInvite = value; knownInvites.add(parsed.token); hideClip(); joining = true; connect(parsed.address, parsed.token, 'viewer', Boolean(parsed.p2p));
    $('join-error').textContent = ''; $('join-button').disabled = true; $('join-input').disabled = true; $('join-button').textContent = 'Entrando…';
    // P2P may need the Cloudflare fallback, which can take up to 150 s to publish.
    joinTimer = setTimeout(() => joinFailure('Não consegui entrar. Confira o convite e tente novamente.'), parsed.p2p ? 210000 : 15000);
  } catch (error) { $('join-error').textContent = error.message; }
};
$('leave-button').onclick = () => { stopSharing(); stopCamera(); disconnect(); target = null; role = null; status('Não conectado'); showView('home'); notice('Você saiu da sala.'); };
$('grid-button').onclick = () => { focus = null; renderTiles(); };
$('sound-button').onclick = () => { muted = !muted; applyAudio(); applyVoice(); publishState(); for (const item of tiles.values()) media?.play(item.video); for (const audio of voices.values()) media?.play(audio); };
// Percentage bubble over the thumb while hovering or dragging the dock volume.
function volumeTip() {
  const input = $('volume'), value = Number(input.value), percent = Math.round(value * 100) + '%';
  $('volume-tip').textContent = percent; input.setAttribute('aria-valuetext', percent);
  $('volume-tip').style.left = (8 + value * (input.offsetWidth - 16)) + 'px';
}
$('volume').oninput = () => { volumeTip(); applyAudio(); };
$('volume').parentElement.addEventListener('pointerenter', volumeTip); $('volume').addEventListener('focus', volumeTip);
$('volume').addEventListener('pointerdown', () => { volumeTip(); $('volume').parentElement.classList.add('adjusting'); });
addEventListener('pointerup', () => $('volume').parentElement.classList.remove('adjusting'));
addEventListener('pointercancel', () => $('volume').parentElement.classList.remove('adjusting'));
$('fullscreen-button').onclick = () => { const action = document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen(); action.catch(error => notice(error.message, true)); };
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.body.dataset.view !== 'room' || document.querySelector('dialog[open]')) return;
  if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
  const key = event.key.toLowerCase();
  if (key === 'm') { event.preventDefault(); $('sound-button').click(); }
  else if (key === 'f') { event.preventDefault(); $('fullscreen-button').click(); }
  else if (key === 'c' && !$('viewer-controls').hidden) { event.preventDefault(); $('chat-button').click(); }
  else if (key === 'escape' && focus) { event.preventDefault(); $('grid-button').click(); }
});
// Files dropped outside the chat are ignored instead of making Chromium open them.
for (const type of ['dragover', 'drop']) document.addEventListener(type, event => { if ([...(event.dataTransfer?.types || [])].includes('Files')) event.preventDefault(); });
new ResizeObserver(renderTiles).observe($('stage')); setInterval(watchLevels, 200); setInterval(() => void updateTileStats(), 1000);
setInterval(() => { if (liveSince) { const elapsed = Math.floor((Date.now()-liveSince)/1000); $('stream-clock').textContent = String(Math.floor(elapsed/3600)).padStart(2,'0') + ':' + String(Math.floor(elapsed/60)%60).padStart(2,'0') + ':' + String(elapsed%60).padStart(2,'0'); } }, 1000);
setInterval(() => { if (inviteRetryAt && Date.now() >= inviteRetryAt) { inviteRetryAt = 0; if (!invitePending) inviteStatus(''); } }, 1000);
window.addEventListener('beforeunload', () => { terminal = true; clearTimeout(reconnectTimer); stopSharing(); stopCamera(); stopVoice(); media?.close(); socket?.close(); stopHosting(); });
try {
  if (!native) throw new Error('Abra o executável do Concord.');
  config = await native.bootstrap(); $('app-version').textContent = 'Concord ' + config.version; renderProfile(); applyPreferences(config.preferences);
  native.onInvite(value => receiveInvite(value));
  native.onUpdate(renderUpdate); renderUpdate(await native.updatesReady());
  const session = await native.session(); if (session.public) showInvite(session);
  if (!config.profile.name) await chooseName();
  uiReady = true; status('Esperando sala'); showView('home'); $('settings-version').textContent = 'Concord ' + config.version;
  for (const id of ['create-room', 'join-room', 'join-room-nav']) $(id).disabled = false;
  const launchInvite = await native.invitesReady(), day = new Date(), introKey = config.version + '@' + [day.getFullYear(), day.getMonth() + 1, day.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  // Full intro on the first launch of the day and after an update, a short one otherwise; an invite skips it.
  homeIntro.play(queuedInvite || launchInvite ? 'none' : introSeen === introKey ? 'short' : 'full');
  if (introSeen !== introKey) { introSeen = introKey; savePreferences(); }
  if (queuedInvite || launchInvite) receiveInvite(queuedInvite || launchInvite);
  if (config.preferencesWarning) notice('Não consegui ler suas preferências. Usei as opções padrão.', true);
} catch (error) { homeIntro.skip(); notice(error.message, true); status('Não consegui abrir'); }
// Clicking the backdrop closes any modal, through the same cancel path as Esc (so dialogs that must stay open can veto it).
for (const dialog of document.querySelectorAll('dialog:not(#member-profile)')) {
  let downOutside = false;
  const outside = event => { const box = dialog.getBoundingClientRect(); return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom); };
  dialog.addEventListener('pointerdown', event => { downOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (!downOutside || !outside(event)) return;
    downOutside = false;
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  });
}
