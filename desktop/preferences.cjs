const { readFile, writeFile, rename } = require('node:fs/promises');

const defaults = Object.freeze({ resolution: '1080', fps: '30', bitrateMode: 'auto', bitrateMbps: 12, audioMode: 'application', audioEnabled: true });
function normalizePreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const number = Number(value.bitrateMbps);
  return {
    resolution: ['720', '1080', '1440', '2160'].includes(value.resolution) ? value.resolution : defaults.resolution,
    fps: ['30', '60'].includes(value.fps) ? value.fps : defaults.fps,
    bitrateMode: ['auto', 'manual'].includes(value.bitrateMode) ? value.bitrateMode : defaults.bitrateMode,
    bitrateMbps: Number.isFinite(number) && number >= 1 && number <= 60 && Number.isInteger(number * 2) ? number : defaults.bitrateMbps,
    audioMode: ['application', 'system'].includes(value.audioMode) ? value.audioMode : defaults.audioMode,
    audioEnabled: typeof value.audioEnabled === 'boolean' ? value.audioEnabled : defaults.audioEnabled
  };
}
async function createPreferences(file) {
  let current = { ...defaults }, warning = false, queue = Promise.resolve();
  try { current = normalizePreferences(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { warning = error.code !== 'ENOENT'; }
  return {
    get: () => ({ ...current }), warning,
    save(value) {
      const next = normalizePreferences(value);
      const saved = queue.then(async () => {
        await writeFile(file + '.tmp', JSON.stringify(next), 'utf8');
        await rename(file + '.tmp', file); current = next; return { ...current };
      });
      queue = saved.catch(() => {}); return saved;
    }
  };
}
module.exports = { defaults, normalizePreferences, createPreferences };
