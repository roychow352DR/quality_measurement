import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyMetrics as weekly,releaseMetrics as release,trendMetrics,blankDraft,scoreMetric,calculate,validateDraft,validateValue,parseDraft,exampleDraft,ragLabel,formatScore} from '../metrics.js';
import {reportDocument,csvDocument,reportBody} from '../report.js';
const metric=(id,scope=release)=>scope.find(m=>m.id===id);
test('Score presentation has one decimal and does not change RAG precision',()=>{
  for(const [score,text] of [[null,'—'],[0,'0.0'],[100,'100.0'],[160/3,'53.3'],[71.25,'71.3'],[84.96,'85.0'],[59.96,'60.0']])assert.equal(formatScore(score),text);
  assert.equal(ragLabel(84.96),'Amber');assert.equal(ragLabel(59.96),'Red');
});
// Explicit boundary fixtures ensure the source's differently scoped thresholds are respected.
const cases=[
 ['created',weekly,[[0,100],[2,100],[3,60],[5,60],[6,0]]],
 ['open',weekly,[[0,100],[2,100],[3,60],[5,60],[6,0]]],
 ['aging',weekly,[[0,100],[3,100],[3.5,60],[7,60],[7.01,0]]],
 ['fixed',weekly,[[79.99,0],[80,60],[99.99,60],[100,100],[500,100]]],
 ['reopened',weekly,[[0,100],[5,100],[5.5,60],[10,60],[10.01,0]]],
 ['functional',weekly,[[89.99,0],[90,60],[94.5,60],[95,100]]],
 ['regression',weekly,[[89.99,0],[90,60],[94.99,60],[95,100]]],
 ['firstRun',weekly,[[79.99,0],[80,60],[89.99,60],[90,100]]],
 ['flaky',weekly,[[5,100],[5.5,60],[10,60],[10.01,0]]],
 ['escaped',release,[[2,100],[3,60],[5,60],[6,0]]],
 ['leakage',release,[[5,100],[5.5,60],[10,60],[10.01,0]]],
 ['crashSessions',release,[[97.99,0],[98,60],[98.99,60],[99,100]]],
 ['crashUsers',release,[[97.99,0],[98,60],[98.99,60],[99,100]]],
 ['incidents',release,[[3,100],[4,60],[6,60],[7,0]]],
 ['hotfixes',release,[[0,100],[1,60],[2,0]]],
 ['functional',release,[[89.99,0],[90,60],[94.99,60],[95,100]]],
 ['completion',release,[[94.99,0],[95,60],[97.99,60],[98,100]]],
 ['regression',release,[[89.99,0],[90,60],[94.99,60],[95,100]]],
 ['openAtRelease',release,[[0,100],[1,60],[2,0]]],
 ['density',release,[[0.2,100],[0.205,60],[0.35,60],[0.3501,0]]],
 ['coverage',release,[[64.99,0],[65,60],[79.99,60],[80,100]]],
 ['firstRun',release,[[79.99,0],[80,60],[89.99,60],[90,100]]],
 ['flaky',release,[[5,100],[5.5,60],[10,60],[10.01,0]]],
 ['averageCreated',release,[[2,100],[2.05,60],[3.5,60],[3.51,0]]],
 ['open',release,[[2,100],[3,60],[5,60],[6,0]]],
 ['aging',release,[[3,100],[3.5,60],[7,60],[7.01,0]]],
 ['fixed',release,[[79.99,0],[80,60],[99.99,60],[100,100],[500,100]]],
 ['reopened',release,[[5,100],[5.5,60],[10,60],[10.01,0]]],
];
for(const [id,scope,values] of cases)test(`${scope===weekly?'Weekly':'Release'} ${id} thresholds`,()=>{for(const [v,s]of values)assert.equal(scoreMetric(metric(id,scope),v),s,`value ${v}`);});
test('Regression / UAT precedence, boundary and zero',()=>{const m=metric('comparison');for(const [r,u,score]of [[0,0,100],[10,0,100],[10,10,100],[11,10,100],[9,10,60],[8,10,0]])assert.equal(scoreMetric(m,{regression:r,uat:u}),score);assert.equal(scoreMetric(m,{regression:0,uat:''}),null);assert.ok(validateValue(m,{regression:0,uat:''}));});
test('Zero counts; blank is excluded; invalid values are rejected',()=>{const m=metric('escaped');assert.equal(scoreMetric(m,0),100);for(const v of ['',null,undefined])assert.equal(scoreMetric(m,v),null);for(const v of [-1,1.5,NaN,Infinity,'no',true,[],{}])assert.ok(validateValue(m,v));assert.ok(validateValue(metric('leakage'),101));assert.equal(validateValue(metric('fixed'),500),null);});
test('Health uses actual measured denominator and original precision',()=>{const d=blankDraft();assert.equal(calculate(d).overall.score,null);d.release.escaped=2;d.release.leakage=7;d.weeks=[{start:'2026-06-01',end:'2026-06-05',values:{created:6},trends:{totalCreated:999}}];const s=calculate(d);assert.deepEqual(s.overall,{count:3,points:160,score:160/3});assert.equal(s.release.score,80);assert.equal(s.weekly.score,0);assert.equal(ragLabel(84.999),'Amber');assert.equal(ragLabel(85),'Green');assert.equal(ragLabel(59.999),'Red');});
test('Required project fields, impossible dates, overlap and partial comparison',()=>{const d=blankDraft();assert.equal(validateDraft(d,{requireReady:true}).length,4);d.project={name:'Test',owner:'Owner',releaseDate:'2026-02-30',description:''};d.release.escaped=0;assert.ok(validateDraft(d,{requireReady:true}).some(e=>e.includes('valid date')));d.project.releaseDate='2026-08-24';d.weeks=[{start:'2026-06-01',end:'2026-06-05',values:{},trends:{}},{start:'2026-06-05',end:'2026-06-08',values:{},trends:{}}];assert.ok(validateDraft(d).some(e=>e.includes('overlap')));});
test('Backup round trip, rejection and original example rescore',()=>{const d=exampleDraft();assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(d))),d);assert.equal(validateDraft(d,{requireReady:true}).length,0);assert.equal(calculate(d).release.count,16);assert.equal(calculate(d).release.points,1080);assert.equal(calculate(d).release.score,67.5);assert.equal(calculate(d).weekly.count,48);assert.throws(()=>parseDraft({}));assert.throws(()=>parseDraft({...d,weeks:new Array(105).fill(d.weeks[0])}));const bad=structuredClone(d);bad.release.leakage='abc';assert.throws(()=>parseDraft(bad));});
test('Standalone report escapes project HTML; CSV prevents spreadsheet formulas',()=>{const d=blankDraft();d.project={name:'<script>alert(1)</script>',owner:'=1+1',releaseDate:'2026-08-24',description:'Quotes " and\nnew line'};d.release.escaped=0;const s={draft:d,generatedAt:'2026-09-11T00:00:00Z'};const html=reportDocument(s,'body{color:black}');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('100'));assert.ok(csvDocument(s).includes('"\'=1+1"'));assert.ok(csvDocument(s).includes('"Quotes "" and\nnew line"'));assert.ok(reportBody(s).includes('No weekly measurements'));});
test('Unfinished invalid browser drafts survive reload but imports stay strict',()=>{const d=blankDraft();d.release.leakage='101';assert.throws(()=>parseDraft(d));assert.equal(parseDraft(d,{allowInvalid:true}).release.leakage,'101');assert.ok(validateDraft(parseDraft(d,{allowInvalid:true})).some(e=>e.includes('percentage')));d.release.leakage={bad:true};assert.throws(()=>parseDraft(d,{allowInvalid:true}));});

test('Version 1 backups preserve removed weekly values without reinterpreting them',()=>{const old=blankDraft();old.version=1;old.project.name='Existing project';old.release.escaped=4;old.weeks=[{start:'2026-06-01',end:'2026-06-05',values:{incidents:1,escaped:5,hotfixes:0,functional:95},trends:{totalCreated:12}}];const next=parseDraft(old);assert.equal(next.version,3);assert.equal(next.project.name,'Existing project');assert.equal(next.release.escaped,4);assert.deepEqual(next.weeks[0].legacyValues,{incidents:1,escaped:5,hotfixes:0});for(const id of ['created','open','aging','fixed','reopened'])assert.equal(next.weeks[0].values[id],'');assert.equal(next.weeks[0].values.functional,95);assert.equal(next.weeks[0].trends.totalCreated,12);assert.equal(calculate(next).weekly.count,1);assert.equal(calculate(next).weekly.score,100);assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(next))),next);});
test('Nine weekly metrics drive score coverage and report exports',()=>{const d=blankDraft();d.project={name:'Updated weekly metrics',owner:'QA',releaseDate:'2026-09-18',description:''};d.weeks=[{start:'2026-09-07',end:'2026-09-11',values:{created:2,open:5,aging:7.1,fixed:150,reopened:5.5,functional:95,regression:90,firstRun:90,flaky:11},trends:{}}];assert.equal(weekly.length,9);assert.equal(calculate(d).weekly.points,580);assert.equal(calculate(d).weekly.count,9);assert.equal(calculate(d).weekly.score,580/9);const snapshot={draft:d,generatedAt:'2026-09-11T00:00:00Z'};const html=reportBody(snapshot),csv=csvDocument(snapshot);assert.ok(html.includes('/ 29'));assert.ok(html.includes('20 N/A'));assert.ok(html.includes('Reopened in week ÷ tested in week × 100%'));assert.ok(html.includes('EQ-Measurement Metrics-110926-043342.pdf'));assert.ok(csv.includes('"Weekly","2026-09-07 to 2026-09-11","Defect flow & backlog health","Defects fixed rate","150%","100","Green"'));for(const name of ['Customer-reported incidents','Escaped P0/P1 defects','Rollback / hotfix count'])assert.ok(!csv.split('\r\n').some(line=>line.startsWith('"Weekly"')&&line.includes('"'+name+'"')));});
test('New weekly validation accepts backlog clearance and rejects fractional counts',()=>{assert.ok(validateValue(metric('created',weekly),2.5));assert.ok(validateValue(metric('open',weekly),-1));assert.equal(validateValue(metric('fixed',weekly),500),null);assert.ok(validateValue(metric('reopened',weekly),101));assert.equal(validateValue(metric('aging',weekly),3.5),null);});

test('All metrics have exactly one agreed primary perspective and shared labels preserve scope',()=>{
  assert.deepEqual(weekly.filter(m=>m.perspective==='qa').map(m=>m.id),['functional','regression','firstRun','flaky']);
  assert.deepEqual(release.filter(m=>m.perspective==='qa').map(m=>m.id),['leakage','functional','completion','regression','coverage','firstRun','flaky','comparison']);
  assert.equal(weekly.filter(m=>m.perspective==='development').length,5);
  assert.equal(release.filter(m=>m.perspective==='development').length,12);
  for(const m of [...weekly,...release,...trendMetrics]){assert.ok(['qa','development'].includes(m.perspective));assert.equal(typeof m.shared,'boolean');}
  assert.equal(metric('open',weekly).shared,true);assert.equal(metric('open',release).shared,false);
  assert.ok(trendMetrics.every(m=>m.perspective==='development'));
});
test('Perspective scores partition scored observations without counting shared outcomes twice',()=>{
  const d=blankDraft();d.release.leakage=0;d.release.escaped=3;
  d.weeks=[{start:'2026-06-01',end:'2026-06-05',values:{functional:100,open:6},trends:{totalEscaped:0}},
    {start:'2026-06-08',end:'2026-06-12',values:{functional:0,regression:90,open:0,created:3,reopened:11},trends:{}}];
  const s=calculate(d),qa=s.perspectives.qa,dev=s.perspectives.development;
  assert.deepEqual(qa.overall,{count:4,points:260,score:65});
  assert.deepEqual(dev.overall,{count:5,points:220,score:44});
  assert.equal(s.overall.count,qa.overall.count+dev.overall.count);
  assert.equal(s.overall.points,qa.overall.points+dev.overall.points);
  assert.equal(s.overall.score,480/9);assert.notEqual(s.overall.score,(65+44)/2);
  assert.equal(qa.weeks[0].score,100);assert.equal(dev.weeks[0].score,0);
  assert.equal(qa.release.score,100);assert.equal(dev.release.score,60);
  assert.equal(s.weekly.score,(50+220/5)/2);
});
test('Perspective blanks, invalid entries, partial comparisons and historical values do not score',()=>{
  const d=blankDraft();d.release.comparison={regression:0,uat:''};d.release.functional=101;
  d.weeks=[{start:'',end:'',values:{open:0},trends:{totalCreated:0,escapedP01:9},legacyValues:{escaped:99}}];
  let s=calculate(d);
  assert.deepEqual(s.perspectives.qa.overall,{count:0,points:0,score:null});
  assert.deepEqual(s.perspectives.development.overall,{count:1,points:100,score:100});
  d.release.comparison={regression:0,uat:0};d.release.functional=0;
  s=calculate(d);assert.deepEqual(s.perspectives.qa.overall,{count:2,points:100,score:50});
  d.release.regression=90;s=calculate(d);
  assert.equal(s.perspectives.qa.overall.score,160/3);
  assert.equal(ragLabel(s.perspectives.qa.overall.score),'Red');
});
