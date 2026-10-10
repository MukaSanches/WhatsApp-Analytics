'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  readChatListInPage, readMessagesInPage,
  readCompatibleChats, readCompatibleMessages
} = require('../wa-compat.cjs');

function fakePage(chats, loader) {
  const window = {
    require(name) {
      if (name === 'WAWebCollections') return { Chat: { getModelsArray: () => chats } };
      if (name === 'WAWebChatLoadMessages') return { loadEarlierMsgs: loader || (async () => []) };
      return undefined;
    }
  };
  return { evaluate(fn, ...args) { return vm.runInNewContext(`(${fn.toString()})`, { window })(...args); } };
}
const asNative = x => JSON.parse(JSON.stringify(x));

test('lista chats com ID antigo, $1 e LID, sem serializar os modelos', async () => {
  const list = [
    { id:{ _serialized:'5511999990000@c.us' }, name:'Alice', unreadCount:2, serialize(){throw new Error('r: r');} },
    { id:{ $1:'874@lid' }, formattedTitle:'Contato LID' },
    { id:{ _serialized:'123@g.us' }, formattedTitle:'Grupo', isGroup:undefined },
    { id:{ _serialized:'status@broadcast' } },
    { id:{ $1:'2@newsletter' } },
    { id:null },
    { get id() {throw new Error('modelo defeituoso');} }
  ];
  const result = asNative(await readCompatibleChats({pupPage:fakePage(list)}));
  assert.equal(result.length,3);
  assert.deepEqual(result.map(x=>x.name),['Alice','Contato LID','Grupo']);
  assert.equal(result[2].isGroup,true);
  assert.equal(result[0].unread,2);
});

test('mensagens em cache suportam campo $1 e autoria própria', async () => {
  const chat = { id:{$1:'chat@c.us'}, msgs:{getModelsArray:()=>[
    {id:{$1:'m1',fromMe:true},t:1800000100,body:'Olá'},
    {id:{_serialized:'m2'},t:1800000200,body:'Bom dia',fromMe:false,author:{$1:'user@lid'}}
  ]} };
  const result=asNative(await readCompatibleMessages({pupPage:fakePage([chat])}, 'chat@c.us',400));
  assert.equal(result.messages.length,2);
  assert.equal(result.messages[0].id,'m1');
  assert.equal(result.messages[0].fromMe,true);
  assert.equal(result.messages[1].author,'user@lid');
  assert.equal(result.incomplete,false);
});

test('paginação acrescenta mensagens antigas sem duplicar', async () => {
  let count=0;
  const chat = {id:{_serialized:'chat@c.us'},msgs:{getModelsArray:()=>[
    {id:{_serialized:'m2'},t:1800000200,body:'Novo'}
  ]}};
  const load=async()=> (++count===1 ? [{id:{_serialized:'m1'},t:1800000100,body:'Antigo'}] : []);
  const result=asNative(await readCompatibleMessages({pupPage:fakePage([chat],load)},'chat@c.us',400));
  assert.deepEqual(result.messages.map(m=>m.id),['m1','m2']);
  assert.equal(count,2);
});

test('falha ao carregar histórico indica parcial, sem apagar mensagens já obtidas',async()=>{
  const chat={id:{_serialized:'chat@c.us'},msgs:{getModelsArray:()=>[{id:{$1:'x'},t:1800000010,body:'Disponível'}]}};
  const page=fakePage([chat],async()=>{throw new Error('t: t');});
  const result=asNative(await readCompatibleMessages({pupPage:page},'chat@c.us',400));
  assert.equal(result.messages.length,1);
  assert.equal(result.incomplete,true);
  assert.match(result.partialReason,/não liberou mais histórico/i);
});

test('coleção indisponível sinaliza erro explícito',()=>{
  assert.throws(()=>readChatListInPage.call(null), /window is not defined/);
});

test('cliente sem página é rejeitado explicitamente',async()=>{
  await assert.rejects(()=>readCompatibleChats({}), /Navegador do WhatsApp/);
});