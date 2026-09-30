import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,publicContent,move,formatPrice} from '../lib/content.js';
const seed=JSON.parse(readFileSync(new URL('../data/content.json',import.meta.url)));
test('preserves both original collections and all 17 pieces',()=>{assert.deepEqual(seed.collections.map(c=>[c.name,c.pieces.length]),[['Wickedly Enchanted',10],['Autumn Harvest',7]]);validate(seed);});
test('hidden records are removed without mutating draft; sold pieces remain',()=>{const d=structuredClone(seed);d.collections[0].hidden=true;d.collections[1].pieces[0].status='Hidden';d.collections[1].pieces[1].status='Sold';const p=publicContent(d);assert.equal(p.collections.length,1);assert.equal(p.collections[0].pieces.length,6);assert.equal(p.collections[0].pieces[0].status,'Sold');assert.equal(d.collections[1].pieces.length,7);});
test('rejects unsafe images, unknown statuses and duplicate identities',()=>{for(const [key,value] of [['image','javascript:alert(1)'],['image','https://evil.test/a.jpg'],['status','Purchased'],['id',seed.collections[0].id]]){const d=structuredClone(seed);d.collections[0].pieces[0][key]=value;assert.throws(()=>validate(d));}});
test('reordering preserves identity and respects boundaries',()=>{const a=['a','b','c'];move(a,0,-1);assert.deepEqual(a,['a','b','c']);move(a,0,1);assert.deepEqual(a,['b','a','c']);move(a,2,1);assert.deepEqual(a,['b','a','c']);});
test('public invariants remain in the page',()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const value of ['G-MZK1H50LPE','61594848291665','checkout-order-notice','All Sales Are Final','id="lightbox"'])assert.ok(html.includes(value));assert.equal(readFileSync(new URL('../CNAME',import.meta.url),'utf8').trim(),'exceptionallyfloral.com');});

test('optional details preserve legacy content and unrestricted serial text',()=>{
 for(const values of [{},{serialNumber:'',price:''},{serialNumber:'  Mixed / <tag> '+ 'x'.repeat(300),price:'125.00'},{price:'0'}]){
  const d=structuredClone(seed);Object.assign(d.collections[0].pieces[0],values);
  assert.deepEqual(publicContent(d).collections[0].pieces[0],d.collections[0].pieces[0]);
 }
});
test('prices format USD and reject malformed input',()=>{
 for(const [value,expected] of [[undefined,''],['',''],['  ',''],['0','$0.00'],['125','$125.00'],['125.00','$125.00'],['1234.5','$1,234.50']])assert.equal(formatPrice(value),expected);
 for(const price of ['-1','1.234','$125','1,000','1e2','NaN','Infinity','10000000000',125,null]){
  const d=structuredClone(seed);d.collections[0].pieces[0].price=price;assert.throws(()=>validate(d),/price/i);
 }
 const d=structuredClone(seed);d.collections[0].pieces[0].serialNumber=123;assert.throws(()=>validate(d),/Serial/);
});
