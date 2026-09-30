// Install Playwright, or set NODE_PATH to a runtime containing it.
const {chromium}=require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const seed=JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(req.url.split('?')[0]);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let owner=true,removed=false,historyCalls=0,passwordSet=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/site-config.js',r=>r.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};"}));
 const after=structuredClone(seed);after.collections[0].pieces[0].price='150';
 await context.route('https://test.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url());let result=true;
 if(url.pathname==='/auth/v1/token'||url.pathname==='/auth/v1/verify')result={access_token:'test-token'};
 else if(url.pathname==='/auth/v1/user'){assert.equal(req.postDataJSON().password,'new-password-1234');passwordSet=true;result={id:'new'};}
 else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
 else if(url.pathname.endsWith('/site_draft'))result=[{content:seed,revision:1}];
 else if(url.pathname.endsWith('editor_profile'))result={owner};
 else if(url.pathname.endsWith('owner_users'))result=[{id:'owner',email:'owner@example.test',owner:true,accepted:true},...removed?[]:[{id:'editor',email:'editor@example.test',owner:false,accepted:true}]];
 else if(url.pathname.endsWith('owner_remove_editor')){assert.equal(req.postDataJSON().target_user,'editor');removed=true;result=null;}
 else if(url.pathname.endsWith('invite-editor'))result={url:'https://exceptionallyfloral.com/admin/#token_hash=test-secret&type=invite',message:'Share this private invitation link.'};
 else if(url.pathname.endsWith('editor_history')){historyCalls++;result=[{id:2,actor_email:'editor@example.test',action:'Saved draft',occurred_at:'2026-09-30T12:00:00Z',revision:2,before_content:seed,after_content:after,details:{}}];}
 await route.fulfill({json:result});
 });
 const login=async()=>{await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByLabel('Password',{exact:true}).fill('password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Signed in.'));};
 await page.goto(base+'/admin/');await login();await page.getByText('Manage users',{exact:true}).click();await page.getByText('owner@example.test — Owner',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Remove access: owner@example.test'}).count(),0);
 await page.getByLabel('Editor email',{exact:true}).fill('new@example.test');await page.getByRole('button',{name:'Create invitation / add editor'}).click();await page.getByLabel('Private invitation link').waitFor();assert.ok((await page.getByLabel('Private invitation link').inputValue()).includes('token_hash='));
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Remove access: editor@example.test'}).click();assert.equal(removed,false);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove access: editor@example.test'}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent==='Editor access removed.');assert.equal(removed,true);
 await page.getByText('Change history',{exact:true}).click();await page.getByText('editor@example.test — Saved draft',{exact:true}).waitFor();assert.ok((await page.locator('#history-list').textContent()).includes('$150.00'));assert.equal(historyCalls,1);
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForSelector('#signin:not([hidden])');owner=false;await login();assert.equal(await page.locator('#users-panel').isVisible(),false);assert.equal(await page.locator('#invite-link').inputValue(),'');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForSelector('#signin:not([hidden])');
 await page.goto(base);await page.goto(base+'/admin/#token_hash=one-use&type=invite');await page.getByLabel('New password',{exact:true}).waitFor();assert.ok(!page.url().includes('token_hash'));
 await page.getByLabel('New password',{exact:true}).fill('new-password-1234');await page.getByLabel('Confirm password',{exact:true}).fill('different-password');await page.getByRole('button',{name:'Set password',exact:true}).click();await page.getByText('Passwords do not match.',{exact:true}).waitFor();assert.equal(passwordSet,false);
 await page.getByLabel('Confirm password',{exact:true}).fill('new-password-1234');await page.getByRole('button',{name:'Set password',exact:true}).click();await page.getByText('Password set. Sign in with your email and new password.',{exact:true}).waitFor();assert.equal(passwordSet,true);assert.deepEqual(errors,[]);
 console.log('Management browser checks passed: owner UI, invitation link, remove/cancel, history, responsive layouts, editor restrictions, sign-out cleanup and invitation password setup.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
