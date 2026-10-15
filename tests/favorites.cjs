const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
module.exports={page};
function page(file,storage=new Map(),blocked=false,syncApi=null,fetcher=null){
  const html=fs.readFileSync(path.join(__dirname,'../docs',file),'utf8');
  const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  const dataset=scripts.find(m=>m[1].includes('application/json'))[2];
  const nodes=new Map(),events={};
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',checked:false,innerHTML:'',textContent:'',dataset:{},listeners:{},classList:{toggle:()=>true},setAttribute(){},addEventListener(k,f){this.listeners[k]=f},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)}
  for(const m of html.matchAll(/<input\b([^>]*)>/g)){const id=m[1].match(/id="([^"]+)"/)?.[1];if(id)node(id).checked=/\bchecked\b/.test(m[1])}
  for(const m of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const options=[...m[2].matchAll(/<option\b([^>]*)>([^<]*)/g)];const opt=options.find(x=>x[1].includes('selected'))||options[0];node(m[1]).value=opt?.[1].match(/value="([^"]*)"/)?.[1]??opt?.[2]??''}
  node('dataset').textContent=dataset;
  const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>Object.assign(node('tab-'+m[1]),{dataset:{tab:m[1]}}));
  const context={document:{getElementById:node,querySelectorAll:()=>tabs,body:node('body'),addEventListener(k,f){events[k]=f}},window:{StoryFavoritesSync:syncApi,scrollTo(){},addEventListener(k,f){events[k]=f}},localStorage:{getItem(k){if(blocked)throw Error('blocked');return storage.get(k)||null},setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v)}},URL,console};
  if(syncApi==='actual'){
    Object.assign(context,{AbortSignal,btoa,atob,setTimeout,clearTimeout});
    Object.assign(context.window,{localStorage:context.localStorage,fetch:fetcher});
  }
  vm.createContext(context);
  if(syncApi==='actual'){
    vm.runInContext(scripts.find(m=>m[1].includes('data-story-favorites-sync'))[2],context);
    context.window.StoryFavoritesSync=context.StoryFavoritesSync;
  }
  vm.runInContext(scripts.filter(m=>!m[1].includes('application/json')&&!m[1].includes('data-story-favorites-sync')).map(m=>m[2]).join('\n'),context);
  return {node,context,events,storage,run:code=>vm.runInContext(code,context),clickFavorite(id){node('results').listeners.click({target:{closest:selector=>selector==='[data-favorite]'?{dataset:{favorite:id}}:null}})}};
}
for(const file of ['retro-story-library.html','switch-vita-vn.html']){
  test(`${file}: favorites persist, combine with search and platform, and reset preserves saved choices`,()=>{
    const h=page(file);const id=h.run('filtered[0].id');h.clickFavorite(id);
    assert.equal(h.run('favorites.size'),1);assert.match(h.node('results').innerHTML,/aria-pressed="true"/);
    const restored=page(file,h.storage);assert.equal(restored.run('favorites.size'),1);
    restored.node('favorites-only').checked=true;restored.node('favorites-only').onchange();assert.equal(restored.run('filtered.length'),1);
    restored.node('search').value='no-matching-game-987654321';restored.node('search').oninput();assert.equal(restored.run('filtered.length'),0);
    restored.node('reset').onclick();assert.equal(restored.run('favorites.size'),1);assert.equal(restored.node('favorites-only').checked,false);
    restored.node('favorites-only').checked=true;restored.node('platform').value=file.startsWith('retro')?'no-such-platform':restored.run("works.find(r=>favorites.has(r.id)).vita==='발매'?'switchonly':'vitaonly'");restored.node('platform').onchange();
    assert.equal(restored.run('filtered.length'),0);
    restored.node('reset').onclick();restored.node('favorites-only').checked=true;restored.node('favorites-only').onchange();restored.clickFavorite(id);
    assert.equal(restored.run('filtered.length'),0);assert.equal(restored.node('page').textContent,'1 / 1');assert.equal(page(file,h.storage).run('favorites.size'),0);
  });
  test(`${file}: removing the final favorite on page two returns to a populated page one`,()=>{
    const h=page(file);const ids=h.run('filtered.slice(0,25).map(r=>r.id)');for(const id of ids)h.clickFavorite(id);h.node('favorites-only').checked=true;h.node('favorites-only').onchange();h.node('next').onclick();assert.equal(h.node('page').textContent,'2 / 2');const last=h.run('filtered[24].id');h.clickFavorite(last);assert.equal(h.node('page').textContent,'1 / 1');assert.equal(h.run('filtered.length'),24);assert.match(h.node('results').innerHTML,/class="card"/);
  });
  test(`${file}: blocked storage keeps session choices and reports persistence limits`,()=>{
    const h=page(file,new Map(),true);h.clickFavorite(h.run('filtered[0].id'));assert.equal(h.run('favorites.size'),1);assert.match(h.node('favorite-status').textContent,/이번 화면에서만/);
  });
  test(`${file}: another tab refreshes favorites; malformed and unknown ids are not accepted`,()=>{
    const h=page(file);const key=h.run('FAVORITES_KEY'),id=h.run('filtered[0].id');h.storage.set(key,JSON.stringify([id,'unknown-id',id,7]));h.events.storage({key});assert.equal(h.run('favorites.size'),1);
    h.storage.set(key,'{broken');assert.equal(page(file,h.storage).run('favorites.size'),0);assert.match(page(file,h.storage).node('sync-key-status').textContent,/동기화 기능을 불러오지 못/);
  });
}
test('two libraries use separate storage keys',()=>{
  const storage=new Map(),retro=page('retro-story-library.html',storage);retro.clickFavorite(retro.run('filtered[0].id'));assert.equal(page('switch-vita-vn.html',storage).run('favorites.size'),0);
});

for(const [file,library] of [['retro-story-library.html','retro'],['switch-vita-vn.html','switch-vita']]){
  test(`${file}: sync adapter updates real favorites and filters while keeping library identity`,()=>{
    let adapter;const changes=[];
    const h=page(file,new Map(),false,{boot(options){adapter=options;return {set:(id,value)=>changes.push([id,value])}}});
    assert.equal(adapter.library,library);
    const id=h.run('works[0].id');assert(adapter.ids.includes(id));
    adapter.apply([id]);assert.equal(h.run('favorites.size'),1);
    h.node('favorites-only').checked=true;h.node('favorites-only').onchange();
    assert.equal(h.run('filtered.length'),1);h.clickFavorite(id);
    assert.deepEqual(changes,[[id,false]]);assert.equal(h.run('filtered.length'),0);
    adapter.apply([id]);assert.equal(h.run('filtered.length'),1);
  });
}

test('real browser module saves key, restores it on reload, and syncs two page instances',async()=>{
  const remote={version:1,libraries:{retro:{},'switch-vita':{}}};let sha=1;
  const fetcher=async(url,options={})=>{
    const response=(value,status=200)=>({ok:status===200,status,json:async()=>JSON.parse(JSON.stringify(value))});
    if(url==='https://api.github.com/user')return response({id:314692476});
    if(url==='https://api.github.com/repos/Dollars-Archive/Game-Story-Library')return response({permissions:{push:true}});
    if(options.method==='PUT'){
      const body=JSON.parse(options.body);
      if(body.sha!==String(sha))return response({},409);
      const next=JSON.parse(Buffer.from(body.content,'base64').toString());remote.libraries=next.libraries;sha++;
      return response({content:{sha:String(sha)}});
    }
    return response({encoding:'base64',content:Buffer.from(JSON.stringify(remote)).toString('base64'),sha:String(sha)});
  };
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  for(const file of ['retro-story-library.html','switch-vita-vn.html']){
    const storage=new Map(),pc=page(file,storage,false,'actual',fetcher);await settle();
    assert.match(pc.node('sync-key-status').textContent,/등록된 열쇠 없음/);
    pc.node('sync-token').value='test-key';await pc.node('sync-save').onclick();
    assert.equal(pc.node('sync-token').value,'');
    assert.match(pc.node('sync-key-status').textContent,/열쇠 저장됨.*확인 완료/);
    const id=pc.run('works[0].id');pc.clickFavorite(id);await settle();
    const reopened=page(file,storage,false,'actual',fetcher);await settle();
    assert.match(reopened.node('sync-key-status').textContent,/열쇠 저장됨.*확인 완료/);
    assert.equal(reopened.run('favorites.size'),1);
    // Saving an intentionally blank input must reuse the stored key, never erase it.
    await reopened.node('sync-save').onclick();assert.equal(storage.get('story-library-editor-token-v1'),'test-key');
    const mobile=page(file,new Map(),false,'actual',fetcher);await settle();assert.equal(mobile.run('favorites.size'),1);
    mobile.node('sync-token').value='test-key';await mobile.node('sync-save').onclick();
    mobile.clickFavorite(id);await settle();await reopened.node('sync-refresh').onclick();assert.equal(reopened.run('favorites.size'),0);
  }
});

test('published pages contain the exact sync module and do not depend on a separate script request',()=>{
  const expected=fs.readFileSync(path.join(__dirname,'../docs/assets/favorites-sync.js'),'utf8').trim();
  for(const name of ['retro-story-library.html','switch-vita-vn.html']){
    const html=fs.readFileSync(path.join(__dirname,'../docs',name),'utf8');
    const embedded=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('data-story-favorites-sync'));
    assert(embedded);assert.equal(embedded[2].trim().replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'));
    assert(!html.includes('src="assets/favorites-sync.js'));
  }
});
