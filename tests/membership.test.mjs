import test from 'node:test';
import assert from 'node:assert/strict';
import { admissionFields, parseNoteDrop } from '../model.ts';

const names = { date:'scheduled', title:'headline', thread:'project', next:'following' };

test('admitting a calendar note preserves its date, body-related fields and unrelated properties', () => {
  const fm = { scheduled:'2026-10-31', calendar:true, headline:'Reunión', following:['[[Otra]]'], tags:['cliente'] };
  const before=structuredClone(fm);
  assert.deepEqual(admissionFields(fm,names,'2026-10-31'),{planner_type:'entry'});
  assert.deepEqual(fm,before);
});

test('explicit date and thread changes use mapped keys and preserve title and connections', () => {
  assert.deepEqual(admissionFields({scheduled:'2026-10-31',following:['[[Otra]]']},names,'2026-11-01','[[Planner/Threads/Cliente]]'),{planner_type:'entry',scheduled:'2026-11-01',project:'[[Planner/Threads/Cliente]]'});
  assert.deepEqual(admissionFields({planner_type:'entry',scheduled:'2026-10-31',project:'[[Hilo]]'},names,'2026-10-31',''),{planner_type:'entry',project:''});
});

test('thread notes and existing unrelated planner types cannot be overwritten by enrollment', () => {
  for (const planner_type of ['thread','reference',true,['entry']]) assert.throws(()=>admissionFields({planner_type},names,'2026-10-31'));
  for (const date of ['2026-02-30','2026-10-31T12:00:00','']) assert.throws(()=>admissionFields({},names,date));
});

test('native Obsidian file drags accept encoded paths only from the current vault', () => {
  const uri='obsidian://open?vault=%40Nexus-dev&file=Clientes%2FAcme%2FReuni%C3%B3n%20QA.md';
  assert.equal(parseNoteDrop(uri,uri,'@Nexus-dev'),'Clientes/Acme/Reunión QA.md');
  assert.equal(parseNoteDrop('',uri,'@Nexus'),null);
  assert.equal(parseNoteDrop('','obsidian://open?vault=%40Nexus-dev&file=Literal%2520QA.md','@Nexus-dev'),'Literal%20QA.md');
});

test('single wiki and Markdown note links support aliases, headings and encoded spaces', () => {
  assert.equal(parseNoteDrop('[[Clientes/Reunión#Agenda|Reunión]]','','Vault'),'Clientes/Reunión');
  assert.equal(parseNoteDrop('[Reunión](Clientes/Reuni%C3%B3n%20QA.md)','','Vault'),'Clientes/Reunión QA.md');
  assert.equal(parseNoteDrop('Carpeta/Nota.md','','Vault'),'Carpeta/Nota.md');
});

test('multiple notes, external files, websites and traversal cannot be imported through a drop', () => {
  for(const text of ['[[Una]]\n[[Otra]]','obsidian://open?file=../Fuera.md','obsidian://open?file=%2FFuera.md','obsidian://other?file=Nota.md','file:///C:/Nota.md','https://example.com/Nota.md','C:\\Nota.md','Texto suelto','[[Una]][[Otra]]']) assert.equal(parseNoteDrop(text,'','Vault'),null,text);
  assert.equal(parseNoteDrop('','obsidian://open?file=Una.md\nobsidian://open?file=Otra.md','Vault'),null);
});
