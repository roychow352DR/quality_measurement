import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankDraft,calculate,parseDraft,ragLabel,weeklyMetrics,releaseMetrics,exampleDraft,isScored} from '../metrics.js';
import {reportCharts,trendChart,reportBody,reportDocument,csvDocument,statsHTML,weekPeriod} from '../report.js';
const week=(values={},trends={},start='2026-09-07')=>({start,end:start,values,trends});
test('Standalone report embeds complete offline styles without a partial font import',()=>{
  const base=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const builder=readFileSync(new URL('../builder.css',import.meta.url),'utf8');
  const print=readFileSync(new URL('../print.css',import.meta.url),'utf8');
  const css=base+'\n'+builder+'\n'+print;
  const html=reportDocument({draft:exampleDraft(),generatedAt:'2026-09-11T07:38:48Z'},css);
  const embedded=html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(embedded,css);
  assert.ok(embedded.startsWith(':root{--navy:#18344f;--teal:#167c80;'));
  assert.doesNotMatch(embedded,/@import|fonts\.googleapis|display=swap/);
  assert.doesNotMatch(html,/<link\b|<script\b/);
  assert.match(embedded,/font-family:Arial,Helvetica,sans-serif/);
  assert.match(html,/<body class="standalone-report">/);
  assert.equal((html.match(/<article\b[^>]*data-chart=/g)||[]).length,5);
});
test('Report metadata retains owner and release date while omitting generation timestamps',()=>{
  const draft=exampleDraft();
  draft.project.owner='Roy <QA> & Team';
  draft.project.releaseDate='2026-08-24';
  const snapshot={draft,generatedAt:'2026-09-11T07:38:48Z'};
  const html=reportDocument(snapshot,'');
  assert.ok(html.includes('<dt>QA owner</dt><dd>Roy &lt;QA&gt; &amp; Team</dd>'));
  assert.ok(html.includes('<dt>Release date</dt><dd><time datetime="2026-08-24">24 Aug 2026</time>'));
  for(const output of [html,reportBody(snapshot),csvDocument(snapshot)]){
    assert.doesNotMatch(output,/Generated on|"Generated",|2026-09-11T07:38:48Z/);
  }
  assert.doesNotMatch(html,/Invalid Date|undefined/);
});
test('Weekly average weights weeks equally and excludes only unmeasured weeks',()=>{
  const d=blankDraft();d.weeks=[week({aging:0}),week({aging:8,open:6},{},'2026-09-14'),week({},{totalCreated:8},'2026-09-21')];
  const s=calculate(d);
  assert.equal(s.weekly.score,50);assert.equal(s.weekly.measuredWeeks,2);assert.equal(s.weekly.totalWeekScores,100);
  assert.equal(s.weekly.count,3);assert.equal(s.overall.score,100/3);
  assert.equal(ragLabel(s.weekly.score),'Red');assert.equal(s.weeks[1].score,0);assert.equal(s.weeks[2].score,null);
  assert.ok(statsHTML(d).includes('100.0 total weekly score / 2 measured weeks'));
  const snapshot={draft:d,generatedAt:'2026-09-11T00:00:00Z'};
  assert.ok(csvDocument(snapshot).includes('"Weekly","100.0","2","Measured weeks","50.0","Red"'));
  assert.ok(reportBody(snapshot).includes('100.0 total weekly score ÷ 2 measured weeks = 50.0'));
});
test('Weekly scores are averaged without rounding and absent data stays N/A',()=>{
  const d=blankDraft();assert.equal(calculate(d).weekly.score,null);assert.equal(calculate(d).weekly.measuredWeeks,0);
  d.weeks=[week({aging:2,open:3,reopened:11}),week({fixed:100},{},'2026-09-14')];
  assert.equal(calculate(d).weekly.score,(160/3+100)/2);
  d.weeks=[week({open:6})];assert.equal(calculate(d).weekly.score,0);assert.equal(calculate(d).weekly.measuredWeeks,1);
});
test('Five charts use their exact sources and distinct colors',()=>{
  const weeks=[week({created:2,open:8,fixed:250,reopened:7},{totalCreated:12,totalEscaped:99,escapedP01:3,totalReopened:9})];
  const charts=reportCharts(weeks);
  assert.deepEqual(charts.map(c=>c.id),['created','escaped','fixed','failed','score']);
  assert.equal(new Set(charts.map(c=>c.color)).size,5);
  assert.deepEqual(charts[0].series.map(s=>s.values),[[12],[2]]);
  assert.deepEqual(charts[1].series[0].values,[8]);
  assert.deepEqual(charts[2].series[0].values,[250]);
  assert.deepEqual(charts[3].series[0].values,[7]);
  assert.deepEqual(charts[4].series[0].values,[160/3]);
  assert.equal(charts[3].title,'Defects Failed Rate (Weekly)');
});
test('Charts retain zeroes, break missing-data lines and leave missing week-end counts unmeasured',()=>{
  const weeks=[week({fixed:0},{totalEscaped:8}),week(),week({fixed:150},{},'2026-09-21')];
  const charts=reportCharts(weeks);
  assert.deepEqual(charts[1].series[0].values,[null,null,null]);
  assert.deepEqual(charts[2].series[0].values,[0,null,150]);
  const svg=trendChart(weeks,charts[2]);assert.equal((svg.match(/<polyline /g)||[]).length,2);assert.ok(svg.includes('data-value="0"'));
  const d=blankDraft();const html=reportBody({draft:d,generatedAt:'2026-09-11T00:00:00Z'});
  assert.equal((html.match(/data-chart=/g)||[]).length,5);assert.equal((html.match(/<p class="empty">Not measured/g)||[]).length,5);
});
test('Escaped P0/P1 migration preserves meaning and intentional clearing',()=>{
  const old=blankDraft();old.version=2;old.weeks=[{...week({open:4},{totalEscaped:10}),legacyValues:{escaped:0}}];
  const migrated=parseDraft(old);assert.equal(migrated.weeks[0].trends.escapedP01,0);
  migrated.weeks[0].trends.escapedP01='';assert.equal(parseDraft(migrated).weeks[0].trends.escapedP01,'');
  delete old.weeks[0].legacyValues;assert.equal(parseDraft(old).weeks[0].trends.escapedP01,'');
});
test('Report thresholds have colored labels and all three text statuses',()=>{
  const d=blankDraft(),html=reportBody({draft:d,generatedAt:'2026-09-11T00:00:00Z'});
  for(const [color,label,points] of [['green','Green',100],['amber','Amber',60],['red','Red',0]])assert.ok(html.includes(`<th class="threshold-${color}"><span class="badge ${color}">${label}</span> <span>${points} pts</span></th>`));
});
test('Existing week-end values drive the escaped chart, data table and CSV, including zero',()=>{
  const draft=blankDraft();
  draft.weeks=[week({open:0},{escapedP01:9,totalEscaped:8}),week({open:4},{escapedP01:99},'2026-09-14')];
  const restored=parseDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored.weeks.map(w=>w.values.open),[0,4]);
  assert.equal(weeklyMetrics.find(m=>m.id==='open').name,'Escaped P0/P1 defects (week-end)');
  assert.equal(releaseMetrics.find(m=>m.id==='open').name,'Open P0/P1 defects');
  const chart=reportCharts(restored.weeks)[1];
  assert.deepEqual(chart.series[0].values,[0,4]);
  assert.ok(trendChart(restored.weeks,chart).includes('data-value="0"'));
  const snapshot={draft:restored,generatedAt:'2026-09-11T00:00:00Z'},html=reportBody(snapshot),csv=csvDocument(snapshot);
  const data=html.split('View Chart Data</summary>')[1].split('</details>')[0];
  assert.ok(data.includes('<td>W1 · Sep 7 - Sep 7</td><td>N/A</td><td>N/A</td><td>0</td>'));
  assert.ok(data.includes('<td>W2 · Sep 14 - Sep 14</td><td>N/A</td><td>N/A</td><td>4</td>'));
  assert.ok(csv.includes('"Escaped P0/P1 defects","2026-09-07 to 2026-09-07","0","count"'));
  assert.ok(csv.includes('"Escaped P0/P1 defects","2026-09-14 to 2026-09-14","4","count"'));
  restored.weeks[0].values.open='';
  assert.equal(reportCharts(restored.weeks)[1].series[0].values[0],null);
});
test('Charts label complete week periods, including cross-month and cross-year dates',()=>{
  assert.equal(weekPeriod({start:'2026-06-01',end:'2026-06-05'}),'Jun 1 - Jun 5');
  assert.equal(weekPeriod({start:'2026-06-29',end:'2026-07-03'}),'Jun 29 - Jul 3');
  assert.equal(weekPeriod({start:'2026-12-28',end:'2027-01-01'}),'Dec 28, 2026 - Jan 1, 2027');
  const weeks=exampleDraft().weeks,svg=trendChart(weeks,reportCharts(weeks)[1]);
  assert.equal((svg.match(/class="chart-axis-label chart-x-label"/g)||[]).length,12);
  for(const w of weeks)assert.ok(svg.includes(`>${weekPeriod(w)}</text>`));
  const longWeeks=Array.from({length:104},(_,i)=>{
    const start=new Date(Date.UTC(2026,5,1+i*7)).toISOString().slice(0,10),end=new Date(Date.UTC(2026,5,5+i*7)).toISOString().slice(0,10);
    return {start,end,values:{open:i},trends:{}};
  });
  const longSVG=trendChart(longWeeks,reportCharts(longWeeks)[1]);
  assert.equal((longSVG.match(/<circle /g)||[]).length,104);
  assert.ok(longSVG.includes(`>${weekPeriod(longWeeks[0],true)}</text>`));
  assert.ok(longSVG.includes(`>${weekPeriod(longWeeks.at(-1),true)}</text>`));
});
test('Every week highlights its score and text RAG, including unmeasured weeks',()=>{
  const draft=blankDraft();draft.weeks=[week({open:0}),week({open:3},{},'2026-09-14'),week({open:6},{},'2026-09-21'),week({},{},'2026-09-28')];
  const html=reportBody({draft,generatedAt:'2026-09-11T00:00:00Z'});
  assert.equal((html.match(/class="week-score-label">Score/g)||[]).length,4);
  for(const [color,label,score] of [['green','Green','100.0'],['amber','Amber','60.0'],['red','Red','0.0'],['neutral','N/A','—']]){
    assert.ok(html.includes(`<span class="week-score ${color}"><span class="week-score-label">Score</span><strong>${score}<small> / 100</small></strong><span class="badge ${color}">${label}</span>`));
  }
});
test('Thresholds separate weekly and release scopes and list each metric in its component',()=>{
  const html=reportBody({draft:blankDraft(),generatedAt:'2026-09-11T00:00:00Z'}).split('<h3>Applied Thresholds</h3>')[1];
  assert.equal((html.match(/class="threshold-scope"/g)||[]).length,2);
  assert.equal((html.match(/class="threshold-component"/g)||[]).length,7);
  assert.doesNotMatch(html,/<h5[^>]*>[^<]*(?:QA|Development) Perspective/);
  for(const [scope,title,metrics] of [['weekly','Weekly Operational',weeklyMetrics.filter(isScored)],['release','Release Summary',releaseMetrics.filter(isScored)]]){
    const section=html.split(`data-scope="${scope}"`)[1].split('<section class="threshold-scope"')[0];
    assert.ok(section.includes(`<h4>${title}<span>${metrics.length} metrics</span></h4>`));
    assert.equal((section.match(/<tr data-metric=/g)||[]).length,metrics.length);
    const groups=[...new Set(metrics.map(m=>m.group))];
    const headings=[...section.matchAll(/<h5[^>]*>(.*?)<\/h5>/g)].map(m=>m[1]);
    assert.deepEqual(headings,groups.map(g=>g.replace(/\b[a-z]/g,c=>c.toUpperCase()).replaceAll('&','&amp;')));
    for(const m of metrics)assert.ok(section.includes(`<tr data-metric="${m.id}"><td>${m.name.replaceAll('&','&amp;')} <span class="classification-labels">`));
  }
});
test('Scores use one decimal in report summaries, chart labels and CSV while live data keeps precision',()=>{
  const draft=blankDraft();draft.weeks=[week({functional:95,regression:90,firstRun:0,fixed:91.25},{totalCreated:19})];
  const snapshot={draft,generatedAt:'2026-09-11T00:00:00Z'},html=reportBody(snapshot),csv=csvDocument(snapshot);
  assert.ok(html.includes('<div class="stat-number">53.3<small>/ 100</small>'));
  assert.ok(html.includes('Weekly score 55.0'));
  assert.ok(csv.includes('"Weekly score","2026-09-07 to 2026-09-07","55.0","points"'));
  assert.ok(csv.includes('"Fixed rate","2026-09-07 to 2026-09-07","91.25","%"'));
  assert.ok(html.includes('Fixed rate 91.25%'));
  assert.ok(html.includes('Overall defects created 19'));
  const data=html.split('View Chart Data</summary>')[1].split('</details>')[0];
  assert.ok(data.includes('<td>19</td>'));assert.ok(data.includes('<td>91.25%</td>'));assert.ok(data.includes('<td>55.0</td>'));
});
test('Report and exports expose perspective scores, labels, and the renamed overall health',()=>{
  const draft=blankDraft();draft.release.leakage=0;draft.release.escaped=6;
  const snapshot={draft,generatedAt:'2026-09-11T00:00:00Z'},html=reportBody(snapshot),csv=csvDocument(snapshot);
  for(const title of ['Overall RAG Score','QA Score','Development Score'])assert.ok(statsHTML(draft).includes(`<div class="stat-title">${title}</div>`));
  assert.doesNotMatch(html,/Overall QA health|Draft QA health/);
  assert.equal((statsHTML(draft).match(/<article class="stat/g)||[]).length,6);
  assert.ok(html.includes('class="perspective-label qa">QA</span>'));assert.ok(html.includes('class="perspective-label development">Development</span>'));
  assert.doesNotMatch(html,/Shared outcome|shared-label/);assert.ok(html.includes('each scored metric is counted once'));
  const releaseRows=[...html.matchAll(/<tr data-report-metric="([^"]+)" data-perspective="([^"]+)">/g)];
  assert.equal(releaseRows.length,19);
  assert.equal(releaseRows.filter(m=>m[2]==='qa').length,8);
  assert.equal(releaseRows.filter(m=>m[2]==='development').length,11);
  assert.ok(csv.includes('"QA Score","100","1","Scored observations","100.0","Green"'));
  assert.ok(csv.includes('"Development Score","0","1","Scored observations","0.0","Red"'));
  assert.ok(csv.includes('"Overall RAG Score","100","2","Scored observations","50.0","Red"'));
  assert.ok(csv.includes('"Primary perspective","Measurement notes"'));assert.doesNotMatch(csv,/Shared outcome/);
  const leakageRow=csv.split('\r\n').find(line=>line.includes('"Defect leakage rate"'));
  assert.ok(leakageRow.endsWith('"QA",""'));
  const empty=statsHTML(blankDraft());assert.equal((empty.match(/<span class="badge neutral">N\/A/g)||[]).length,5);
});
test('Release Summary uses its four original components plus Defect Density with classification labels and scores',()=>{
  const draft=exampleDraft(),html=reportBody({draft,generatedAt:'2026-09-11T00:00:00Z'});
  const release=html.split('id="report-release">Release Summary</h2>')[1].split('<section class="panel report-method">')[0];
  assert.doesNotMatch(release,/class="report-perspective"|QA Perspective|Development Perspective/);
  assert.equal((release.match(/class="panel release-group"/g)||[]).length,5);
  assert.equal((release.match(/data-report-metric=/g)||[]).length,19);
  assert.equal((release.match(/class="classification-labels"/g)||[]).length,19);
  assert.ok(release.includes('QA Score'));assert.ok(release.includes('Development Score'));
  const sections=release.split('<section class="panel release-group">').slice(1);
  const groups=[...new Set(releaseMetrics.map(m=>m.group))];
  sections.forEach((section,i)=>{
    assert.ok(section.includes(`<h2>${groups[i].replace(/\b[a-z]/g,c=>c.toUpperCase()).replaceAll('&','&amp;')}</h2>`));
    assert.deepEqual([...section.matchAll(/data-report-metric="([^"]+)"/g)].map(m=>m[1]),releaseMetrics.filter(m=>isScored(m)&&m.group===groups[i]).map(m=>m.id));
  });
});
test('CSV keeps trend and archived classifications unscored and week perspective scores scoped',()=>{
  const draft=blankDraft();draft.weeks=[{...week({functional:95,open:6},{totalCreated:9,escapedP01:99}),legacyValues:{escaped:0}}];
  const snapshot={draft,generatedAt:'2026-09-11T00:00:00Z'},csv=csvDocument(snapshot),html=reportBody(snapshot);
  assert.ok(csv.includes('"1","2026-09-07","2026-09-07","2","50.0","Red","100.0","Green","1","0.0","Red","1"'));
  const lines=csv.split('\r\n');
  for(const scope of ['Trend only','Archived trend','Previous weekly']){
    const row=lines.find(line=>line.startsWith('"'+scope+'"'));
    assert.ok(row.includes('"N/A","N/A","","","","Development"'));
  }
  assert.ok(html.includes('aria-label="QA Score"><strong>100.0 / 100</strong>'));
  assert.ok(html.includes('aria-label="Development Score"><strong>0.0 / 100</strong>'));
  assert.equal((html.match(/data-report-metric=/g)||[]).length,27);
});
