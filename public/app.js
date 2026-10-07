import { qualityPreset, videoBitrate, formatMbps } from './stream-settings.js';
import { parseInvite } from './invites.js';
import { RoomMedia } from './room-media.js';
const $ = id => document.getElementById(id);
const native = window.concord, video = $('screen-video');
let config, role = 'host', socket, target, reconnectTimer, terminal = false, retries = 0, processing = Promise.resolve();
let media, self = '', members = [], focus = null, muted = false;
const tiles = new Map();
let stream, display, microphone, audioContext, selectedSource, starting = false, liveSince = 0;
let selectedAudioSource, appAudioContext, appAudioNode, unsubscribeAppAudio, unsubscribeAppAudioError;
let invite, inviteGeneration = 0, invitePending = false;
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); $('notice').hidden = !text; }
function status(text, online = false) { document.body.dataset.connected = String(online); document.body.dataset.connectionState = text; }
function inviteStatus(text) { $('invite-status').textContent = text; $('invite-status').hidden = !text; }
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
  const element = document.createElement(profile.photo ? 'img' : 'span'); element.className = 'avatar ' + className;
  if (profile.photo) { element.src = profile.photo; element.alt = ''; }
  else element.textContent = (profile.name || 'A').slice(0, 2).toUpperCase();
  return element;
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
  $('transport-label').textContent = routes.has('relay') ? 'Compatibilidade · por túnel' : routes.has('direct') ? 'Conexão direta · baixa latência' : 'Aguardando transmissão';
  $('stream-quality').textContent = count ? count + (count === 1 ? ' tela' : ' telas') : 'Nenhuma transmissão ativa';
  applyAudio();
}
function renderMembers() {
  const others = members.filter(member => member.id !== self);
  $('friend-label').textContent = others.length ? others.length + (others.length === 1 ? ' pessoa na sala' : ' pessoas na sala') : 'Aguardando seus amigos';
  $('friend-dot').classList.toggle('green', others.length > 0); $('audience-list').replaceChildren();
  for (const member of others) {
    const row = document.createElement('div'); row.className = 'audience-person'; row.dataset.member = member.id;
    const text = document.createElement('span'); text.textContent = member.name;
    const state = document.createElement('small'); state.textContent = member.stream.active ? 'Compartilhando' : 'Assistindo';
    row.append(avatar(member), text, state); $('audience-list').append(row);
    const item = tiles.get(member.id); if (item) tile(member);
  }
  localTile(); renderTiles();
}
function setLive(active) {
  $('live-dot').classList.toggle('red', active); document.title = active ? 'Concord · AO VIVO' : 'Concord'; liveSince = active ? Date.now() : 0;
  $('stream-clock').hidden = !active; $('stream-clock').textContent = active ? '00:00:00' : '';
}
function showVideo() { renderTiles(); }
function lockSettings(locked) {
  for (const id of ['choose-source', 'choose-audio-source', 'audio-mode', 'quality', 'connection-mode', 'bitrate-mode', 'bitrate-value', 'bitrate-slider', 'system-audio', 'microphone']) $(id).disabled = locked;
  $('start-button').hidden = Boolean(stream); $('stop-button').hidden = !stream;
  $('start-button').disabled = locked || !selectedSource || socket?.readyState !== WebSocket.OPEN;
}
function bitrate() { return videoBitrate($('quality').value, $('bitrate-mode').value === 'manual' ? $('bitrate-value').value : null); }
function qualityLabel() { return $('quality').selectedOptions[0].textContent + ' · ' + formatMbps(bitrate()) + ' Mbps'; }
function updateBitrateControls() {
  const manual = $('bitrate-mode').value === 'manual'; $('manual-bitrate').hidden = !manual;
  const recommended = formatMbps(videoBitrate($('quality').value));
  $('bitrate-mode').options[0].textContent = 'Automática · ' + recommended + ' Mbps';
  $('bitrate-hint').textContent = manual ? 'Referência: ' + recommended + ' Mbps. Ajuste antes de transmitir.' : 'Mais bitrate preserva detalhes e usa mais upload.';
}
function publishState() { send({ type: 'stream-state', active: Boolean(stream), label: selectedSource?.name || '', quality: stream ? qualityLabel() : '', relay: $('connection-mode').value === 'relay' }); }
function disconnect() {
  terminal = true; clearTimeout(reconnectTimer); const previous = socket; socket = undefined; previous?.close();
  media?.close(); media = null; self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers();
}
function connect(address, token, connectionRole) {
  disconnect(); role = connectionRole; terminal = false; retries = 0; target = { address, token, role: connectionRole }; openSocket();
}
function openSocket() {
  if (terminal || !target) return;
  const ws = new WebSocket(target.address.replace(/^http/, 'ws') + '/socket'); socket = ws; ws.binaryType = 'arraybuffer'; status('Conectando');
  media = new RoomMedia({ send, sendBytes, options: () => ({ relay: $('connection-mode').value === 'relay', bitrate: bitrate(), fps: qualityPreset($('quality').value).fps }),
    player: member => tile(member), remove: removeTile, update: renderTiles, error: text => notice(text, true), fatal: text => { stopSharing(); notice(text, true); } });
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: target.token, role: target.role, profile: config.profile }));
  ws.onmessage = event => {
    processing = processing.then(async () => {
      if (socket !== ws) return;
      if (typeof event.data !== 'string') { media.binary(event.data); return; }
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome' || msg.type === 'room') {
        if (msg.type === 'welcome') {
          self = msg.self; retries = 0; notice(''); status('Sala conectada', true); $('viewer-controls').hidden = false;
          $('own-invite-controls').hidden = role !== 'host'; lockSettings(Boolean(stream)); publishState(); await media.setStream(stream);
        }
        members = msg.members; await media.roster(self, members); renderMembers();
      } else if (msg.type === 'tunnel-closed') { invite = null; $('invite-result').hidden = true; $('invite-button').hidden = false; inviteStatus('O acesso encerrou. Prepare outro convite.'); }
      else await media.message(msg);
    }).catch(error => notice('A conexão encontrou um problema: ' + error.message, true));
  };
  ws.onerror = () => {};
  ws.onclose = event => {
    if (socket !== ws) return;
    socket = undefined; media?.close(); self = ''; for (const id of [...tiles.keys()]) removeTile(id); members = []; renderMembers(); lockSettings(Boolean(stream));
    if (terminal) return;
    if ([4001,4002,4003].includes(event.code)) { terminal = true; stopSharing(); status('Não conectado'); notice(event.reason || 'Convite inválido.', true); return; }
    status('Reconectando'); retries++; reconnectTimer = setTimeout(openSocket, Math.min(1000 * 2 ** Math.min(retries-1,4),15000));
  };
}
async function switchRole(next) {
  if (stream) stopSharing(); disconnect(); role = next; notice('');
  $('host-tab').classList.toggle('selected', next === 'host'); $('own-invite-controls').hidden = next !== 'host'; $('viewer-controls').hidden = true;
  if (next === 'host') connect(config.address, config.hostToken, 'host'); else status('Esperando convite');
}
function updateAudioControls() {
  const appOnly = $('audio-mode').value === 'application';
  $('audio-settings').hidden = !$('system-audio').checked;
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
  appAudioContext = new AudioContext({ sampleRate: 48000 });
  await appAudioContext.audioWorklet.addModule('/app-audio-worklet.js');
  appAudioNode = new AudioWorkletNode(appAudioContext, 'concord-app-audio', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  const destination = appAudioContext.createMediaStreamDestination(); appAudioNode.connect(destination);
  unsubscribeAppAudio = native.onAppAudio(bytes => appAudioNode?.port.postMessage(new Uint8Array(bytes)));
  unsubscribeAppAudioError = native.onAppAudioError(message => { stopSharing(); notice(`Áudio do app interrompido: ${message}`, true); });
  await native.startAppAudio(selectedAudioSource.id); await appAudioContext.resume();
  return destination.stream.getAudioTracks()[0];
}
async function startSharing() {
  if (starting || stream || !selectedSource) return;
  if ($('bitrate-mode').value === 'manual' && !$('bitrate-value').reportValidity()) return;
  const appOnly = $('system-audio').checked && $('audio-mode').value === 'application';
  if (appOnly && !selectedAudioSource) { notice('Escolha o jogo/app em Fonte do áudio. Você pode compartilhar um monitor inteiro e ouvir só esse app.', true); return; }
  starting = true; lockSettings(true); notice('');
  try {
    await native.selectSource(selectedSource.id);
    const { width, height, fps } = qualityPreset($('quality').value);
    display = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } }, audio: $('system-audio').checked && !appOnly });
    const track = display.getVideoTracks()[0];
    await track.applyConstraints({ width: { max: width }, height: { max: height }, frameRate: { max: fps } });
    track.contentHint = fps === 60 ? 'motion' : 'detail';
    const audio = display.getAudioTracks();
    if (appOnly) audio.push(await captureAppAudio());
    if ($('microphone').checked) {
      try {
        microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        audio.push(...microphone.getAudioTracks());
      } catch { notice('O microfone não ficou disponível. Sua tela será compartilhada com o áudio do computador.'); }
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
    stopSharing(); notice(error.name === 'NotAllowedError' ? 'A captura não foi autorizada. Escolha a tela e tente novamente.' : `Não consegui iniciar a captura: ${error.message}`, true);
  } finally { starting = false; lockSettings(Boolean(stream)); }
}
function stopSharing() {
  void media?.setStream(null);
  for (const item of [stream, display, microphone]) for (const track of item?.getTracks() || []) { track.onended = null; track.stop(); }
  audioContext?.close().catch(() => {}); stream = display = microphone = audioContext = undefined;
  unsubscribeAppAudio?.(); unsubscribeAppAudioError?.(); unsubscribeAppAudio = unsubscribeAppAudioError = undefined;
  appAudioNode?.disconnect(); appAudioNode = undefined;
  appAudioContext?.close().catch(() => {}); appAudioContext = undefined; native?.stopAppAudio().catch(() => {});
  video.srcObject = null; setLive(false);
  publishState(); removeTile(self); lockSettings(false); renderTiles();
}
function showInvite(data) {
  invite = data; $('invite-link').value = data.guestInvite; $('invite-result').hidden = false; $('invite-button').hidden = true;
  inviteStatus('');
}
async function makeInvite() {
  if (invitePending) return;
  const generation = ++inviteGeneration; invitePending = true;
  $('invite-button').disabled = true; $('invite-button').textContent = 'Preparando convite…';
  inviteStatus('Preparando em segundo plano. Você já pode escolher a tela e a qualidade.');
  $('cancel-invite').hidden = false;
  try {
    const data = await native.tunnel(); if (generation !== inviteGeneration) return;
    showInvite(data);
  } catch (error) {
    if (generation === inviteGeneration) inviteStatus(`Não consegui preparar: ${error.message} Clique em tentar novamente.`);
  } finally {
    if (generation === inviteGeneration) {
      invitePending = false; $('cancel-invite').hidden = true;
      $('invite-button').disabled = false; $('invite-button').textContent = 'Preparar convite ↗';
    }
  }
}
async function closeInvite() {
  ++inviteGeneration; invitePending = false;
  $('cancel-invite').hidden = true; $('invite-button').disabled = false;
  $('invite-button').textContent = 'Preparar convite ↗';
  try {
    await native.closeTunnel(); await native.renewInvite();
    invite = undefined; $('invite-result').hidden = true; $('invite-button').hidden = false;
    inviteStatus('Acesso fechado. Prepare outro convite quando quiser.');
  } catch (error) { notice(error.message, true); }
}
function renderProfile() {
  $('profile-name').textContent = config.profile.name || 'Escolha seu nome';
  $('profile-avatar').replaceChildren(avatar(config.profile)); $('name-avatar').replaceChildren(avatar(config.profile, 'tile-avatar'));
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
$('profile-button').onclick = () => void chooseName();

$('host-tab').onclick = () => switchRole('host');
$('choose-source').onclick = () => chooseSource(); $('choose-audio-source').onclick = () => chooseSource(true);
$('audio-mode').onchange = updateAudioControls; $('system-audio').onchange = updateAudioControls; updateAudioControls();
$('quality').onchange = updateBitrateControls; $('bitrate-mode').onchange = updateBitrateControls; updateBitrateControls();
$('bitrate-slider').oninput = () => { $('bitrate-value').value = $('bitrate-slider').value; };
$('bitrate-value').oninput = () => { if ($('bitrate-value').validity.valid) $('bitrate-slider').value = $('bitrate-value').value; };
$('close-picker').onclick = () => $('source-picker').close(); $('start-button').onclick = startSharing; $('stop-button').onclick = () => { stopSharing(); notice('Sua transmissão encerrou. A sala continua aberta.'); };
$('invite-button').onclick = makeInvite; $('close-invite').onclick = closeInvite; $('cancel-invite').onclick = closeInvite;
$('copy-button').onclick = async () => { try { await native.copyInvite(); notice('Convite copiado. Mande pra galera.'); } catch { $('invite-link').select(); notice('Use Ctrl+C para copiar.'); } };
$('renew-button').onclick = async () => { try { showInvite(await native.renewInvite()); notice('Convite trocado. O anterior não funciona mais.'); } catch (error) { notice(error.message, true); } };
$('join-form').onsubmit = event => { event.preventDefault(); try { const invite = parseInvite($('join-input').value); if (stream) stopSharing(); connect(invite.address, invite.token, 'viewer'); } catch (error) { notice(error.message, true); } };
$('leave-button').onclick = () => { stopSharing(); void switchRole('host'); notice('Você saiu da sala.'); };
$('grid-button').onclick = () => { focus = null; renderTiles(); };
$('sound-button').onclick = () => { muted = !muted; applyAudio(); for (const item of tiles.values()) media?.play(item.video); };
$('volume').oninput = () => { muted = Number($('volume').value) === 0; applyAudio(); };
$('fullscreen-button').onclick = () => { const action = document.fullscreenElement ? document.exitFullscreen() : $('stage').requestFullscreen(); action.catch(error => notice(error.message, true)); };
new ResizeObserver(renderTiles).observe($('stage'));
setInterval(() => { if (liveSince) { const elapsed = Math.floor((Date.now()-liveSince)/1000); $('stream-clock').textContent = String(Math.floor(elapsed/3600)).padStart(2,'0') + ':' + String(Math.floor(elapsed/60)%60).padStart(2,'0') + ':' + String(elapsed%60).padStart(2,'0'); } }, 1000);
window.addEventListener('beforeunload', () => { terminal = true; clearTimeout(reconnectTimer); media?.close(); socket?.close(); for (const track of display?.getTracks() || []) track.stop(); });
try {
  if (!native) throw new Error('Abra o executável do Concord.');
  config = await native.bootstrap(); $('app-version').textContent = 'Concord ' + config.version; renderProfile();
  native.onUpdate(renderUpdate); renderUpdate(await native.updatesReady());
  const session = await native.session(); if (session.public) showInvite(session); else void makeInvite();
  if (!config.profile.name) await chooseName();
  connect(config.address, config.hostToken, 'host');
} catch (error) { notice(error.message, true); status('Não consegui abrir'); }
