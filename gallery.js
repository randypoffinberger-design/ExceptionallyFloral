import {configured, request, photoURL} from './lib/api.js';
import {publicContent, textFields} from './lib/content.js';
let generation = 0;
let objectURLs = [];
export async function renderContent(content, previewPhotos = {}) {
  const doc = publicContent(content), current = ++generation;
  objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = [];
  for (const [key, selector] of Object.entries(textFields)) document.querySelector(selector).textContent = doc.text[key];
  const host = document.querySelector('#collections'); host.replaceChildren();
  for (const c of doc.collections) {
    const section = document.createElement('section'); section.setAttribute('aria-label', c.name);
    const label = document.createElement('div'); label.className = 'collection-label';
    const name = document.createElement('span'); name.textContent = `FEATURED COLLECTION · ${c.name.toUpperCase()}`;
    const count = document.createElement('span'); count.textContent = `${c.pieces.length} collection photos · Tap a photo to explore`;
    label.append(name, count); section.append(label);
    if (c.description) { const p = document.createElement('p'); p.className = 'collection-description'; p.textContent = c.description; section.append(p); }
    const gallery = document.createElement('div'); gallery.className = `gallery layout-${c.layout}`;
    for (const p of c.pieces) {
      const figure = document.createElement('figure'); figure.dataset.pieceId = p.id;
      const link = document.createElement('a'); link.className = 'gallery-link'; link.setAttribute('aria-label', `Enlarge ${p.name}${p.status === 'Sold' ? ', sold' : ''}`);
      const img = document.createElement('img'); img.alt = p.alt || `${p.name}, ${c.name}`; img.loading = 'lazy'; link.append(img);
      if (p.status === 'Sold') { const badge = document.createElement('span'); badge.className = 'sold-badge'; badge.textContent = 'SOLD'; link.append(badge); }
      const caption = document.createElement('figcaption'), title = document.createElement('span'), sub = document.createElement('small');
      title.textContent = p.name; sub.textContent = c.name + (p.status === 'Made to Order' ? ' · Made to Order' : ''); caption.append(title,sub); figure.append(link,caption); gallery.append(figure);
      (previewPhotos[p.id] ? Promise.resolve(previewPhotos[p.id]) : photoURL(p.image)).then(url => {
        if (generation !== current) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
        if (url.startsWith('blob:') && !previewPhotos[p.id]) objectURLs.push(url); img.src = url; link.href = url;
      }).catch(() => { img.alt += ' — photo temporarily unavailable'; link.removeAttribute('href'); });
    }
    section.append(gallery); host.append(section);
  }
}
const preview = new URLSearchParams(location.search).has('preview') && window.parent !== window;
if (preview) {
  const banner = document.createElement('p'); banner.className = 'preview-banner'; banner.textContent = 'DRAFT PREVIEW — only published changes appear on your website'; document.body.prepend(banner);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'ef-preview') return;
    // Uploaded image URLs are resolved by the authenticated parent; never accept arbitrary HTML.
    const photos = Object.fromEntries(Object.entries(event.data.photos || {}).filter(([,url]) => typeof url === 'string' && url.startsWith('blob:' + location.origin + '/')));
    renderContent(event.data.content, photos).catch(() => {document.querySelector('#collections').textContent='Unable to show this draft.';});
  });
  window.parent.postMessage({type:'ef-preview-ready'}, location.origin);
} else {
  (async () => {
    // Configured sites fail visibly instead of resurrecting stale sold/hidden stock.
    const doc = configured ? (await request('/rest/v1/site_public?id=eq.1&select=content'))[0]?.content : await fetch('data/content.json').then(r => {if(!r.ok)throw Error();return r.json();});
    if (!doc) throw Error('No published content');
    await renderContent(doc);
  })().catch(() => {document.querySelector('#collections').textContent='Our collections are temporarily unavailable. Please contact us on Facebook for current availability.';});
}
