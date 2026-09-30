import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityChanges} from '../admin/history.js';
import {makeHandler} from '../supabase/functions/invite-editor/handler.js';
const seed={text:{intro:'Hello'},collections:[{id:'a',name:'Autumn',hidden:false,layout:'original',description:'',pieces:[{id:'p',name:'Rose',price:'125',serialNumber:'ABC'}]}]};
test('history shows prices, serials, moves and literal text',()=>{
 const after=structuredClone(seed);after.collections[0].pieces[0].price='150';after.collections[0].pieces[0].serialNumber='<script>';
 const changes=activityChanges({before_content:seed,after_content:after});assert.ok(changes.some(c=>c.includes('$125.00')&&c.includes('$150.00')));assert.ok(changes.some(c=>c.includes('<script>')));
 after.collections.push({id:'b',name:'Winter',pieces:after.collections[0].pieces});after.collections[0].pieces=[];
 assert.ok(activityChanges({before_content:seed,after_content:after}).some(c=>c.includes('Moved')));
});
test('history distinguishes legacy history and no changes',()=>{
 assert.match(activityChanges({details:{historical:true}})[0],/not recorded/);
 assert.deepEqual(activityChanges({before_content:seed,after_content:seed}),['No content differences.']);
});
const request=(email='new@example.test',token='user-token')=>new Request('https://test/invite',{method:'POST',headers:{Origin:'https://exceptionallyfloral.com',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({email})});
test('invitation rejects nonowners before any administrative call',async()=>{
 const calls=[];const handler=makeHandler({url:'https://test',key:'server-secret',fetcher:async(url,opts)=>{calls.push(url);return Response.json(url.endsWith('owner_check')?{message:'Only owner'}:{id:'user'},{status:url.endsWith('owner_check')?403:200});}});
 const result=await handler(request());assert.equal(result.status,403);assert.equal(calls.length,2);assert.ok(!calls.some(c=>c.includes('admin/')));
});
test('invitation returns one-use link only after owner grant; secrets stay server side',async()=>{
 const calls=[];const handler=makeHandler({url:'https://test',key:'server-secret',fetcher:async(url,opts)=>{calls.push([url,opts]);return Response.json(url.endsWith('owner_find_user')?null:url.endsWith('generate_link')?{hashed_token:'one-use-token'}:true);}});
 const result=await handler(request());const body=await result.json();assert.match(body.url,/#token_hash=one-use-token&type=invite$/);assert.ok(!JSON.stringify(body).includes('server-secret'));
 assert.equal(calls.at(-1)[0],'https://test/rest/v1/rpc/owner_grant_editor');
 assert.equal(calls.find(c=>c[0].includes('generate_link'))[1].headers.Authorization,'Bearer server-secret');
 assert.equal(calls.at(-1)[1].headers.Authorization,'Bearer user-token');
});
test('existing confirmed accounts get access without generating password links',async()=>{
 const calls=[];const handler=makeHandler({url:'https://test',key:'secret',fetcher:async url=>{calls.push(url);return Response.json(url.endsWith('owner_find_user')?{id:'existing',confirmed:true}:true);}});
 assert.equal((await (await handler(request())).json()).existing,true);assert.ok(!calls.some(c=>c.includes('generate_link')));
});
