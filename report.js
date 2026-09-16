import {weeklyMetrics,releaseMetrics,trendMetrics,perspectives,metricSections,legacyWeeklyNames,scoreMetric,calculate,rag,ragLabel,formatScore,formatValue,thresholds,RULE_VERSION,SOURCE_DOCUMENT,isBlank,isScored,scoredCount,releaseValues,discoverySummary} from './metrics.js';
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const badge = score => `<span class="badge ${rag(score)}">${ragLabel(score)}</span>`;
export const metricBadge = (m,value) => {
  if(!isScored(m))return '<span class="badge neutral">Informational</span>';
  const score=scoreMetric(m,value);
  return badge(score)+(m.unit==='uatShare'&&score===0&&Number(value.criticalUat)>0?'<small class="critical-override">P0/P1 UAT discovery</small>':'');
};
const h=escapeHTML;
const sectionTitle = value => value.replace(/\b[a-z]/g,letter=>letter.toUpperCase());
export const reportFilterOptions = {
  label:[{value:'',name:'All labels'},{value:'qa',name:'QA'},{value:'development',name:'Development'}],
  component:[{value:'',name:'All components'},...[...new Set([...weeklyMetrics,...releaseMetrics].map(m=>m.group))].map(group=>({value:group,name:group}))],
};
export function normalizeReportFilters(filters={}) {
  return Object.fromEntries(Object.entries(reportFilterOptions).map(([key,options])=>[key,options.some(o=>o.value===filters?.[key])?filters[key]:'']));
}
export function matchesReportMetric(metric,filters={}) {
  const {label,component}=normalizeReportFilters(filters);
  return (!label||metric.perspective===label)&&(!component||(metric.group??'Defect flow & backlog health')===component);
}
export function reportFilterDetails(draft,filters={}) {
  const selected=normalizeReportFilters(filters),weekly=weeklyMetrics.filter(m=>matchesReportMetric(m,selected)),release=releaseMetrics.filter(m=>matchesReportMetric(m,selected));
  return {filters:selected,active:!!(selected.label||selected.component),weekly,release,
    visible:weekly.length*draft.weeks.length+release.length,total:weeklyMetrics.length*draft.weeks.length+releaseMetrics.length,
    description:Object.entries(selected).map(([key,value])=>reportFilterOptions[key].find(o=>o.value===value).name).join(' · ')};
}
function filterNoteHTML(details) {
  if(!details.active)return '';
  return `<aside class="report-filter-note"><strong>Filtered report · ${h(details.description)}</strong><p>${details.visible} of ${details.total} metric entries shown, including N/A entries. Scores, RAG, coverage, and weekly score summaries use all original measurements. Metric tables and applied thresholds follow the filters. All five trend charts and their data use the full report.</p>${details.visible?'':'<p class="filter-empty">No metric entries match these filters. Choose another label or component, or clear the filters.</p>'}</aside>`;
}
export const classificationLabels = m => `<span class="classification-labels"><span class="perspective-label ${m.perspective}">${m.perspective==='qa'?'QA':'Development'}</span></span>`;
export const classificationNote = '<p class="classification-note">Labels show the primary improvement perspective; each scored metric is counted once in its assigned QA or Development perspective. Informational measurements do not contribute points. Scores describe quality, not team performance.</p>';
export const dateLabel = date => date && Number.isFinite(Date.parse(date+'T00:00:00Z')) ? new Date(date+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : 'Not set';
export function discoveryNote(m,values,weeks,{asList=false}={}) {
  if(m.id==='averageCreated'&&weeks) {
    const s=discoverySummary(weeks).p01;
    return s.count?`${s.total} P0/P1 defects ÷ ${s.count} measured weeks = ${s.average.toFixed(1)}. ${weeks.length-s.count} weeks without valid counts excluded; measured zero counts.`:'No measured weekly P0/P1 counts. Enter weekly counts to calculate the average.';
  }
  if(m.id==='uatDiscovery') {
    const v=values.uatDiscovery??{},old=values.comparison;
    const counts=`Pre-UAT: ${isBlank(v.preUat)?'Not measured':v.preUat}; UAT: ${isBlank(v.uat)?'Not measured':v.uat}; P0/P1 UAT discoveries: ${isBlank(v.criticalUat)?'Not measured':v.criticalUat}.`;
    const zero=!isBlank(v.preUat)&&!isBlank(v.uat)&&Number(v.preUat)===0&&Number(v.uat)===0?' No defects in the population: rate is N/A, not Green.':'';
    const scoring=scoreMetric(m,v)===null?' Score is N/A until all three valid counts and a non-zero discovery total are available. Enter 0 P0/P1 UAT discoveries explicitly if none were found.':Number(v.criticalUat)>0?' P0/P1 UAT discovery override: Red, 0 points for this metric, even if the defect has since been fixed.':'';
    const legacy=old&&(!isBlank(old.regression)||!isBlank(old.uat))?` Previous inputs (not used in the rate): Regression ${isBlank(old.regression)?'N/A':old.regression} / UAT ${isBlank(old.uat)?'N/A':old.uat}. Verify first-discovery stages and the complete pre-UAT population.`:'';
    const items=[counts,zero,scoring,legacy,v.notes?` Notes / root causes: ${v.notes}`:''].filter(Boolean).map(text=>text.trim());
    return asList?`<ul class="metric-description discovery-note">${items.map(text=>`<li>${h(text)}</li>`).join('')}</ul>`:items.join(' ');
  }
  return '';
}
export function discoveryNoteHTML(m,values,weeks) {
  const note=discoveryNote(m,values,weeks,{asList:m.id==='uatDiscovery'});
  return m.id==='uatDiscovery'?note:note?`<small class="discovery-note">${h(note)}</small>`:'';
}
function discoveryOverview(draft,filters) {
  if(!weeklyMetrics.some(m=>m.id==='created'&&matchesReportMetric(m,filters))&&!releaseMetrics.some(m=>m.id==='averageCreated'&&matchesReportMetric(m,filters)))return '';
  const s=discoverySummary(draft.weeks);
  if(!s.all.count&&!s.p01.count)return '';
  return `<aside class="report-note discovery-overview"><strong>Defect Discovery · Informational</strong><p>${s.all.count?`${s.all.total} total defects across ${s.all.count} measured weeks.`:'Overall-created counts are not measured.'} ${s.p01.count?`${s.p01.total} P0/P1 defects across ${s.p01.count} measured weeks; average ${s.p01.average.toFixed(1)} per measured week.`:'P0/P1-created counts are not measured.'} ${s.weeks} weekly records in total. Counts use their own measured weeks; they describe discovered work and do not affect quality scores.</p></aside>`;
}
export function weekPeriod(week,includeYear=false) {
  const showYear=includeYear || week.start.slice(0,4)!==week.end.slice(0,4);
  const label=date=>date && Number.isFinite(Date.parse(date+'T00:00:00Z')) ? new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',...(showYear?{year:'numeric'}:{}),timeZone:'UTC'}) : 'Not set';
  return `${label(week.start)} - ${label(week.end)}`;
}
export const methodology = `<h3>Scores from Your Measurements</h3>
<p>Each scored metric receives 100 points for Green, 60 for Amber, or 0 for Red. Each week’s score = that week’s total metric points ÷ its number of measured metrics. <strong>Average weekly operational score = total score of all measured weeks ÷ total measured weeks.</strong> Each measured week has equal weight. A week with no measured metrics is excluded; a measured score of zero is included. The average score determines the weekly operational RAG.</p>
<p>Health status is Green at ≥ 85, Amber at ≥ 60 and &lt; 85, and Red below 60. Scores display one decimal place; calculations and status use the unrounded value. Blank values are N/A and excluded. Zero is a measured value. Release health averages the measured release metrics. Overall health pools all individual weekly and release metric observations with equal weight per observation; its denominator is the number of scored observations. Trend-only inputs, P0/P1 discovery counts, and their derived weekly average do not affect scores or scored-coverage denominators. UAT Discovery Rate is scored once when all three counts are measured and the discovery total is non-zero.</p>
<h3>QA and Development Perspectives</h3><p><strong>QA Score</strong> covers testing effectiveness, coverage, and automation reliability. <strong>Development Score</strong> covers defect prevention, fix effectiveness, and production stability. Each perspective score = total points from its measured weekly and release entries ÷ its number of scored observations. Each weekly entry counts separately; this is distinct from the equal-week operational average. Scope-specific scores use only the selected week or release. An unmeasured perspective displays N/A.</p><p>Each metric has one primary perspective. Each scored metric counts only in its assigned QA or Development perspective. Overall RAG Score pools both perspectives’ observations; it is not the simple average of QA Score and Development Score when their counts differ. Classification assumes QA owns the functional, regression, and automation suites. These labels identify an improvement focus, not exclusive responsibility or a team performance ranking. Classification and perspective scores follow the agreed reporting design; the remaining scored metrics retain their source RAG thresholds.</p>
<p><strong>Perspective score example:</strong> functional and regression pass rates depend on both QA testing and Development fixes. Both are assigned to QA, so if these are the only measured QA entries and receive 100 and 60 points, QA Score = (100 + 60) ÷ 2 = <strong>80.0</strong>. An escaped-defect metric labeled Development contributes to Development Score only. Points are neither split between the two perspectives nor counted twice.</p>
<h3>Defect Discovery and UAT Effectiveness</h3><p>P0/P1 discovery volume and its weekly average are informational. More discoveries do not reduce any score. The average is derived from total P0/P1 discoveries in measured weeks ÷ measured weeks; blanks are excluded and measured zeroes included. Stored manual averages are retained in backups but never used in the report.</p><ul class="metric-description"><li><strong>UAT Discovery Rate</strong> = UAT discovered defects ÷ (Pre-UAT discovered defects + UAT discovered defects) x 100%.</li><li>Use distinct confirmed defects for the same release and agreed scope; include functional, integration, and regression stages before UAT.</li><li>Count each defect once at its first discovery.</li><li>Exclude duplicates, cancelled non-defects, and changes outside the agreed requirements.</li><li>Supply both counts; zero divided by zero is N/A.</li><li><strong>Internal pilot thresholds:</strong> Green = rate ≤ 10% and 0 P0/P1 UAT discoveries (100 points); Amber = rate &gt; 10% and ≤ 20%, with 0 P0/P1 UAT discoveries (60 points); Red = rate &gt; 20% or at least 1 P0/P1 UAT discovery (0 points).</li><li>All three counts must be supplied for scoring; a blank P0/P1 UAT count is not zero.</li><li>Missing counts or a zero denominator give N/A and contribute neither points nor a scored observation.</li><li>The percentage can still be displayed when the P0/P1 UAT count is missing.</li><li>Status uses the unrounded rate, even when the displayed percentage rounds to a boundary.</li><li>These are internal pilot targets, not prescribed ISTQB or market benchmarks; review them after 3–5 comparable completed releases.</li><li>The P0/P1 UAT override changes this metric only, not the entire report RAG.</li><li>Count a confirmed P0/P1 defect first discovered in UAT even if it has since been fixed: this measures detection timing, not current release readiness.</li><li>P0/P1 UAT discoveries are confirmed P0/P1 defects first discovered during UAT.</li><li>P0/P1 UAT discoveries are a subset of UAT discoveries and have no separate score.</li><li>This metric contributes once to QA, Release, and Overall scores; Development Score is unchanged.</li><li>Show counts and root-cause notes alongside the rate, especially with small samples; a UAT discovery is not automatically a QA failure.</li><li>Previous regression/UAT inputs are retained for verification, not converted into the new rate.</li><li>A regression-only count cannot establish all pre-UAT discoveries.</li><li>These definition and scoring changes are local reporting requirements, not rules transcribed from the source PDF.</li></ul><h3>Chart Definitions</h3><p>The five charts show overall-created versus P0/P1-created counts, escaped P0/P1 counts, fixed rate, failed rate, and each week’s score. <strong>Defects Failed Rate uses the weekly reopened-rate value.</strong> Escaped P0/P1 charts and chart data use the weekly <strong>Escaped P0/P1 defects (week-end)</strong> field, previously labeled Open P0/P1 defects (week-end). Existing week-end values are retained. Overall-created counts use the supplementary trend input. Missing values remain gaps.</p>
<h3>How Source Ambiguities Are Handled</h3><ul><li>The source lists 20 release metrics but uses 19 in an example. The report uses the actual number of scored entries.</li><li>Decimal gaps are continuous intervals: 94.5% is Amber for a 95% pass-rate target; 5.5% is Amber for a ≤ 5% leakage target. Density 0.205 is Amber. No input is rounded before scoring.</li><li>Weekly reopened rate is reopened in week ÷ retested in week × 100%; weekly aging is the average age of open P0/P1 defects at week-end. The release reopened-rate and aging formulas remain ambiguous in the source. Enter measured percentages and days directly; they are not derived automatically. Fixed rates may exceed 100% when clearing a backlog.</li><li>Release product-quality metrics cover the first 14 days after release; other release values are final release measurements. Weekly metrics cover their entered dates. The report does not infer maturity or missing measurements.</li></ul><p>Resolved = Ready for deploy / Done. Reopened = QA Failed / UAT Failed. Tested = QA In Progress / UAT In Progress.</p>`;
export function overallRagHTML(summary) {
  const bands=[[100,'≥ 85 pts'],[60,'≥ 60 and < 85 pts'],[0,'< 60 pts']];
  return `<section class="panel overall-rag" aria-labelledby="overall-rag-title"><h2 id="overall-rag-title">Overall RAG Score</h2>${summary?`<div class="overall-rag-result"><span>Overall RAG Score</span><strong>${formatScore(summary.score)} <small>/ 100</small></strong>${badge(summary.score)}</div><p class="report-note">${summary.count?`${summary.points.toLocaleString()} total points ÷ ${summary.count} scored observations = ${formatScore(summary.score)}.`:'No scored measurements; Overall RAG Score is N/A.'} Uses all measured weekly and release entries, regardless of report filters.</p>`:'<p class="report-note">Use these bands for overall, weekly, release, QA, and Development health scores, each out of 100.</p>'}<div class="table-scroll"><table class="overall-rag-table" aria-labelledby="overall-rag-title"><thead><tr><th scope="col">RAG</th><th scope="col">Score range</th>${summary?'<th scope="col">Your result</th>':''}</tr></thead><tbody>${bands.map(([score,range])=>{const current=!!summary&&summary.score!==null&&rag(summary.score)===rag(score);return `<tr class="rag-band ${rag(score)}${current?' current-band':''}"${current?' data-current="true"':''}><th scope="row">${badge(score)}</th><td>${h(range)}</td>${summary?`<td>${current?'<strong class="current-rag-label">Current status</strong>':'—'}</td>`:''}</tr>`;}).join('')}</tbody></table></div><p class="report-note rag-precision-note">Amber covers 60–84 whole points and decimal scores below 85. Scores display one decimal place; RAG uses the unrounded score. Unmeasured scores are N/A.</p></section>`;
}
const rulesSourceHTML = `<p class="rules-source">Rules version ${RULE_VERSION} · Source: ${SOURCE_DOCUMENT}, pages 6–8. Discovery counts remain informational. UAT discovery rate uses agreed internal pilot thresholds (10% / 20%) with a P0/P1 UAT discovery override, not thresholds from the source PDF. Other scored thresholds remain unchanged.</p>`;
export const methodologyLink = (text='Scoring Methodology',className='button') => `<a class="${className}" href="/methodology.html" aria-label="${h(text)}">${h(text)} <span aria-hidden="true">→</span></a>`;
export function methodologyDocument() {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#18344f"><meta name="description" content="Quality Measurement scoring methodology, overall RAG bands, metric thresholds, and QA and Development score calculations."><title>Quality Measurement · Scoring Methodology</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/builder.css"><link rel="stylesheet" href="/print.css"></head><body class="standalone-report methodology-page"><header class="methodology-topbar"><a href="/#project" class="methodology-brand">Quality <span>Measurement</span></a><a class="button" href="/#report">Generated Report</a></header><main><section class="report-intro"><div class="eyebrow">THE MEASUREMENT FRAMEWORK</div><h1>Scoring Methodology</h1><p>Understand how live measurements become scores, RAG statuses, and quality perspectives.</p></section><nav class="methodology-contents" aria-label="Methodology contents"><a href="#overall-rag-title">Overall RAG Score</a><a href="#calculation-rules">Calculation Rules</a><a href="#metric-thresholds">Applied Thresholds</a></nav>${overallRagHTML()}<section class="panel report-method methodology-rules" id="calculation-rules"><h2>Calculation Rules</h2>${methodology}<h3>Report Filters</h3><p>Label and component filters narrow metric tables and applied thresholds. All five trend charts and their data use all original weeks, regardless of filters. Hide Trend Charts hides the charts and chart-data view from the report, including HTML and PDF output; Show Trend Charts restores them. CSV always includes all chart series. Summary scores, RAG, and measurement coverage always use all original measurements. The reference tables on this page show every metric.</p></section><section class="panel report-method" id="metric-thresholds"><h2>Metric Reference</h2>${classificationNote}${thresholdsHTML()}${rulesSourceHTML}<a class="text-link" href="/reference.html">Read the Metrics Reference →</a></section></main><footer><span>QUALITY MEASUREMENT <b>/</b> Engineering Quality</span><span>Scoring Methodology</span></footer></body></html>`;
}
export function statsHTML(draft) {
  const scores=calculate(draft);
  const cards=[['Overall RAG Score',scores.overall,'overall'],['QA Score',scores.perspectives.qa.overall,'qa'],['Development Score',scores.perspectives.development.overall,'development'],['Weekly Operational',scores.weekly,'weekly'],['Release Quality',scores.release,'release']];
  return `<div class="stats-grid">${cards.map(([name,s,scope])=>`<article class="stat ${scope}"><div class="stat-title">${name}</div><div class="stat-number">${formatScore(s.score)}<small>/ 100</small></div>${badge(s.score)}<div class="stat-foot">${scope==='weekly'?`${formatScore(s.totalWeekScores)} total weekly score / ${s.measuredWeeks} measured weeks`:`${s.points.toLocaleString()} points / ${s.count} scored entries`}</div></article>`).join('')}<article class="stat"><div class="stat-title">Scored Measurement Coverage</div><div class="stat-number">${scores.overall.count}<small>/ ${scoredCount(releaseMetrics)+draft.weeks.length*scoredCount(weeklyMetrics)}</small></div><div class="stat-foot">${scoredCount(releaseMetrics)+draft.weeks.length*scoredCount(weeklyMetrics)-scores.overall.count} unmeasured · ${draft.weeks.length} weeks</div></article></div>`;
}
function metricTable(metrics,values,{grouped=false,perspectiveScores={},weeks}={}) {
  const rows=items=>items.map(m=>`<tr data-report-metric="${m.id}" data-perspective="${m.perspective}"><td>${h(m.name)} ${classificationLabels(m)}<small>${h(m.formula)}</small>${discoveryNoteHTML(m,values,weeks)}</td><td>${h(formatValue(m,values[m.id]))}</td><td>${scoreMetric(m,values[m.id])??'—'}</td><td>${metricBadge(m,values[m.id])}</td></tr>`).join('');
  const body=grouped?metricSections(metrics).map(p=>p.components.map(c=>`<tbody><tr class="metric-group-heading"><th colspan="4"><div class="metric-group-summary"><span>${p.name} Perspective · ${h(sectionTitle(c.group))}</span>${perspectiveScores[p.id]?`<span class="group-score" aria-label="${p.name} Score"><strong>${formatScore(perspectiveScores[p.id].score)} / 100</strong>${badge(perspectiveScores[p.id].score)}</span>`:''}</div></th></tr>${rows(c.metrics)}</tbody>`).join('')).join(''):`<tbody>${rows(metrics)}</tbody>`;
  return `<div class="table-scroll"><table><thead><tr><th>Metric / definition</th><th>Live value</th><th>Points</th><th>RAG</th></tr></thead>${body}</table></div>`;
}
function perspectiveScoresHTML(summary,scope) {
  return `<div class="perspective-scores" aria-label="${scope} perspective scores">${perspectives.map(p=>`<div class="perspective-score ${p.id}"><span>${p.name} Score</span><strong>${formatScore(summary[p.id].score)} <small>/ 100</small></strong>${badge(summary[p.id].score)}<small>${summary[p.id].count} measured</small></div>`).join('')}</div>`;
}
const value = (week, section, id) => isBlank(week[section][id]) ? null : Number(week[section][id]);
const chartValue = (chart,value) => value===null?'N/A':chart.id==='score'?formatScore(value):String(value);
export function reportCharts(weeks) {
  const scores=calculate({release:{},weeks}).weeks;
  const charts=[
    {id:'created',title:'Overall Defects Created (Weekly) vs P0/P1 Defects Created (Weekly)',unit:'count',color:'#315c9b',series:[
      {name:'Overall defects created',color:'#315c9b',values:weeks.map(w=>value(w,'trends','totalCreated'))},
      {name:'P0/P1 defects created',color:'#4e92b6',values:weeks.map(w=>value(w,'values','created'))},
    ]},
    {id:'escaped',title:'Escaped P0/P1 Defects (Weekly)',unit:'count',color:'#a96c2e',series:[{name:'Escaped P0/P1 defects',color:'#a96c2e',values:weeks.map(w=>value(w,'values','open'))}]},
    {id:'fixed',title:'Defects Fixed Rate (Weekly)',unit:'%',color:'#167c80',series:[{name:'Fixed rate',color:'#167c80',values:weeks.map(w=>value(w,'values','fixed'))}]},
    {id:'failed',title:'Defects Failed Rate (Weekly)',unit:'%',color:'#af596d',note:'Uses the weekly reopened-rate value.',series:[{name:'Failed rate (reopened rate)',color:'#af596d',values:weeks.map(w=>value(w,'values','reopened'))}]},
    {id:'score',title:'Score (Weekly)',unit:'points',color:'#7862a5',series:[{name:'Weekly score',color:'#7862a5',values:scores.map(w=>w.score)}]},
  ];
  return charts;
}
export function trendChart(weeks,chart) {
  const hasData=chart.series.some(s=>s.values.some(v=>v!==null));
  const legend=`<div class="report-legend">${chart.series.map((s,i)=>`<span><i style="background:${s.color}" class="${i?'square':''}"></i>${h(s.name)}</span>`).join('')}</div>`;
  const heading=`<h3>${h(chart.title)}</h3>${legend}`;
  if(!hasData)return `<article class="panel report-chart" data-chart="${chart.id}" style="border-top:3px solid ${chart.color}">${heading}<p class="empty">Not measured</p></article>`;
  const includeYear=new Set(weeks.flatMap(w=>[w.start.slice(0,4),w.end.slice(0,4)])).size>1;
  const periods=weeks.map(w=>weekPeriod(w,includeYear));
  // Reserve space for complete date ranges at 45 degrees, including year-spanning reports.
  const labelExtent=Math.ceil(Math.max(...periods.map(p=>p.length))*5.4/Math.SQRT2);
  const width=chart.series.length>1?900:460,left=Math.max(65,labelExtent+12),right=20,bottom=Math.max(80,labelExtent+30),top=24,height=top+174+bottom,plot=width-left-right;
  const maxValue=Math.max(1,...chart.series.flatMap(s=>s.values.filter(v=>v!==null)));
  const max=chart.unit==='count'?Math.ceil(maxValue/4)*4:Math.max(100,Math.ceil(maxValue/100)*100);
  const x=i=>left+(weeks.length===1?plot/2:i*plot/(weeks.length-1));
  const y=n=>top+(height-bottom-top)*(1-n/max);
  const unit=chart.unit==='%'?'%':'';
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${h(chart.title)}"><title>${h(chart.title)}</title>`;
  for(let i=0;i<=4;i++){
    const n=max*i/4;
    svg+=`<line x1="${left}" x2="${width-right}" y1="${y(n)}" y2="${y(n)}" stroke="#e2e8f0" stroke-dasharray="3 4"/><text class="chart-axis-label chart-y-label" x="${left-9}" y="${y(n)+4}" text-anchor="end">${chart.id==='score'?formatScore(n):n.toLocaleString('en-US')}${unit}</text>`;
  }
  chart.series.forEach((series,seriesIndex)=>{
    let segment=[];
    const flush=()=>{if(segment.length)svg+=`<polyline data-series="${h(series.name)}" points="${segment.join(' ')}" fill="none" stroke="${series.color}" stroke-width="2.5"/>`;segment=[];};
    series.values.forEach((v,i)=>{if(v===null)flush();else segment.push(`${x(i)},${y(v)}`);});flush();
    series.values.forEach((v,i)=>{
      if(v===null)return;
      const label=`Week ${i+1} (${periods[i]}): ${series.name} ${chartValue(chart,v)}${unit}`;
      const attrs=`tabindex="0" aria-label="${h(label)}" data-value="${v}" fill="${series.color}" stroke="white" stroke-width="1.2"`;
      svg+=seriesIndex?`<rect x="${x(i)-3.5}" y="${y(v)-3.5}" width="7" height="7" ${attrs}><title>${h(label)}</title></rect>`:`<circle cx="${x(i)}" cy="${y(v)}" r="4" ${attrs}><title>${h(label)}</title></circle>`;
    });
  });
  const step=Math.max(1,Math.ceil(weeks.length/Math.max(2,Math.floor(plot/26))));
  const ticks=weeks.map((_,i)=>i).filter(i=>i%step===0);
  if(ticks.at(-1)!==weeks.length-1){
    if(weeks.length-1-ticks.at(-1)<step/2)ticks.pop();
    ticks.push(weeks.length-1);
  }
  ticks.forEach(i=>{
    const tickY=height-bottom+18;
    svg+=`<text class="chart-axis-label chart-x-label" x="${x(i)}" y="${tickY}" transform="rotate(-45 ${x(i)} ${tickY})" text-anchor="end">${h(periods[i])}</text>`;
  });
  return `<article class="panel report-chart" data-chart="${chart.id}" style="border-top:3px solid ${chart.color}">${heading}<div class="chart-scroll" role="region" tabindex="0" aria-label="${h(chart.title)}">${svg}</svg></div>${chart.note?`<p class="chart-note">${h(chart.note)}</p>`:''}</article>`;
}
function weeklySummary(weeks,summary) {
  return `<section class="panel weekly-summary"><div class="panel-head"><h2>Weekly Score Summary</h2>${badge(summary.weekly.score)}</div><p class="report-note">${formatScore(summary.weekly.totalWeekScores)} total weekly score ÷ ${summary.weekly.measuredWeeks} measured weeks = ${formatScore(summary.weekly.score)}. Weeks without scored measurements are excluded.</p><div class="table-scroll"><table><thead><tr><th>Week</th><th>Period</th><th>Scored metrics measured</th><th>Week score</th><th>RAG</th></tr></thead><tbody>${weeks.map((w,i)=>`<tr><td>Week ${i+1}</td><td>${h(dateLabel(w.start))} – ${h(dateLabel(w.end))}</td><td>${summary.weeks[i].count} / ${scoredCount(weeklyMetrics)}</td><td><strong class="weekly-score-value ${rag(summary.weeks[i].score)}">${formatScore(summary.weeks[i].score)} / 100</strong></td><td>${badge(summary.weeks[i].score)}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function chartsHTML(weeks) {
  const charts=reportCharts(weeks);
  return `<div class="report-trends">${charts.map(c=>trendChart(weeks,c)).join('')}</div><p class="report-note">Charts always show all original weeks, regardless of report filters. Each chart has a distinct color. The comparison chart also uses square markers for P0/P1 defects. Gaps indicate unmeasured values; zero values are plotted. Failed rate uses reopened rate.</p><details class="panel trend-data"><summary>View Chart Data</summary><div class="table-scroll"><table><thead><tr><th>Week</th>${charts.flatMap(c=>c.series.map(s=>`<th>${h(s.name)}${c.unit==='%'?' (%)':''}</th>`)).join('')}</tr></thead><tbody>${weeks.map((w,i)=>`<tr><td>W${i+1} · ${h(weekPeriod(w))}</td>${charts.flatMap(c=>c.series.map(s=>`<td>${chartValue(c,s.values[i])}${s.values[i]!==null&&c.unit==='%'?'%':''}</td>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function thresholdsHTML(filters) {
  const statuses=['green','amber','red'];
  const scopes=[['weekly','Weekly Operational',weeklyMetrics],['release','Release Summary',releaseMetrics]].map(([scope,title,metrics])=>[scope,title,metrics.filter(m=>matchesReportMetric(m,filters))]).filter(([, ,metrics])=>metrics.length);
  return `<h3>Applied Thresholds</h3>${scopes.map(([scope,title,metrics])=>`<section class="threshold-scope" data-scope="${scope}"><h4>${title}<span>${metrics.length} metrics</span></h4>${[...new Set(metrics.map(m=>m.group))].map((group,i)=>`<section class="threshold-component"><h5 id="threshold-${scope}-${i}">${h(sectionTitle(group))}</h5><div class="table-scroll"><table class="applied-thresholds" aria-labelledby="threshold-${scope}-${i}"><thead><tr><th>Metric</th>${[100,60,0].map(score=>`<th class="threshold-${rag(score)}">${badge(score)} <span>${score} pts</span></th>`).join('')}</tr></thead><tbody>${metrics.filter(m=>m.group===group).map(m=>`<tr data-metric="${m.id}"><td>${h(m.name)} ${classificationLabels(m)}</td>${isScored(m)?thresholds(m).map((t,i)=>`<td class="threshold-${statuses[i]}">${h(t)}</td>`).join(''):'<td colspan="3" class="informational-threshold">Informational · no RAG thresholds or points</td>'}</tr>`).join('')}</tbody></table></div></section>`).join('')}</section>`).join('')||'<p class="report-note">No applied thresholds match these filters.</p>'}`;
}
function trendsSectionHTML(weeks,{standalone,showTrends}) {
  if(standalone&&!showTrends)return '';
  return `<section class="report-trend-section${showTrends?'':' trends-hidden'}" aria-labelledby="report-trends-title"><div class="report-trend-heading"><h2 class="report-section-title" id="report-trends-title">Weekly Trends</h2>${standalone?'':`<button type="button" class="button trend-toggle" data-action="toggle-report-trends" aria-expanded="${showTrends}" aria-controls="report-trend-content">${showTrends?'Hide':'Show'} Trend Charts</button>`}</div><div id="report-trend-content"${showTrends?'':' hidden'}>${chartsHTML(weeks)}</div></section>`;
}
function weeklySectionHTML(weeks,metrics,summary,{standalone,showWeeklyDetails}) {
  const hasDetails=weeks.length>0&&metrics.length>0;
  const heading=`<div class="report-weekly-heading"><h2 class="report-section-title" id="report-weekly">Weekly Operational Metrics</h2>${standalone||!hasDetails?'':`<button type="button" class="button weekly-details-toggle" data-action="toggle-report-weekly-details" aria-expanded="${showWeeklyDetails}" aria-controls="report-weekly-details">${showWeeklyDetails?'Hide':'Show'} Weekly Details</button>`}</div>`;
  if(!weeks.length)return heading+'<p class="notice">No weekly measurements were entered.</p>';
  if(!metrics.length)return heading+'<p class="report-note">No weekly metrics match these filters.</p>';
  const overview=heading+weeklySummary(weeks,summary);
  if(standalone&&!showWeeklyDetails)return overview;
  return overview+`<div id="report-weekly-details"${showWeeklyDetails?'':' hidden'}>${weeks.map((w,i)=>`<section class="panel release-group weekly-report"><div class="panel-head"><h2>Week ${i+1} · ${h(dateLabel(w.start))} – ${h(dateLabel(w.end))}</h2><span class="week-score ${rag(summary.weeks[i].score)}"><span class="week-score-label">Score</span><strong>${formatScore(summary.weeks[i].score)}<small> / 100</small></strong>${badge(summary.weeks[i].score)}</span></div>${metricTable(metrics,w.values,{grouped:true,perspectiveScores:Object.fromEntries(perspectives.map(p=>[p.id,summary.perspectives[p.id].weeks[i]]))})}</section>`).join('')}</div>`;
}
export function reportBody(snapshot,filters={}, {standalone=false,showTrends=true,showWeeklyDetails=true}={}) {
  const d=snapshot.draft,sorted=[...d.weeks].sort((a,b)=>a.start.localeCompare(b.start)),s=calculate({...d,weeks:sorted});
  const selected=reportFilterDetails(d,filters),weekly=selected.weekly,release=selected.release;
  return `<section class="report-intro"><div class="eyebrow">QUALITY MEASUREMENT REPORT</div><h1>${h(d.project.name)}</h1><p>${h(d.project.description)}</p><dl class="report-meta"><div><dt>QA owner</dt><dd>${h(d.project.owner)}</dd></div><div><dt>Release date</dt><dd><time datetime="${h(d.project.releaseDate)}">${h(dateLabel(d.project.releaseDate))}</time></dd></div></dl></section>
${filterNoteHTML(selected)}${overallRagHTML(s.overall)}${statsHTML(d)}<p class="report-note">${s.overall.count} scored observations · ${d.weeks.length} weekly records · ${scoredCount(releaseMetrics)+scoredCount(weeklyMetrics)*d.weeks.length-s.overall.count} scored measurements N/A. Informational metrics excluded from coverage. Health reflects entered measurements only; see coverage and scoring methodology. QA and Development scores each pool that perspective’s measured weekly and release entries.</p>${classificationNote}
${discoveryOverview(d,selected.filters)}${trendsSectionHTML(sorted,{standalone,showTrends})}
${weeklySectionHTML(sorted,weekly,s,{standalone,showWeeklyDetails})}
<h2 class="report-section-title" id="report-release">Release Summary</h2>${!release.length?'<p class="report-note">No release metrics match these filters.</p>':perspectiveScoresHTML(Object.fromEntries(perspectives.map(p=>[p.id,s.perspectives[p.id].release])),'Release')+`<div class="release-grid">${[...new Set(release.map(m=>m.group))].map(group=>`<section class="panel release-group"><div class="panel-head"><h2>${h(sectionTitle(group))}</h2></div>${metricTable(release.filter(m=>m.group===group),releaseValues(d),{weeks:d.weeks})}</section>`).join('')}</div>`}
<section class="panel report-method"><div class="report-method-heading"><h2 id="scoring-methodology">Scoring Methodology</h2>${standalone?'':methodologyLink('Open scoring methodology')}</div><p class="methodology-screen-note">Read the calculation rules on the dedicated page. Applied Thresholds below follow the report filters. HTML and PDF reports include the full methodology.</p><div class="methodology-copy">${methodology}</div>${thresholdsHTML(selected.filters)}${rulesSourceHTML}</section>`;
}
export function reportDocument(snapshot,css,filters={}, {showTrends=true,showWeeklyDetails=true}={}) {return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(snapshot.draft.project.name)} · Quality Measurement report</title><meta name="theme-color" content="#18344f"><style>${css}</style></head><body class="standalone-report"><main>${reportBody(snapshot,filters,{standalone:true,showTrends,showWeeklyDetails})}</main></body></html>`;}
export function csvDocument(snapshot,filters={}) {
  const d=snapshot.draft,sorted=[...d.weeks].sort((a,b)=>a.start.localeCompare(b.start)),s=calculate({...d,weeks:sorted});
  const selected=reportFilterDetails(d,filters);
  const rows=[['Project',d.project.name],['QA owner',d.project.owner],['Release date',d.project.releaseDate],['Description',d.project.description],['Rules version',RULE_VERSION],['Scope','Total score','Denominator','Denominator unit','Health score','RAG'],
    ['Overall RAG Score',s.overall.points,s.overall.count,'Scored observations',formatScore(s.overall.score),ragLabel(s.overall.score)],
    ...perspectives.map(p=>{const score=s.perspectives[p.id].overall;return [p.name+' Score',score.points,score.count,'Scored observations',formatScore(score.score),ragLabel(score.score)];}),
    ['Weekly',formatScore(s.weekly.totalWeekScores),s.weekly.measuredWeeks,'Measured weeks',formatScore(s.weekly.score),ragLabel(s.weekly.score)],
    ['Release',s.release.points,s.release.count,'Scored metrics',formatScore(s.release.score),ragLabel(s.release.score)],[],
    ...perspectives.map(p=>{const score=s.perspectives[p.id].release;return ['Release '+p.name+' Score',score.points,score.count,'Scored metrics',formatScore(score.score),ragLabel(score.score)];}),[],
    ['Week','Start','End','Measured metrics','Week score','RAG',...perspectives.flatMap(p=>[p.name+' Score',p.name+' RAG',p.name+' measured metrics'])],
    ...sorted.map((w,i)=>[i+1,w.start,w.end,s.weeks[i].count,formatScore(s.weeks[i].score),ragLabel(s.weeks[i].score),...perspectives.flatMap(p=>{const score=s.perspectives[p.id].weeks[i];return [formatScore(score.score),ragLabel(score.score),score.count];})]),[],
    ['Scope','Period','Category','Metric','Live value','Points','RAG','Green (100)','Amber (60)','Red (0)','Primary perspective','Measurement notes']];
  const labels=m=>[m.perspective==='qa'?'QA':'Development'];
  const add=(scope,period,metrics,values)=>metrics.forEach(m=>rows.push([scope,period,m.group,m.name,formatValue(m,values[m.id]),scoreMetric(m,values[m.id])??'N/A',isScored(m)?ragLabel(scoreMetric(m,values[m.id])):'Informational',...thresholds(m),...labels(m),discoveryNote(m,values,d.weeks)]));
  add('Release',d.project.releaseDate,selected.release,releaseValues(d));
  sorted.forEach(w=>{const period=`${w.start} to ${w.end}`;add('Weekly',period,selected.weekly,w.values);trendMetrics.filter(m=>matchesReportMetric(m,selected.filters)).forEach(m=>rows.push([m.archived?'Archived trend':'Trend only',period,'Unscored',m.name,formatValue(m,w.trends[m.id]),'N/A','N/A','','','',...labels(m)]));Object.entries(w.legacyValues??{}).forEach(([id,value])=>{const m=releaseMetrics.find(m=>m.id===id);if(m&&matchesReportMetric(m,selected.filters))rows.push(['Previous weekly',period,'Unscored',legacyWeeklyNames[id],formatValue(m,value),'N/A','N/A','','','',...labels(m)]);});});
  const charts=reportCharts(sorted);
  rows.push([],['Chart series','Period','Value','Unit']);
  sorted.forEach((w,i)=>charts.forEach(chart=>chart.series.forEach(series=>rows.push([series.name,`${w.start} to ${w.end}`,chartValue(chart,series.values[i]),chart.unit]))));
  rows.push([],['Methodology','Weekly average = sum of measured week scores / measured weeks. Empty weeks excluded; zero-score measured weeks included. Overall = total metric points / scored observations. Escaped P0/P1 chart = weekly week-end field (formerly Open P0/P1). Failed rate chart = weekly reopened rate. Continuous decimal thresholds. P0/P1 discovery counts and derived weekly average remain informational. UAT Discovery Rate = UAT discovered defects ÷ (Pre-UAT discovered defects + UAT discovered defects) x 100%; same release, distinct confirmed first discoveries. Internal pilot bands: Green <= 10% with 0 P0/P1 UAT discoveries (100 points); Amber > 10% and <= 20% with 0 P0/P1 UAT discoveries (60 points); Red > 20% or >= 1 P0/P1 UAT discovery (0 points). All three valid counts and a non-zero denominator are required; otherwise N/A. Use unrounded percentages. The P0/P1 UAT override affects this metric only; those discoveries are not scored separately. UAT contributes once to QA, Release and Overall; Development is unchanged. Legacy comparison counts are not converted.']);
  rows.push(['Perspective methodology','QA Score and Development Score each equal total points / measured observations within that perspective, pooling weekly and release entries. Each metric has one primary perspective. Each scored metric counts once in its primary perspective. Blank or invalid values and trend-only / archived inputs are excluded; measured zero counts. RAG uses unrounded scores: Green >= 85, Amber >= 60 and < 85, Red < 60. Overall RAG Score pools both perspectives; it is not a simple average of their scores.']);
  if(selected.active)rows.unshift(['Report Filters',selected.description],['Visible metric entries',selected.visible,'Full report metric entries',selected.total],['Scoring scope','All original measurements. Filters apply to metric rows only; summary scores, RAG, coverage, and weekly score summaries are unchanged. All chart series include all original weeks.'],[]);
  // Prevent user-entered spreadsheet formulas from executing when CSV is opened.
  const cell=v=>{let text=String(v??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
