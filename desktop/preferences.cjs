const { readFile, writeFile, rename } = require('node:fs/promises');

const defaults = Object.freeze({ resolution: '1080', fps: '30', bitrateMode: 'auto', bitrateMbps: 12, audioMode: 'auto', audioEnabled: true, audioVersion: 2, micMuted: false, micDevice: '', cameraDevice: '', speakerDevice: '', themeColor: '#aa96ff', introSeen: '', discordFavorites: [], discordRecent: [] });
// Discord friends are kept only as IDs (favorites and recent invites); names and photos come from the SDK at runtime.
const friendIds = (value, max) => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && /^\d{5,25}$/.test(id)))].slice(0, max) : [];
const deviceName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 200) : '';
function normalizePreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const number = Number(value.bitrateMbps);
  return {
    resolution: ['720', '1080', '1440', '2160'].includes(value.resolution) ? value.resolution : defaults.resolution,
    fps: ['30', '60'].includes(value.fps) ? value.fps : defaults.fps,
    bitrateMode: ['auto', 'manual'].includes(value.bitrateMode) ? value.bitrateMode : defaults.bitrateMode,
    bitrateMbps: Number.isFinite(number) && number >= 1 && number <= 60 && Number.isInteger(number * 2) ? number : defaults.bitrateMbps,
    // Before audioVersion 2 'application' was only the default; those profiles move to the automatic mode.
    audioMode: value.audioVersion !== 2 && value.audioMode === 'application' ? 'auto' : ['auto', 'application', 'system'].includes(value.audioMode) ? value.audioMode : defaults.audioMode,
    audioEnabled: typeof value.audioEnabled === 'boolean' ? value.audioEnabled : defaults.audioEnabled,
    audioVersion: 2,
    // Voice: mute is remembered like Discord; devices are kept by name because Chromium IDs change with the app port.
    micMuted: typeof value.micMuted === 'boolean' ? value.micMuted : defaults.micMuted,
    micDevice: deviceName(value.micDevice), cameraDevice: deviceName(value.cameraDevice), speakerDevice: deviceName(value.speakerDevice),
    themeColor: typeof value.themeColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.themeColor) ? value.themeColor.toLowerCase() : defaults.themeColor,
    // Painel intro: "<version>@<local date>" of the last full intro, so it plays once a day and after updates.
    introSeen: typeof value.introSeen === 'string' && /^[0-9A-Za-z.+-]{1,32}@\d{4}-\d{2}-\d{2}$/.test(value.introSeen) ? value.introSeen : defaults.introSeen,
    discordFavorites: friendIds(value.discordFavorites, 50), discordRecent: friendIds(value.discordRecent, 8)
  };
}
async function createPreferences(file) {
  let current = { ...defaults }, warning = false, queue = Promise.resolve();
  try { current = normalizePreferences(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { warning = error.code !== 'ENOENT'; }
  return {
    get: () => structuredClone(current), warning,
    save(value) {
      const next = normalizePreferences(value);
      const saved = queue.then(async () => {
        await writeFile(file + '.tmp', JSON.stringify(next), 'utf8');
        await rename(file + '.tmp', file); current = next; return structuredClone(current);
      });
      queue = saved.catch(() => {}); return saved;
    }
  };
}
module.exports = { defaults, normalizePreferences, createPreferences };
