import {weeklyMetrics,releaseMetrics,trendMetrics,SOURCE_DOCUMENT,densityMeasures} from './metrics.js';
import {escapeHTML as h,classificationLabels} from './report.js';

// Reference content checked against the definition tables on PDF pages 1-6.
// Scoring rules remain in metrics.js; this page does not calculate scores.
const titleCase=value=>value.replace(/\b[a-z]/g,letter=>letter.toUpperCase());
const weekly=weeklyMetrics.map(metric=>({
  ...metric,timing:'Weekly',
  note:metric.id==='open'?'The PDF calls this “Open P0/P1 defects (week-end)” and defines it as the open count at week-end. The website uses the updated escaped-defect label.':'',
}));
const release=releaseMetrics.map(metric=>({
  ...metric,
  timing:metric.group==='Product quality'?'Post-release (first 14 days)':['openAtRelease','averageCreated','open','aging'].includes(metric.id)?'At release time':'At release (final value)',
  ...(metric.id==='density'?{
    name:'Defect Density',
    formula:densityMeasures.map(m=>m.name+': '+m.formula).join('; '),
    note:'Updated website definition. Use one distinct confirmed defect population and the same release scope and cutoff for all three measures. Exclude duplicate and rejected non-defects; count reopened defects once. Count distinct executed test cases, not reruns, and requirements at a consistent level of detail. Use the fixed approved planned development effort baseline. Missing counts or zero denominators are unavailable. Previous man-days ratios are retained for reference only.',
  }:metric.id==='aging'?{
    formula:'(Resolved date - detected date) ÷ total days open',
    note:'The PDF formula is ambiguous. In the website, enter your measured average age in days; it is not calculated automatically.',
  }:metric.id==='reopened'?{
    formula:'Total tested defects ÷ total reopened defects',
    note:'The PDF formula is ambiguous and differs from the weekly definition. In the website, enter your measured reopened percentage; it is not calculated automatically.',
  }:metric.id==='uatDiscovery'?{
    note:'Updated website definition replacing the PDF’s Regression vs UAT defects comparison. Use distinct confirmed first discoveries for the same release and scope across all agreed pre-UAT stages and UAT. Both counts are required; a zero denominator is N/A. Previous regression-only counts are retained for verification, not treated as the complete pre-UAT population. Record P0/P1 UAT discoveries, including those subsequently fixed, and root causes separately. P0/P1 UAT discoveries are a subset of the total UAT discoveries. Supply an explicit zero if none were found.',
  }:metric.id==='averageCreated'?{
    note:'Calculated from saved weekly P0/P1-created counts. Divide their total by weeks with valid measured counts; include measured zeroes and exclude blanks. A previous manually entered average is not used.',
  }:['firstRun','flaky'].includes(metric.id)?{note:'If applicable; the PDF marks this metric “if any”.'}:{}),
}));
const trendDefinitions={
  totalEscaped:{formula:'Total escaped defects recorded each week.',source:'Not specified in PDF'},
  totalCreated:{formula:'Total defects created each week.',source:'Not specified in PDF'},
  totalResolved:{formula:'Total defects resolved each week.',source:'Not specified in PDF'},
  totalReopened:{formula:'Total defects reopened each week.',source:'Not specified in PDF'},
  p1Aging:{name:'P1 aging trend',formula:'Weekly P1 defect aging. The PDF does not specify the aggregation method.',source:'Jira'},
};
const trends=trendMetrics.filter(metric=>!metric.archived).map(metric=>({...metric,...trendDefinitions[metric.id],timing:'Weekly'}));

export const referenceSections=[
  {id:'reference-weekly',title:'Weekly Operational Metrics',items:weekly,description:'Measure defect flow, backlog health, and test execution each week.'},
  {id:'reference-trends',title:'Trend Charts',items:trends,description:'All five trend items listed in the PDF. Descriptions follow the item names; detailed formulas are not supplied. The generated report uses the chart selection agreed for the website.'},
  {id:'reference-release',title:'Release Summary Metrics',items:release,description:'Measure product quality during the first 14 days after release, and capture final release values for the other components.'},
];
export const defectStatuses=[
  {name:'Resolved defects',definition:'Defects moved to Ready for deploy / Done status.'},
  {name:'Reopened defects',definition:'Defects moved to QA Failed / UAT Failed status.'},
  {name:'Tested defects',definition:'Defects moved to QA In Progress / UAT In Progress status.'},
];

function referenceTable(items,id){
  return `<div class="table-scroll reference-scroll" role="region" aria-labelledby="${id}" tabindex="0"><table class="reference-table" aria-labelledby="${id}"><colgroup><col class="reference-metric-col"><col class="reference-definition-col"><col class="reference-timing-col"><col class="reference-source-col"></colgroup><thead><tr><th scope="col">Metric</th><th scope="col">Formula / Definition</th><th scope="col">Measurement Timing</th><th scope="col">Tool / Source</th></tr></thead><tbody>${items.map(metric=>`<tr data-reference-metric="${h(id+'-'+metric.id)}"><th scope="row"><span class="reference-metric-name">${h(metric.name)}</span>${classificationLabels(metric)}</th><td>${h(metric.formula)}${metric.note?(metric.id==='uatDiscovery'?`<ul class="metric-description reference-note">${metric.note.split('. ').map(text=>`<li>${h(text.endsWith('.')?text:text+'.')}</li>`).join('')}</ul>`:`<p class="reference-note">${h(metric.note)}</p>`):''}</td><td>${h(metric.timing)}</td><td>${h(metric.source)}</td></tr>`).join('')}</tbody></table></div>`;
}
function referenceSection(section){
  const groups=[...new Set(section.items.map(metric=>metric.group||'Trend Items'))];
  return `<section class="reference-section" aria-labelledby="${section.id}"><div class="reference-section-heading"><h2 id="${section.id}">${h(section.title)}</h2><span class="count-pill">${section.items.length} items</span></div><p class="report-note">${h(section.description)}</p>${groups.map((group,index)=>{
    const id=section.id+'-'+index,title=group==='Product quality'?'Product Quality (Customer & Production)':titleCase(group);
    return `<section class="panel reference-component"><div class="reference-component-heading"><h3 id="${id}">${h(title)}</h3></div>${referenceTable(section.items.filter(metric=>(metric.group||'Trend Items')===group),id)}</section>`;
  }).join('')}</section>`;
}
export function referenceDocument(){
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#18344f"><meta name="description" content="Weekly and release metric definitions, trend items, measurement timing, data sources, and defect statuses."><title>Quality Measurement · Metrics Reference</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/builder.css"><link rel="stylesheet" href="/print.css"></head><body class="standalone-report reference-page"><header class="reference-topbar"><a href="/#project" class="methodology-brand">Quality <span>Measurement</span></a><div><a class="button" href="/methodology.html">Scoring Methodology</a><a class="button" href="/#report">Generated Report</a></div></header><main><section class="report-intro"><div class="eyebrow">THE METRICS LIBRARY</div><h1>Metrics Reference</h1><p>Definitions, measurement timing, and data sources for every weekly, trend, and release item in the reference document.</p><div class="reference-counts"><span>9 weekly metrics</span><span>5 trend items</span><span>20 release metrics</span><span>3 status definitions</span></div></section><nav class="methodology-contents reference-contents" aria-label="Reference contents">${referenceSections.map(section=>`<a href="#${section.id}">${h(section.title)}</a>`).join('')}<a href="#reference-statuses">Defect Status Definitions</a></nav><p class="report-note reference-intro-note">Metric names and QA / Development labels align with the website. Notes identify updated wording and ambiguous source formulas. Percentage ratios are expressed as percentages for the website inputs.</p>${referenceSections.map(referenceSection).join('')}<section class="reference-section" aria-labelledby="reference-statuses"><div class="reference-section-heading"><h2 id="reference-statuses">Defect Status Definitions</h2><span class="count-pill">${defectStatuses.length} items</span></div><div class="panel"><table class="reference-table reference-status-table" aria-labelledby="reference-statuses"><thead><tr><th scope="col">Term</th><th scope="col">Definition</th></tr></thead><tbody>${defectStatuses.map(status=>`<tr data-reference-status><th scope="row">${h(status.name)}</th><td>${h(status.definition)}</td></tr>`).join('')}</tbody></table></div></section><p class="report-note reference-source">Source: ${h(SOURCE_DOCUMENT)}, definition tables and status notes on pages 1-6.</p></main><footer><span>QUALITY MEASUREMENT <b>/</b> Engineering Quality</span><span>Metrics Reference</span></footer></body></html>`;
}
