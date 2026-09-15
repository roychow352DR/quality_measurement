import test from 'node:test';
import assert from 'node:assert/strict';
import {jiraOverallQuery,jiraLocalDateFormatter,jiraStatusTimeline,jiraOverallSnapshot} from '../jira-overall.js';
import {jiraWeeks,jiraWeekRequest} from '../jira-model.js';
import {createJiraService} from '../jira-service.mjs';
import {createServer} from '../server.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../jira-model.js';
import {jiraOverallColumns} from '../jira-overall.js';
import {escapeHTML} from '../report.js';

const filters={project:'EX',start:'2026-06-01',end:'2026-06-14',excludePentest:true};
const config={site:'https://example.atlassian.net',authorization:'Basic private-test-value'};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const issue=(id,status='To Do',priority='High',created='2026-05-20T12:00:00+08:00')=>({id,key:'EX-'+id,fields:{summary:'Example',status:{name:status},priority:{name:priority},created}});
const change=(id,date,from,to)=>({id,created:new Date(date).getTime(),items:[{fieldId:'status',fromString:from,toString:to}]});
const localDate=jiraLocalDateFormatter('Asia/Hong_Kong');

test('Overall queries keep field filters and exclude current Cancel, without a creation lower bound',()=>{
  const query=jiraOverallQuery({...filters,end:'2026-06-07',epics:['EX-10'],priorities:['High'],components:['123']},{highPriority:true});
  for(const text of ['parent IN ("EX-10")','component IN ("123")','priority IN (High, Highest)','summary !~ "PENTEST"','created < "2026-06-08 00:00"','status != CANCEL'])assert.ok(query.includes(text));
  assert.doesNotMatch(query,/created >=|DURING|2026-06-01/);
  const empty=jiraOverallQuery({...filters,end:'2026-06-07'},{keys:[]});
  assert.match(empty,/created < "2026-06-08 00:00"/);assert.match(empty,/created >= "2026-06-08 00:00"/);assert.doesNotMatch(empty,/IN \(\)/);
});
test('Overall custom JQL removes creation predicates and retains date handling for other filters on later weeks',()=>{
  const input={...filters,mode:'jql',jql:'project = EX AND created >= "2026-06-01" AND created < "2026-06-08" AND updated >= "2026-06-01" AND parent = EX-10 ORDER BY created ASC'};
  const request=jiraWeekRequest(input,jiraWeeks(input)[1]);
  const query=jiraOverallQuery(request);
  assert.doesNotMatch(query,/created >=|2026-06-01/);
  assert.match(query,/updated >= "2026-06-08"/);assert.match(query,/created < "2026-06-15 00:00"/);assert.match(query,/parent = EX-10/);
  assert.match(jiraOverallQuery({...request,jqlDateMode:'fixed'}),/updated >= "2026-06-01"/);
});
test('snapshots sort full history, count repeat transitions once, and use the actual status at cutoff',()=>{
  const timeline=jiraStatusTimeline({status:'Done',created:'2026-05-20T12:00:00+08:00'},[
    change('4','2026-06-09T01:00:00+08:00','QA Failed','Done'),
    change('3','2026-06-07T23:59:59+08:00','Ready for Deploy','QA Failed'),
    change('1','2026-06-01T01:00:00+08:00','To Do','QA In Progress'),
    change('2','2026-06-03T01:00:00+08:00','QA In Progress','Ready for Deploy'),
  ],localDate);
  assert.deepEqual(jiraOverallSnapshot(timeline,'2026-06-07'),{statusAtCutoff:'QA Failed',created:true,outstanding:true,tested:true,resolved:true,failed:true});
  assert.equal(jiraOverallSnapshot(timeline,'2026-06-14').outstanding,false);
  assert.equal(jiraOverallSnapshot(timeline,'2026-05-19'),null);
});
test('cutoffs include Sunday last seconds and exclude next Monday midnight in the Jira timezone',()=>{
  const timeline=jiraStatusTimeline({status:'Done',created:'2026-06-07T15:59:58Z'},[
    change('1','2026-06-07T15:59:59Z','To Do','QA In Progress'),
    change('2','2026-06-07T16:00:00Z','QA In Progress','Done'),
  ],localDate);
  const end=jiraOverallSnapshot(timeline,'2026-06-07');
  assert.equal(end.statusAtCutoff,'QA In Progress');assert.equal(end.tested,true);assert.equal(end.resolved,false);
  const ny=jiraLocalDateFormatter('America/New_York');
  assert.equal(ny('2026-03-09T03:59:59Z'),'2026-03-08');
  assert.equal(ny('2026-03-09T04:00:00Z'),'2026-03-09');
  assert.equal(ny('2026-11-02T04:59:59Z'),'2026-11-01');
  assert.equal(ny('2026-11-02T05:00:00Z'),'2026-11-02');
});
test('issues with no status changes retain initial status; malformed history cannot become a zero',()=>{
  const timeline=jiraStatusTimeline({status:'To Do',created:'2026-01-01T00:00:00Z'},[],localDate);
  assert.deepEqual(jiraOverallSnapshot(timeline,'2026-06-07'),{statusAtCutoff:'To Do',created:true,outstanding:true,tested:false,resolved:false,failed:false});
  const initial=jiraStatusTimeline({status:'Done',created:'2026-01-01T00:00:00Z'},[],localDate);
  assert.equal(jiraOverallSnapshot(initial,'2026-06-07').resolved,true);
  assert.throws(()=>jiraStatusTimeline({status:'Unknown',created:'2026-01-01'},[],localDate),/incomplete/);
  assert.throws(()=>jiraStatusTimeline({status:'Done',created:'2026-01-01'},[{items:[{field:'status',toString:'Done'}]}],localDate),/invalid history date/);
});
test('Overall service paginates history, deduplicates it, includes older defects and derives High Priority per cutoff',async()=>{
  const requests=[];
  const history=[change('1','2026-06-02T00:00:00+08:00','To Do','QA In Progress'),change('2','2026-06-03T00:00:00+08:00','QA In Progress','QA Failed'),change('3','2026-06-08T00:00:00+08:00','QA Failed','Done')];
  const service=createJiraService({config,fetchImpl:async(url,options)=>{
    const body=options.body&&JSON.parse(options.body);requests.push({url,body});
    if(url.endsWith('/myself'))return response({timeZone:'Asia/Hong_Kong'});
    if(url.endsWith('/search/jql'))return response({issues:[issue('1','Done'),...(body.jql.includes('2026-06-15')?[issue('2','To Do','Low','2026-06-09T12:00:00+08:00')]:[])],isLast:true});
    if(url.endsWith('/changelog/bulkfetch')){
      assert.deepEqual(body.fieldIds,['status']);
      return response({issueChangeLogs:[{issueId:'1',changeHistories:body.nextPageToken?[history[0],history[1]]:[history[2],history[1]]}],...(body.nextPageToken?{}:{nextPageToken:'second'})});
    }
    throw new Error('Unexpected API');
  }});
  const report=await service.getOverall(filters),[first,last]=report.rows;
  assert.equal(first.metrics.created.count,1);assert.equal(last.metrics.created.count,2);
  assert.equal(first.metrics.outstanding.count,1);assert.equal(last.metrics.outstanding.count,1);
  assert.equal(first.metrics.resolved.count,0);assert.equal(last.metrics.resolved.count,1);
  assert.equal(last.metrics.failed.count,1);assert.equal(last.metrics.tested.count,1);
  assert.equal(last.metrics.outstanding.highCount,0);assert.equal(last.metrics.created.highCount,1);
  assert.equal(first.metrics.outstanding.issues[0].status,'Done');assert.equal(first.metrics.outstanding.issues[0].statusAtCutoff,'QA Failed');
  assert.match(last.metrics.outstanding.jql,/key IN \("EX-2"\)/);
  assert.equal(requests.length,5);
  await service.getOverall(filters);assert.equal(requests.length,5);
  await service.getOverall(filters,{refresh:true});assert.equal(requests.length,10);
});
test('empty cohorts produce real zeroes without fetching history',async()=>{
  let calls=0;
  const service=createJiraService({config,fetchImpl:async url=>{calls++;return response(url.endsWith('/myself')?{timeZone:'UTC'}:{issues:[],isLast:true});}});
  const report=await service.getOverall({...filters,end:'2026-06-07'});
  for(const metric of Object.values(report.rows[0].metrics)){assert.equal(metric.count,0);assert.equal(metric.highCount,0);}
  assert.equal(calls,2);
});
test('history failures and missing timezone fail explicitly, and errors are not cached',async()=>{
  for(const scenario of ['history','timezone','token']){
    let calls=0;
    const service=createJiraService({config,fetchImpl:async url=>{
      calls++;
      if(url.endsWith('/myself'))return response(scenario==='timezone'?{}:{timeZone:'UTC'});
      if(url.endsWith('/search/jql'))return response({issues:[issue('1')],isLast:true});
      return response(scenario==='token'?{issueChangeLogs:[],nextPageToken:'repeat'}:{});
    }});
    await assert.rejects(service.getOverall(filters),/timezone|history|pagination/);
    const before=calls;await assert.rejects(service.getOverall(filters));assert.ok(calls>before);
  }
});
test('Overall API accepts same-origin JSON only and keeps credentials on the server',async()=>{
  let calls=0;
  const server=createServer({jira:{configured:true,site:config.site,getOverall:async(input,options)=>{calls++;return {start:input.start,refresh:options.refresh,rows:[]};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...filters,refresh:true})};
  try{
    const result=await fetch(origin+'/api/jira/overall',options);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
    assert.deepEqual(await result.json(),{start:filters.start,refresh:true,rows:[]});
    assert.equal((await fetch(origin+'/api/jira/overall')).status,405);
    assert.equal((await fetch(origin+'/api/jira/overall',{...options,headers:{...options.headers,Origin:'https://external.example'}})).status,403);
    assert.equal(calls,1);
    const client=await (await fetch(origin+'/jira-overall.js')).text();assert.doesNotMatch(client,/authorization|private-test-value|JIRA_API_TOKEN/i);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Overall CSV preserves cumulative columns, priority groups, cutoff rules and formula protection',async()=>{
  let blob,anchor;
  const context=vm.createContext({...model,jiraOverallColumns,h:escapeHTML,structuredClone,Blob,setTimeout:()=>{},URL:{createObjectURL:value=>{blob=value;return 'blob:test';}},document:{createElement:()=>{anchor={click(){}};return anchor;}}});
  const source=readFileSync(new URL('../jira.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source,context);
  vm.runInContext(`state.filters=validateJiraFilters({project:'EX',start:'2026-06-01',end:'2026-06-07',mode:'jql',jql:'project = EX AND summary ~ "=1+1"'});state.weeks=jiraWeeks(state.filters);state.overallTimeZone='Asia/Hong_Kong';state.overallRows=new Map([['2026-06-01',{metrics:Object.fromEntries(jiraOverallColumns.map(m=>[m.id,{count:7,highCount:3}])),fetchedAt:'2026-09-14T00:00:00Z'}]]);downloadCSV('overall');`,context);
  const csv=await blob.text();
  assert.equal(anchor.download,'custom-query-jira-overall-2026-06-01-2026-06-07.csv');
  assert.match(csv,/"Total Created","Outstanding","Tested","Resolved","QA Failed"/);
  assert.doesNotMatch(csv,/Defects Fixed Rate|Defects Reopened Rate|Escaped/);
  assert.match(csv,/"All Priorities","7","7","7","7","7"/);
  assert.match(csv,/"High Priority","3","3","3","3","3"/);
  assert.match(csv,/Cumulative through Period End \(Asia\/Hong_Kong\)/);
  vm.runInContext(`state.overallRows=new Map([['2026-06-01',{error:'=unsafe()'}]]);downloadCSV('overall');`,context);
  const failed=await blob.text();assert.match(failed,/"N\/A","N\/A","N\/A","N\/A","N\/A"/);assert.match(failed,/"'=unsafe\(\)"/);
});
