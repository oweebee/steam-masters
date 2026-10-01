const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function harness(fetch){
  const slots=[],effects=[];let cursor=0;
  const react={createContext:()=>({Provider:'provider'}),useRef:v=>{const i=cursor++;return slots[i]??={current:v};},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],n=>{slots[i]=typeof n==='function'?n(slots[i]):n;}];},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(fn);}}};
  const exports={};const jsx=(type,props)=>({type,props});
  const code=ts.transpileModule(fs.readFileSync('src/components/CardWatchControls.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('exports','require','fetch',code)(exports,id=>id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:{default:{}},fetch);
  const render=()=>{cursor=0;const tree=exports.CardWatchScope({children:null});for(const fn of effects.splice(0))fn();return tree.props.value;};
  return{render};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('existing follows load and exact game IDs toggle both ways',async()=>{
  const posts=[];let watching=true;
  const h=harness(async(url,options)=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));watching=!watching;return{ok:true,json:async()=>({watching})};}return{ok:true,json:async()=>[{gameId:'igdb-42',studioId:null}]};});
  h.render();await tick();let state=h.render();assert.ok(state.ids.has('game:igdb-42'));
  await state.toggle({gameId:'igdb-42'});state=h.render();assert.equal(state.ids.has('game:igdb-42'),false);
  await state.toggle({gameId:'igdb-42'});assert.ok(h.render().ids.has('game:igdb-42'));assert.deepEqual(posts,[{gameId:'igdb-42'},{gameId:'igdb-42'}]);
});
test('server rejection leaves existing state intact and exposes an error',async()=>{
  const h=harness(async(url,options)=>options.method==='POST'?{ok:false,json:async()=>({error:'Non connecté'})}:{ok:true,json:async()=>[]});
  h.render();await tick();await h.render().toggle({studioId:'studio-1'});
  const state=h.render();assert.equal(state.ids.size,0);assert.equal(state.error,'Non connecté');assert.equal(state.busy.size,0);
});
test('double click sends only one toggle',async()=>{
  let calls=0,finish;
  const h=harness(async(url,options)=>{if(options.method==='POST'){calls++;await new Promise(resolve=>finish=resolve);return{ok:true,json:async()=>({watching:true})};}return{ok:true,json:async()=>[]};});
  h.render();await tick();const state=h.render();const first=state.toggle({studioId:'s'});await state.toggle({studioId:'s'});assert.equal(calls,1);finish();await first;
});
