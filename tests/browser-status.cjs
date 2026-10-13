const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];fs.mkdirSync('verification',{recursive:true});
 try{for(const file of ['retro-story-library.html','switch-vita-vn.html']){
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file:///'+path.resolve('docs',file).replaceAll('\\','/'));
  await page.selectOption('#korean','official');assert(await page.locator('.language-status').count()>0);
  await page.screenshot({path:`verification/${file}-mobile.png`,fullPage:true});
  await page.screenshot({path:`verification/${file}-mobile-viewport.png`});
  await page.locator('.card').first().scrollIntoViewIfNeeded();await page.screenshot({path:`verification/${file}-mobile-cards.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('#korean-status-notice').innerText().then(s=>s.includes('조사 범위에서 공개 패치를 찾지 못했다')));
  await page.locator('[data-id]').first().click();assert(await page.locator('#modalBody').innerText().then(s=>s.includes('정식 한글화:')&&s.includes('자료 정리일:')));
  assert(await page.locator('#detail').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));await page.locator('#close').click();
  await page.selectOption('#korean','patch');await page.selectOption('#platform',file.startsWith('retro')?'PSP':'switch');
  await page.locator('#compact').click();await page.screenshot({path:`verification/${file}-mobile-compact.png`,fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.selectOption('#korean','absent');assert(await page.locator('.card').count()>0);assert(await page.locator('.language').first().innerText().then(s=>s.includes('한글 패치 없음')));
  await page.locator('#reset').click();await page.locator('#search').fill(file.startsWith('retro')?'메모리즈':'SeaBed');assert(await page.locator('.card').count()>0);
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`verification/${file}-desktop.png`,fullPage:true});
  assert.equal(errors.length,0);results.push({file,mobileWidth:390,desktopWidth:1440,errors,passed:true});await page.close();
 }}finally{await browser.close()}
 fs.writeFileSync('verification/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1});
