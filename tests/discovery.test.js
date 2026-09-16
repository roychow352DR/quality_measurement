import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,emptyUatDiscovery,exampleDraft,parseDraft,calculate,validateDraft,validateValue,weeklyMetrics,releaseMetrics,scoreMetric,scoredCount,discoverySummary,releaseValues,uatDiscoveryShare,formatValue,thresholds,RULE_VERSION} from '../metrics.js';
import {reportBody,reportDocument,csvDocument,methodologyDocument,statsHTML,reportCharts,metricBadge,discoveryNote} from '../report.js';
import {referenceSections} from '../reference.js';

const metric=releaseMetrics.find(m=>m.id==='uatDiscovery');
const week=(created,totalCreated)=>({start:'2026-06-01',end:'2026-06-05',values:{created},trends:{totalCreated}});

test('Discovery volume cannot change any score, scored denominator, or measured-week denominator',()=>{
  const d=blankDraft();d.release.functional=95;d.weeks=[{...week('',0),values:{created:'',open:0}}];
  const before=calculate(d);
  for(const count of [0,2,6,500]) {
    d.weeks[0].values.created=count;d.weeks[0].trends.totalCreated=count;
    d.release.averageCreated=count;
    assert.deepEqual(calculate(d),before);
    assert.equal(scoreMetric(weeklyMetrics.find(m=>m.id==='created'),count),null);
    assert.equal(scoreMetric(metric,d.release.uatDiscovery),null);
  }
  d.weeks=[week(11,19)];d.release={uatDiscovery:{preUat:1,uat:6}};
  assert.equal(calculate(d).overall.count,0);
  assert.equal(calculate(d).weekly.measuredWeeks,0);
  assert.ok(validateDraft(d,{requireReady:true}).some(error=>error.includes('scored live metric')));
  assert.equal(scoredCount(weeklyMetrics),8);assert.equal(scoredCount(releaseMetrics),19);
});

test('Average comes only from valid measured weekly counts, including zero and excluding blanks',()=>{
  const d=blankDraft();d.release.averageCreated=999;
  d.weeks=[week(4,12),week(0,0),week('',7),week(undefined,''),week(-1,-1),week(1.5,2.5)];
  assert.deepEqual(discoverySummary(d.weeks),{all:{total:19,count:3,average:19/3},p01:{total:4,count:2,average:2},weeks:6});
  assert.equal(releaseValues(d).averageCreated,2);assert.equal(d.release.averageCreated,999);
  d.weeks=[];assert.equal(releaseValues(d).averageCreated,null);
  const example=exampleDraft();assert.equal(example.release.averageCreated,3);
  assert.equal(releaseValues(example).averageCreated,32/12);
  assert.equal(formatValue(releaseMetrics.find(m=>m.id==='averageCreated'),releaseValues(example).averageCreated),'2.7');
});

test('UAT share requires the complete two-part population and zero denominator stays N/A',()=>{
  for(const [preUat,uat,expected] of [[20,6,6/26*100],[1,6,6/7*100],[20,0,0],[0,6,100],[0,0,null],['',6,null],[20,'',null],['','',null]]) {
    const value={...emptyUatDiscovery(),preUat,uat};
    assert.equal(uatDiscoveryShare(value),expected);
    assert.equal(formatValue(metric,value),expected===null?'N/A':`${expected.toFixed(1)}%`);
    assert.equal(scoreMetric(metric,value),null);
  }
  for(const value of [{preUat:-1,uat:6},{preUat:1.5,uat:6},{preUat:Infinity,uat:6},{preUat:20,uat:6,criticalUat:7},{preUat:20,uat:6,criticalUat:-1},{preUat:20,uat:6,notes:[]},{preUat:20,uat:6,notes:'x'.repeat(2001)}]) {
    assert.ok(validateValue(metric,value));assert.equal(uatDiscoveryShare(value),null);
  }
  assert.equal(validateValue(metric,{preUat:20,uat:6,criticalUat:6,notes:'Three agreed-scope bugs; investigate test data.'}),null);
});

test('Old backups retain historical comparison counts without converting them into pre-UAT data',()=>{
  for(const version of [1,2,3]) {
    const old={...blankDraft(),version,release:{comparison:{regression:1,uat:6},averageCreated:3}};
    const next=parseDraft(old);
    assert.equal(next.version,4);assert.deepEqual(next.release.comparison,{regression:1,uat:6});
    assert.deepEqual(next.release.uatDiscovery,emptyUatDiscovery());
    assert.equal(next.release.averageCreated,3);assert.equal(releaseValues(next).averageCreated,null);
    assert.equal(calculate(next).overall.count,0);
    assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(next))),next);
  }
  assert.notEqual(RULE_VERSION,'2026-09-11.report-v3');
});

test('New UAT inputs and notes survive reload and imports validate counts and shapes',()=>{
  const d=exampleDraft();d.release.uatDiscovery={preUat:'20',uat:'6',criticalUat:'1',notes:'Requirement clarified\n<QA> & Development'};
  const restored=parseDraft(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(restored,d);assert.equal(uatDiscoveryShare(restored.release.uatDiscovery),6/26*100);
  d.release.uatDiscovery.criticalUat='7';assert.throws(()=>parseDraft(d));
  assert.equal(parseDraft(d,{allowInvalid:true}).release.uatDiscovery.criticalUat,'7');
  for(const bad of [42,[],{preUat:{value:20},uat:6},{preUat:20,uat:6,notes:[]},{preUat:20,uat:6,notes:'x'.repeat(2001)}]) {
    d.release.uatDiscovery=bad;assert.throws(()=>parseDraft(d,{allowInvalid:true}));
  }
});

test('Report, HTML and CSV use derived values, informational counts, scored UAT results, and safely escaped context',()=>{
  const d=exampleDraft();d.release.uatDiscovery={preUat:20,uat:6,criticalUat:1,notes:'<script>alert(1)</script>\n=SUM(A1)'};
  const snapshot={draft:d};
  for(const html of [reportBody(snapshot),reportDocument(snapshot,'')]) {
    assert.match(html,/73 total defects across 12 measured weeks/);
    assert.match(html,/32 P0\/P1 defects across 12 measured weeks; average 2.7/);
    assert.match(html,/32 P0\/P1 defects ÷ 12 measured weeks = 2.7/);
    assert.match(html,/Previous inputs \(not used in the rate\): Regression 1 \/ UAT 6/);
    assert.match(html,/P0\/P1 UAT discoveries: 1/);
    assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
    const row=html.match(/<tr data-report-metric="uatDiscovery"[\s\S]*?<\/tr>/)[0];
    assert.match(row,/<td>23.1%<\/td><td>0<\/td><td><span class="badge red">Red/);
  }
  const csv=csvDocument(snapshot);
  assert.match(csv,/"UAT Discovery Rate","23.1%","0","Red"/);
  assert.match(csv,/"Average weekly P0\/P1 created","2.7","N\/A","Informational"/);
  assert.match(csv,/Pre-UAT: 20; UAT: 6; P0\/P1 UAT discoveries: 1/);
  assert.match(statsHTML(d),/Scored Measurement Coverage/);assert.match(statsHTML(d),/51<small>\/ 115/);
  assert.deepEqual(reportCharts(d.weeks)[0].series[1].values,d.weeks.map(w=>w.values.created));
});

test('Methodology and reference explain the changed population without obsolete comparison thresholds',()=>{
  const html=methodologyDocument();
  assert.doesNotMatch(html,/Regression ≥ UAT|0 vs 0 is Green|Regression &lt; 90%/);
  assert.equal((html.match(/Informational · no RAG thresholds or points/g)||[]).length,2);
  assert.match(html,/zero divided by zero is N\/A/);
  const ref=referenceSections[2].items.find(m=>m.id==='uatDiscovery');
  assert.match(ref.note,/replacing the PDF/);assert.match(ref.note,/not treated as the complete pre-UAT population/);
  const d=exampleDraft(),filtered=reportBody({draft:d},{label:'qa'});
  assert.doesNotMatch(filtered,/discovery-overview/);
  assert.match(filtered,/data-report-metric="uatDiscovery"/);
});

test('UAT pilot bands include exact boundaries and score unrounded percentages',()=>{
  for(const [preUat,uat,criticalUat,points] of [
    [90,10,0,100],[80,20,0,60],[20,6,0,0],[20,0,0,100],[0,6,0,0],
    [91,9,0,100],[81,19,0,60],[79,21,0,0],
    [899999,100001,0,60],[799999,200001,0,0],
    [95,5,1,0],[90,10,1,0],[80,20,1,0],[20,6,6,0],
  ])assert.equal(scoreMetric(metric,{preUat,uat,criticalUat}),points,`${preUat}/${uat}/${criticalUat}`);
  assert.equal(formatValue(metric,{preUat:899999,uat:100001,criticalUat:0}),'10.0%');
  assert.equal(formatValue(metric,{preUat:799999,uat:200001,criticalUat:0}),'20.0%');
  assert.equal(scoreMetric(metric,{preUat:'90',uat:'10',criticalUat:'0'}),100);
});

test('Missing UAT counts and a zero population remain N/A, never an inferred zero or a pass',()=>{
  for(const value of [undefined,null,emptyUatDiscovery(),{preUat:20},{uat:6},{preUat:20,uat:6},{preUat:95,uat:5,criticalUat:''},{preUat:95,criticalUat:1},{uat:5,criticalUat:1},{preUat:0,uat:0,criticalUat:0}]) {
    assert.equal(validateValue(metric,value),null);
    assert.equal(scoreMetric(metric,value),null);
    const d=blankDraft();d.release.uatDiscovery=value;
    assert.deepEqual(calculate(d).overall,{count:0,points:0,score:null});
  }
  assert.equal(formatValue(metric,{preUat:95,uat:5}),'5.0%');
  assert.match(metricBadge(metric,{preUat:95,uat:5}),/N\/A/);
  assert.match(discoveryNote(metric,{uatDiscovery:{preUat:95,uat:5}}),/Enter 0 P0\/P1 UAT discoveries explicitly/);
  for(const value of [{preUat:-1,uat:5,criticalUat:0},{preUat:20,uat:6,criticalUat:7},{preUat:20,uat:6,criticalUat:0.5},{preUat:20,uat:6,criticalUat:NaN}]) {
    assert.ok(validateValue(metric,value));assert.equal(scoreMetric(metric,value),null);
  }
});

test('UAT contributes exactly once to QA, Release, and Overall while Development and weekly scores stay unchanged',()=>{
  const d=exampleDraft(),before=calculate(d);
  d.release.uatDiscovery={preUat:95,uat:5,criticalUat:1,notes:'Confirmed critical issue, now fixed.'};
  const after=calculate(d);
  assert.deepEqual(after.release,{count:15,points:1020,score:68});
  assert.deepEqual(after.perspectives.qa.overall,{count:5,points:300,score:60});
  assert.deepEqual(after.perspectives.development,before.perspectives.development);
  assert.deepEqual(after.weekly,before.weekly);
  assert.equal(after.overall.count,before.overall.count+1);
  assert.equal(after.overall.points,before.overall.points);
  assert.equal(after.overall.score,3460/51);
  for(const [counts,points] of [[{preUat:90,uat:10,criticalUat:0},100],[{preUat:80,uat:20,criticalUat:0},60]]) {
    d.release.uatDiscovery=counts;const scored=calculate(d);
    assert.equal(scored.overall.points,before.overall.points+points);
    assert.equal(scored.overall.count,before.overall.count+1);
    assert.equal(scored.perspectives.qa.overall.points,before.perspectives.qa.overall.points+points);
  }
});

test('P0/P1 UAT override and pilot thresholds are explicit in input badges, reports and exports',()=>{
  const d=exampleDraft();d.release.uatDiscovery={preUat:95,uat:5,criticalUat:1,notes:'Fixed after UAT discovery'};
  for(const html of [reportBody({draft:d}),reportDocument({draft:d},'')]) {
    const row=html.match(/<tr data-report-metric="uatDiscovery"[\s\S]*?<\/tr>/)[0];
    assert.match(row,/<td>5.0%<\/td><td>0<\/td><td><span class="badge red">Red/);
    assert.match(row,/P0\/P1 UAT discovery override: Red, 0 points/);
    assert.match(row,/class="critical-override">P0\/P1 UAT discovery/);
    assert.match(html,/overall-rag-result[\s\S]*?67.8[\s\S]*?badge amber/);
  }
  assert.match(csvDocument({draft:d}),/"UAT Discovery Rate","5.0%","0","Red"/);
  const method=methodologyDocument();
  for(const text of thresholds(metric))assert.ok(method.includes(text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')));
  assert.match(method,/All three counts must be supplied for scoring/);
  assert.match(method,/not prescribed ISTQB or market benchmarks/);
  assert.doesNotMatch(method,/UAT share are informational|share is informational|no RAG thresholds or points until/);
  assert.notEqual(RULE_VERSION,'2026-09-16.discovery-v4');
});
