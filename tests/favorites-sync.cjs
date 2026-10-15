const test=require('node:test'),assert=require('node:assert/strict');
const sync=require('../docs/assets/favorites-sync.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64');
const decode=value=>JSON.parse(Buffer.from(value,'base64').toString());
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function server(){
  const s={data:sync.empty(),sha:1,offline:false,failWrite:0,conflict:null,calls:[],user:314692476,push:true};
  s.fetch=async(url,options={})=>{
    s.calls.push({url,options});if(s.offline)throw Error('offline');
    const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>clone(value)});
    if(url==='https://api.github.com/user')return response(200,{id:s.user});
    if(url===sync.CONTENT.split('/contents/')[0])return response(200,{permissions:{push:s.push}});
    if(!url.startsWith(sync.CONTENT))throw Error('Unexpected endpoint');
    if(options.method==='PUT'){
      if(s.failWrite)return response(s.failWrite,{});
      if(s.conflict){const conflict=s.conflict;s.conflict=null;conflict();s.sha++;return response(409,{})}
      const body=JSON.parse(options.body);
      assert.equal(body.branch,'watchlist-data');
      if(body.sha!==String(s.sha))return response(409,{});
      s.data=decode(body.content);s.sha++;
      return response(200,{content:{sha:String(s.sha)}});
    }
    assert(options.cache==='no-store');assert(options.redirect==='error');
    return response(200,{encoding:'base64',content:encode(s.data),sha:String(s.sha)});
  };
  return s;
}
function client(s,{library='retro',legacy=[],storage=new Map(),key=true,blocked=false}={}){
  if(key)storage.set(sync.TOKEN_KEY,'test-key');
  let visible=[...legacy],messages=[];
  const store=sync.createStore({library,ids:['A','B','C'],storage:{getItem(k){return storage.get(k)||null},setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v)}},fetcher:s.fetch,apply:ids=>visible=ids,status:m=>messages.push(m),encodeData:encode,decodeData:decode});
  return {store,storage,visible:()=>visible,messages,start:()=>store.refresh(legacy)};
}
test('PC legacy favorites import once; mobile reads them; removals do not revive on PC',async()=>{
  const s=server(),pc=client(s,{legacy:['A']});
  assert(await pc.start());assert.equal(s.data.libraries.retro.A,true);
  const mobile=client(s);await mobile.start();assert.deepEqual(mobile.visible(),['A']);
  mobile.store.set('A',false);await settle();assert.equal(s.data.libraries.retro.A,false);
  await pc.store.refresh(['A']);assert.deepEqual(pc.visible(),[]);
  const stale=client(s,{legacy:['A']});await stale.start();assert.deepEqual(stale.visible(),[]);
});
test('conflict retries preserve another device and the other library',async()=>{
  const s=server(),pc=client(s);await pc.start();
  s.conflict=()=>{s.data.libraries.retro.B=true;s.data.libraries['switch-vita'].A=true};
  pc.store.set('A',true);await settle();
  assert.deepEqual(s.data.libraries.retro,{A:true,B:true});assert.deepEqual(s.data.libraries['switch-vita'],{A:true});
  assert.equal(s.calls.filter(c=>c.options.method==='PUT').length,2);
});
test('offline edits persist across reload and retry without clearing existing remote favorites',async()=>{
  const s=server(),pc=client(s);await pc.start();
  s.offline=true;pc.store.set('A',true);await settle();
  assert.equal(pc.store.getPending().A,true);
  const reloaded=client(s,{legacy:['A'],storage:pc.storage});assert.equal(await reloaded.start(),false);
  s.data.libraries.retro.B=true;s.sha++;s.offline=false;
  await reloaded.store.refresh(['A']);assert.deepEqual(s.data.libraries.retro,{B:true,A:true});
  assert.deepEqual(reloaded.store.getPending(),{});
});
test('owner verification rejects foreign keys and repository without push access',async()=>{
  for(const change of [s=>s.user=123,s=>s.push=false]){
    const s=server();change(s);const pc=client(s,{legacy:['A']});await pc.start();
    pc.store.set('B',true);await settle();
    assert.equal(s.calls.filter(c=>c.options.method==='PUT').length,0);
    assert(pc.messages.some(m=>m.includes('権')||m.includes('권한')));
    assert(!pc.messages.some(m=>m.includes('test-key')));
  }
});
test('existing discovery key is reused; clearing it here leaves discovery setting unchanged',async()=>{
  const s=server(),storage=new Map([[sync.DISCOVERY_KEY,'test-discovery-key']]);
  const pc=client(s,{storage,key:false,legacy:['A']});await pc.start();
  assert.equal(s.data.libraries.retro.A,true);
  assert(s.calls.some(c=>c.options.headers?.Authorization==='Bearer test-discovery-key'));
  pc.store.clearToken();assert.equal(storage.get(sync.DISCOVERY_KEY),'test-discovery-key');
  const before=s.calls.length;await pc.store.refresh([]);pc.store.set('B',true);await settle();
  assert(!s.calls.slice(before).some(c=>c.options.headers?.Authorization));
});
test('readers without a key can see public favorites and keep local edits without writes',async()=>{
  const s=server();s.data.libraries.retro.B=true;
  const pc=client(s,{key:false,legacy:['A']});await pc.start();
  assert.deepEqual(new Set(pc.visible()),new Set(['A','B']));
  pc.store.set('B',false);await settle();assert.equal(s.calls.filter(c=>c.options.method==='PUT').length,0);
  assert.equal(pc.store.getPending().B,false);
  assert(await pc.store.saveToken('test-key',['A']));
  assert.deepEqual(s.data.libraries.retro,{A:true,B:false});
});
test('forbidden save keeps pending edits and does not claim successful sync',async()=>{
  const s=server(),pc=client(s);await pc.start();s.failWrite=403;
  pc.messages.length=0;pc.store.set('A',true);await settle();
  assert.equal(pc.store.getPending().A,true);
  assert(!pc.messages.includes('GitHub 찜 동기화 완료'));
  assert(pc.messages.some(m=>m.includes('保存')||m.includes('저장 실패')));
  s.failWrite=0;await pc.store.refresh(['A']);assert.equal(s.data.libraries.retro.A,true);
});
test('in-flight edits queue a second save instead of losing later changes',async()=>{
  const s=server(),pc=client(s);await pc.start();
  s.conflict=()=>pc.store.set('B',true);
  pc.store.set('A',true);await settle();await settle();
  assert.deepEqual(s.data.libraries.retro,{A:true,B:true});
});
test('malformed remote data is not replaced with an empty list',async()=>{
  const s=server(),pc=client(s,{legacy:['A']});s.data={version:99};
  assert.equal(await pc.start(),false);assert.deepEqual(pc.visible(),['A']);
  assert.equal(s.calls.filter(c=>c.options.method==='PUT').length,0);
  assert.throws(()=>sync.normalize({version:1,libraries:{retro:{A:'yes'},'switch-vita':{}}}));
});
test('blocked storage is explicit and does not discard the in-memory change',async()=>{
  const s=server(),pc=client(s,{key:false,blocked:true});await pc.start();
  pc.store.set('A',true);assert.equal(pc.store.getPending().A,true);
  assert(pc.messages.at(-1).includes('이번 화면'));
  assert.equal(await pc.store.saveToken('test-key'),false);
});
