import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDraft,exampleDraft,weeklyMetrics,releaseMetrics,calculate} from '../metrics.js';
import {normalizeReportFilters,reportFilterOptions,reportFilterDetails,matchesReportMetric,reportBody,reportDocument,csvDocument,reportCharts,statsHTML} from '../report.js';
const snapshot=draft=>({draft,generatedAt:'2026-09-11T00:00:00Z'});
const metricRows=html=>[...html.matchAll(/data-report-metric="([^"]+)" data-perspective="([^"]+)"/g)];

test('Filter options use the existing labels and unique components; invalid options cannot enter exports',()=>{
  assert.deepEqual(reportFilterOptions.label.map(o=>o.name),['All labels','QA','Development']);
  assert.equal(reportFilterOptions.component.length,6);
  assert.deepEqual(normalizeReportFilters(),{label:'',component:''});
  assert.deepEqual(normalizeReportFilters(null),{label:'',component:''});
  assert.deepEqual(normalizeReportFilters({label:'<script>',component:'unknown'}),{label:'',component:''});
  assert.doesNotMatch(reportDocument(snapshot(blankDraft()),'',{label:'<script>alert(1)</script>'}),/<script>/);
});

test('Label and component filters intersect and removed labels fall back to all labels',()=>{
  const d=exampleDraft(),qa=reportFilterDetails(d,{label:'qa'}),dev=reportFilterDetails(d,{label:'development'}),removed=reportFilterDetails(d,{label:'shared'});
  assert.equal(qa.weekly.length,4);assert.equal(qa.release.length,8);assert.equal(qa.visible,56);
  assert.equal(dev.weekly.length,5);assert.equal(dev.release.length,12);assert.equal(dev.visible,72);
  assert.equal(qa.visible+dev.visible,qa.total);assert.equal(qa.total,128);
  assert.deepEqual(removed,reportFilterDetails(d));
  const process=reportFilterDetails(d,{label:'qa',component:'Process quality'});
  assert.equal(process.weekly.length,0);assert.deepEqual(process.release.map(m=>m.id),['functional','completion','regression']);
  assert.equal(matchesReportMetric(releaseMetrics.find(m=>m.id==='density'),process.filters),false);
});

test('Filtering preserves the snapshot and full scores, with every matching metric shown once',()=>{
  const s=snapshot(exampleDraft()),before=JSON.stringify(s),fullScores=statsHTML(s.draft);
  const html=reportBody(s,{label:'qa'}),rows=metricRows(html);
  assert.equal(rows.length,56);assert.ok(rows.every(m=>m[2]==='qa'));
  assert.ok(html.includes(fullScores));assert.ok(html.includes('56 of 128 metric entries shown'));
  assert.ok(html.includes('Scores, RAG, coverage, and weekly score summaries use all original measurements.'));
  assert.equal((html.match(/<tr data-metric=/g)||[]).length,12);
  assert.equal(JSON.stringify(s),before);
  assert.equal(reportBody(s),reportBody(s,{label:'',component:''}));
});

test('Component selection removes empty sections and keeps original component grouping',()=>{
  const html=reportBody(snapshot(exampleDraft()),{component:'Product quality'});
  assert.equal(metricRows(html).length,6);
  assert.equal((html.match(/class="panel release-group"/g)||[]).length,1);
  assert.equal((html.match(/class="threshold-component"/g)||[]).length,1);
  assert.equal((html.match(/<tr data-metric=/g)||[]).length,6);
  assert.equal((html.match(/data-chart=/g)||[]).length,5);
  assert.ok(html.includes('No weekly metrics match these filters.'));
});

test('Impossible filter combinations show an empty result without replacing scores',()=>{
  const d=exampleDraft(),filters={label:'development',component:'Test execution / process monitoring'},html=reportBody(snapshot(d),filters);
  assert.equal(reportFilterDetails(d,filters).visible,0);
  assert.equal(metricRows(html).length,0);
  assert.ok(html.includes('No metric entries match these filters.'));
  assert.doesNotMatch(html,/class="threshold-scope"|class="weekly-report"/);
  assert.equal((html.match(/data-chart=/g)||[]).length,5);
  assert.ok(html.includes(statsHTML(d)));
});

test('All trend charts and chart data stay identical across label and component filters',()=>{
  const d=exampleDraft(),s=snapshot(d),full=reportBody(s);
  const chartSection=html=>html.split('<div id="report-trend-content">')[1].split('</details>')[0];
  for(const filters of [{label:'qa'},{label:'development'},{component:'Product quality'},{label:'development',component:'Test execution / process monitoring'}]){
    const filtered=reportBody(s,filters);
    assert.equal(chartSection(filtered),chartSection(full));
    const csv=csvDocument(s,filters);
    const series=csv.split('"Chart series","Period","Value","Unit"')[1].split('"Methodology"')[0];
    assert.equal(series,csvDocument(s).split('"Chart series","Period","Value","Unit"')[1].split('"Methodology"')[0]);
  }
  assert.deepEqual(reportCharts(d.weeks).map(c=>c.id),['created','escaped','fixed','failed','score']);
  assert.deepEqual(reportCharts(d.weeks).find(c=>c.id==='score').series[0].values,calculate(d).weeks.map(w=>w.score));
});

test('Charts can be hidden without changing metrics or scores, and HTML exports follow visibility',()=>{
  const s=snapshot(exampleDraft()),filters={label:'qa',component:'Process quality'};
  const shown=reportBody(s,filters),hidden=reportBody(s,filters,{showTrends:false});
  assert.match(shown,/aria-expanded="true" aria-controls="report-trend-content">Hide Trend Charts/);
  assert.match(hidden,/aria-expanded="false" aria-controls="report-trend-content">Show Trend Charts/);
  assert.match(hidden,/<div id="report-trend-content" hidden>/);
  assert.deepEqual(metricRows(hidden).map(m=>m.slice(0,3)),metricRows(shown).map(m=>m.slice(0,3)));
  assert.ok(hidden.includes(statsHTML(s.draft)));
  const exported=reportDocument(s,'',filters,{showTrends:false});
  assert.doesNotMatch(exported,/data-chart=|report-trend-section|toggle-report-trends|View Chart Data/);
  assert.deepEqual(metricRows(exported).map(m=>m.slice(0,3)),metricRows(shown).map(m=>m.slice(0,3)));
  assert.equal((reportDocument(s,'',filters).match(/data-chart=/g)||[]).length,5);
  assert.doesNotMatch(reportDocument(s,'',filters),/toggle-report-trends/);
});

test('Weekly details can be hidden while retaining the summary, chart data, scores, and release tables',()=>{
  const s=snapshot(exampleDraft()),before=JSON.stringify(s);
  const weeklyOverview=html=>html.match(/<section class="panel weekly-summary">[\s\S]*?<\/section>/)[0];
  for(const filters of [{},{label:'qa'}]){
    const shown=reportBody(s,filters),hidden=reportBody(s,filters,{showWeeklyDetails:false});
    assert.match(shown,/aria-expanded="true" aria-controls="report-weekly-details">Hide Weekly Details/);
    assert.match(hidden,/aria-expanded="false" aria-controls="report-weekly-details">Show Weekly Details/);
    assert.match(hidden,/<div id="report-weekly-details" hidden>/);
    assert.equal(weeklyOverview(hidden),weeklyOverview(shown));
    assert.ok(hidden.includes(statsHTML(s.draft)));
    assert.equal(hidden.split('<h2 class="report-section-title" id="report-release">')[1],shown.split('<h2 class="report-section-title" id="report-release">')[1]);
    assert.deepEqual(metricRows(hidden).map(m=>m.slice(0,3)),metricRows(shown).map(m=>m.slice(0,3)));
    const exported=reportDocument(s,'',filters,{showWeeklyDetails:false});
    assert.doesNotMatch(exported,/report-weekly-details|weekly-report|toggle-report-weekly-details/);
    assert.equal(weeklyOverview(exported),weeklyOverview(shown));
    assert.deepEqual(metricRows(exported).map(m=>m[1]),reportFilterDetails(s.draft,filters).release.map(m=>m.id));
    assert.equal((exported.match(/data-chart=/g)||[]).length,5);
    const shownExport=reportDocument(s,'',filters);
    assert.equal((shownExport.match(/class="panel release-group weekly-report"/g)||[]).length,12);
    assert.doesNotMatch(shownExport,/toggle-report-weekly-details/);
  }
  assert.equal(JSON.stringify(s),before);
});

test('Weekly detail and chart visibility are independent',()=>{
  const s=snapshot(exampleDraft());
  const bothHidden=reportBody(s,{}, {showTrends:false,showWeeklyDetails:false});
  assert.match(bothHidden,/<div id="report-trend-content" hidden>/);
  assert.match(bothHidden,/<div id="report-weekly-details" hidden>/);
  const exported=reportDocument(s,'',{}, {showTrends:false,showWeeklyDetails:false});
  assert.doesNotMatch(exported,/data-chart=|weekly-report|toggle-report-/);
  assert.match(exported,/Weekly Score Summary/);
  const detailsOnly=reportDocument(s,'',{}, {showTrends:false});
  assert.match(detailsOnly,/weekly-report/);
  assert.doesNotMatch(detailsOnly,/data-chart=/);
});

test('Weekly details toggle is absent when no weeks or no matching weekly metrics exist',()=>{
  for(const showWeeklyDetails of [true,false]){
    const empty=reportBody(snapshot(blankDraft()),{}, {showWeeklyDetails});
    assert.match(empty,/No weekly measurements were entered\./);
    assert.doesNotMatch(empty,/toggle-report-weekly-details|id="report-weekly-details"/);
    const noMatch=reportBody(snapshot(exampleDraft()),{component:'Product quality'}, {showWeeklyDetails});
    assert.match(noMatch,/No weekly metrics match these filters\./);
    assert.doesNotMatch(noMatch,/toggle-report-weekly-details|id="report-weekly-details"/);
  }
});

test('Filtered HTML and CSV agree on selected metrics and identify the unchanged scoring scope',()=>{
  const s=snapshot(exampleDraft()),filters={label:'qa',component:'Process quality'};
  const html=reportDocument(s,'body{color:black}',filters),csv=csvDocument(s,filters);
  assert.deepEqual(metricRows(html).map(m=>m[1]),['functional','completion','regression']);
  assert.ok(html.includes('Filtered report · QA · Process quality'));
  const lines=csv.split('\r\n'),metrics=lines.filter(line=>/^"(?:Weekly|Release)","\d{4}-/.test(line));
  assert.equal(metrics.length,3);assert.ok(metrics.every(line=>line.includes('"Process quality"')));
  assert.ok(csv.includes('"Report Filters","QA · Process quality"'));
  assert.ok(csv.includes('"QA Score","300","4","Scored observations","75.0","Amber"'));
  assert.ok(csv.includes('summary scores, RAG, coverage, and weekly score summaries are unchanged.'));
  assert.ok(!lines.some(line=>/^"(?:Trend only|Archived trend|Previous weekly)"/.test(line)));
  assert.doesNotMatch(html,/<script|<select/);
});

test('Filters retain matching zero and N/A values rather than filtering by completion',()=>{
  const d=blankDraft();d.release.escaped=0;
  const html=reportBody(snapshot(d),{label:'development',component:'Product quality'});
  assert.equal(metricRows(html).length,5);assert.ok(html.includes('<td>0</td><td>100</td>'));
  assert.equal((html.match(/<td>N\/A<\/td>/g)||[]).length,4);
});
