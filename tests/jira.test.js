import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {jiraDefaults,jiraWeeks,jiraQuery,validateJiraFilters,weekLabel,monthLabel,jiraScope,normalizeJql,quoteJql,shiftJqlDates,jiraWeekRequest,withoutCreatedDates,jiraRate,formatJiraRate,jiraRateColumns,jiraTableColumns} from '../jira-model.js';
import {createJiraService,jiraConfig} from '../jira-service.mjs';
import {createServer} from '../server.mjs';
import {jiraView} from '../jira.js';

const filters={project:'EFSGLYTY',start:'2026-06-01',end:'2026-06-07',excludePentest:true};
const config={site:'https://example.atlassian.net',authorization:'Basic private-test-value'};
const issue=(key,priority='High')=>({key,fields:{summary:'Example <script>alert(1)</script>',priority:{name:priority},status:{name:'Cancel'},created:'2026-06-01T01:00:00.000+0800'}});
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});

test('weekly periods cover Monday–Sunday and group cross-month weeks by their final day',()=>{
  const weeks=jiraWeeks(jiraDefaults);
  assert.equal(weeks.length,12);
  assert.deepEqual(weeks[4],{start:'2026-06-29',end:'2026-07-05',month:'2026-07',number:1});
  assert.equal(weekLabel(weeks[4]),'Jun 29 - Jul 5');assert.equal(monthLabel(weeks[4]),'July 2026');
  assert.equal(weeks[11].start,'2026-08-17');assert.equal(weeks[11].end,'2026-08-23');
});
test('filter validation rejects invalid dates, query injection, reversed dates, and excessive ranges',()=>{
  for(const change of [{project:'EFSGLYTY OR project = OTHER'},{start:'2026-02-30'},{start:'2026-06-02'},{end:'2026-05-31'},{end:'2026-05-29'},{end:'2027-06-04'}])assert.throws(()=>validateJiraFilters({...filters,...change}));
  assert.throws(()=>validateJiraFilters({...filters,end:'2026-06-14'},{singleWeek:true}));
  assert.equal(validateJiraFilters({...filters,project:' efsglYTY '}).project,'EFSGLYTY');
});
test('Last Day supports partial final weeks and the 26-week limit without counting beyond the selection',()=>{
  assert.deepEqual(jiraWeeks({...filters,end:'2026-06-01'}),[{start:'2026-06-01',end:'2026-06-01',month:'2026-06',number:1}]);
  const weeks=jiraWeeks({...filters,end:'2026-06-10'});
  assert.deepEqual(weeks.map(w=>[w.start,w.end]),[['2026-06-01','2026-06-07'],['2026-06-08','2026-06-10']]);
  const partial=jiraWeekRequest({...filters,end:'2026-06-10'},weeks[1]);
  assert.match(jiraQuery(partial,'created'),/created < "2026-06-11 00:00"/);
  assert.match(jiraQuery(partial,'tested'),/"2026-06-10 23:59"/);
  assert.equal(jiraWeeks({...filters,end:'2026-11-29'}).length,26);
  assert.throws(()=>jiraWeeks({...filters,end:'2026-11-30'}),/26 weeks/);
  const acrossYear=jiraWeeks({...filters,start:'2026-12-28',end:'2027-01-10'});
  assert.deepEqual(acrossYear.map(w=>[w.start,w.end]),[['2026-12-28','2027-01-03'],['2027-01-04','2027-01-10']]);
});
test('derived rates use the same week and priority group, retain precision, and permit backlog clearance over 100%',()=>{
  const row={metrics:{created:{count:3,highCount:1},resolved:{count:5,highCount:2},tested:{count:7,highCount:3},failed:{count:2,highCount:1}}};
  assert.equal(jiraRate(row,'fixedRate').value,5/3*100);
  assert.equal(formatJiraRate(jiraRate(row,'fixedRate').value),'166.7%');
  assert.equal(formatJiraRate(jiraRate(row,'fixedRate','high').value),'200.0%');
  assert.equal(formatJiraRate(jiraRate(row,'reopenedRate').value),'28.6%');
  assert.equal(formatJiraRate(jiraRate(row,'reopenedRate','high').value),'33.3%');
  assert.equal(jiraRateColumns.length,2);assert.equal(jiraTableColumns.length,7);
});
test('derived rates distinguish real zero from zero denominators and failed or missing counts',()=>{
  const row={metrics:{created:{count:2,highCount:0},resolved:{count:0,highCount:0},tested:{count:0},failed:{count:3}}};
  assert.equal(formatJiraRate(jiraRate(row,'fixedRate').value),'0.0%');
  assert.equal(formatJiraRate(jiraRate(row,'fixedRate','high').value),'N/A');
  assert.equal(formatJiraRate(jiraRate(row,'reopenedRate').value),'N/A');
  assert.match(jiraRate(row,'reopenedRate').reason,/undefined/);
  for(const source of [undefined,{}, {error:'Could not retrieve'}, {metrics:{created:{count:2},resolved:{count:null}}}, {metrics:{created:{count:2,error:'Failed'},resolved:{count:3}}}]){
    assert.equal(jiraRate(source,'fixedRate').value,null);
  }
});
test('queries use the selected week, current cancellation for Created, and historical workflow transitions',()=>{
  const august={...filters,start:'2026-08-17',end:'2026-08-23'};
  const created=jiraQuery(august,'created',{highPriority:true});
  assert.match(created,/created >= "2026-08-17 00:00" AND created < "2026-08-24 00:00"/);
  assert.match(created,/AND status != CANCEL\nORDER BY created DESC$/);
  assert.doesNotMatch(created,/status WAS|DURING/);
  assert.doesNotMatch(created,/2026-08-03/);assert.match(created,/priority IN \(High, Highest\)/);
  assert.match(created,/summary !~ "PENTEST"/);
  assert.doesNotMatch(jiraQuery({...filters,excludePentest:false},'created'),/PENTEST|priority IN/);
  for(const mode of ['basic','jql'])for(const highPriority of [false,true]){
    const may=jiraQuery({...filters,mode,jql:'project = EFSGLYTY AND type = Bug',start:'2026-05-18',end:'2026-05-22'},'created',{highPriority});
    assert.match(may,/created >= "2026-05-18 00:00" AND created < "2026-05-23 00:00"/);
    assert.match(may,/AND status != CANCEL\nORDER BY created DESC$/);
    assert.doesNotMatch(may,/status WAS|DURING/);
  }
  assert.match(jiraQuery(filters,'resolved'),/FROM "UAT In Progress" TO "Ready for Deploy"/);
  assert.match(jiraQuery(filters,'tested'),/AND status NOT IN \("Cancel"\)/);
  assert.match(jiraQuery(filters,'failed'),/FROM "UAT In Progress" TO "UAT Failed"/);
  assert.match(jiraQuery(filters,'escaped'),/status WAS NOT IN/);
  assert.throws(()=>jiraQuery(filters,'unknown'));
});
test('search retrieves all pages, deduplicates issues, and never follows redirects with credentials',async()=>{
  const requests=[];
  const service=createJiraService({config,fetchImpl:async(url,options)=>{
    requests.push({url,options});const body=JSON.parse(options.body);
    return body.nextPageToken?response({issues:[issue('EX-1'),issue('EX-2','Low')],isLast:true}):response({issues:[issue('EX-1')],nextPageToken:'page-2',isLast:false});
  }});
  const result=await service.search('project = EX');
  assert.equal(result.length,2);assert.equal(result[1].priority,'Low');
  assert.equal(requests.length,2);assert.equal(JSON.parse(requests[1].options.body).nextPageToken,'page-2');
  assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.method,'POST');
  assert.equal(result[0].url,'https://example.atlassian.net/browse/EX-1');
});
test('incomplete pagination fails instead of returning a partial count',async()=>{
  for(const data of [{issues:[issue('EX-1')],isLast:false},{issues:[issue('EX-1')],nextPageToken:'repeat'}]){
    const service=createJiraService({config,fetchImpl:async()=>response(data)});
    await assert.rejects(service.search('project = EX'),/partial count/);
  }
});
test('weekly counts include zero, derive High/Highest consistently, cache successes, and permit explicit refresh',async()=>{
  let calls=0;
  const service=createJiraService({config,fetchImpl:async()=>{calls++;return response({issues:[issue('EX-1','Highest'),issue('EX-2','High'),issue('EX-3','Low')],isLast:true});}});
  const row=await service.getWeek(filters);
  assert.equal(row.metrics.created.count,3);assert.equal(row.metrics.created.highCount,2);
  assert.match(row.metrics.created.highJql,/priority IN/);assert.equal(calls,5);
  await service.getWeek(filters);assert.equal(calls,5);
  await service.getWeek(filters,{refresh:true});assert.equal(calls,10);
  const empty=createJiraService({config,fetchImpl:async()=>response({issues:[],isLast:true})});
  assert.equal((await empty.getWeek(filters)).metrics.created.count,0);
});
test('failed queries stay N/A, do not leak upstream credentials, and are retried on the next load',async()=>{
  let calls=0;
  const service=createJiraService({config,fetchImpl:async()=>{calls++;return response({errorMessages:['private-test-value']},401);}});
  const row=await service.getWeek(filters);assert.equal(row.metrics.created.count,null);assert.match(row.metrics.created.error,/authentication failed/);
  assert.doesNotMatch(JSON.stringify(row),/private-test-value/);
  await service.getWeek(filters);assert.equal(calls,10);
  await assert.rejects(createJiraService({config:null}).getWeek(filters),/not configured/);
});
test('rate limits retry as directed and concurrent Jira requests remain bounded',async()=>{
  let attempt=0,active=0,peak=0;const sleeps=[];
  const service=createJiraService({config,sleep:async ms=>sleeps.push(ms),fetchImpl:async()=>{
    if(attempt++===0)return response({},429,{'Retry-After':'2'});
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return response({issues:[],isLast:true});
  }});
  await Promise.all([service.getWeek(filters),service.getWeek({...filters,start:'2026-06-08',end:'2026-06-14'})]);
  assert.deepEqual(sleeps,[2000]);assert.ok(peak<=4);
});
test('only a configured Atlassian Cloud URL can receive server-side credentials',()=>{
  const env={JIRA_URL:'https://example.atlassian.net/',JIRA_USERNAME:'test@example.com',JIRA_API_TOKEN:'private-test-value'};
  assert.equal(jiraConfig(env).site,'https://example.atlassian.net');
  for(const url of ['http://example.atlassian.net','https://example.atlassian.net.evil.com','https://example.com','https://user:pass@example.atlassian.net','https://example.atlassian.net:1234'])assert.equal(jiraConfig({...env,JIRA_URL:url}),null);
  assert.equal(jiraConfig({...env,JIRA_API_TOKEN:''}),null);
});
test('Jira page has Weekly and Overall tables for both priority groups, filters and detail dialog',()=>{
  const html=jiraView();assert.equal((html.match(/class="jira-stats-table"/g)||[]).length,4);
  for(const text of ['data-stats-section="weekly"','data-stats-section="overall"','Total Created','Outstanding','Download Overall CSV','Period Ending','All Priorities'])assert.ok(html.includes(text));
  for(const text of ['Jira Defect Statistics','High Priority','Overall','QA Failed','Ready for Deploy','First Monday','Last Day','View JQL']){
    if(text!=='View JQL')assert.ok(html.includes(text));
  }
  assert.match(html,/<dialog id="jira-issues-dialog" aria-labelledby="jira-dialog-title">/);
  assert.doesNotMatch(html,/ATATT|JIRA_API_TOKEN=|Authorization/);
  assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/data-page="jira" aria-label="Jira Defect Statistics"/);
});
test('API routes return only intended data, deny cross-site requests, and keep private server files inaccessible',async()=>{
  let calls=0;
  const server=createServer({jira:{configured:true,site:config.site,getWeek:async(input)=>{calls++;return {project:input.project};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const status=await fetch(origin+'/api/jira/status');assert.equal(status.headers.get('cache-control'),'no-store');assert.deepEqual(await status.json(),{configured:true,site:config.site});
    const week=await fetch(origin+'/api/jira/week?project=EX');assert.deepEqual(await week.json(),{project:'EX'});assert.equal(calls,1);
    assert.equal((await fetch(origin+'/api/jira/week?project=EX',{headers:{Origin:'https://external.example'}})).status,403);assert.equal(calls,1);
    for(const path of ['/jira-service.mjs','/.env','/.env.jira','/jira.env','/api/jira/unknown'])assert.equal((await fetch(origin+path)).status,404);
    for(const path of ['/jira','/jira.html','/jira.js','/jira-model.js','/jira.css'])assert.equal((await fetch(origin+path)).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});


test('field selections compose quoted multi-value clauses and All types removes the Bug restriction',()=>{
  const input={...filters,issueTypes:['Task','Bug','Bug'],priorities:['High','Highest'],statuses:['QA In Progress'],components:['123'],fixVersions:['456']};
  const normalized=validateJiraFilters(input);
  assert.deepEqual(normalized.issueTypes,['Bug','Task']);
  const scope=jiraScope(normalized);
  for(const clause of ['issuetype IN ("Bug", "Task")','priority IN ("High", "Highest")','status IN ("QA In Progress")','component IN ("123")','fixVersion IN ("456")'])assert.ok(scope.includes(clause));
  assert.doesNotMatch(jiraScope({...filters,issueTypes:[]}),/issuetype/);
  assert.equal(quoteJql('a" OR project = X'),String.raw`"a\" OR project = X"`);
  assert.equal(quoteJql(String.raw`path\name`),String.raw`"path\\name"`);
  for(const change of [{issueTypes:'Bug'},{priorities:Array(51).fill('High')},{statuses:['Bad\nValue']},{components:['']}])assert.throws(()=>validateJiraFilters({...filters,...change}));
});

test('custom JQL replaces basic selections, groups OR clauses, and preserves explicit date filters',()=>{
  const query=jiraQuery({...filters,mode:'jql',jql:'project = A OR (project = B AND created >= "2026-06-03") ORDER BY updated DESC'},'created');
  assert.ok(query.startsWith('(project = A OR (project = B AND created >= "2026-06-03"))\nAND'));
  assert.doesNotMatch(query,/EFSGLYTY|issuetype|updated DESC/);
  assert.equal((query.match(/ORDER BY/g)||[]).length,1);
  assert.match(query,/created < "2026-06-08 00:00"/);
  assert.equal(validateJiraFilters({...filters,mode:'jql',jql:'type = Task'}).project,'');
});

test('JQL normalization handles quoted ORDER BY and rejects incomplete or excessive input',()=>{
  const expression=String.raw`summary ~ "order by" AND labels = 'release'`;
  assert.equal(normalizeJql(expression+' ORDER BY created DESC'),expression);
  assert.equal(normalizeJql(String.raw`summary ~ "say \"hello\" order by" ORDER BY key`),String.raw`summary ~ "say \"hello\" order by"`);
  for(const invalid of ['', 'ORDER BY created DESC', 'project = "unfinished', '(type = Bug', 'type = Bug)', 'a'.repeat(4001)])assert.throws(()=>normalizeJql(invalid));
});

test('weekly cache separates field selections and JQL scopes',async()=>{
  const queries=[];
  const service=createJiraService({config,fetchImpl:async(url,options)=>{queries.push(JSON.parse(options.body).jql);return response({issues:[],isLast:true});}});
  await service.getWeek({...filters,issueTypes:['Task']});
  await service.getWeek({...filters,issueTypes:['Bug']});
  await service.getWeek({...filters,mode:'jql',jql:'project = EX AND type = Task'});
  assert.equal(queries.length,15);
  await service.getWeek({...filters,issueTypes:['Task']});assert.equal(queries.length,15);
});

test('selector metadata retrieves all pages, deduplicates workflow values, and caches successful lists',async()=>{
  const calls=[];
  const service=createJiraService({config,fetchImpl:async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');
    if(url.endsWith('/search/jql')){assert.equal(options.method,'POST');return response({issues:[issue('EX-12')],isLast:true});}
    assert.equal(options.method,'GET');
    if(url.includes('/project/search'))return url.endsWith('startAt=0')?response({values:[{key:'EX',name:'Example'}],isLast:false,total:2}):response({values:[{key:'DEMO',name:'Demo'}],isLast:true,total:2});
    if(url.includes('/priority/search'))return response({values:[{name:'High'},{name:'Low'}],isLast:true});
    if(url.endsWith('/statuses'))return response([{name:'Bug',statuses:[{name:'To Do'},{name:'Done'}]},{name:'Task',statuses:[{name:'Done'}]}]);
    return response({values:[{id:'101',name:'Web'}],isLast:true});
  }});
  const global=await service.getOptions();assert.deepEqual(global.projects.map(p=>p.value),['EX','DEMO']);
  const fields=await service.getOptions('EX');assert.deepEqual(fields.issueTypes.map(v=>v.value),['Bug','Task']);assert.deepEqual(fields.statuses.map(v=>v.value),['Done','To Do']);assert.deepEqual(fields.components,[{value:'101',label:'Web'}]);
  assert.deepEqual(fields.epics,[{value:'EX-12',label:'EX-12 · Example <script>alert(1)</script>'}]);
  const count=calls.length;await service.getOptions('EX');await service.getOptions();assert.equal(calls.length,count);
  await assert.rejects(service.getOptions('../outside'),/Select a Jira space/);
});

test('field metadata errors stay visible while successful selectors remain available',async()=>{
  let calls=0;
  const service=createJiraService({config,fetchImpl:async url=>{
    calls++;if(url.endsWith('/statuses'))return response({},403);
    if(url.endsWith('/search/jql'))return response({issues:[],isLast:true});
    return response({values:[],isLast:true});
  }});
  const data=await service.getOptions('EX');assert.match(data.errors.issueTypes,/denied access/);assert.match(data.errors.statuses,/denied access/);assert.deepEqual(data.components,[]);
  await service.getOptions('EX');assert.equal(calls,8);
});

test('query validation checks first and last weeks and returns Jira errors without searching',async()=>{
  const service=createJiraService({config,fetchImpl:async(url,options)=>{
    assert.ok(url.endsWith('/jql/parse?validation=strict'));
    const {queries}=JSON.parse(options.body);assert.equal(queries.length,10);
    assert.ok(queries.slice(0,5).every(q=>q.includes('2026-06-01')));
    assert.ok(queries.slice(5).every(q=>q.includes('2026-06-22')));
    assert.ok(queries[0].includes('created < "2026-06-08 00:00"'));
    assert.ok(queries[5].includes('created < "2026-06-29 00:00"'));
    assert.ok(queries.slice(1,5).every(q=>q.includes('2026-06-07 23:59')));
    assert.ok(queries.slice(6).every(q=>q.includes('2026-06-28 23:59')));
    return response({queries:queries.map(query=>({query,errors:['Field is unknown.']}))});
  }});
  const result=await service.validate({...filters,end:'2026-06-28',mode:'jql',jql:'mystery = value'});
  assert.equal(result.valid,false);assert.deepEqual(result.errors,['Field is unknown.']);
});

test('JSON query endpoints support custom scope and reject cross-site or invalid request bodies',async()=>{
  const seen=[];
  const server=createServer({jira:{configured:true,site:config.site,getWeek:async input=>{seen.push(input);return {query:input.jql};},getOptions:async project=>({project}),validate:async input=>({valid:input.jql==='project = EX'})}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  try{
    assert.deepEqual(await (await post('/api/jira/week',{...filters,mode:'jql',jql:'project = EX'})).json(),{query:'project = EX'});
    assert.deepEqual(await (await post('/api/jira/validate',{jql:'project = EX'})).json(),{valid:true});
    assert.deepEqual(await (await fetch(origin+'/api/jira/options?project=EX')).json(),{project:'EX'});
    assert.equal((await post('/api/jira/week','broken')).status,400);
    assert.equal((await post('/api/jira/week',[])).status,400);
    assert.equal((await post('/api/jira/week',{}, {'Content-Type':'text/plain'})).status,415);
    assert.equal((await post('/api/jira/week',{}, {Origin:'https://elsewhere.example'})).status,403);
    assert.equal((await post('/api/jira/week',{jql:'x'.repeat(33000)})).status,413);
    assert.equal(seen.length,1);
    assert.equal((await post('/app.js',{})).status,405);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Jira validation requires complete parse results before treating a query as valid',async()=>{
  for(const data of [{queries:[]},{queries:Array.from({length:5},()=>({}))}]){
    const service=createJiraService({config,fetchImpl:async()=>response(data)});
    await assert.rejects(service.validate(filters),/validate the complete query/);
  }
  const service=createJiraService({config,fetchImpl:async(url,options)=>response({queries:JSON.parse(options.body).queries.map(query=>({query,structure:{where:{}}}))})});
  assert.equal((await service.validate(filters)).valid,true);
});


const datedJql='type = Bug AND project = EFSGLYTY AND created >= "2026-06-01" AND created <= "2026-06-06" AND status WAS NOT Cancel DURING ("2026-06-01", "2026-06-06") ORDER BY created DESC';
test('pasted weekly JQL advances from the second week onward using one stable reference week',()=>{
  const report={...filters,mode:'jql',jql:datedJql,end:'2026-06-21'};
  const weeks=jiraWeeks(report);
  for(let i=0;i<weeks.length;i++){
    const input=jiraWeekRequest(report,weeks[i]);
    assert.equal(input.jqlAnchorStart,'2026-06-01');
    const expectedStart=['2026-06-01','2026-06-08','2026-06-15'][i];
    const expectedEnd=['2026-06-06','2026-06-13','2026-06-20'][i];
    for(const metric of ['created','resolved','tested','failed','escaped']){
      const query=jiraQuery(input,metric);
      if(metric==='created')assert.ok(query.includes(`created >= "${expectedStart}" AND created <= "${expectedEnd}"`));
      else assert.doesNotMatch(normalizeJql(query),/\bcreated\b/i);
      assert.ok(query.includes(`DURING ("${expectedStart}", "${expectedEnd}")`));
      if(i>0)assert.doesNotMatch(query,/2026-06-01|2026-06-06/);
    }
  }
});

test('activity columns remove creation filters in both date modes while retaining the other issue filters',()=>{
  const jql='project = EFSGLYTY AND type = Bug AND parent IN ("EFSGLYTY-24") AND created >= "2026-06-01" AND "CreatedDate" < startOfWeek() AND priority = High AND status WAS NOT Cancel DURING ("2026-06-01", "2026-06-06")';
  for(const jqlDateMode of ['weekly','fixed']){
    const report={...filters,mode:'jql',jql,jqlDateMode,end:'2026-06-14'};
    const input=jiraWeekRequest(report,jiraWeeks(report)[1]);
    for(const metric of ['resolved','tested','failed','escaped'])for(const highPriority of [false,true]){
      const query=jiraQuery(input,metric,{highPriority});
      assert.doesNotMatch(normalizeJql(query),/\bcreated(?:date)?\b/i);
      for(const clause of ['project = EFSGLYTY','type = Bug','parent IN ("EFSGLYTY-24")','priority = High','summary !~ "PENTEST"'])assert.ok(query.includes(clause));
      const date=jqlDateMode==='weekly'?'2026-06-08':'2026-06-01';
      assert.ok(query.includes(`status WAS NOT Cancel DURING ("${date}"`));
      assert.ok(query.includes('DURING ("2026-06-08 00:00", "2026-06-14 23:59")'));
      assert.ok(query.endsWith('ORDER BY created DESC'));
      assert.equal(query.includes('priority IN (High, Highest)'),highPriority);
    }
    assert.match(jiraQuery(input,'created'),/"CreatedDate" < startOfWeek\(\)/);
  }
});

test('creation predicate removal respects boolean groups, negation, quoted text, and function arguments',()=>{
  const cases=[
    ['created >= -7d AND project = EX AND created < now()', 'project = EX'],
    ['(project = EX AND created >= -7d) OR (project = DEMO AND created < now())','(project = EX) OR (project = DEMO)'],
    ['project = EX AND (created >= -7d OR priority = High)','project = EX AND (priority = High)'],
    ['project = EX AND (created >= -7d OR created < now())','project = EX'],
    ['NOT (created >= -7d AND priority = Low) AND type = Bug','NOT (priority = Low) AND type = Bug'],
    ['NOT created >= -7d AND project = EX','project = EX'],
    ['project = EX && !("CreatedDate" <= startOfWeek("-1w"))','project = EX'],
    ["'createdDate' IN ('2026-06-01', '2026-06-02') OR project = EX",'project = EX'],
    ['created IS NOT EMPTY',''],
    ['((created >= -7d))',''],
  ];
  for(const [source,expected] of cases)assert.equal(withoutCreatedDates(source),expected,source);
  const preserved=String.raw`summary ~ "created >= \\"2026-06-01\\" AND OR" AND labels IN ("created", "OR") AND "Created By" = currentUser() AND updated > startOfWeek("-1w") AND issue IN linkedIssues("EX-1", "created")`;
  assert.equal(withoutCreatedDates(preserved+' AND created >= -7d'),preserved);
  assert.equal(withoutCreatedDates('project = EX AND'),'project = EX AND');
});

test('a creation-only scope leaves valid activity rules with no empty group or leading AND',()=>{
  for(const metric of ['resolved','tested','failed','escaped']){
    const input={...filters,mode:'jql',jql:'created >= startOfWeek()',excludePentest:false};
    const query=jiraQuery(input,metric);
    assert.doesNotMatch(normalizeJql(query),/created|\(\s*\)|^\s*AND/i);
    assert.ok(query.startsWith(metric==='escaped'?'status':'(status'));
    assert.equal(jiraScope(input,metric),'');
  }
});

test('weekly service includes older issues in activity counts and uses the same scope for detail links',async()=>{
  const older=issue('EX-OLD','High');older.fields.created='2026-05-25T01:00:00.000+0800';
  const service=createJiraService({config,fetchImpl:async(url,options)=>{
    const query=normalizeJql(JSON.parse(options.body).jql);
    return response({issues:/\bcreated\b/i.test(query)?[]:[older],isLast:true});
  }});
  const report={...filters,mode:'jql',jql:datedJql,end:'2026-06-14'};
  const row=await service.getWeek(jiraWeekRequest(report,jiraWeeks(report)[1]));
  assert.equal(row.metrics.created.count,0);
  for(const metric of ['resolved','tested','failed','escaped']){
    const value=row.metrics[metric];
    assert.equal(value.count,1);assert.equal(value.highCount,1);
    assert.equal(value.issues[0].key,'EX-OLD');
    assert.doesNotMatch(normalizeJql(value.jql),/\bcreated\b/i);
    assert.doesNotMatch(normalizeJql(value.highJql),/\bcreated\b/i);
  }
});

test('weekly date handling crosses months and years without modifying date-like text filters',()=>{
  const query='created >= "2026-12-28 09:30" AND updated < \'2027/01/02\' AND resolved IN ("2026-12-29") AND status CHANGED AFTER "2026-12-30" AND summary ~ "2026-12-28" AND labels = "2026-12-28" AND fixVersion = "2026-12-28"';
  const moved=shiftJqlDates(query,7);
  assert.match(moved,/created >= "2027-01-04 09:30"/);
  assert.ok(moved.includes("updated < '2027/01/09'"));
  assert.match(moved,/resolved IN \("2027-01-05"\)/);
  assert.match(moved,/CHANGED AFTER "2027-01-06"/);
  assert.match(moved,/summary ~ "2026-12-28" AND labels = "2026-12-28" AND fixVersion = "2026-12-28"/);
  assert.equal(shiftJqlDates('project = EX AND type = Bug',7),'project = EX AND type = Bug');
});

test('fixed JQL dates remain an intentional cohort and reference week validation rejects invalid anchors',()=>{
  const report={...filters,mode:'jql',jql:datedJql,end:'2026-06-14',jqlDateMode:'fixed'};
  const query=jiraQuery(jiraWeekRequest(report,jiraWeeks(report)[1]),'created');
  assert.match(query,/created >= "2026-06-01" AND created <= "2026-06-06"/);
  assert.match(query,/created >= "2026-06-08 00:00"/);
  assert.throws(()=>validateJiraFilters({...report,jqlDateMode:'invalid'}));
  assert.throws(()=>validateJiraFilters({...report,jqlAnchorStart:'2026-06-02'}));
  assert.throws(()=>validateJiraFilters({...report,jqlAnchorStart:'2026-06-08'}));
});

test('Epic filters select children of one or more selected epics and support clearing',()=>{
  const scope=jiraScope({...filters,epics:['EFSGLYTY-24','EFSGLYTY-67']});
  assert.match(scope,/parent IN \("EFSGLYTY-24", "EFSGLYTY-67"\)/);
  assert.doesNotMatch(jiraScope({...filters,epics:[]}),/parent IN/);
  assert.match(jiraView(),/data-picker="epics"/);
});

test('weekly service cache keeps moving dates, fixed dates, and Epic selections separate',async()=>{
  const queries=[];
  const service=createJiraService({config,fetchImpl:async(url,options)=>{queries.push(JSON.parse(options.body).jql);return response({issues:[],isLast:true});}});
  const report={...filters,mode:'jql',jql:datedJql,end:'2026-06-14'},week=jiraWeeks(report)[1];
  await service.getWeek(jiraWeekRequest(report,week));
  await service.getWeek(jiraWeekRequest({...report,jqlDateMode:'fixed'},week));
  await service.getWeek({...filters,epics:['EFSGLYTY-24']});
  await service.getWeek({...filters,epics:['EFSGLYTY-67']});
  assert.equal(queries.length,20);
  assert.ok(queries[0].includes('created <= "2026-06-13"'));
  assert.ok(queries[5].includes('created <= "2026-06-06"'));
  assert.ok(queries[10].includes('parent IN ("EFSGLYTY-24")'));
  assert.ok(queries[15].includes('parent IN ("EFSGLYTY-67")'));
});
