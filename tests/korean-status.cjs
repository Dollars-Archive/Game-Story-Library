const {page}=require('./favorites.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
for(const file of ['retro-story-library.html','switch-vita-vn.html']){
 test(`${file}: exposes exactly three status filter choices plus all`,()=>{
  const html=fs.readFileSync(path.join(__dirname,'../docs',file),'utf8');
  const select=html.match(/<select[^>]*id="korean"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/value="([^"]*)"/g)].map(m=>m[1]),[file.startsWith('retro')?'':'all','official','patch','absent']);
 });
 test(`${file}: every language filter uses platform-specific facts in both views`,()=>{
  const h=page(file);h.node('strict').checked=false;
  for(const platform of file.startsWith('retro')?['','PSP','PS2','DS']:['all','switch','vita','both','switchonly','vitaonly']){
   h.node('platform').value=platform;
   for(const k of ['official','patch','absent','unknown']){
    h.node('korean').value=k;h.node('korean').onchange();
    const values=h.run(`filtered.map(r=>r.korean_status[${JSON.stringify({official:'official',patch:'patch',absent:'absent',unknown:'unresolved'}[k])}])`);
    const required=file.startsWith('retro')?(platform?[platform]:[]):platform.startsWith('switch')?['Switch']:platform.startsWith('vita')?['PS Vita']:platform==='both'?['Switch','PS Vita']:[];
    assert(values.every(ps=>required.length?required.some(p=>ps.includes(p)):ps.length));
    const cards=h.node('results').innerHTML;h.node('compact').onclick();assert.equal(h.node('results').innerHTML,cards);h.node('cards').onclick();
   }
  }
 });
 test(`${file}: survey absence is scoped and dated without inventing new evidence`,()=>{
  const h=page(file);h.node('strict').checked=false;
  assert(h.run('works.filter(r=>r.korean_status.absent.length).length')>0);
  assert(h.run('works.every(r=>r.korean_status.absent.every(p=>!r.korean_status.patch.includes(p)&&!r.korean_status.official.includes(p)))'));
  const unknown=h.run('works.find(r=>!r.korean_status.official.length&&!r.korean_status.patch.length).id');
  assert(h.run(`koreanLabels(works.find(r=>r.id===${JSON.stringify(unknown)})).every(s=>s.startsWith('한글 패치 없음'))`));
  h.run(`openDetail(${JSON.stringify(unknown)})`);assert.match(h.node('modalBody').innerHTML,/조사 범위:.*자료 정리일: 2026-10-13/s);
  assert.match(h.node('modalBody').innerHTML,/자료 정리일은 새 개별 조사일이 아닙니다/);
  assert.match(h.node('modalBody').innerHTML,/조사 범위에서 공개 패치를 찾지 못했다/);
  assert(!h.run('works.some(r=>r.korean_status.evidence_checked_on==="2026-10-13")'));
  if(file.startsWith('switch'))assert.match(h.node('modalBody').innerHTML,/이 항목의 개별 확인일은 별도 기록 없음/);
  const known=h.run('works.find(r=>r.korean_status.patch.length).id');h.run(`openDetail(${JSON.stringify(known)})`);assert.match(h.node('modalBody').innerHTML,/한글 패치 있음:/);assert.match(h.node('modalBody').innerHTML,/https?:/);
 });
 test(`${file}: search includes the visible language status and normal title searches remain valid`,()=>{
  const h=page(file);h.node('strict').checked=false;h.node('search').value='정식 한글화';h.node('search').oninput();
  assert(h.run('filtered.length')>0);assert(h.run('filtered.every(r=>r.korean_status.official.length>0)'));
  h.node('reset').onclick();h.node('search').value=file.startsWith('retro')?'메모리즈':'SeaBed';h.node('search').oninput();assert(h.run('filtered.length')>0);
 });
}
test('PC official support and announcements are never attributed to Switch',()=>{
 const h=page('switch-vita-vn.html');
 for(const id of ['VN392','VN450','VN304']){
  assert(h.run(`works.find(r=>r.id==='${id}').korean_status.official.includes('PC')`));
  assert(!h.run(`works.find(r=>r.id==='${id}').korean_status.official.includes('Switch')`));
 }
 assert(h.run("works.find(r=>r.id==='VN434').korean_status.official.includes('Switch')"));
 for(const id of ['VN125','VN126','VN244','VN496'])assert(!h.run(`works.find(r=>r.id==='${id}').korean_status.official.includes('Switch')`));
 assert(h.run("koreanLabels(works.find(r=>r.id==='VN320')).join(' ').includes('PC·PSP')"));
});
test('multi-platform DS patches do not imply PS1/PS2 support',()=>{
 const h=page('retro-story-library.html');
 for(const [id,unsupported] of [['tokyo-majin-ds','PS1'],['tsuki-no-hikari-ds','PS2']]){
  assert(h.run(`works.find(r=>r.id==='${id}').korean_status.patch.includes('DS')`));
  assert(!h.run(`koreanMatches(works.find(r=>r.id==='${id}'),'patch',['${unsupported}'])`));
 }
});
test('a work with official and fan translations shows both',()=>{
 const h=page('switch-vita-vn.html');const labels=h.run("koreanLabels(works.find(r=>r.title_english.startsWith('Tsukihime')))");
 assert(labels.some(t=>t.startsWith('정식 한글화: Switch')));assert(labels.some(t=>t.startsWith('한글 패치 있음: Switch')));
});
