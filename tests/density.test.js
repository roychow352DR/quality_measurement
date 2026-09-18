import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,emptyDefectDensity,densityMeasures,densitySummary,scoreMetric,releaseMetrics,calculate,validateValue,validateDraft,parseDraft,exampleDraft,ragLabel,formatScore,formatDensityRatio} from '../metrics.js';
import {reportBody,reportDocument,csvDocument,methodologyDocument,densityNote,reportFilterDetails} from '../report.js';
import {referenceDocument} from '../reference.js';

const metric=releaseMetrics.find(m=>m.id==='density');
const example={defects:10,testCases:100,requirements:25,manDays:50};

test('Three independent density bands classify exact boundaries without rounding ratios',()=>{
  const fixtures={testCases:[[0,100],[5000,100],[5001,60],[10000,60],[10001,0]],requirements:[[20000,100],[20001,60],[40000,60],[40001,0]],manDays:[[20000,100],[20001,60],[35000,60],[35001,0]]};
  for(const [key,cases] of Object.entries(fixtures))for(const [defects,points] of cases){
    const result=densitySummary({defects,[key]:100000});
    assert.equal(result.count,1);assert.equal(result.score,points,`${key}: ${defects}/100000`);
    assert.equal(result.measures.find(m=>m.id===key).value,defects/100000);
  }
  assert.equal(densitySummary({defects:1,manDays:2.5}).score,0);
});

test('Composite averages points, keeps precision, and contributes exactly once to Development, Release and Overall',()=>{
  const d=blankDraft();d.release.functional=95;d.release.escaped=3;
  d.weeks=[{start:'2026-09-07',end:'2026-09-13',values:{functional:95,open:6},trends:{}}];
  const before=calculate(d);d.release.density=example;
  const result=densitySummary(example),after=calculate(d);
  assert.deepEqual(result.measures.map(m=>m.score),[60,60,100]);
  assert.equal(result.score,220/3);assert.equal(result.points,220);assert.equal(result.count,3);
  assert.equal(scoreMetric(metric,example),220/3);assert.equal(formatScore(result.score),'73.3');assert.equal(ragLabel(result.score),'Amber');
  for(const [a,b] of [[after.overall,before.overall],[after.release,before.release],[after.perspectives.development.overall,before.perspectives.development.overall]]){
    assert.equal(a.count,b.count+1);assert.equal(a.points,b.points+220/3);assert.equal(a.score,a.points/a.count);
  }
  assert.deepEqual(after.perspectives.qa,before.perspectives.qa);assert.deepEqual(after.weekly,before.weekly);
  assert.equal(densitySummary({...example,testCases:200}).score,260/3);
});

test('Partial coverage excludes missing and zero denominators but includes measured zero points',()=>{
  assert.equal(densitySummary({defects:10,testCases:100,requirements:0}).score,60);
  const partial=densitySummary({defects:10,testCases:100,requirements:1});
  assert.equal(partial.count,2);assert.equal(partial.points,60);assert.equal(partial.score,30);
  assert.match(densityNote({defects:10,testCases:100,requirements:1}),/Partial · 2 of 3 measured/);
  assert.equal(densitySummary({defects:0,testCases:100,requirements:25,manDays:50}).score,100);
  for(const value of [undefined,null,'',emptyDefectDensity(),{defects:'',testCases:100},{defects:0,testCases:0},{defects:10,testCases:0,requirements:0,manDays:0}]){
    assert.equal(scoreMetric(metric,value),null);assert.equal(densitySummary(value).count,0);
  }
  const d=blankDraft();d.release.density={defects:1,testCases:0};assert.equal(calculate(d).overall.count,0);
});

test('Density validation rejects invalid shapes and values; unfinished scalar edits can be retained without scoring',()=>{
  for(const value of [1.05,[],{defects:-1},{defects:1.5},{defects:Infinity},{defects:10,testCases:1.5},{defects:10,requirements:-1},{defects:10,manDays:'x'},{defects:10,manDays:true}]){
    assert.ok(validateValue(metric,value));assert.equal(scoreMetric(metric,value),null);assert.equal(densitySummary(value).score,null);
  }
  const d=blankDraft();d.release.density={...example,testCases:-1};
  assert.throws(()=>parseDraft(d));assert.equal(parseDraft(d,{allowInvalid:true}).release.density.testCases,-1);
  assert.ok(validateDraft(d).some(e=>e.includes('Distinct executed test cases')));
  for(const value of [[],{},true]){
    d.release.density={...example,defects:value};assert.throws(()=>parseDraft(d,{allowInvalid:true}));
  }
});

test('Old effort ratios are preserved but never converted into new counts or silently reused in the composite',()=>{
  for(const version of [1,2,3,4])for(const ratio of [0,1.05,'0.205']){
    const d=blankDraft();d.version=version;d.release.density=ratio;
    const migrated=parseDraft(d);
    assert.equal(migrated.version,5);assert.equal(migrated.release.legacyDensity,ratio);
    assert.deepEqual(migrated.release.density,emptyDefectDensity());assert.equal(calculate(migrated).overall.count,0);
    assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(migrated))),migrated);
    assert.match(reportBody({draft:migrated}),/Previous man-days density/);
  }
  const d=exampleDraft();assert.equal(d.release.legacyDensity,1.05);assert.equal(scoreMetric(metric,d.release.density),null);
  d.release.density={defects:'10',testCases:'100',requirements:'25',manDays:'50.0'};
  assert.deepEqual(parseDraft(JSON.parse(JSON.stringify(d))),d);
  assert.equal(scoreMetric(metric,parseDraft(d).release.density),220/3);
});

test('Report, HTML, CSV and filtered views retain the composite, sub-measures and partial coverage together',()=>{
  const d=blankDraft();d.release.density=example;const snapshot={draft:d};
  for(const html of [reportBody(snapshot),reportDocument(snapshot,''),reportBody(snapshot,{component:'Defect Density',label:'development'})]){
    assert.equal((html.match(/data-report-metric="density"/g)||[]).length,1);
    assert.equal((html.match(/data-density-measure=/g)||[]).length,3);
    assert.match(html,/<td>3 of 3 measured<\/td><td>73.3<\/td><td><span class="badge amber">Amber/);
    assert.match(html,/\(60 \+ 60 \+ 100\) ÷ 3 = 73.3 points/);
    assert.doesNotMatch(html,/NaN|Infinity|\[object Object\]/);
  }
  const filtered=reportBody(snapshot,{label:'qa'});
  assert.doesNotMatch(filtered,/data-report-metric="density"|data-density-measure=/);
  assert.equal(reportFilterDetails(d,{component:'Defect Density'}).visible,1);
  const csv=csvDocument(snapshot,{component:'Defect Density'});
  assert.equal(csv.split('\r\n').filter(line=>line.startsWith('"Density sub-measure"')).length,3);
  assert.match(csv,/"Overall Defect Density Score","3 of 3 measured","73.3","Amber"/);
  assert.match(csv,/Defects: 10; denominator: 100/);
  assert.doesNotMatch(csvDocument(snapshot,{label:'qa'}),/"Density sub-measure"/);
  d.release.density.requirements='';assert.match(reportDocument(snapshot,''),/Partial · 2 of 3 measured/);
});

test('Methodology lists all dedicated bands and separates composite status from sub-measure point awards',()=>{
  const html=methodologyDocument();
  assert.equal((html.match(/data-density-threshold=/g)||[]).length,3);
  for(const m of densityMeasures){
    assert.match(html,new RegExp(`data-density-threshold="${m.id}"`));
    assert.ok(html.includes(m.name));
  }
  assert.match(html,/without converting that average back to 100\/60\/0/);
  assert.match(html,/Average ≥ 85 pts/);assert.match(html,/Average ≥ 60 and &lt; 85 pts/);
  assert.match(html,/73.3 · Amber/);assert.match(html,/not validated market or ISTQB benchmarks/);
  const reference=referenceDocument();for(const m of densityMeasures)assert.ok(reference.includes(m.name));
  assert.doesNotMatch(reference,/data-density-threshold|Green ≤ 0.05/);
});

test('Density rendering escapes historical input and never prints non-finite calculated ratios',()=>{
  const d=blankDraft();d.release.density=example;d.release.legacyDensity='<script>alert(1)</script>';
  const html=reportDocument({draft:d},'');assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  assert.equal(densitySummary({defects:1e9,manDays:1e-320}).score,null);
  assert.equal(densitySummary({defects:1e9,manDays:0.1}).score,0);
  assert.equal(formatDensityRatio(1e-8),'0.00');
});
