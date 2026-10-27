import { qualityPreset, videoBitrate, formatMbps } from './stream-settings.js';
import { parseInvite } from './invites.js';
import { RoomMedia } from './room-media.js';
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
let stream, display, microphone, audioContext, selectedSource, starting = false, liveSince = 0;
let selectedAudioSource, appAudioContext, appAudioNode, unsubscribeAppAudio, unsubscribeAppAudioError;
let invite, inviteGeneration = 0, invitePending = false, inviteRetryAt = 0;
let ownInviteMessage = '', currentInvite = '', joining = false, joinTimer, uiReady = false, queuedInvite;
let audioPreviewTrack, testingAudio = false, audioGeneration = 0, captureGeneration = 0;
const meter = new AudioMeter($('audio-level'), $('audio-level-label'));
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = !text; }
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
  const guest = role === 'viewer', code = guest ? currentInvite : invite?.guestInvite;
  $('own-invite-controls').hidden = guest;
  $('invite-result').hidden = !code; $('invite-link').value = code || '';
  $('invite-status').textContent = guest ? '' : ownInviteMessage;
  $('invite-status').hidden = guest || !ownInviteMessage;
  $('invite-button').hidden = invitePending || Boolean(code);
  const wait = Math.max(0, Math.ceil((inviteRetryAt - Date.now()) / 1000));
  $('invite-button').disabled = invitePending || wait > 0;
  if (inviteRetryAt) $('invite-button').textContent = wait ? 'Tentar novamente em ' + Math.floor(wait / 60) + ':' + String(wait % 60).padStart(2, '0') : 'Tentar novamente';
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
  if (role !== 'host' || !target) { stopSharing(); connect(config.address, config.hostToken, 'host'); }
  showView('room');
}
function openJoin(value) {
  if (!uiReady) { if (value) queuedInvite = value; return; }
  if (joining) cancelJoin();
  $('join-error').textContent = ''; if (value !== undefined) $('join-input').value = value;
  $('join-hint').textContent = stream ? 'Confirme para trocar de sala e encerrar sua transmissão atual.' : 'Cole o convite e confirme para entrar.';
  if (!$('join-picker').open) $('join-picker').showModal();
  if (value !== undefined) { try { parseInvite(value); } catch (error) { $('join-error').textContent = error.message; } }
  $('join-input').focus();
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
    bitrateMbps: Number($('bitrate-value').value), audioMode: $('audio-mode').value, audioEnabled: $('system-audio').checked };
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
function sendBytes(blob) {
  if (socket?.readyState !== WebSocket.OPEN) return true;
  if (socket.bufferedAmount + blob.size > 32 * 1024 * 1024) return false;
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
    const element = document.createElement('button'); element.type = 'button'; element.className = 'stream-tile'; element.dataset.member = member.id;
    const player = own ? video : document.createElement('video'); player.autoplay = true; player.playsInline = true; player.className = 'call-video'; player.dataset.publisher = member.id;
    const placeholder = document.createElement('div'); placeholder.className = 'tile-placeholder';
    const label = document.createElement('span'); label.className = 'tile-label';
    element.append(placeholder, player, label); element.onclick = () => { focus = focus === member.id ? null : member.id; renderTiles(); };
    player.addEventListener('playing', () => { if (player.videoWidth) element.classList.add('playing'); renderTiles(); });
    player.addEventListener('emptied', () => element.classList.remove('playing'));
    player.addEventListener('canplay', () => media?.play(player));
    player.addEventListener('error', () => { if (media?.receivers.has(member.id)) media.recover(member.id); });
    item = { element, video: player, placeholder, label, own, member }; tiles.set(member.id, item); $('streams-grid').append(element);
  }
  item.member = member; item.placeholder.replaceChildren(avatar(member, 'tile-avatar'));
  item.label.textContent = member.name + (own ? ' · você' : '');
  applyAudio(); return item.video;
}
function localTile() { if (stream && self) tile({ id: self, ...config.profile, stream: { active: true } }, true); }
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
  for (const id of ['choose-source', 'choose-audio-source', 'audio-mode', 'quality', 'fps', 'bitrate-mode', 'bitrate-value', 'bitrate-slider', 'system-audio', 'microphone']) $(id).disabled = locked;
  $('test-audio').hidden = Boolean(stream) || starting || $('audio-mode').value !== 'application';
  $('start-button').hidden = Boolean(stream); $('stop-button').hidden = !stream;
  $('start-button').disabled = locked || !selectedSource || socket?.readyState !== WebSocket.OPEN;
}
function bitrate() { return videoBitrate(qualityKey(), $('bitrate-mode').value === 'manual' ? $('bitrate-value').value : null); }
function qualityLabel() { return $('quality').selectedOptions[0].textContent + ' · ' + $('fps').value + ' FPS · ' + formatMbps(bitrate()) + ' Mbps'; }
function updateBitrateControls() {
  const manual = $('bitrate-mode').value === 'manual'; $('manual-bitrate').hidden = !manual;
  const recommended = formatMbps(videoBitrate(qualityKey()));
  $('bitrate-mode').options[0].textContent = 'Automática · ' + recommended + ' Mbps';
  $('bitrate-hint').textContent = manual ? 'Referência: ' + recommended + ' Mbps. Ajuste antes de transmitir.' : 'Mais bitrate preserva detalhes e usa mais upload.';
}
function publishState() { send({ type: 'stream-state', active: Boolean(stream), label: selectedSource?.name || '', quality: stream ? qualityLabel() : '', relay: false }); }
function disconnect() {
  closeDiscordFriends();
  terminal = true; clearTimeout(reconnectTimer); clearTimeout(joinTimer); const previous = socket; socket = undefined; previous?.close();
  media?.close(); media = null; self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers();
}
function connect(address, token, connectionRole) {
  disconnect(); role = connectionRole; terminal = false; retries = 0; target = { address, token, role: connectionRole }; openSocket();
}
function openSocket() {
  if (terminal || !target) return;
  const ws = new WebSocket(target.address.replace(/^http/, 'ws') + '/socket'); socket = ws; ws.binaryType = 'arraybuffer'; status('Conectando');
  media = new RoomMedia({ send, sendBytes, options: () => ({ relay: false, bitrate: bitrate(), fps: qualityPreset(qualityKey()).fps }),
    player: member => tile(member), remove: removeTile, update: renderTiles,
    compatibility: updateRoomMessage,
    error: text => notice(text, true), fatal: text => { stopSharing(); notice(text, true); } });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: target.token, role: target.role, profile: config.profile }));
  ws.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== ws) return;
      if (typeof event.data !== 'string') { media.binary(event.data); return; }
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome' || msg.type === 'room') {
        if (msg.type === 'welcome') {
          self = msg.self; retries = 0; notice(''); status('Sala conectada', true); $('viewer-controls').hidden = false;
          if (joining) { clearTimeout(joinTimer); joining = false; $('join-button').disabled = false; $('join-input').disabled = false; $('join-button').textContent = 'Entrar na sala'; $('join-picker').close(); showView('room'); }
          renderInvite(); lockSettings(Boolean(stream)); publishState(); await media.setStream(stream);
        }
        members = msg.members; await media.roster(self, members); renderMembers();
      } else if (msg.type === 'tunnel-closed') { invite = null; inviteStatus('O acesso encerrou. Tente novamente para gerar outro código.'); }
      else await media.message(msg);
    }).catch(error => notice('A conexão encontrou um problema: ' + error.message, true));
  };
  ws.onerror = () => {};
  ws.onclose = event => {
    if (socket !== ws) return;
    socket = undefined; media?.close(); self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers(); lockSettings(Boolean(stream));
    if (terminal) return;
    if (joining && [4001,4002,4003].includes(event.code)) { joinFailure(event.reason || 'Convite inválido. Confira o código.'); return; }
    if ([4001,4002,4003].includes(event.code)) { terminal = true; stopSharing(); status('Não conectado'); notice(event.reason || 'Convite inválido.', true); return; }
    status('Reconectando'); retries++; reconnectTimer = setTimeout(openSocket, Math.min(1000 * 2 ** Math.min(retries-1,4),15000));
  };
}
function updateAudioControls() {
  const appOnly = $('audio-mode').value === 'application';
  $('audio-settings').hidden = !$('system-audio').checked;
  $('audio-meter-panel').hidden = !$('system-audio').checked;
  $('test-audio').hidden = !appOnly || Boolean(stream) || starting;
  $('test-audio').disabled = !selectedAudioSource;
  $('test-audio').textContent = audioPreviewTrack || testingAudio ? 'Parar teste de áudio' : 'Testar áudio do app';
  $('choose-audio-source').hidden = !appOnly;
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
  if (stream || starting || $('audio-mode').value !== 'application' || !$('system-audio').checked || !selectedAudioSource) return;
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
  const appOnly = $('system-audio').checked && $('audio-mode').value === 'application';
  if (appOnly && !selectedAudioSource) { notice('Escolha o jogo/app em Fonte do áudio. Você pode compartilhar um monitor inteiro e ouvir só esse app.', true); return; }
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
      const destination = audioContext.createMediaStreamDestination();
      for (const audioTrack of audio) audioContext.createMediaStreamSource(new MediaStream([audioTrack])).connect(destination);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (audio.length) stream.addTrack(audio[0]);
    track.onended = () => stopSharing();
    video.srcObject = display; video.muted = true; video.play().catch(() => {});
    showVideo(true); setLive(true); $('stream-quality').textContent = qualityLabel();
    publishState(); await media.setStream(stream); localTile(); renderTiles();
  } catch (error) {
    if (generation === captureGeneration) { stopSharing(); notice(error.name === 'NotAllowedError' ? 'A captura não foi autorizada. Escolha a tela e tente novamente.' : `Não consegui iniciar a captura: ${error.message}`, true); }
  } finally { starting = false; lockSettings(Boolean(stream)); }
}
function stopSharing() {
  ++captureGeneration; stopAudioPreview(); meter.stop();
  void media?.setStream(null);
  for (const item of [stream, display, microphone]) for (const track of item?.getTracks() || []) { track.onended = null; track.stop(); }
  audioContext?.close().catch(() => {}); stream = display = microphone = audioContext = undefined;
  stopAppAudioResources();
  video.srcObject = null; setLive(false);
  publishState(); removeTile(self); lockSettings(false); renderTiles();
}
function showInvite(data) {
  invite = data;
  inviteStatus('');
}
async function makeInvite() {
  if (invitePending || Date.now() < inviteRetryAt) return;
  const generation = ++inviteGeneration; invitePending = true;
  $('invite-button').disabled = true;
  inviteStatus('Código sendo carregado…');
  try {
    const data = await native.tunnel(); if (generation !== inviteGeneration) return;
    inviteRetryAt = 0; showInvite(data);
  } catch (error) {
    const state = await native.session().catch(() => null);
    if (generation === inviteGeneration) {
      inviteRetryAt = state?.inviteError?.retryAt || 0;
      inviteStatus(state?.inviteError?.message || 'Não consegui conectar ao serviço de convites. Tente novamente em instantes.');
    }
  } finally {
    if (generation === inviteGeneration) {
      invitePending = false;
      $('invite-button').disabled = false; $('invite-button').textContent = 'Tentar novamente'; renderInvite();
    }
  }
}
async function closeInvite() {
  ++inviteGeneration; invitePending = false;
  $('cancel-invite').hidden = true; $('invite-button').disabled = false;
  $('invite-button').textContent = 'Tentar novamente';
  try {
    await native.closeTunnel(); await native.renewInvite();
    invite = undefined;
    inviteStatus('Acesso fechado. Prepare outro convite quando quiser.');
  } catch (error) { notice(error.message, true); }
}
function renderProfile() {
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
$('close-picker').onclick = () => $('source-picker').close(); $('start-button').onclick = startSharing; $('stop-button').onclick = () => { stopSharing(); notice(''); };
$('invite-button').onclick = makeInvite; $('close-invite').onclick = closeInvite; $('cancel-invite').onclick = closeInvite;
$('copy-link-button').onclick = async () => {
  try { await native.copyLink($('invite-link').value); notice('Link copiado.'); }
  catch { notice('Não consegui copiar o link. Tente novamente.', true); }
};
$('renew-button').onclick = async () => { try { showInvite(await native.renewInvite()); notice('Convite trocado. O anterior não funciona mais.'); } catch (error) { notice(error.message, true); } };
$('join-form').onsubmit = event => {
  event.preventDefault(); if (joining) return;
  try {
    const value = $('join-input').value.trim(), parsed = parseInvite(value);
    stopSharing(); currentInvite = value; joining = true; connect(parsed.address, parsed.token, 'viewer');
    $('join-error').textContent = ''; $('join-button').disabled = true; $('join-input').disabled = true; $('join-button').textContent = 'Entrando…';
    joinTimer = setTimeout(() => joinFailure('Não consegui entrar. Confira o convite e tente novamente.'), 15000);
  } catch (error) { $('join-error').textContent = error.message; }
};
$('leave-button').onclick = () => { stopSharing(); disconnect(); target = null; role = null; status('Não conectado'); showView('home'); notice('Você saiu da sala.'); };
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
setInterval(() => { if (inviteRetryAt) { renderInvite(); if (Date.now() >= inviteRetryAt) inviteRetryAt = 0; } }, 1000);
window.addEventListener('beforeunload', () => { terminal = true; clearTimeout(reconnectTimer); stopSharing(); media?.close(); socket?.close(); });
try {
  if (!native) throw new Error('Abra o executável do Concord.');
  config = await native.bootstrap(); $('app-version').textContent = 'Concord ' + config.version; renderProfile(); applyPreferences(config.preferences);
  native.onInvite(value => openJoin(value));
  native.onUpdate(renderUpdate); renderUpdate(await native.updatesReady());
  const session = await native.session(); if (session.public) showInvite(session); else void makeInvite();
  if (!config.profile.name) await chooseName();
  uiReady = true; status('Esperando sala'); showView('home');
  for (const id of ['create-room', 'join-room', 'join-room-nav']) $(id).disabled = false;
  const launchInvite = await native.invitesReady();
  if (queuedInvite || launchInvite) openJoin(queuedInvite || launchInvite);
  if (config.preferencesWarning) notice('Não consegui ler suas preferências. Usei as opções padrão.', true);
} catch (error) { notice(error.message, true); status('Não consegui abrir'); }
