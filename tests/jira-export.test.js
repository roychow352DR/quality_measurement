import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as model from '../jira-model.js';
import {jiraExportFilters,loadJiraExportData,jiraExportSVG,jiraExportDataTable,jiraExportIssues,jiraImagePDF,jiraExportFilename} from '../jira-export.js';
import {jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns} from '../jira-overall.js';
import {escapeHTML} from '../report.js';
import {jiraView} from '../jira.js';

const filters={...model.jiraDefaults,project:'EX'};
const now=new Date(2026,10,4,12);
const row=(created=4,resolved=9)=>({metrics:{created:{count:created,highCount:3},resolved:{count:resolved,highCount:1},tested:{count:8,highCount:2},failed:{count:2,highCount:0},escaped:{count:1,highCount:0}}});
const dataset=(input=filters)=>{const f=jiraExportFilters(input,now),weeks=model.jiraWeeks(f);return {filters:f,weeks,rows:new Map(weeks.map(w=>[w.start,row()])),generatedAt:'2026-11-04T04:00:00Z'};};
const cumulativeRow=()=>({metrics:{created:{count:120,highCount:30},outstanding:{count:12,highCount:3},tested:{count:100,highCount:20},resolved:{count:90,highCount:18},failed:{count:10,highCount:5}}});

test('High Priority Created percentage uses all-priority cumulative counts and appears only in All Priorities exports',()=>{
  const data=dataset();data.section='overall';data.timeZone='Asia/Hong_Kong';
  data.rows=new Map(data.weeks.map(week=>[week.start,cumulativeRow()]));
  for(const group of ['overall','high']){
    assert.equal(model.formatJiraMetric(cumulativeRow(),'highPriorityCreatedRate',group),'25.0%');
    const table=jiraExportDataTable(data,group,'table');
    if(group==='high'){
      assert.doesNotMatch(table,/High Priority Created %/);
      assert.doesNotMatch(jiraExportSVG(data,group).svg,/High Priority Created %|Created %/);
    }else{
      assert.match(table,/<th scope="col">Total Created<\/th><th scope="col">High Priority Created %<\/th>/);
      assert.ok(table.includes('<td>120</td><td>25.0%</td>'));
      assert.match(jiraExportSVG(data,group).svg,/High Priority Created % = High \+ Highest Created \/ All Priorities Created/);
    }
    for(const created of [{count:100,highCount:0},{count:0,highCount:0},{count:100,highCount:null},{count:null,highCount:30},{count:100,highCount:30,error:'Unavailable'}]){
      assert.equal(model.formatJiraMetric({metrics:{created}},'highPriorityCreatedRate',group),'0.0%');
    }
  }
  assert.equal(model.jiraMetricValue({metrics:{created:{count:100,highCount:null}}},'highPriorityCreatedRate'),null);
  assert.equal(jiraOverallColumns.length,5);assert.equal(jiraOverallTableColumns.length,8);assert.equal(jiraOverallExportColumns.length,8);
  assert.deepEqual(jiraExportIssues(data),[]);
});

test('Net Resolved is signed, informational, and calculated independently for each priority group',()=>{
  assert.equal(model.jiraMetricValue(row(),'netResolved'),5);
  assert.equal(model.jiraMetricValue(row(),'netResolved','high'),-2);
  assert.equal(model.jiraMetricValue(row(3,3),'netResolved'),0);
  assert.equal(model.jiraMetricValue(row(5,0),'netResolved'),-5);
  assert.equal(model.jiraMetricValue(row(0,5),'netResolved'),5);
  assert.equal(model.jiraMetricValue(row(0,5),'fixedRate'),0);
  assert.equal(model.jiraColumns.length,5); // Only source counts trigger Jira queries.
  assert.ok(!model.jiraColumns.some(m=>m.id==='netResolved'));
  assert.match(model.jiraNetResolvedColumn.description,/does not affect measurement scores/);
  for(const input of [undefined,{error:'Failed',...row()}, {metrics:{created:{count:2},resolved:{count:4,error:'Failed'}}}, {metrics:{created:{count:null},resolved:{count:4}}}]){
    assert.equal(model.formatJiraMetric(input,'netResolved'),'0');
  }
});

test('exports use current week through today plus exactly four preceding Monday-Sunday weeks',()=>{
  const f=jiraExportFilters(filters,now),weeks=model.jiraWeeks(f);
  assert.equal(f.start,'2026-10-05');assert.equal(f.end,'2026-11-04');
  assert.deepEqual(weeks.map(w=>[w.start,w.end]),[['2026-10-05','2026-10-11'],['2026-10-12','2026-10-18'],['2026-10-19','2026-10-25'],['2026-10-26','2026-11-01'],['2026-11-02','2026-11-04']]);
  for(const [date,start,end] of [[new Date(2026,10,2),'2026-10-05','2026-11-02'],[new Date(2026,10,8),'2026-10-05','2026-11-08'],[new Date(2027,0,1),'2026-11-30','2027-01-01'],[new Date(2028,1,29),'2028-01-31','2028-02-29']]){
    const current=jiraExportFilters(filters,date);assert.equal(current.start,start);assert.equal(current.end,end);assert.equal(model.jiraWeeks(current).length,5);
  }
  assert.equal(filters.start,'2026-06-01');assert.equal(filters.end,'2026-08-23');
});

test('exports never precede First Monday and cap projects at the latest five calendar weeks',async()=>{
  for(const [start,total] of [['2026-11-02',1],['2026-10-26',2],['2026-10-19',3],['2026-10-12',4],['2026-10-05',5],['2026-09-28',5]]){
    const input={...filters,start,end:'2026-11-04'},requests=[],progress=[];
    const data=await loadJiraExportData(input,{now,fetchWeek:async request=>{requests.push(request);return row();},onProgress:(count,length)=>progress.push([count,length])});
    assert.equal(data.weeks.length,total);assert.equal(requests.length,total);
    assert.equal(data.filters.start,start<'2026-10-05'?'2026-10-05':start);
    assert.equal(data.weeks.at(-1).end,'2026-11-04');
    assert.ok(requests.every(request=>request.start>=start));
    assert.deepEqual(progress.map(([count])=>count),Array.from({length:total},(_,i)=>i+1));
    assert.ok(progress.every(([,length])=>length===total));
    assert.equal(input.start,start);
  }
});

test('projects starting in the future do not request or export any earlier weeks',async()=>{
  let requests=0;
  const input={...filters,start:'2026-11-09',end:'2026-11-15'};
  assert.throws(()=>jiraExportFilters(input,now),/start date.*after today/);
  await assert.rejects(loadJiraExportData(input,{now,fetchWeek:async()=>{requests++;return row();}}),/No weeks are available/);
  assert.equal(requests,0);
  const monday=jiraExportFilters({...input,start:'2026-11-02'},new Date(2026,10,2));
  assert.equal(monday.start,'2026-11-02');assert.equal(monday.end,'2026-11-02');
  const yearBoundary=jiraExportFilters({...filters,start:'2026-12-28',end:'2027-01-10'},new Date(2027,0,1));
  assert.equal(yearBoundary.start,'2026-12-28');assert.equal(model.jiraWeeks(yearBoundary).length,1);
});

test('rolling exports preserve selections and moving JQL for new and older projects',()=>{
  const source={...filters,mode:'jql',jql:'project = EX AND created >= "2026-06-01" AND created < "2026-06-08" AND updated >= "2026-06-01" AND summary ~ "2026-06-01"'};
  for(const date of [now,new Date(2026,5,3)]){
    const f=jiraExportFilters(source,date),weeks=model.jiraWeeks(f);
    for(const week of weeks){
      const request=model.jiraWeekRequest(f,week),created=model.jiraQuery(request,'created'),resolved=model.jiraQuery(request,'resolved');
      assert.ok(created.includes(`created >= "${week.start}"`));
      assert.ok(resolved.includes(`updated >= "${week.start}"`));
      assert.ok(resolved.includes('summary ~ "2026-06-01"'));
      assert.ok(!resolved.includes('created >='));
    }
  }
  const fixed=jiraExportFilters({...source,jqlDateMode:'fixed'},now);
  assert.equal(fixed.jql,source.jql);
  const fields=jiraExportFilters({...filters,priorities:['High'],epics:['EX-12'],components:['123'],excludePentest:false},now);
  assert.deepEqual(fields.epics,['EX-12']);assert.deepEqual(fields.components,['123']);assert.deepEqual(fields.priorities,['High']);assert.equal(fields.excludePentest,false);
});

test('one- to four-week tables and charts label the current week and render finite chart coordinates',()=>{
  for(const [start,total] of [['2026-11-02',1],['2026-10-26',2],['2026-10-19',3],['2026-10-12',4]]){
    const data=dataset({...filters,start,end:'2026-11-04'});
    for(const group of ['overall','high'])for(const kind of ['table','trend']){
      const html=jiraExportDataTable(data,group,kind),drawing=jiraExportSVG(data,group,kind);
      assert.equal((html.match(/scope="row"/g)||[]).length,total);
      assert.equal((html.match(/\(current week\)/g)||[]).length,1);
      assert.match(html,/2026-11-02 to 2026-11-04 \(current week\)/);
      assert.ok(drawing.svg.includes(`${total} ${total===1?'week':'weeks'}  |`));
      assert.doesNotMatch(drawing.svg,/NaN|Infinity|undefined|previous 4 weeks/);
      if(kind==='trend'){
        assert.equal((drawing.svg.match(/<circle /g)||[]).length,total*5);
        if(total===1)assert.match(drawing.svg,/<circle cx="394"/); // A single week is centered in the activity plot.
      }
    }
  }
});

test('zero-denominator rates plot as zero in Weekly and Overall charts without changing source counts',()=>{
  for(const section of ['weekly','overall']){
    const data=dataset();data.section=section;data.timeZone='Asia/Hong_Kong';
    const week=data.weeks[0],source={metrics:{created:{count:0,highCount:0},resolved:{count:5,highCount:2},tested:{count:0,highCount:0},failed:{count:3,highCount:1},outstanding:{count:2,highCount:1}}};
    data.rows.set(week.start,source);const original=structuredClone(source);
    for(const group of ['overall','high']){
      const chart=jiraExportSVG(data,group,'trend').svg,date=section==='overall'?'as of '+week.end:week.start;
      assert.ok(chart.includes(`Fixed Rate, ${date}: 0.0%</title>`));
      assert.ok(chart.includes(`Failed Rate, ${date}: 0.0%</title>`));
      assert.ok(chart.includes(`Resolved, ${date}: ${group==='high'?2:5}</title>`));
      assert.equal((chart.match(/<circle /g)||[]).length,data.weeks.length*5);
      assert.doesNotMatch(chart,/NaN|Infinity/);
    }
    assert.deepEqual(source,original);
  }
});

test('five-week retrieval is bounded, preserves errors, and does not reuse unrelated historical rows',async()=>{
  const requests=[],progress=[];let active=0,peak=0;
  const data=await loadJiraExportData(filters,{now,onProgress:count=>progress.push(count),fetchWeek:async request=>{
    requests.push(request);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;
    if(request.start==='2026-10-12')throw new Error('Could not retrieve this week');
    return row();
  }});
  assert.equal(requests.length,5);assert.equal(peak,2);assert.deepEqual(progress,[1,2,3,4,5]);
  assert.equal(requests[0].start,'2026-10-05');assert.equal(requests[4].end,'2026-11-04');
  assert.equal(data.rows.size,5);assert.equal(model.formatJiraMetric(data.rows.get('2026-10-12'),'created'),'0');
  assert.deepEqual(jiraExportIssues(data),['2026-10-12: Could not retrieve this week']);
});

test('closing an export cancels retrieval without progressing through the remaining weeks',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(loadJiraExportData(filters,{now,signal:controller.signal,fetchWeek:async()=>{calls++;controller.abort();return row();}}),{name:'AbortError'});
  assert.equal(calls,1);
});

test('table and chart drawings keep group-specific counts, uncapped rates, missing data, without export query metadata',()=>{
  const data=dataset(),table=jiraExportSVG(data),chart=jiraExportSVG(data,'high','trend');
  assert.match(table.svg,/>Net</);assert.match(table.svg,/>225.0%</);assert.match(table.svg,/>5</);
  assert.match(chart.svg,/>Failed Rate</);assert.match(chart.svg,/Fixed Rate, [^<]+: 33.3%<\/title>/);assert.match(chart.svg,/Failed Rate, [^<]+: 0.0%<\/title>/);
  assert.ok(!chart.svg.includes('225.0%'));
  const html=jiraExportDataTable(data,'high','table');assert.match(html,/>-2</);assert.match(html,/<caption>High Priority/);
  assert.equal((html.match(/scope="row"/g)||[]).length,5);
  data.rows.get(data.weeks[2].start).metrics.created={count:null,highCount:null,error:'Failed'};
  const missing=jiraExportSVG(data,'overall','trend');assert.doesNotMatch(missing.svg,/N\/A/);assert.ok(jiraExportIssues(data).length>0);assert.doesNotMatch(missing.svg,/NaN|Infinity/);
  data.filters={...data.filters,mode:'jql',jql:'summary ~ "<script>"'};
  assert.ok(!jiraExportSVG(data).svg.includes('<script>'));
  assert.doesNotMatch(jiraExportSVG(data).svg,/&lt;script&gt;|Scope:|Generated |PENTEST|JQL dates:|Missing counts display|Rates may exceed/);
  assert.equal(jiraExportFilename(data,'high','trend','pdf'),'custom-query-jira-trend-high-priority-2026-10-05-2026-11-04.pdf');
});

test('PDF cross references and binary image stream lengths use byte offsets',async()=>{
  const jpeg=new Uint8Array([255,216,128,255,217]),blob=jiraImagePDF(jpeg,2880,1560),bytes=new Uint8Array(await blob.arrayBuffer());
  const source=new TextDecoder('latin1').decode(bytes);
  assert.equal(blob.type,'application/pdf');assert.match(source,/^%PDF-1.4/);
  assert.match(source,/\/MediaBox \[0 0 841.89 595.28\]/);assert.match(source,/\/Length 5 >>\nstream/);
  const offset=Number(source.match(/startxref\n(\d+)/)[1]);assert.equal(source.slice(offset,offset+4),'xref');
  const entries=source.slice(offset).split('\n').slice(3,8);
  entries.forEach((entry,i)=>assert.ok(source.slice(Number(entry.slice(0,10))).startsWith(`${i+1} 0 obj`)));
});

test('both sections expose separate priority export controls and weekly CSV includes signed Net Resolved',async()=>{
  const html=jiraView();assert.equal((html.match(/data-jira-action="export-table"/g)||[]).length,4);assert.equal((html.match(/data-jira-action="export-trend"/g)||[]).length,4);
  assert.equal((html.match(/class="highPriorityCreatedRate"/g)||[]).length,1);
  assert.equal((html.match(/class="jira-table-calculation"/g)||[]).length,1);
  for(const section of ['weekly','overall'])for(const group of ['overall','high'])for(const kind of ['table','trend']){
    assert.ok(html.includes(`data-jira-action="export-${kind}" data-group="${group}" data-export-section="${section}"`));
  }
  assert.match(html,/id="jira-export-dialog" aria-labelledby="jira-export-title"/);
  let blob;
  const context=vm.createContext({...model,jiraOverallColumns,jiraOverallTableColumns,jiraOverallExportColumns,h:escapeHTML,structuredClone,Blob,setTimeout:()=>{},URL:{createObjectURL:value=>{blob=value;return 'blob:test';}},document:{createElement:()=>({click(){}})}});
  const source=readFileSync(new URL('../jira.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
  vm.runInContext(source,context);
  context.exampleRow=row();
  vm.runInContext(`state.filters=validateJiraFilters({project:'EX',start:'2026-06-01',end:'2026-06-07'});state.weeks=jiraWeeks(state.filters);state.rows=new Map([['2026-06-01',exampleRow]]);downloadCSV();`,context);
  const csv=await blob.text();assert.match(csv,/"Resolved","Net Resolved","Tested"/);
  assert.match(csv,/"All Priorities","4","9","5","8"/);
  assert.match(csv,/"High Priority","3","1","'-2","2"/);
});

test('Overall exports retrieve true cumulative snapshots once, within the shared project start and five-week limit',async()=>{
  for(const [start,total] of [['2026-11-02',1],['2026-10-26',2],['2026-10-12',4],['2026-10-05',5],['2026-09-28',5]]){
    const requests=[];
    const data=await loadJiraExportData({...filters,start,end:'2026-11-04'},{section:'overall',now,
      fetchWeek:async()=>assert.fail('Overall exports must not sum weekly activity'),
      fetchOverall:async request=>{
        requests.push(request);
        return {timeZone:'Asia/Hong_Kong',rows:model.jiraWeeks(request).map(week=>({...week,...cumulativeRow()})).reverse()};
      }});
    assert.equal(requests.length,1);assert.ok(requests[0].start>=start);
    assert.equal(requests[0].end,'2026-11-04');assert.equal(data.weeks.length,total);
    assert.equal(data.section,'overall');assert.equal(data.timeZone,'Asia/Hong_Kong');
    assert.deepEqual([...data.rows.keys()],data.weeks.map(week=>week.start));
    assert.ok([...data.rows.values()].every(row=>row.metrics.created.count===120));
    assert.deepEqual(jiraExportIssues(data),[]); // Escaped is a weekly-only column.
  }
});

test('Overall table exports retain their priority-specific columns, cutoff dates and timezone, and chart rates use each snapshot',()=>{
  for(const start of ['2026-11-02','2026-10-05']){
    const data=dataset({...filters,start,end:'2026-11-04'});
    data.section='overall';data.timeZone='Asia/Hong_Kong';
    data.rows=new Map(data.weeks.map(week=>[week.start,cumulativeRow()]));
    for(const group of ['overall','high']){
      const table=jiraExportDataTable(data,group,'table'),svg=jiraExportSVG(data,group).svg,chart=jiraExportSVG(data,group,'trend').svg;
      for(const name of ['Total Created','Outstanding','Tested','Resolved','QA Failed','Fixed Rate','Failed Rate'])assert.ok(table.includes(name));
      assert.equal(table.includes('High Priority Created %'),group!=='high');
      for(const output of [table,svg])assert.doesNotMatch(output,/Net Resolved|Escaped|Ready for Deploy/);
      assert.ok(table.includes(group==='high'?'>25.0%</td>':'>10.0%</td>'));
      assert.ok(table.includes(group==='high'?'>60.0%</td>':'>75.0%</td>'));
      assert.match(table,/Period Ending/);assert.match(table,/As of 2026-11-04 \(current week\)/);
      assert.match(svg,/Overall defect statistics/);assert.match(svg,/Cutoffs: Asia\/Hong_Kong/);
      assert.match(chart,/Overall defect trends/);assert.match(chart,/Cumulative rates/);
      assert.match(chart,/Dates show each snapshot cutoff/);assert.doesNotMatch(chart,/NaN|Infinity|Ready for Deploy/);
      assert.ok(chart.includes(group==='high'?': 60.0%</title>':': 75.0%</title>'));
      assert.ok(chart.includes(group==='high'?': 25.0%</title>':': 10.0%</title>'));
      for(const format of ['png','pdf'])for(const kind of ['table','trend']){
        assert.equal(jiraExportFilename(data,group,kind,format),`EX-jira-overall-${kind}-${group==='high'?'high-priority':'all-priorities'}-${start}-2026-11-04.${format}`);
      }
    }
  }
});

test('Overall export failures and missing or mismatched snapshots retain missing-data errors while displaying zero',async()=>{
  const options={section:'overall',now};
  await assert.rejects(loadJiraExportData(filters,{...options,fetchOverall:async()=>{throw new Error('History unavailable');}}),/History unavailable/);
  for(const response of [{rows:[]},{timeZone:'Asia/Hong_Kong'}]){
    await assert.rejects(loadJiraExportData(filters,{...options,fetchOverall:async()=>response}),/incomplete snapshots/);
  }
  const data=await loadJiraExportData(filters,{...options,fetchOverall:async request=>({timeZone:'Asia/Hong_Kong',rows:model.jiraWeeks(request).slice(1).map(week=>({...week,...cumulativeRow(),...(week.start==='2026-11-02'?{end:'2026-11-08'}:{})}))})});
  assert.equal(jiraExportIssues(data).length,2);
  assert.equal(model.formatJiraMetric(data.rows.get('2026-10-05'),'created'),'0');
  assert.equal(model.formatJiraMetric(data.rows.get('2026-11-02'),'created'),'0');
  const chart=jiraExportSVG(data,'high','trend').svg;
  assert.equal(jiraExportIssues(data).length,2);assert.doesNotMatch(chart,/NaN|Infinity/);
});

test('Overall exports preserve the query and stop cleanly for future starts or cancellation',async()=>{
  const source={...filters,mode:'jql',jql:'project = EX AND created >= "2026-06-01" AND updated >= "2026-06-01"'};
  const controller=new AbortController();let request;
  await assert.rejects(loadJiraExportData(source,{section:'overall',now,signal:controller.signal,fetchOverall:async input=>{
    request=input;controller.abort();return {timeZone:'Asia/Hong_Kong',rows:[]};
  }}),{name:'AbortError'});
  assert.equal(request.start,'2026-10-05');
  assert.match(model.jiraScope(request,'overall'),/updated >= "2026-10-05"/);
  assert.doesNotMatch(model.jiraScope(request,'overall'),/created >=/);
  await assert.rejects(loadJiraExportData({...filters,start:'2026-11-09',end:'2026-11-15'},{section:'overall',now,fetchOverall:async()=>assert.fail('No future project requests')}),/No weeks are available/);
});
