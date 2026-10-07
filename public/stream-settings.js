export const QUALITY_PRESETS = Object.freeze({
  '720:30': { width: 1280, height: 720, fps: 30, bitrate: 4_000_000 },
  '720:60': { width: 1280, height: 720, fps: 60, bitrate: 6_000_000 },
  '1080:30': { width: 1920, height: 1080, fps: 30, bitrate: 8_000_000 },
  '1080:60': { width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 },
  '1440:30': { width: 2560, height: 1440, fps: 30, bitrate: 16_000_000 },
  '1440:60': { width: 2560, height: 1440, fps: 60, bitrate: 24_000_000 },
  '2160:30': { width: 3840, height: 2160, fps: 30, bitrate: 32_000_000 },
  '2160:60': { width: 3840, height: 2160, fps: 60, bitrate: 45_000_000 }
});

export function qualityPreset(value) { return QUALITY_PRESETS[value] || QUALITY_PRESETS['1080:30']; }
export function videoBitrate(quality, manualMbps = null) {
  if (manualMbps === null) return qualityPreset(quality).bitrate;
  const value = Number(manualMbps);
  if (!Number.isFinite(value) || value < 1 || value > 60 || Math.abs(value * 2 - Math.round(value * 2)) > 1e-8) {
    throw new RangeError('Use uma taxa entre 1 e 60 Mbps, em passos de 0,5 Mbps.');
  }
  return Math.round(value * 1_000_000);
}
export function formatMbps(bits) { return (bits / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }); }
