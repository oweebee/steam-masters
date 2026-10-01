const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, requireFn, extras = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', ...Object.keys(extras), js)(exports, requireFn, ...Object.values(extras));
  return exports;
}
const engine = load('src/lib/escalade.ts', require);
const timing = load('src/lib/battleAnimationTiming.ts', require);
function harness(storage, persistReplay, fresh = false) {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, dirty = false, timerId = 0, tree;
  const react = {
    useRef(value) { const i=cursor++; return slots[i] ??= { current:value }; },
    useState(value) { const i=cursor++; if (!(i in slots)) slots[i]=typeof value==='function'?value():value; return [slots[i], next=>{ const value=typeof next==='function'?next(slots[i]):next; if(!Object.is(slots[i],value)){slots[i]=value;dirty=true;} }]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn,deps) { const i=cursor++; const old=slots[i]; if(!old || !deps || deps.some((v,j)=>!Object.is(v,old.deps[j]))) { slots[i]={deps}; effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();}); } },
  };
  const jsx = (type,props)=>({type,props});
  const { Arena } = load('src/app/bataille/EscaladeClient.tsx', id => id==='react'?react:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:id==='@/lib/escalade'?engine:id==='@/lib/battleAnimationTiming'?timing:id==='./BattlePresentation'?{battlePresentation:new Proxy({}, {get:(_,key)=>String(key)})}:{}, {
    window:{localStorage:storage},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),
  });
  let state=engine.createEscalade(['d2','a4','a5','a6','d1'],['a7','a2','d3','a0','a1'],0);
  if (!fresh) state=engine.playEscalade(state,0,{type:'defend',cardId:'d2'});
  const match={id:'training',challenger:{username:'Moi'},opponent:{username:'Bot'},escalation:engine.publicEscalade(state,0)};
  const render=()=>{let n=0;do{dirty=false;cursor=0;tree=Arena({match,busy:false,act(){},skinMap:{},persistReplay});for(const fn of effects.splice(0))fn();assert.ok(++n<30,'render loop');}while(dirty);};
  render();
  const findClass=className=>{const visit=node=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node))return node.map(visit).find(Boolean) ?? null;if(node.props?.className?.includes(className))return node;return visit(node.props?.children);};return visit(tree);};
  return {intro:()=>findClass('opening'),result:()=>findClass('escalade-splash-overlay'),settle(){state={...state,phase:'FINISHED',winner:0,wins:[2,0],revision:state.revision+1};match.escalation=engine.publicEscalade(state,0);render();},overlay:()=>findClass('escalade-anim-overlay'),story:()=>findClass('escalade-story-card'),move(){state=engine.playEscalade(state,0,{type:'defend',cardId:'d2'});match.escalation=engine.publicEscalade(state,0);render();},finish(){for(const [id,timer] of [...timers].sort((a,b)=>a[1].ms-b[1].ms)){if(timers.delete(id))timer.fn();}render();}};
}
test('new training ignores previous seen revisions and animates its own move',()=>{
  const h=harness({getItem(){return '40';},setItem(){throw Error('training must not persist');}},false);
  assert.match(h.overlay().props.className,/from-self/);
  assert.match(JSON.stringify(h.story()),/poses.*bouclier/);
  h.finish();assert.equal(h.overlay(),null);
});
test('blocked browser storage cannot prevent or stall battle animations',()=>{
  const h=harness({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},true);
  assert.ok(h.overlay());h.finish();assert.equal(h.overlay(),null);
});
test('a stale revision ahead of the match does not suppress replay',()=>{
  const h=harness({getItem(){return '99';},setItem(){}},true);
  assert.ok(h.overlay());h.finish();assert.equal(h.overlay(),null);
});
test('multi-card attacks reserve one visible strike interval per card',()=>{
  const one=timing.battleAnimationTiming(1), four=timing.battleAnimationTiming(4);
  assert.equal(four.flightDelay-one.flightDelay,3*timing.CARD_ATTACK_GAP_MS);
  assert.ok(four.completeAt>one.completeAt);
});
test('opening survives a polled turn change, then releases queued replay',()=>{
  const h=harness({getItem(){return '0';},setItem(){}},false,true);
  assert.ok(h.intro());
  h.move();
  assert.ok(h.intro());assert.equal(h.overlay(),null);
  h.finish();assert.equal(h.intro(),null);assert.ok(h.overlay());
  h.finish();assert.equal(h.overlay(),null);
});
test('resuming an existing round does not announce a new opening',()=>{
  const h=harness({getItem(){return '0';},setItem(){}},false);
  assert.equal(h.intro(),null);assert.ok(h.overlay());
});
test('match result waits for the last replay and its breathing interval',()=>{
  const h=harness({getItem(){return '0';},setItem(){}},false);
  h.settle();assert.equal(h.result(),null);
  h.finish();assert.equal(h.overlay(),null);assert.equal(h.result(),null);
  h.finish();assert.ok(h.result());
});
test('result uses the native modal layer and Escape acknowledges it',()=>{
  let effect, opened=0, closed=0, acknowledged=0, prevented=false;
  const dialog={open:false,showModal(){this.open=true;opened++;},close(){this.open=false;closed++;}};
  const jsx=(type,props)=>({type,props});
  const {BattleResultDialog}=load('src/app/bataille/BattlePresentation.tsx',id=>
    id==='react'?{useRef:()=>({current:dialog}),useEffect:fn=>{effect=fn;}}:
    id==='react/jsx-runtime'?{jsx,jsxs:jsx}:{default:{resultDialog:'resultDialog'}});
  const tree=BattleResultDialog({className:'escalade-splash-overlay',children:null,onAcknowledge(){acknowledged++;}});
  assert.equal(tree.type,'dialog');
  const cleanup=effect();assert.equal(opened,1);
  tree.props.onCancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(acknowledged,1);
  cleanup();assert.equal(closed,1);
});
