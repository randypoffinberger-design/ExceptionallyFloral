import {formatPrice} from '../lib/content.js';
const labels={name:'name',description:'description',hidden:'visibility',layout:'gallery layout',alt:'photo description',image:'photo',status:'status',inventoryType:'inventory type',serialNumber:'serial number',price:'price',intro:'home introduction',creations:'creations introduction',note:'gallery note',about:'about introduction',contact:'contact introduction'};
const value=(key,v)=>v===undefined||v===''?'blank':key==='price'?formatPrice(v):key==='hidden'?(v?'Hidden':'Visible'):String(v);
export function activityChanges(event){
 if(event.details?.email)return [event.details.email];
 if(!event.before_content)return [event.details?.historical?'Earlier publication; detailed changes were not recorded.':'Initial content snapshot.'];
 const before=event.before_content,after=event.after_content,changes=[];
 const fields=(a,b,keys,name)=>{for(const key of keys)if(JSON.stringify(a?.[key])!==JSON.stringify(b?.[key]))changes.push(`${name}: ${labels[key]||key} changed from “${value(key,a?.[key])}” to “${value(key,b?.[key])}”.`);};
 fields(before.text,after.text,Object.keys(labels).filter(k=>['intro','creations','note','about','contact'].includes(k)),'Website wording');
 const oldCollections=new Map(before.collections.map(c=>[c.id,c])),newCollections=new Map(after.collections.map(c=>[c.id,c]));
 for(const [id,c] of newCollections){if(!oldCollections.has(id))changes.push(`Added collection “${c.name}”.`);else fields(oldCollections.get(id),c,['name','description','hidden','layout'],`Collection “${c.name}”`);}
 for(const [id,c] of oldCollections)if(!newCollections.has(id))changes.push(`Removed collection “${c.name}”.`);
 const flatten=doc=>new Map(doc.collections.flatMap(c=>c.pieces.map(p=>[p.id,{...p,collection:c.id,collectionName:c.name}])));
 const oldPieces=flatten(before),newPieces=flatten(after);
 for(const [id,p] of newPieces){
  const old=oldPieces.get(id);if(!old){changes.push(`Added piece “${p.name}” to “${p.collectionName}”.`);continue;}
  fields(old,p,['name','alt','image','status','inventoryType','serialNumber','price'],`Piece “${p.name}”`);
  if(old.collection!==p.collection)changes.push(`Moved “${p.name}” from “${old.collectionName}” to “${p.collectionName}”.`);
 }
 for(const [id,p] of oldPieces)if(!newPieces.has(id))changes.push(`Removed piece “${p.name}”.`);
 const reordered=(a,b)=>{const common=new Set(a.filter(id=>b.includes(id)));return a.filter(id=>common.has(id)).join(',')!==b.filter(id=>common.has(id)).join(',');};
 if(reordered([...oldCollections.keys()],[...newCollections.keys()]))changes.push('Changed collection order.');
 for(const [id,c] of newCollections)if(oldCollections.has(id)&&reordered(oldCollections.get(id).pieces.map(p=>p.id),c.pieces.map(p=>p.id)))changes.push(`Changed piece order in “${c.name}”.`);
 return changes.length?changes:['No content differences.'];
}
