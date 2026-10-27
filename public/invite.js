import { parseInvite, desktopInvite } from './invites.js';
const $ = id => document.getElementById(id);
function renderInvite() {
  $('open-concord').hidden = true; $('open-concord').removeAttribute('href');
  $('open-hint').hidden = $('manual-invite').hidden = true; $('manual-code').value = '';
  try {
  const value = location.href;
  parseInvite(value);
  const code = desktopInvite(value);
  $('open-concord').href = code; $('open-concord').hidden = false;
  $('open-hint').hidden = false; $('manual-invite').hidden = false;
  $('manual-code').value = code;
  $('invite-message').textContent = 'Abra o convite no Concord instalado neste PC e confirme a entrada.';
  } catch {
  $('invite-message').textContent = 'Este convite está incompleto ou inválido. Peça um novo link para quem criou a sala.';
  }
}
window.addEventListener('hashchange', renderInvite); renderInvite();
