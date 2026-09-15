import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the application's actual save lifecycle without a browser or real storage.
function saveHarness(){
  const lines=readFileSync(new URL('../app.js',import.meta.url),'utf8').split('\n');
  const code=lines.filter(line=>line.startsWith('function save()')||line.startsWith('function queueSave()')||line.startsWith("window.addEventListener('pagehide'")).join('\n');
  const writes=[],timers=new Map(),handlers={},status={};let next=1;
  const context=vm.createContext({draft:{project:{name:'Original'}},snapshot:null,STORAGE:'test',saveTimer:undefined,document:{querySelector:()=>status},localStorage:{setItem:(key,value)=>writes.push(JSON.parse(value))},window:{addEventListener:(name,callback)=>{handlers[name]=callback;}},setTimeout:callback=>{const id=next++;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(code,context);
  return {context,writes,timers,handlers};
}
test('opening and closing a read-only Jira tab never saves a stale copy of project inputs',()=>{
  const {writes,handlers}=saveHarness();
  handlers.pagehide();assert.equal(writes.length,0);
});
test('leaving with pending input edits flushes them once, and an idle tab does not save again',()=>{
  const {context,writes,timers,handlers}=saveHarness();
  vm.runInContext("draft.project.name='Edited';queueSave();",context);
  assert.equal(timers.size,1);assert.equal(writes.length,0);
  handlers.pagehide();
  assert.equal(writes[0].draft.project.name,'Edited');assert.equal(timers.size,0);
  handlers.pagehide();assert.equal(writes.length,1);
  vm.runInContext("draft.project.name='Saved by timer';queueSave();",context);
  [...timers.values()][0]();
  assert.equal(writes.length,2);assert.equal(timers.size,0);
  handlers.pagehide();assert.equal(writes.length,2);
});
