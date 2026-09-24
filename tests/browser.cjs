// Install Playwright, or set NODE_PATH to a runtime containing it.
const {chromium}=require('playwright');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const seed=JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let name=decodeURIComponent(req.url.split('?')[0]);if(name.endsWith('/'))name+='index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});let checks=0;
 try{
 for(const width of [375,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({body:''}));
  await page.goto(base);await page.waitForSelector('.gallery figure');assert.equal(await page.locator('.gallery figure').count(),17);
  await page.locator('.gallery-link').first().click();assert.equal(await page.locator('#lightbox').evaluate(el=>el.open),true);await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Public overflow at ${width}`);
  await page.goto(base+'/admin/');await page.waitForSelector('#notice:not(:empty)');assert.equal(await page.locator('#login button').isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Admin overflow at ${width}`);
  assert.deepEqual(errors,[]);checks++;await context.close();
 }
 // Simulated service exercises the UI, not the production database security policies.
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let draft=structuredClone(seed),rev=0,published=structuredClone(seed),conflict=false;
 await page.route('**/site-config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const config={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};"}));
 await page.route('https://www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await page.route('https://test.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),body=req.headers()['content-type']?.includes('application/json')?req.postDataJSON():null;let result;
  if(url.pathname==='/auth/v1/token')result={access_token:'test-session'};
  else if(url.pathname.endsWith('editor_check'))result=true;
  else if(url.pathname==='/rest/v1/site_draft')result=[{content:draft,revision:rev}];
  else if(url.pathname==='/rest/v1/site_public')result=[{content:published}];
  else if(url.pathname.endsWith('save_draft')){if(conflict)return route.fulfill({status:409,json:{message:'Another editor saved a newer draft.'}});assert.equal(body.expected_revision,rev);draft=body.document;result=++rev;}
  else if(url.pathname.endsWith('publish_draft')){assert.equal(body.expected_revision,rev);published=structuredClone(draft);result=rev;}
  else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
  else if(url.pathname.startsWith('/storage/v1/object/')&&req.method()==='POST')result={Key:'uploaded'};
  else if(url.pathname.startsWith('/storage/v1/object/authenticated/'))return route.fulfill({contentType:'image/jpeg',body:fs.readFileSync(path.join(root,'assets/logo.jpg'))});
  else throw Error('Unexpected request '+req.url());
  await route.fulfill({json:result});
 });
 await page.goto(base+'/admin/');await page.getByLabel('Email',{exact:true}).fill('editor@example.test');await page.getByLabel('Password',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForSelector('.piece');
 assert.equal(await page.locator('.piece').count(),17);
 await page.getByLabel('Status',{exact:true}).nth(0).selectOption('Sold');await page.getByLabel('Status',{exact:true}).nth(1).selectOption('Hidden');
 await page.getByLabel('Collection description').first().fill('Handcrafted for autumn.');
 assert.equal(await page.getByRole('button',{name:'Publish previewed draft'}).isDisabled(),true);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Draft saved'));
 assert.equal(published.collections[0].pieces[0].status,'Available');
 await page.getByRole('button',{name:'Preview',exact:true}).click();const frame=page.frameLocator('#preview-frame');await frame.locator('.sold-badge').waitFor();assert.equal(await frame.locator('.gallery figure').count(),16);
 await page.getByRole('button',{name:'Done reviewing'}).click();await page.getByRole('button',{name:'Publish previewed draft'}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Published.'));assert.equal(published.collections[0].pieces[0].status,'Sold');
 await page.getByLabel('Piece name').first().fill('<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'Preview',exact:true}).click();await frame.locator('figcaption span').first().waitFor();assert.equal(await frame.locator('figcaption span').first().textContent(),'<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'Done reviewing'}).click();
 await page.getByLabel('Piece name').first().fill('Enchanted Mischief');assert.equal(await page.getByRole('button',{name:'Publish previewed draft'}).isDisabled(),true);
 await page.getByLabel('Replace photo').first().setInputFiles(path.join(root,'assets/logo.jpg'));await page.waitForFunction(()=>document.querySelector('#notice').textContent.startsWith('Photo uploaded.'));
 await page.getByRole('button',{name:'Preview',exact:true}).click();await frame.locator('.gallery img').first().waitFor();await page.waitForTimeout(300);assert.ok((await frame.locator('.gallery img').first().getAttribute('src')).startsWith('blob:'));await page.getByRole('button',{name:'Done reviewing'}).click();
 await page.getByRole('button',{name:'+ Add collection',exact:true}).click();assert.equal(await page.locator('.collection').count(),3);
 await page.getByLabel('Collection name').last().fill('Spring');await page.getByRole('button',{name:'↑ Move collection up'}).last().click();assert.equal(await page.getByLabel('Collection name').nth(1).inputValue(),'Spring');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const out=process.env.TEST_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'admin-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'admin-phone.png'),fullPage:true});}
 conflict=true;await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Another editor'));
 assert.deepEqual(errors,[]);checks++;await context.close();console.log(`Passed ${checks} browser scenarios: responsive layouts, login, sold/hidden, draft isolation, preview/publish, invalidated preview, upload, safe text, collection ordering and conflicts.`);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
