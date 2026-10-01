const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const engineModule = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/escalade.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(engineModule.exports);
const { TACTICS, DRAFT_BUDGET, MAX_ATTACK_POWER, abilityCost, abilityLayoutForSeed, draftHand, handCost, attackPower, createEscalade, playEscalade, publicEscalade } = engineModule.exports;
const a = ['d2','a4','a5','a6','d1'];
const b = ['a7','a2','d3','a0','a1'];
const begin = () => createEscalade(a,b,0);
test('draft rejects duplicates, forged cards, wrong length and missing defense', () => {
  for (const ids of [null, [], ['d0','d0','a1','a2','a3'], ['x','a1','a2','a3','d0'], ['a0','a1','a2','a3','a4']]) assert.throws(() => draftHand(ids));
  assert.equal(draftHand(a).length,5);
});
test('pair, suite, non-stacking bonuses and single pierce', () => {
  const cards = (...ids) => ids.map(id => TACTICS.find(c => c.id === id));
  assert.deepEqual(attackPower(cards('a0','a1')), {raw:3,bonus:3,pierce:4});
  assert.deepEqual(attackPower(cards('a0','a1','a2','a3')), {raw:7,bonus:5,pierce:4});
  assert.throws(() => attackPower(cards('d0')));
});
test('tutorial plays real engine, wins one round only, next draft stays secret', () => {
  let s = createEscalade(['d2','d1','a7','a8','a9'],['d2','a4','a0','a1','a2'],0);
  for(const [side,action] of [[0,{type:'defend',cardId:'d2'}],[1,{type:'attack',cardIds:['a4']}],[1,{type:'attack',cardIds:['a0','a1']}],[1,{type:'defend',cardId:'d2',useAbility:true}],[0,{type:'attack',cardIds:['a7','a8','a9']}],[0,{type:'defend',cardId:'d1'}],[1,{type:'cede'}]]) s=playEscalade(s,side,action);
  assert.deepEqual(s.hp,[20,11]); assert.deepEqual(s.wins,[1,0]); assert.equal(s.phase,'DRAFT'); assert.equal(s.starter,1);
  s=playEscalade(s,0,{type:'draft',cardIds:a});
  assert.throws(()=>playEscalade(s,0,{type:'draft',cardIds:b}));
  const view=publicEscalade(s,1); assert.equal(view.hand.length,0); assert.equal('hands' in view,false);
  s=playEscalade(s,1,{type:'draft',cardIds:b}); assert.equal(s.phase,'OPEN'); assert.equal(s.turn,1); assert.deepEqual(s.hp,[20,20]);
});
test('steam is server-authoritative, capped, and only a played card can activate one ability', () => {
  let s=createEscalade(['d2','d1','a7','a8','a9'],['d3','a4','a0','a1','a2'],0);
  s=playEscalade(s,0,{type:'defend',cardId:'d2'});
  const snapshot=JSON.stringify(s);
  assert.throws(()=>playEscalade(s,1,{type:'attack',cardIds:['a4'],abilityCardId:'a4'}),/vapeur/);
  assert.equal(JSON.stringify(s),snapshot);
  s=playEscalade(s,1,{type:'attack',cardIds:['a4']});
  assert.equal(s.pressure[1],1);
  assert.throws(()=>playEscalade(s,1,{type:'attack',cardIds:['a0','a1'],abilityCardId:'a9'}),/carte jouée/);
  s=playEscalade(s,1,{type:'attack',cardIds:['a0','a1']});
  assert.equal(s.pressure[1],3);
  s=playEscalade(s,1,{type:'defend',cardId:'d3',useAbility:true});
  assert.equal(s.pressure[1],0); assert.equal(s.hp[1],20); assert.equal(s.lastAction.ability,'SOUPAPE');
});
test('shared round event modifies both players and old persisted matches migrate safely', () => {
  let s=begin(); s.event='METAL_FRAGILE';
  s=playEscalade(s,0,{type:'defend',cardId:'d2'}); assert.equal(s.line.remaining,13);
  const old=begin(); delete old.pressure; delete old.event; old.version=1;
  const view=publicEscalade(old,0); assert.deepEqual(view.pressure,[0,0]); assert.ok(view.event); assert.equal(view.version,3);
});
test('invalid turn, replay and forged attacks leave input untouched', () => {
  const s=begin(), snapshot=JSON.stringify(s);
  assert.throws(()=>playEscalade(s,1,{type:'defend',cardId:'d3'}));
  assert.throws(()=>playEscalade(s,0,{type:'pass'}));
  const next=playEscalade(s,0,{type:'defend',cardId:'d2'});
  assert.equal(JSON.stringify(s),snapshot);
  assert.throws(()=>playEscalade(next,1,{type:'attack',cardIds:['a7','a7']}));
  assert.throws(()=>playEscalade(next,1,{type:'attack',cardIds:['a9']}));
});
test('public action history preserves every consecutive move for asynchronous replay', () => {
  let s=begin();
  s=playEscalade(s,0,{type:'defend',cardId:'d2'});
  s=playEscalade(s,1,{type:'attack',cardIds:['a2']});
  s=playEscalade(s,1,{type:'attack',cardIds:['a0','a1']});
  const view=publicEscalade(s,0);
  assert.deepEqual(view.actionHistory.map(entry=>entry.revision),[1,2,3]);
  assert.deepEqual(view.actionHistory.map(entry=>entry.action.type),['defend','attack','attack']);
  assert.equal(view.actionHistory[1].action.side,1);
  assert.deepEqual(view.actionHistory[1].damage.find(hit=>hit.kind==='def'),{side:0,amount:3,kind:'def'});
  assert.equal(view.actionHistory.flatMap(entry=>entry.damage).filter(hit=>hit.kind==='hp' && hit.side===1).reduce((sum,hit)=>sum+hit.amount,0),20-s.hp[1]);
  assert.equal('hands' in view,false);
});
test('erosion ignores pierce only for break threshold, defender pass automatic', () => {
  let s=createEscalade(['d4','a4','a5','a6','d1'],b,0);
  s=playEscalade(s,0,{type:'defend',cardId:'d4'});
  s=playEscalade(s,1,{type:'attack',cardIds:['a2']});
  assert.equal(s.line.remaining,19); assert.equal(s.turn,1);
});
test('final defense resolves even with empty hands and only second win settles match', () => {
  let s=begin(); s.wins=[1,0]; s.hands=[draftHand(a).filter(c=>c.id==='d1'),[]];
  s=playEscalade(s,0,{type:'defend',cardId:'d1'});
  assert.equal(s.phase,'FINISHED'); assert.equal(s.winner,0); assert.deepEqual(s.wins,[2,0]); assert.deepEqual(s.hp,[20,8]);
  assert.deepEqual(s.actionHistory.at(-1).damage,[{side:1,amount:12,kind:'hp'}]);
  assert.throws(()=>playEscalade(s,0,{type:'defend',cardId:'d1'}));
});
test('no further defenses ends round; equal HP and equal remaining attack is a drawn round', () => {
  let s=begin(); s.phase='RELAY'; s.hands=[[{id:'d1',kind:'DEFENSE',value:12}],[]];
  s=playEscalade(s,0,{type:'pass'}); assert.equal(s.phase,'DRAFT'); assert.deepEqual(s.wins,[0,0]);
});
test('zero-damage concession consumes attacks and yields only the current line', () => {
  let s=begin(); s=playEscalade(s,0,{type:'defend',cardId:'d2'}); s.line.remaining=1;
  s=playEscalade(s,1,{type:'cede'}); assert.deepEqual(s.hp,[20,20]); assert.deepEqual(s.wins,[0,0]); assert.equal(s.phase,'OPEN'); assert.equal(s.turn,1); assert.equal(s.hands[1].some(c=>c.kind==='ATTACK'),false);
});

test('seeded power deals are deterministic, shared and draft budget blocks dominant hands', () => {
  const one=abilityLayoutForSeed(123456,1), same=abilityLayoutForSeed(123456,1), next=abilityLayoutForSeed(123456,2);
  assert.deepEqual(one,same); assert.notDeepEqual(one,next);
  assert.equal(Object.values(one).length,15);
  assert.throws(()=>draftHand(['d4','a6','a7','a8','a9'],one,DRAFT_BUDGET),/budget/);
  assert.throws(()=>draftHand(['d0','d1','d2','d3','d4'],one,DRAFT_BUDGET),/attaque/);
  const legal=draftHand(['d2','a3','a4','a5','a6'],one,DRAFT_BUDGET);
  assert.equal(handCost(legal),DRAFT_BUDGET);
  const state=createEscalade(['d2','a3','a4','a5','a6'],['d2','a3','a4','a5','a6'],0,123456,DRAFT_BUDGET);
  assert.equal(state.hands[0][0].ability,state.hands[1][0].ability);
});

test('attack regulator caps oversized combos', () => {
  let s=createEscalade(['d2','d1','a4','a5','a6'],['d1','a7','a8','a9','a0'],0);
  s=playEscalade(s,0,{type:'defend',cardId:'d2'});
  s=playEscalade(s,1,{type:'attack',cardIds:['a7','a8','a9']});
  assert.equal(s.lastAction.power,MAX_ATTACK_POWER);
});

test('direct damage, burn, mirror and accumulator powers alter combat authoritatively', () => {
  let direct=createEscalade(['d2','d1','a7','a8','a9'],['d3','a4','a0','a1','a2'],0);
  direct.abilityLayout.a4='COURT_CIRCUIT'; direct.pressure[1]=4;
  direct=playEscalade(direct,0,{type:'defend',cardId:'d2'});
  direct=playEscalade(direct,1,{type:'attack',cardIds:['a4'],abilityCardId:'a4'});
  assert.equal(direct.hp[0],18); assert.equal(direct.lastAction.ability,'COURT_CIRCUIT');

  let burn=createEscalade(['d2','d1','a7','a8','a9'],['d3','a4','a0','a1','a2'],0);
  burn.abilityLayout.a4='INCENDIE'; burn.pressure[1]=4;
  burn=playEscalade(burn,0,{type:'defend',cardId:'d2'});
  burn=playEscalade(burn,1,{type:'attack',cardIds:['a4'],abilityCardId:'a4'});
  burn=playEscalade(burn,1,{type:'attack',cardIds:['a0','a1']});
  burn=playEscalade(burn,1,{type:'defend',cardId:'d3'});
  burn=playEscalade(burn,0,{type:'attack',cardIds:['a7']});
  assert.equal(burn.burn[0],1);
  burn=playEscalade(burn,0,{type:'attack',cardIds:['a8']});
  assert.equal(burn.burn[0],0); assert.equal(burn.hp[0],14);

  let mirror=createEscalade(['d2','d1','a7','a8','a9'],['d3','a4','a0','a1','a2'],0);
  mirror.abilityLayout.d2='MIROIR'; mirror.pressure[0]=3;
  mirror=playEscalade(mirror,0,{type:'defend',cardId:'d2',useAbility:true});
  mirror=playEscalade(mirror,1,{type:'attack',cardIds:['a4']});
  assert.equal(mirror.hp[1],16);

  let accumulator=createEscalade(['d0','d1','a7','a8','a9'],['d3','a9','a0','a1','a2'],0);
  accumulator.abilityLayout.d0='ACCUMULATEUR'; accumulator.pressure[0]=2;
  accumulator=playEscalade(accumulator,0,{type:'defend',cardId:'d0',useAbility:true});
  accumulator=playEscalade(accumulator,1,{type:'attack',cardIds:['a9']});
  assert.equal(accumulator.pressure[0],4);
});

// Reproducible self-play: strategies see only their own hand and public line.
let seed=42831; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/2**32;};
function hand(){const pool=[...TACTICS]; for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]];} const ids=pool.slice(0,5).map(c=>c.id); return valid(ids)?ids:hand();}
function valid(ids){try{draftHand(ids,undefined,DRAFT_BUDGET);return true;}catch{return false;}}
function choose(s){
 const cards=s.hands[s.turn];
 if(s.phase==='OPEN'||s.phase==='RELAY'){
  const card=cards.filter(c=>c.kind==='DEFENSE').sort((a,b)=>b.value-a.value)[0];
  const useful=card.ability!=='SOUPAPE'||s.hp[s.turn]<20;
  return {type:'defend',cardId:card.id,...(useful&&s.pressure[s.turn]>=abilityCost(card.ability,s.event)?{useAbility:true}:{})};
 }
 const atk=cards.filter(c=>c.kind==='ATTACK'); const choices=[];
 for(let mask=1;mask<(1<<atk.length);mask++){
  const part=atk.filter((_,i)=>mask&(1<<i)); const p=attackPower(part);
  const variants=[null,...part.filter(card=>s.pressure[s.turn]>=abilityCost(card.ability,s.event))];
  for(const abilityCard of variants){const ability=abilityCard?.ability;const power=Math.min(MAX_ATTACK_POWER,p.raw+p.bonus+(ability==='SURCHARGE'?2:0));const pierce=p.pierce+(ability==='PERCUSSION'?2:0);if(power>=Math.max(0,s.line.remaining-pierce))choices.push({part,abilityCard,cost:part.length*100+p.raw-(ability?1:0)});}
 }
 choices.sort((a,b)=>a.cost-b.cost);
 if(choices.length)return {type:'attack',cardIds:choices[0].part.map(c=>c.id),...(choices[0].abilityCard?{abilityCardId:choices[0].abilityCard.id}:{})};
 const strongest=[...atk].sort((x,y)=>y.value-x.value)[0];
 if(strongest){const activate=s.pressure[s.turn]>=abilityCost(strongest.ability,s.event);return {type:'attack',cardIds:[strongest.id],...(activate?{abilityCardId:strongest.id}:{})};}
 return {type:'cede'};
}
if (process.env.ESCALADE_BALANCE === '1') {
 const styles={fortress:['d0','d1','d2','d3','d4'],heavy:['d4','a6','a7','a8','a9'],balanced:['d1','d2','a4','a5','a6'],pierce:['d4','d0','a0','a5','a9'],run:['d3','d1','a4','a5','a6']};
 for(const [name,ids] of Object.entries(styles)) {
  let wins=0,losses=0,draws=0;
  for(let i=0;i<1000;i++) {
   if(!valid(ids)) continue;
   let s=createEscalade(ids,hand(),i%2,1000+i,DRAFT_BUDGET),steps=0;
   while(!['DRAFT','FINISHED'].includes(s.phase)&&steps++<30)s=playEscalade(s,s.turn,choose(s));
   if(s.wins[0])wins++;else if(s.wins[1])losses++;else draws++;
  }
  console.log(JSON.stringify({style:name,wins,losses,draws}));
 }
}
test('seeded full-match simulations terminate, preserve HP bounds and winner needs two wins', () => {
 let first=0,second=0,rounds=0,moves=0;
 for(let i=0;i<4000;i++){
  const starter=i%2; let s=createEscalade(hand(),hand(),starter,70000+i,DRAFT_BUDGET), steps=0;
  while(s.phase!=='FINISHED'&&steps<300){
   if(s.phase==='DRAFT'){s=playEscalade(s,0,{type:'draft',cardIds:hand()});s=playEscalade(s,1,{type:'draft',cardIds:hand()});}
   else s=playEscalade(s,s.turn,choose(s));
   assert.ok(s.hp.every(hp=>hp>=0&&hp<=20)); steps++;
  }
  assert.equal(s.phase,'FINISHED'); assert.equal(s.wins[s.winner],2);
  if(s.winner===starter)first++;else second++;rounds+=s.round;moves+=steps;
 }
 console.log(JSON.stringify({simulation:'4000 mirrored-seat matches, random legal drafts, identical public-information greedy strategy',firstOpenerWinPercent:first/40,secondOpenerWinPercent:second/40,meanRounds:rounds/4000,meanActions:moves/4000}));
});

if (process.env.ESCALADE_TEST_DATABASE_URL) test('PostgreSQL/API: private drafts, two wins, atomic stakes, replay and permissions', async () => {
  const url = new URL(process.env.ESCALADE_TEST_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname === '/steammasters_test');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources:{ db:{url:url.toString()} } });
  let userId='escalade-a';
  const mocks={'@/lib/prisma':{prisma:db},'@/auth':{auth:async()=>({user:{id:userId,role:'USER'}})},'@/lib/battleNotify':{notifyBattle:async()=>{}}};
  const cache=new Map();
  function load(file){
    if(cache.has(file))return cache.get(file).exports;
    const mod={exports:{}}; cache.set(file,mod);
    const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const req=name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load(path.resolve(__dirname,'../src',name.slice(2)+'.ts')):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name);
    new Function('require','module','exports',source)(req,mod,mod.exports);return mod.exports;
  }
  const collection=load(path.resolve(__dirname,'../src/app/api/bataille/route.ts'));
  const individual=load(path.resolve(__dirname,'../src/app/api/bataille/[id]/route.ts'));
  const req=body=>new Request('http://localhost/api/bataille',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let matchId;
  const post=body=>individual.POST(req(body),{params:Promise.resolve({id:matchId})});
  const get=async()=> (await (await collection.GET()).json()).battles.find(m=>m.id===matchId);
  const defenseHand=['d0','d1','d2','d3','d4'];
  try {
    for(const [id,name] of [['escalade-a','Alice'],['escalade-b','Bob'],['escalade-outsider','Charlie']]) await db.user.create({data:{id,username:name,email:`${id}@example.invalid`,password:'test-only',status:'ACTIVE',coins:100}});
    await db.steamGame.create({data:{id:'escalade-game',name:'Test wager',description:'',headerImage:'/test.png',reviewScore:90,peakCcu:0,ownerEstimate:1000,atk:9,def:12,rarity:'COMMON',tags:[],developers:[]}});
    for(const who of ['a','b'])await db.card.create({data:{id:`escalade-card-${who}`,userId:`escalade-${who}`,gameId:'escalade-game',atk:9,rarity:'COMMON'}});
    const created=await collection.POST(req({opponentId:'escalade-b',cardIds:defenseHand,stakeCoins:3,stakeCardId:'escalade-card-a'}));
    assert.equal(created.status,201);matchId=(await created.json()).id;
    assert.equal((await db.user.findUnique({where:{id:userId}})).coins,97);
    userId='escalade-b'; let view=await get(); assert.deepEqual(view.challengerDeck,[]);assert.equal(view.draft,null);assert.equal('escalationState' in view,false);
    assert.equal((await post({action:'accept',cardIds:['bad'],stakeCoins:7})).status,400);
    assert.equal((await db.user.findUnique({where:{id:userId}})).coins,100);
    assert.equal((await post({action:'accept',cardIds:defenseHand,stakeCoins:3,stakeCardId:'escalade-card-b'})).status,200);
    const repeatedAccept=await post({action:'accept',cardIds:defenseHand,stakeCoins:3});assert.equal(repeatedAccept.status,400);
    userId='escalade-outsider';assert.equal((await post({action:'play',revision:0,move:{type:'defend',cardId:'d4'}})).status,400);
    assert.equal((await get()),undefined);
    let staleMove;
    for(let round=0;round<3;round++){
      userId='escalade-a';view=await get(); const state=view.escalation;
      assert.equal('hands' in state,false);assert.deepEqual(view.challengerDeck,[]);
      if(state.phase==='DRAFT') {
        assert.equal((await post({action:'play',revision:state.revision,move:{type:'draft',cardIds:defenseHand}})).status,200);
        userId='escalade-b';view=await get();assert.equal(view.escalation.hand.length,0);
        assert.equal((await post({action:'play',revision:view.escalation.revision,move:{type:'draft',cardIds:defenseHand}})).status,200);
      }
      userId='escalade-a';view=await get();userId=view.escalation.turn===0?'escalade-a':'escalade-b';
      staleMove={action:'play',revision:view.escalation.revision,move:{type:'defend',cardId:'d4'}};
      assert.equal((await post(staleMove)).status,200);
      assert.equal((await post(staleMove)).status,400);
      const row=await db.battle.findUnique({where:{id:matchId}});
      if(round<2){assert.equal(row.status,'ACTIVE');assert.equal(await db.battleReward.count({where:{battleId:matchId}}),0);assert.equal((await db.user.findUnique({where:{id:'escalade-a'}})).coins,97);assert.equal((await db.card.findUnique({where:{id:'escalade-card-a'}})).userId,'escalade-a');}
      else {assert.equal(row.status,'FINISHED');assert.equal(Math.max(row.challengerScore,row.opponentScore),2);assert.equal(await db.battleReward.count({where:{battleId:matchId}}),2);assert.equal((await db.user.findUnique({where:{id:row.winnerId}})).coins,106);assert.equal((await db.card.findUnique({where:{id:'escalade-card-a'}})).userId,row.winnerId);assert.equal((await db.card.findUnique({where:{id:'escalade-card-b'}})).userId,row.winnerId);}
    }
    assert.equal((await post(staleMove)).status,400);
    // Pending cancellation refunds exactly once.
    userId='escalade-a'; const cancelled=await collection.POST(req({opponentId:'escalade-b',cardIds:defenseHand,stakeCoins:5}));assert.equal(cancelled.status,201);matchId=(await cancelled.json()).id;
    const before=(await db.user.findUnique({where:{id:userId}})).coins;
    assert.equal((await post({action:'cancel'})).status,200);assert.equal((await post({action:'cancel'})).status,400);
    assert.equal((await db.user.findUnique({where:{id:userId}})).coins,before+5);
  } finally { await db.$disconnect(); }
});
