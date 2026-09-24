import {config} from '../site-config.js';
export const configured = Boolean(config.supabaseUrl && config.publishableKey);
let session = null;
export async function request(path, {method = 'GET', body, headers = {}, raw = false} = {}) {
  if (!configured) throw Error('The editor needs its Supabase project settings. See the setup guide.');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl)) throw Error('Invalid Supabase project URL.');
  const response = await fetch(config.supabaseUrl + path, {
    method, headers: {apikey: config.publishableKey, ...(session ? {Authorization: `Bearer ${session.access_token}`} : {}), ...(body && !raw ? {'Content-Type':'application/json'} : {}), ...headers},
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(20000), cache: 'no-store'
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(response.status === 401 ? 'Your session expired. Sign in again; keep this tab open to retain your changes.' : error.message || error.error_description || 'The request failed. Please try again.');
  }
  if (raw && method === 'GET') return response.blob();
  return response.status === 204 ? null : response.json();
}
export async function login(email, password) {
  session = await request('/auth/v1/token?grant_type=password', {method:'POST', body:{email,password}});
  try { await request('/rest/v1/rpc/editor_check', {method:'POST', body:{}}); }
  catch (error) { session = null; throw error; }
}
export async function logout() {
  try { if (session) await request('/auth/v1/logout', {method:'POST'}); } finally { session = null; }
}
export async function photoURL(path) {
  if (path.startsWith('assets/')) return new URL('../' + path, import.meta.url).href;
  return URL.createObjectURL(await request('/storage/v1/object/authenticated/site-photos/' + path, {raw:true}));
}
export async function uploadPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw Error('Choose a JPG, PNG, or WebP photo under 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.88));
  if (!blob || blob.size > 5 * 1024 * 1024) throw Error('Photo is too large after resizing. Choose a smaller image.');
  const path = `uploads/${crypto.randomUUID()}.jpg`;
  await request('/storage/v1/object/site-photos/' + path, {method:'POST', raw:true, body:blob, headers:{'Content-Type':'image/jpeg','x-upsert':'false'}});
  return path;
}
