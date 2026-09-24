export const statuses = ['Available', 'Sold', 'Made to Order', 'Hidden'];
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
