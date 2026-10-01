const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const exportsObject={};
new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/shopDistribution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsObject);
const {shopRarityQuotas,selectShopStock}=exportsObject;
test('50 shop slots respect default percentages with a guaranteed legendary',()=>{
  assert.deepEqual(shopRarityQuotas({LEGENDARY:.5,EPIC:5,RARE:10,UNCOMMON:20,COMMON:64.5},50),{LEGENDARY:1,EPIC:2,RARE:5,UNCOMMON:10,COMMON:32});
});
test('custom admin percentages drive the quotas, including zero legendary override',()=>{
  assert.deepEqual(shopRarityQuotas({LEGENDARY:10,EPIC:10,RARE:20,UNCOMMON:20,COMMON:40},50),{LEGENDARY:5,EPIC:5,RARE:10,UNCOMMON:10,COMMON:20});
  const q=shopRarityQuotas({LEGENDARY:0,EPIC:0,RARE:0,UNCOMMON:0,COMMON:100},50);
  assert.equal(q.LEGENDARY,1);assert.equal(q.COMMON,49);
});
test('eligible rare stock is reserved first and no subject is repeated',()=>{
  const stock=selectShopStock(['legend','common','epic'],{LEGENDARY:1,EPIC:1,RARE:0,UNCOMMON:0,COMMON:1},(c,r)=>r==='LEGENDARY'?c==='legend':r==='EPIC'?c==='epic':true);
  assert.equal(new Set(stock.map(s=>s.candidate)).size,3);assert.equal(stock[0].candidate,'legend');
});
test('an unavailable rarity is redistributed without blocking the rotation',()=>{
  const candidates=Array.from({length:50},(_,i)=>`common-${i}`);
  const stock=selectShopStock(candidates,{LEGENDARY:1,EPIC:2,RARE:5,UNCOMMON:10,COMMON:32},(candidate,rarity)=>rarity==='COMMON');
  assert.equal(stock.length,50);assert.ok(stock.every(item=>item.rarity==='COMMON'));
});
test('only a genuinely insufficient distinct catalogue blocks rotation',()=>{
  assert.throws(()=>selectShopStock(['one'],{LEGENDARY:1,EPIC:0,RARE:0,UNCOMMON:0,COMMON:1},()=>true),/Catalogue insuffisant/);
});
