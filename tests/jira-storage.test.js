import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../jira-model.js';
import {JIRA_FILTER_STORAGE,readJiraFilters,saveJiraFilters} from '../jira-storage.js';
import {jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns} from '../jira-overall.js';
import {escapeHTML} from '../report.js';

function storage(){
  const data=new Map(),writes=[];
  return {data,writes,getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,value);}};
}
const filters={...model.jiraDefaults,project:'OTHER',start:'2026-10-19',end:'2026-11-04',issueTypes:['Bug','Task'],priorities:['High'],statuses:['To Do'],components:['123'],fixVersions:['456'],epics:['OTHER-10'],excludePentest:false};

test('applied Jira filters round trip independently of imported measurement inputs and omit result data',()=>{
  const saved=storage(),builder=JSON.stringify({draft:{project:{name:'Old JSON project'},weeks:[{start:'2026-06-01'}]}});
  saved.data.set('measure-builder-v1',builder);
  assert.equal(readJiraFilters(saved),null);
  saveJiraFilters(saved,{...filters,metrics:{created:999},rows:[{count:999}],snapshot:{old:true}});
  assert.deepEqual(readJiraFilters(saved),model.validateJiraFilters(filters));
  assert.equal(saved.getItem('measure-builder-v1'),builder);
  assert.deepEqual(saved.writes,[JIRA_FILTER_STORAGE]);
  assert.doesNotMatch(saved.getItem(JIRA_FILTER_STORAGE),/metrics|rows|snapshot|999/);
  saved.data.set('measure-builder-v1',JSON.stringify({draft:{project:{name:'Another imported backup'}}}));
  assert.equal(readJiraFilters(saved).project,'OTHER');
});

test('JQL, reference dates, date handling and PENTEST selection survive reload',()=>{
  for(const jqlDateMode of ['weekly','fixed']){
    const saved=storage(),input={...filters,mode:'jql',jql:'project = OTHER AND created >= "2026-10-19" AND updated >= "2026-10-19"',jqlDateMode};
    saveJiraFilters(saved,input);
    const restored=readJiraFilters(saved);
    assert.deepEqual(restored,model.validateJiraFilters(input));
    assert.equal(restored.jqlAnchorStart,'2026-10-19');
    assert.equal(restored.excludePentest,false);
  }
});

test('invalid or unavailable storage is reported without replacing a valid saved selection',()=>{
  const saved=storage();saveJiraFilters(saved,filters);const original=saved.getItem(JIRA_FILTER_STORAGE);
  assert.throws(()=>saveJiraFilters(saved,{...filters,start:'2026-10-20'}),/Monday/);
  assert.equal(saved.getItem(JIRA_FILTER_STORAGE),original);
  for(const value of ['broken',JSON.stringify({version:2,filters}),JSON.stringify({version:1,filters:[]}),JSON.stringify({version:1,filters:{...filters,end:'2026-02-30'}})]){
    saved.data.set(JIRA_FILTER_STORAGE,value);assert.throws(()=>readJiraFilters(saved));
  }
  assert.throws(()=>readJiraFilters({getItem(){throw new Error('Denied');}}),/Denied/);
  assert.throws(()=>saveJiraFilters({setItem(){throw new Error('Quota exceeded');}},filters),/Quota exceeded/);
  assert.throws(()=>saveJiraFilters(undefined,filters),/unavailable/);
  assert.equal(readJiraFilters(undefined),null);
});

test('Jira page restores the last applied query and dates without rewriting saved state',()=>{
  const saved=storage();saveJiraFilters(saved,filters);saved.writes.length=0;
  const context=vm.createContext({...model,jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns,readJiraFilters,saveJiraFilters,h:escapeHTML,structuredClone,window:{localStorage:saved}});
  const source=readFileSync(new URL('../jira.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source,context);
  const html=vm.runInContext('jiraView()',context);
  assert.match(html,/name="start" value="2026-10-19"/);assert.match(html,/name="end" value="2026-11-04"/);
  assert.equal(vm.runInContext('state.filters.project',context),'OTHER');
  assert.equal(vm.runInContext('state.weeks.length',context),3);
  assert.equal(vm.runInContext('state.rows.size+state.overallRows.size',context),0);
  vm.runInContext('disposeJiraPage();jiraView();',context);
  assert.deepEqual(saved.writes,[]); // Read-only navigation/closing cannot overwrite newer settings.
});

test('corrupt saved filters show a recovery notice and leave the original storage intact',()=>{
  const saved=storage();saved.data.set(JIRA_FILTER_STORAGE,'broken');
  const context=vm.createContext({...model,jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns,readJiraFilters,saveJiraFilters,h:escapeHTML,structuredClone,window:{localStorage:saved}});
  const source=readFileSync(new URL('../jira.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source,context);
  const html=vm.runInContext('jiraView()',context);
  assert.match(html,/Saved Jira filters could not be read/);
  assert.equal(saved.getItem(JIRA_FILTER_STORAGE),'broken');assert.deepEqual(saved.writes,[]);
});

test('restored JQL can be reapplied to an earlier First Monday without retaining the old reference week',()=>{
  const saved=storage();saveJiraFilters(saved,{...filters,mode:'jql',jql:'project = OTHER AND updated >= "2026-10-19"'});
  const context=vm.createContext({...model,jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns,readJiraFilters,saveJiraFilters,h:escapeHTML,structuredClone,window:{localStorage:saved}});
  const source=readFileSync(new URL('../jira.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source,context);vm.runInContext('jiraView()',context);
  assert.equal(vm.runInContext('draftMatchesApplied()',context),true);
  const reapplied=vm.runInContext('state.draft.start="2026-10-12";state.draft.jql=\'project = OTHER AND updated >= "2026-10-12"\';validateJiraFilters(state.draft)',context);
  assert.equal(reapplied.jqlAnchorStart,'2026-10-12');
  assert.equal(vm.runInContext('state.filters.jqlAnchorStart',context),'2026-10-19');
});

test('Overall rates are derived from source counts and display zero for missing or zero denominators',()=>{
  const rate=jiraOverallTableColumns.find(metric=>metric.name==='Failed Rate');
  assert.equal(rate.id,'reopenedRate');assert.equal(jiraOverallColumns.length,5);assert.equal(jiraOverallTableColumns.length,8);
  const row={metrics:{tested:{count:40,highCount:3},failed:{count:5,highCount:2}}};
  assert.equal(model.formatJiraMetric(row,rate.id),'12.5%');
  assert.equal(model.formatJiraMetric(row,rate.id,'high'),'66.7%');
  for(const invalid of [{metrics:{tested:{count:0},failed:{count:0}}},{metrics:{tested:{count:40,error:'Unavailable'},failed:{count:5}}},undefined]){
    assert.equal(model.formatJiraMetric(invalid,rate.id),'0.0%');
  }
  const fixed=jiraOverallTableColumns.find(metric=>metric.name==='Fixed Rate');
  assert.equal(fixed.id,'fixedRate');
  const snapshot={metrics:{created:{count:120,highCount:30},resolved:{count:90,highCount:18}}};
  assert.equal(model.formatJiraMetric(snapshot,fixed.id),'75.0%');
  assert.equal(model.formatJiraMetric(snapshot,fixed.id,'high'),'60.0%');
  for(const invalid of [{metrics:{created:{count:0},resolved:{count:0}}},{metrics:{created:{count:40},resolved:{count:5,error:'Unavailable'}}},undefined]){
    assert.equal(model.formatJiraMetric(invalid,fixed.id),'0.0%');
  }
});
