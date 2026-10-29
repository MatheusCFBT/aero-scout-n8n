import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { createWorkflows } from '../scripts/workflow/definition.mjs';

function execute(name, items, context) {
  const code = createWorkflows().query.nodes.find(n => n.name === name).parameters.jsCode;
  const fn = new Script('(async function($input, $, $now) {' + code + '\n})').runInNewContext({Buffer});
  return fn({all:()=>items},()=>({itemMatching:()=>({json:context})}),{});
}
function page(cards) {
 return {cards, headings:`${cards.length} ofertas saindo de GRU para viagem de 3-14 dias nos próximos 6 meses`,
 bodyText:cards.length?'Ofertas':'Nenhuma oferta encontrada para sua pesquisa',
 tripType:'Ida e volta',cabin:'Econômica',passengers:'1 passageiro',currency:'BRL',originLabel:'GRU'};
}
for (const scenario of ['cards','empty','failure']) {
 test('generated card metadata discards full HTML: '+scenario, async()=>{
  const context={data:'x'.repeat(1024*1024),statusCode:scenario==='failure'?503:200,error:null,origin:'GRU',category:'nacionais',attempt:1};
  const raw=page(scenario==='cards'?Array(50).fill('<div>Oferta</div>'):[]);
  const before=structuredClone({raw,context});
  const output=await execute('Separar cards',[{json:raw}],context);
  assert.equal(output.length,scenario==='cards'?50:1);
  for (const item of output) {
   assert.equal(Object.hasOwn(item.json.meta,'data'),false);
   assert.equal(item.json.meta.origin,'GRU');
   assert.equal(item.pairedItem.item,0);
   assert.equal(item.json.hasCard,scenario==='cards');
   assert.equal(item.json.meta.status,scenario==='failure'?'failed':'complete');
   if(scenario==='failure') assert.ok(item.json.meta.warnings.length);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(output))<65536);
  assert.deepEqual({raw,context},before);
 });
}
test('generated retries preserve search context, remove response and do not mutate input',async()=>{
 const context={url:'https://example.test/search',origin:'GRU',category:'nacionais',requestId:'request',startDate:'2027-01-01',endDate:'2027-01-20',attempt:2,data:'x'.repeat(1024*1024),statusCode:503,error:'Falha HTTP'};
 const before=structuredClone(context);
 const output=JSON.parse(JSON.stringify(await execute('Iniciar tentativa',[{json:context}],{})));
 const {data,statusCode,error,...expected}=context;
 assert.deepEqual(output,[{json:{...expected,attempt:3},pairedItem:{item:0}}]);
 assert.deepEqual(context,before);
 const first=await execute('Iniciar tentativa',[{json:{url:'url'}}],{});
 assert.equal(first[0].json.attempt,1);
});
