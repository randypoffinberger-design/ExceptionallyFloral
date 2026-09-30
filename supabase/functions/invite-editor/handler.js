const origin = 'https://exceptionallyfloral.com';
const cors = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
export function makeHandler({url, key, fetcher=fetch}) {
 return async req => {
  const reply=(status,body)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});
  if(req.headers.get('origin') && req.headers.get('origin')!==origin)return reply(403,{message:'Origin not allowed.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{message:'Use POST.'});
  const authorization=req.headers.get('authorization');
  if(!authorization?.startsWith('Bearer '))return reply(401,{message:'Sign in again.'});
  try {
   const call=async(path,body,admin=false)=>{
    const response=await fetcher(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:admin?`Bearer ${key}`:authorization,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message||data.msg||'Request failed.'),{status:response.status});return data;
   };
   await call('/auth/v1/user');
   await call('/rest/v1/rpc/owner_check',{});
   const body=await req.json();const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(400,{message:'Enter a valid email address.'});
   await call('/rest/v1/rpc/owner_invite_check',{});
   const existing=await call('/rest/v1/rpc/owner_find_user',{target_email:email});
   if(existing?.confirmed){await call('/rest/v1/rpc/owner_grant_editor',{target_email:email});return reply(200,{existing:true,message:'Editor access granted. They can sign in with their existing account.'});}
   // Generate a one-use invitation without depending on SMTP or emailing credentials.
   const invitation=await call('/auth/v1/admin/generate_link',{type:'invite',email},true);
   if(!invitation.hashed_token)throw Error('Invitation could not be created.');
   await call('/rest/v1/rpc/owner_grant_editor',{target_email:email});
   return reply(200,{url:`${origin}/admin/#token_hash=${encodeURIComponent(invitation.hashed_token)}&type=invite`,message:'Share this private invitation link with the person you invited. It can be used once.'});
  }catch(error){return reply(error.status===401?401:error.status===403?403:400,{message:error.status===401?'Sign in again.':error.message||'Unable to create invitation.'});}
 };
}
