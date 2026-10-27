// Only visual data crosses the room connection. Discord credentials/IDs stay local.
export function visualProfile(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const result = {
    name: typeof value.name === 'string' ? value.name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 32) : '',
    photo: image(value.photo, 'jpeg', 60000)
  };
  if (value.banner !== undefined) result.banner = image(value.banner, 'jpeg', 60000);
  if ((result.photo.length + (result.banner?.length || 0)) > 60000) result.banner = '';
  if (value.accentColor !== undefined) result.accentColor = typeof value.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(value.accentColor) ? value.accentColor.toLowerCase() : '';
  return result;
}
function image(value, type, limit) {
  return typeof value === 'string' && value.length < limit && new RegExp('^data:image/' + type + ';base64,[A-Za-z0-9+/=]+$').test(value) ? value : '';
}
