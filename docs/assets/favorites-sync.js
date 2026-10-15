(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StoryFavoritesSync=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const REPO='https://api.github.com/repos/Dollars-Archive/Game-Story-Library';
  const CONTENT=REPO+'/contents/docs/data/favorites.json';
  const BRANCH='watchlist-data',TOKEN_KEY='story-library-editor-token-v1';
  const DISCOVERY_KEY='discovery-watchlist-token-v1',OWNER_ID=314692476;
  const empty=()=>({version:1,libraries:{retro:{},'switch-vita':{}}});
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  function normalize(input){
    if(!input||input.version!==1||!input.libraries||typeof input.libraries!=='object')throw Error('찜 목록 형식 오류');
    const out=empty();
    for(const library of Object.keys(out.libraries)){
      const items=input.libraries[library];
      if(!items||typeof items!=='object'||Array.isArray(items))throw Error('찜 목록 형식 오류');
      for(const [id,value] of Object.entries(items)){
        if(!validId(id)||typeof value!=='boolean')throw Error('찜 항목 형식 오류');
        out.libraries[library][id]=value;
      }
    }
    return out;
  }
  const encode=value=>btoa(unescape(encodeURIComponent(JSON.stringify(value,null,2)+'\n')));
  const decode=value=>JSON.parse(decodeURIComponent(escape(atob(value.replace(/\s/g,'')))));
  function createStore({library,ids,storage,fetcher,apply,status=()=>{},encodeData=encode,decodeData=decode}){
    if(!['retro','switch-vita'].includes(library))throw Error('Unknown library');
    const known=new Set(ids),prefix='story-favorites-sync-v1-'+library;
    let remote=empty(),ready=false,verified='',busy=false,rerun=false,epoch=0;
    let pending={},legacy=[],imported=false;
    const readLocal=(key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback}catch{return fallback}};
    const writeLocal=(key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true}catch{return false}};
    const cached=readLocal(prefix+'-cache',null);
    if(cached)try{remote=normalize(cached)}catch{}
    const saved=readLocal(prefix+'-pending',{});
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [id,v] of Object.entries(saved))if(known.has(id)&&typeof v==='boolean')pending[id]=v;
    imported=readLocal(prefix+'-imported',false)===true;
    function token(){try{const own=storage.getItem(TOKEN_KEY);return own==='disabled'?'':own||storage.getItem(DISCOVERY_KEY)||''}catch{return ''}}
    function headers(value=''){return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(value?{Authorization:'Bearer '+value}:{})}}
    async function request(url,options={}){
      return fetcher(url,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
    }
    function persist(){return writeLocal(prefix+'-pending',pending)}
    function display(){
      const items={...remote.libraries[library],...pending};
      // Import an old browser's saved choices once, without reviving remote removals.
      if(!imported)for(const id of legacy)if(!(id in items))items[id]=true;
      apply(Object.keys(items).filter(id=>known.has(id)&&items[id]));
    }
    function importLegacy(){
      if(imported||!ready||!verified)return;
      for(const id of legacy)if(!(id in remote.libraries[library])&&!(id in pending))pending[id]=true;
      // Keep migration pending until the legacy choices have reached GitHub.
      persist();
    }
    async function read(){
      const response=await request(CONTENT+'?ref='+BRANCH+'&_='+Date.now(),{headers:headers(verified&&verified===token()?verified:'')});
      if(!response.ok)throw Error('GitHub 찜 목록을 불러오지 못했습니다');
      const payload=await response.json();
      if(payload.encoding!=='base64'||!payload.sha||typeof payload.content!=='string')throw Error('GitHub 응답 형식 오류');
      return {data:normalize(decodeData(payload.content)),sha:payload.sha};
    }
    async function verify(value){
      verified='';
      if(!value)return false;
      const user=await request('https://api.github.com/user',{headers:headers(value)});
      if(!user.ok||(await user.json()).id!==OWNER_ID)return false;
      const repo=await request(REPO,{headers:headers(value)});
      if(!repo.ok||!(await repo.json()).permissions?.push)return false;
      if(value!==token())return false;
      verified=value;return true;
    }
    async function flush(){
      if(busy){rerun=true;return false}
      if(!ready||!verified||verified!==token())return false;
      busy=true;const currentEpoch=epoch,currentToken=verified;
      try{
        for(let attempt=0;attempt<3;attempt++){
          const latest=await read();
          if(currentEpoch!==epoch||currentToken!==token())return false;
          remote=latest.data;importLegacy();
          const changes={...pending};
          if(!Object.keys(changes).length){
            imported=true;writeLocal(prefix+'-imported',true);writeLocal(prefix+'-cache',remote);display();
            status('GitHub 찜 동기화 완료');return true;
          }
          const next=normalize(remote);
          Object.assign(next.libraries[library],changes);
          const response=await request(CONTENT,{method:'PUT',headers:{...headers(currentToken),'Content-Type':'application/json'},body:JSON.stringify({branch:BRANCH,sha:latest.sha,message:'chore(favorites): '+library+' 찜 목록 갱신',content:encodeData(next)})});
          if(response.status===409)continue;
          if(!response.ok){if(response.status===401||response.status===403)verified='';throw Error('save failed')}
          if(currentEpoch!==epoch)return false;
          remote=next;
          for(const [id,value] of Object.entries(changes))if(pending[id]===value)delete pending[id];
          imported=true;writeLocal(prefix+'-imported',true);persist();writeLocal(prefix+'-cache',remote);display();
          status(Object.keys(pending).length?'추가 변경 저장 대기 중':'GitHub 찜 동기화 완료');
          return true;
        }
        throw Error('conflict');
      }catch{
        status('GitHub 저장 실패 · 찜은 이 기기에 보관 중입니다. 새로고침으로 다시 시도하세요.');return false;
      }finally{
        busy=false;
        if(rerun){rerun=false;void flush()}
      }
    }
    async function refresh(initial=[]){
      legacy=[...initial].filter(id=>known.has(id));
      try{
        const latest=await read();remote=latest.data;ready=true;writeLocal(prefix+'-cache',remote);
        const value=token();
        if(value&&verified!==value)try{await verify(value)}catch{verified=''}
        importLegacy();display();
        if(verified){status('GitHub 찜 동기화 중');await flush()}
        else status(value?'찜 불러옴 · 열쇠의 소유자·Game-Story-Library 쓰기 권한을 확인하세요.':'GitHub 찜 불러옴 · 열쇠 없이 한 변경은 이 기기에 보관합니다.');
        return true;
      }catch{status('GitHub 연결 실패 · 기존 찜을 유지합니다. 새로고침으로 다시 시도하세요.');return false}
    }
    function set(id,selected){
      if(!known.has(id)||typeof selected!=='boolean')return;
      pending[id]=selected;
      const saved=persist();
      status(saved?'찜을 이 기기에 저장했습니다.':'브라우저 저장 불가 · 이번 화면에서만 유지됩니다.');
      if(verified&&verified===token())void flush();
    }
    async function saveToken(value,initial=[]){
      epoch++;verified='';
      const trimmed=value.trim();
      try{storage.setItem(TOKEN_KEY,trimmed)}catch{status('열쇠를 이 브라우저에 저장할 수 없습니다.');return false}
      if(!trimmed){status('이 기기의 서재 열쇠를 비웠습니다.');return false}
      try{
        if(!await verify(trimmed)){status('소유자 또는 Game-Story-Library 쓰기 권한이 없습니다.');return false}
        status('열쇠 확인 완료');return await refresh(initial);
      }catch{status('열쇠 확인 실패 · 네트워크와 권한을 확인하세요.');return false}
    }
    function clearToken(){
      epoch++;verified='';
      // Empty string deliberately blocks discovery-token fallback on this device.
      try{storage.setItem(TOKEN_KEY,'disabled')}catch{}
      status('이 기기의 서재 열쇠 사용을 중지했습니다. 발굴 아카이브 열쇠는 유지됩니다.');
    }
    return {set,refresh,saveToken,clearToken,getPending:()=>({...pending})};
  }
  function boot({library,ids,getFavorites,apply,status}){
    let storage;
    try{storage=window.localStorage}catch{storage={getItem(){return null},setItem(){throw Error('blocked')}}}
    const store=createStore({library,ids,storage,fetcher:window.fetch.bind(window),apply,status});
    const node=id=>document.getElementById(id);
    node('sync-save').onclick=async()=>{
      const input=node('sync-token'),value=input.value;input.value='';
      node('sync-save').disabled=true;
      try{await store.saveToken(value,getFavorites())}finally{node('sync-save').disabled=false}
    };
    node('sync-clear').onclick=()=>{node('sync-token').value='';store.clearToken()};
    node('sync-refresh').onclick=()=>store.refresh(getFavorites());
    window.addEventListener('focus',()=>store.refresh(getFavorites()));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void store.refresh(getFavorites())});
    void store.refresh(getFavorites());
    return store;
  }
  return {createStore,normalize,empty,boot,BRANCH,CONTENT,TOKEN_KEY,DISCOVERY_KEY};
});
