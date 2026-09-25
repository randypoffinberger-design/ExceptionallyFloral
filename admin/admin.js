import {configured, login, logout, request, uploadPhoto, photoURL} from '../lib/api.js';
import {validate, statuses, textFields, move} from '../lib/content.js';
const $ = selector => document.querySelector(selector);
let draft, revision = 0, dirty = false, previewed = '', busy = false;
const photos = new Map();
const notify = message => { $('#notice').textContent = message; };
function changed() {dirty=true;previewed='';$('#publish').disabled=true;$('#state').textContent='Unsaved changes';}
function control(tag, text, action, secondary=true) { const el=document.createElement(tag);el.textContent=text;if(tag==='button'){el.type='button';if(secondary)el.className='secondary';el.onclick=()=>run(action);}return el; }
function field(label, value, update, type='text', choices=[]) {
  const wrapper=document.createElement('label');wrapper.textContent=label;
  const input=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');
  input.setAttribute('aria-label',label);
  if(type==='select')for(const option of choices){const el=document.createElement('option');el.value=option;el.textContent=option;input.append(el);}
  else if(type!=='textarea')input.type=type;
  if(type==='checkbox')input.checked=value;else input.value=value;
  if(type==='text')input.maxLength=label==='Photo description'?500:120;
  if(type==='textarea')input.maxLength=3000;
  input.addEventListener('input',()=>{update(type==='checkbox'?input.checked:input.value);changed();});wrapper.append(input);return wrapper;
}
async function run(action) {
  if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');
  const controls=[...document.querySelectorAll('#editor button,#editor input,#editor textarea,#editor select,#login button')]; const previous=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
  try{await action();}catch(error){notify(error.message);}finally{busy=false;document.body.removeAttribute('aria-busy');controls.forEach((el,i)=>el.disabled=previous[i]);$('#publish').disabled=!previewed||dirty;}
}
function reorder(items,index,delta){move(items,index,delta);changed();render();}
function confirmCollectionDeletion(collection) {
  const dialog=document.createElement('dialog');dialog.className='delete-dialog';
  dialog.setAttribute('aria-labelledby','delete-title');dialog.setAttribute('aria-describedby','delete-description');
  const title=control('h2','Delete collection?');title.id='delete-title';
  const description=control('p',`Remove “${collection.name}” and all ${collection.pieces.length} pieces from your draft? Move any pieces you want to keep to another collection first. The live website changes only after you preview and publish.`);description.id='delete-description';
  const note=control('p','There is no restore button in the editor. Stored photos and publication backups are retained; this does not erase those files.');
  const phrase=collection.name.trim() || 'DELETE';
  const label=document.createElement('label');label.textContent=`Type ${phrase} to confirm`;
  const input=document.createElement('input');input.type='text';input.autocomplete='off';input.spellcheck=false;input.setAttribute('autocapitalize','off');label.append(input);
  const buttons=document.createElement('div');buttons.className='row';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Keep collection';cancel.onclick=()=>dialog.close();
  const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Delete collection and pieces';remove.disabled=true;
  input.oninput=()=>{remove.disabled=input.value!==phrase;};
  remove.onclick=()=>{
    if(busy || input.value!==phrase)return;
    const index=draft.collections.findIndex(item=>item.id===collection.id);if(index<0)return;
    draft.collections.splice(index,1);changed();dialog.close();render();
    notify(`“${collection.name}” and its ${collection.pieces.length} pieces were removed from your draft. Save, preview, then publish to remove them from the website.`);
    $('#add-collection').focus();
  };
  buttons.append(cancel,remove);dialog.append(title,description,note,label,buttons);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();cancel.focus();
}
async function resolvePhoto(path) {if(!photos.has(path))photos.set(path,photoURL(path).catch(e=>{photos.delete(path);throw e;}));return photos.get(path);}
function render() {
  const host=$('#collections-editor');host.replaceChildren();
  draft.collections.forEach((c,ci)=>{
    const section=document.createElement('section');section.className='collection';
    const top=document.createElement('div');top.className='collection-top';top.append(control('h2',c.name));
    const ordering=document.createElement('div');ordering.className='row';
    for(const [text,delta] of [['↑ Move collection up',-1],['↓ Move collection down',1]]){const button=control('button',text,()=>reorder(draft.collections,ci,delta));button.disabled=ci+delta<0||ci+delta>=draft.collections.length;ordering.append(button);}
    const deleteButton=control('button','Delete collection',()=>confirmCollectionDeletion(c));deleteButton.classList.add('delete-collection');ordering.append(deleteButton);
    top.append(ordering);section.append(top,field('Collection name',c.name,v=>{c.name=v;top.querySelector('h2').textContent=v;}),field('Collection description',c.description,v=>c.description=v,'textarea'),field('Hide this collection',c.hidden,v=>c.hidden=v,'checkbox'),field('Gallery layout',c.layout,v=>c.layout=v,'select',['original','even','large']));
    const pieces=document.createElement('div');pieces.className='pieces';
    c.pieces.forEach((p,pi)=>{
      const card=document.createElement('article');card.className='piece';const img=document.createElement('img');img.alt=p.alt||p.name;resolvePhoto(p.image).then(url=>img.src=url).catch(()=>img.alt='Photo unavailable');card.append(img);
      const row=document.createElement('div');row.className='row';
      for(const [text,delta] of [['↑ Earlier',-1],['↓ Later',1]]){const b=control('button',text,()=>reorder(c.pieces,pi,delta));b.setAttribute('aria-label',`${text}: ${p.name}`);b.disabled=pi+delta<0||pi+delta>=c.pieces.length;row.append(b);}
      card.append(row,field('Piece name',p.name,v=>p.name=v),field('Status',p.status,v=>p.status=v,'select',statuses),field('Inventory type',p.inventoryType,v=>p.inventoryType=v,'select',['one-off','made-to-order']),field('Photo description',p.alt,v=>p.alt=v));
      const upload=document.createElement('label');upload.textContent='Replace photo';const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.onchange=()=>run(async()=>{if(!input.files[0])return;notify('Uploading photo…');p.image=await uploadPhoto(input.files[0]);changed();render();notify('Photo uploaded. Save and preview when ready.');});upload.append(input);card.append(upload);
      const collectionSelect=field('Move to collection',c.id,v=>{const target=draft.collections.find(item=>item.id===v);if(target&&target!==c){c.pieces.splice(pi,1);target.pieces.push(p);queueMicrotask(render);}},'select',draft.collections.map(item=>item.id));
      [...collectionSelect.querySelectorAll('option')].forEach((o,i)=>o.textContent=draft.collections[i].name);card.append(collectionSelect);pieces.append(card);
    });section.append(pieces);
    const add=document.createElement('label');add.textContent='+ Add piece from photo';const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.onchange=()=>run(async()=>{if(!file.files[0])return;notify('Uploading photo…');const image=await uploadPhoto(file.files[0]);c.pieces.push({id:crypto.randomUUID(),name:'New piece',alt:'',image,status:'Hidden',inventoryType:'one-off'});changed();render();notify('Piece added as Hidden. Give it a name and choose its status.');});add.append(file);section.append(add);host.append(section);
  });
  const text=$('#text-editor');text.replaceChildren();const labels={intro:'Home introduction',creations:'Creations introduction',note:'Gallery note',about:'About introduction',contact:'Contact introduction'};
  for(const key of Object.keys(textFields))text.append(field(labels[key],draft.text[key],v=>draft.text[key]=v,'textarea'));
}
async function save() {
  validate(draft);
  const saved=await request('/rest/v1/rpc/save_draft',{method:'POST',body:{document:draft,expected_revision:revision}});
  revision=saved;dirty=false;$('#state').textContent=`Draft saved · revision ${revision}`;notify('Draft saved. The public website has not changed.');
}
$('#login').onsubmit=event=>{event.preventDefault();run(async()=>{
  const form=new FormData(event.target);await login(form.get('email'),form.get('password'));event.target.reset();
  if(!draft){const rows=await request('/rest/v1/site_draft?id=eq.1&select=content,revision');if(rows.length){draft=validate(rows[0].content);revision=rows[0].revision;}else{draft=validate(await fetch('../data/content.json').then(r=>r.json()));dirty=true;}}
  $('#signin').hidden=true;$('#editor').hidden=false;render();notify('Signed in. Changes stay in your draft until you publish.');
});};
$('#save').onclick=()=>run(save);
$('#add-collection').onclick=()=>{draft.collections.push({id:crypto.randomUUID(),name:'New collection',description:'',hidden:true,layout:'original',pieces:[]});changed();render();};
$('#preview').onclick=()=>run(async()=>{
  if(dirty)await save();validate(draft);notify('Preparing your preview…');
  const resolved={};for(const c of draft.collections)for(const p of c.pieces)if(p.image.startsWith('uploads/'))resolved[p.id]=await resolvePhoto(p.image);
  const snapshot=JSON.stringify(draft);const frame=$('#preview-frame');
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{window.removeEventListener('message',ready);reject(Error('Preview did not load. Please try again.'));},15000);
    function ready(event){if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='ef-preview-ready')return;clearTimeout(timeout);window.removeEventListener('message',ready);frame.contentWindow.postMessage({type:'ef-preview',content:JSON.parse(snapshot),photos:resolved},location.origin);resolve();}
    window.addEventListener('message',ready);frame.src='../?preview=1';$('#preview-dialog').showModal();
  });
  previewed=snapshot;notify('Review your preview, then publish when ready.');
});
$('#close-preview').onclick=()=>$('#preview-dialog').close();
$('#phone').onclick=()=>$('#preview-frame').classList.add('phone');$('#desktop').onclick=()=>$('#preview-frame').classList.remove('phone');
$('#publish').onclick=()=>run(async()=>{
  if(dirty||previewed!==JSON.stringify(draft))throw Error('Preview your latest changes before publishing.');
  await request('/rest/v1/rpc/publish_draft',{method:'POST',body:{expected_revision:revision}});previewed='';notify('Published. Your website now shows this version.');$('#state').textContent=`Published · revision ${revision}`;
});
$('#signout').onclick=()=>run(async()=>{if(dirty&&!confirm('Sign out and discard unsaved changes?'))return;await logout();draft=null;dirty=false;previewed='';revision=0;for(const value of photos.values()){const url=await value.catch(()=>null);if(url?.startsWith('blob:'))URL.revokeObjectURL(url);}photos.clear();$('#editor').hidden=true;$('#signin').hidden=false;$('#collections-editor').replaceChildren();notify('Signed out.');});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
// Short-lived in-memory sessions: reauthentication never discards an open draft.
const reauth=control('button','Sign in again',()=>{$('#signin').hidden=false;$('#signin').scrollIntoView();});$('#editor .buttons').append(reauth);
if(!configured){notify('Setup is required before sign-in. Follow ADMIN-SETUP.md to connect your Supabase project.');$('#login button').disabled=true;}
