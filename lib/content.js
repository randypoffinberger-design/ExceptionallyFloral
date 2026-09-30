export const statuses = ['Available', 'Sold', 'Made to Order', 'Hidden'];
// Keep decimal input as text so blank and zero remain distinct across save/load.
export function validPrice(value) {
  return value === undefined || (typeof value === 'string' && (value.trim() === '' || (/^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 9999999999.99)));
}
const usd = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
export function formatPrice(value) {
  return validPrice(value) && value?.trim() ? usd.format(Number(value)) : '';
}
export const textFields = {intro: '.intro', creations: '#creations .section-heading > p', note: '.gallery-note', about: '.about-copy p:first-child', contact: '#contact > div > p:not(.eyebrow):not(.contact-note)'};
export function validate(doc) {
  if (doc?.schemaVersion !== 1 || !Array.isArray(doc.collections) || doc.collections.length > 50) throw Error('Invalid collections.');
  const ids = new Set();
  const str = (v, max, required = false) => { if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw Error('Please complete names and keep text within the limits.'); };
  const id = v => {str(v, 100, true); if (!/^[a-z0-9-]+$/.test(v) || ids.has(v)) throw Error('Invalid or duplicate ID.'); ids.add(v);};
  if (!doc.text || Object.keys(doc.text).some(k => !(k in textFields))) throw Error('Invalid text fields.');
  for (const key of Object.keys(textFields)) str(doc.text[key], 3000);
  for (const c of doc.collections) {
    id(c.id); str(c.name, 120, true); str(c.description, 3000);
    if (typeof c.hidden !== 'boolean' || !['original','even','large'].includes(c.layout) || !Array.isArray(c.pieces) || c.pieces.length > 200) throw Error('Invalid collection.');
    for (const p of c.pieces) {
      id(p.id); str(p.name, 120, true); str(p.alt, 500); str(p.image, 300, true);
      if (p.serialNumber !== undefined && typeof p.serialNumber !== 'string') throw Error('Serial number must be text.');
      if (!validPrice(p.price)) throw Error('Enter a price from 0 to 9999999999.99 with up to two decimal places, or leave it blank.');
      if (!/^(assets\/[A-Za-z0-9% ._-]+\.(?:png|jpg|jpeg|webp)|uploads\/[a-f0-9-]+\.jpg)$/i.test(p.image) || !statuses.includes(p.status) || !['one-off','made-to-order'].includes(p.inventoryType)) throw Error('Invalid photo or piece status.');
    }
  }
  return doc;
}
export function publicContent(doc) {
  const result = structuredClone(validate(doc));
  result.collections = result.collections.filter(c => !c.hidden).map(c => ({...c, pieces: c.pieces.filter(p => p.status !== 'Hidden')}));
  return result;
}
export function move(items, index, delta) {
  const next = index + delta;
  if (next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
}
