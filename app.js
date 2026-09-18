import {weeklyMetrics,releaseMetrics,trendMetrics,blankDraft,emptyWeek,exampleDraft,parseDraft,validateDraft,validateValue,scoreMetric,calculate,thresholds,formatScore,ragLabel,formatValue,RULE_VERSION,legacyWeeklyNames,isBlank,isScored,scoredCount,releaseValues,emptyUatDiscovery,emptyDefectDensity,densityMeasures,densitySummary} from './metrics.js';
import {escapeHTML as h,badge,statsHTML,reportBody,reportDocument,csvDocument,methodologyLink,dateLabel,classificationLabels,reportFilterOptions,normalizeReportFilters,reportFilterDetails,metricBadge,discoveryNoteHTML,densityNote} from './report.js';
import {jiraView,mountJiraPage,disposeJiraPage} from './jira.js';
const STORAGE='measure-builder-v1';
let draft=blankDraft(),snapshot=null,storageMessage='',errors=[],page='project',activeWeek=0,saveTimer;
let reportFilters=normalizeReportFilters(),reportShowTrends=true,reportShowWeeklyDetails=true;
try {const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved){draft=parseDraft(saved.draft,{allowInvalid:true});if(saved.snapshot && saved.snapshot.rulesVersion!==RULE_VERSION){storageMessage='Report calculations and charts have been updated. Your inputs are retained; generate a new report with the current rules.';try{const archiveKey=STORAGE+':before-'+RULE_VERSION;if(!localStorage.getItem(archiveKey))localStorage.setItem(archiveKey,JSON.stringify(saved));}catch{storageMessage+=' Download an input backup to keep a copy.';}}if(saved.snapshot && saved.snapshot.rulesVersion===RULE_VERSION){const reportDraft=parseDraft(saved.snapshot.draft);if(!validateDraft(reportDraft,{requireReady:true}).length && Number.isFinite(Date.parse(saved.snapshot.generatedAt)))snapshot={...saved.snapshot,draft:reportDraft};}}} catch {storageMessage='Saved data could not be read. Import a backup to restore it.';}
const pages={project:'Project Details',weekly:'Weekly Metrics',release:'Release Metrics',report:'Generated Report',jira:'Jira Defect Statistics'};
const descriptions={project:'Start with the project. Turn your live measurements into a clear quality report.',weekly:'Track defect flow, backlog health, and testing quality week by week.',release:'Enter the final live values. Scores and RAG statuses update as you type.',report:'A shareable snapshot of the measurements you entered.'};
function save(){clearTimeout(saveTimer);saveTimer=null;try{localStorage.setItem(STORAGE,JSON.stringify({draft,snapshot}));document.querySelector('#save-status').textContent='Saved in this browser';}catch{document.querySelector('#save-status').textContent='Not saved — download a backup';} }
function queueSave(){document.querySelector('#save-status').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,250);}
window.addEventListener('pagehide',()=>{if(saveTimer)save();});
function confirmReplace(message,{title='Replace current data?',confirmLabel='Confirm'}={}){return new Promise(resolve=>{const dialog=document.querySelector('#confirm-dialog');document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-proceed').textContent=confirmLabel;document.querySelector('#confirm-message').textContent=message;const finish=value=>{dialog.close();resolve(value);};document.querySelector('#confirm-cancel').onclick=()=>finish(false);document.querySelector('#confirm-proceed').onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();});}
function hasInputs(){return JSON.stringify(draft)!==JSON.stringify(blankDraft());}
function stale(){return snapshot&&JSON.stringify(snapshot.draft)!==JSON.stringify(draft);}
function notify(message){const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),4000);}
function navigate(next){if(page===next){render();window.scrollTo(0,0);}else location.hash=next;}
function heading(){return `<div class="page-heading"><div><div class="eyebrow">${page==='report'?'YOUR QUALITY PICTURE':'QUALITY STARTS WITH MEASUREMENT'}</div><h1>${pages[page]}</h1><p class="subtitle">${descriptions[page]}</p></div><div class="heading-actions">${methodologyLink('Methodology')}${page==='weekly'?`<button type="button" class="button" data-action="reset-weeks" ${draft.weeks.length?'':'disabled'}>Reset all weeks</button>`:''}<button class="button primary" data-action="generate">${snapshot?'Regenerate report':'Generate report'} ↗</button></div></div>`;}
function errorHTML(){return errors.length?`<div class="validation-errors" role="alert" tabindex="-1"><strong>Please check these inputs</strong><ul>${errors.map(e=>`<li>${h(e)}</li>`).join('')}</ul></div>`:'';}
function projectView(){return `<div class="project-builder"><section class="panel project-form"><div class="form-section-heading"><span class="section-number">01</span><div><h2>A little context for your report</h2><p>Your project details appear on the generated report.</p></div></div><div class="form-grid"><label>Project name <span class="required">*</span><input data-project="name" maxlength="200" placeholder="e.g. Loyalty Migration" value="${h(draft.project.name)}" required autocomplete="off"></label><label>QA owner <span class="required">*</span><input data-project="owner" maxlength="200" placeholder="e.g. Roy Chow" value="${h(draft.project.owner)}" required autocomplete="off"></label><label>Release date <span class="required">*</span><input type="date" data-project="releaseDate" value="${h(draft.project.releaseDate)}" required></label><div class="field-note">Product-quality metrics cover the first 14 days after release. Other release metrics use the final release value.</div><label class="span-all">Project notes <span class="optional">Optional</span><textarea data-project="description" maxlength="2000" rows="4" placeholder="Add scope, release context, or measurement notes…">${h(draft.project.description)}</textarea></label></div><div class="form-bottom"><span>Fields marked * are required to generate a report.</span><div class="form-actions"><button type="button" class="button" data-action="reset-project" title="Clear all Project Details fields">Reset</button><button class="button primary" data-action="go-weekly">Continue to weekly metrics →</button></div></div></section><aside class="builder-guide"><span class="eyebrow">FROM INPUT TO INSIGHT</span><h2>A report that does<br>the scoring for you.</h2><p>Enter your measurements and get a consistent view of quality using your team’s RAG thresholds.</p><ol><li><b>Add project details</b><span>Give your report a name and owner.</span></li><li><b>Enter live measurements</b><span>Add weekly and release values. Leave unmeasured metrics blank.</span></li><li><b>Generate and download</b><span>Review scores, trends, and a complete measurement report.</span></li></ol><button class="button" data-action="example">Try the Loyalty Migration example ↗</button><p class="tiny">Example scores are recalculated with the new thresholds.</p></aside></div><div class="draft-summary" id="draft-summary">${draftSummary()}</div>`;}
function draftSummary(){const c=calculate(draft);return `<div><span class="eyebrow">CURRENT DRAFT</span><h3>${h(draft.project.name||'Your next quality report')}</h3></div><div><b>${draft.weeks.length}</b><span>Weekly records</span></div><div><b>${c.release.count} / ${scoredCount(releaseMetrics)}</b><span>Scored Release Metrics entered</span></div><div><b>${formatScore(c.overall.score)}</b><span>Overall Quality Health</span></div>`;}
function inputHTML(m,value,key,part='') {
  const id=`input-${key}${part?'-'+part:''}`;
  const partLabel={preUat:'Pre-UAT Discoveries',uat:'UAT Discoveries',criticalUat:'P0/P1 UAT Discoveries'}[part];
  const name=part?`${m.name} — ${partLabel}`:m.name;
  const max=m.unit==='%'&&m.id!=='fixed'?100:1e9;
  return `<div class="number-input"><input type="number" id="${id}" aria-label="${h(name)}" data-metric="${h(m.id)}" ${part?`data-part="${part}"`:''} min="0" max="${max}" step="${m.unit==='count'||part?'1':'any'}" placeholder="N/A" value="${h(value??'')}" inputmode="decimal"><span>${part?'count':m.unit==='%'?'%':m.unit==='days'?'days':m.unit==='count'?'count':''}</span></div>`;
}
function uatInputHTML(m,value,key) {
  const v=value??emptyUatDiscovery();
  return `<div class="uat-discovery-inputs">${[['preUat','Pre-UAT Discoveries'],['uat','UAT Discoveries'],['criticalUat','P0/P1 UAT Discoveries']].map(([part,label])=>`<label for="input-${key}-${part}">${label}${inputHTML(m,v[part],key,part)}</label>`).join('')}<label for="input-${key}-notes">Notes / root causes (optional)<textarea id="input-${key}-notes" data-metric="${m.id}" data-part="notes" maxlength="2000" rows="3" placeholder="Explain scope changes, test-data gaps, or missed test scenarios…">${h(v.notes??'')}</textarea></label><div class="derived-value" data-uat-share aria-live="polite">UAT Discovery Rate: ${h(formatValue(m,v))}</div></div>`;
}
function metricRows(metrics,values,scope){return metrics.map(m=>{
  const key=scope+'-'+m.id,invalid=validateValue(m,values[m.id]);
  const info=isScored(m)?`<details class="threshold-detail"><summary>RAG thresholds</summary><div>${thresholds(m).map((t,i)=>`<span><i class="threshold-dot ${['green','amber','red'][i]}"></i>${h(t)} · ${[100,60,0][i]} pts</span>`).join('')}</div></details>`:'<small class="informational-help">Informational · excluded from quality scores.</small>';
  const context=m.id==='uatDiscovery'?'<ul class="metric-description"><li>Use distinct confirmed defects from the same release and agreed scope.</li><li>Pre-UAT includes functional, integration, and regression discoveries.</li><li>Exclude duplicates, cancelled non-defects, and out-of-scope requirement changes.</li><li>All three counts are needed for a score; enter 0 P0/P1 UAT discoveries explicitly when none were found.</li><li>More than 2 P0/P1 UAT discoveries make this metric Red, even if they have since been fixed.</li><li>P0/P1 UAT discoveries are part of the total UAT discoveries.</li><li>A UAT finding is not automatically a QA failure.</li></ul>':'';
  const note=discoveryNoteHTML(m,values,draft.weeks);
  const input=m.derived?`<output id="input-${key}" class="derived-value">${h(formatValue(m,values[m.id]))}</output><small>Calculated from weekly records</small>`:m.unit==='uatShare'?uatInputHTML(m,values[m.id],key):inputHTML(m,values[m.id],key);
  return `<tr data-row="${m.id}"><td><label for="input-${key}${m.unit==='uatShare'?'-preUat':''}">${h(m.name)}</label>${classificationLabels(m)}<small>${h(m.formula)}</small><span class="source-tag">${h(m.source)}</span>${info}${context}${note}</td><td class="live-input-cell">${input}<span class="input-error" aria-live="polite">${invalid?h(invalid):''}</span></td><td class="live-score">${scoreMetric(m,values[m.id])??'—'}</td><td class="live-rag">${invalid?'<span class="badge red">Invalid</span>':metricBadge(m,values[m.id])}</td></tr>`;
}).join('');}
function densityResultsHTML() {
  const summary=densitySummary(draft.release.density);
  return `<div class="density-score"><span><strong>Overall Defect Density Score</strong><small>${summary.count&&summary.count<3?'Partial · ':''}${summary.count} of 3 measured</small></span><strong>${formatScore(summary.score)} <small>/ 100</small></strong>${badge(summary.score)}</div><p class="density-context">${h(densityNote(draft.release.density,draft.release.legacyDensity))}</p>`;
}
function densityInputPanel(index) {
  const value=draft.release.density??emptyDefectDensity();
  const fields=[['defects','Confirmed defects','Count distinct confirmed defects once; exclude duplicates and rejected non-defects.'],...densityMeasures.map(m=>[m.id,m.denominatorLabel,m.id==='testCases'?'Count each executed case once, excluding reruns.':m.id==='requirements'?'Use the agreed release scope and consistent requirement granularity.':'Use the fixed approved development effort baseline; fractional days are allowed.'])];
  return `<section class="panel input-panel density-panel" id="release-component-${index}"><div class="panel-head"><div><h2><span class="section-number">${String(index+1).padStart(2,'0')}</span>Defect Density ${classificationLabels(releaseMetrics.find(m=>m.id==='density'))}</h2><p class="description">Three measures · one composite score · provisional internal targets</p></div><button type="button" class="button component-reset" data-action="reset-release-component" data-component="Defect Density" aria-label="Reset Defect Density">Reset</button></div><p class="density-context">Use the same confirmed defect count, release scope and measurement cutoff for all three measures. Leave unavailable inputs blank. Zero denominators are N/A.</p><div class="density-fields">${fields.map(([key,label,help])=>`<label for="input-release-density-${key}"><span class="density-field-label">${h(label)}</span><input id="input-release-density-${key}" type="number" data-density-input="${key}" min="0" max="1000000000" step="${key==='manDays'?'any':'1'}" placeholder="N/A" value="${h(value[key]??'')}" inputmode="decimal" aria-describedby="density-help-${key}"><small id="density-help-${key}">${h(help)}</small></label>`).join('')}</div><p id="density-error" class="input-error density-context" role="status">${h(validateValue({unit:'density'},value)||'')}</p><div id="density-results" aria-live="polite">${densityResultsHTML()}</div></section>`;
}
function refreshDensity() {
  const root=document.querySelector('#density-results');if(!root)return;
  root.innerHTML=densityResultsHTML();
  document.querySelector('#density-error').textContent=validateValue({unit:'density'},draft.release.density)||'';
  document.querySelectorAll('[data-density-input]').forEach(input=>input.setAttribute('aria-invalid',String(!!validateValue({unit:input.dataset.densityInput==='manDays'?'ratio':'count'},input.value))));
}
function metricGroups(metrics,values,scope){
  return [...new Set(metrics.map(m=>m.group))].map((group,i)=>{
    const componentMetrics=metrics.filter(m=>m.group===group);
    if(scope==='release'&&group==='Defect Density')return densityInputPanel(i);
    const reset=scope==='release'?`<button type="button" class="button component-reset" data-action="reset-release-component" data-component="${h(group)}" aria-label="Reset ${h(group)}">Reset</button>`:'';
    return `<section class="panel input-panel" id="${scope}-component-${i}"><div class="panel-head"><div><h2><span class="section-number">${String(i+1).padStart(2,'0')}</span>${h(group)}</h2><p class="description">${scope==='release'?(group==='Product quality'?'Post-release · first 14 days':'At release · final measured values'):'Weekly measurement'} · ${componentMetrics.length} metrics</p></div>${reset}</div><div class="table-scroll"><table class="metric-input-table"><thead><tr><th>Metric / definition</th><th>Live value</th><th>Points</th><th>Status</th></tr></thead><tbody>${metricRows(componentMetrics,values,scope)}</tbody></table></div></section>`;
  }).join('');
}
function scoreStrip(scope){const s=scope==='release'?calculate(draft).release:calculate(draft).weeks[activeWeek]??{score:null,count:0};return `<div class="live-strip"><span><strong>${scope==='release'?'Release health':'This week’s health'}</strong><small>Blank = N/A · measured zero counts</small></span><span class="live-summary"><b>${formatScore(s.score)}</b><small>/ 100</small>${badge(s.score)}</span><span class="live-completion">${s.count} / ${scoredCount(scope==='release'?releaseMetrics:weeklyMetrics)} scored metrics measured</span></div>`;}
function releaseView(){return `<div id="live-strip">${scoreStrip('release')}</div><div class="entry-hint">Enter percentages directly, e.g. <b>95.5</b> for 95.5%. Leave unavailable measurements blank. ${methodologyLink('How scoring works','text-link')}</div>${metricGroups(releaseMetrics,releaseValues(draft),'release')}<div class="flow-bottom"><button class="button" data-action="go-weekly">← Weekly Metrics</button><button class="button primary" data-action="generate">Generate measurement report ↗</button></div>`;}
function legacyWeekHTML(w){
  const entries=Object.entries(w.legacyValues??{}),archived=trendMetrics.filter(m=>m.archived&&!isBlank(w.trends[m.id]));
  return entries.length||archived.length?`<details class="panel trend-data"><summary>Previous weekly measurements · not scored</summary><p class="report-note">These earlier measurements are retained in your input backup and excluded from scores and charts. The escaped P0/P1 chart uses the Escaped P0/P1 defects (week-end) field above.</p>${entries.length?`<ul>${entries.map(([id,value])=>`<li>${h(legacyWeeklyNames[id])}: ${h(value)} ${classificationLabels(releaseMetrics.find(m=>m.id===id))}</li>`).join('')}</ul>`:''}<div class="trend-fields">${trendFields(archived,w)}</div></details>`:'';
}
function trendFields(metrics,w){return metrics.map(m=>`<label>${h(m.name)} ${classificationLabels(m)}<input type="number" aria-label="${h(m.name)}" data-trend="${m.id}" min="0" max="1000000000" step="${m.unit==='count'?'1':'any'}" placeholder="N/A${m.unit==='days'?' · days':''}" value="${h(w.trends[m.id]??'')}"></label>`).join('');}
function weeklyView(){if(!draft.weeks.length)return `<section class="panel empty-week"><span class="empty-week-icon">▦</span><h2>Start with your first testing week</h2><p>Add a date range and weekly live values.<br>Weekly measurements are optional; you can also create a release-only report.</p><button class="button primary" data-action="add-week">＋ Add a week</button><button class="text-link" data-action="go-release">Continue to release metrics →</button></section>`;
  activeWeek=Math.min(activeWeek,draft.weeks.length-1);const w=draft.weeks[activeWeek];return `<div class="week-selector"><div class="week-tabs">${draft.weeks.map((week,i)=>`<button class="${i===activeWeek?'selected':''}" data-week="${i}">Week ${i+1}<span>${week.start?h(dateLabel(week.start)):'Set dates'}</span></button>`).join('')}</div><button class="button" data-action="add-week" ${draft.weeks.length>=104?'disabled':''}>＋ Add week</button></div><section class="panel week-dates"><label>Week start <input type="date" data-week-date="start" value="${h(w.start)}" required></label><label>Week end <input type="date" data-week-date="end" value="${h(w.end)}" required></label><div class="week-actions"><button type="button" class="button" data-action="reset-week" title="Clear dates and measurements for Week ${activeWeek+1}">Reset</button><button class="text-link danger" data-action="remove-week">Remove this week</button></div></section><div id="live-strip">${scoreStrip('weekly')}</div>${metricGroups(weeklyMetrics,w.values,'weekly')}${legacyWeekHTML(w)}<div class="flow-bottom"><button class="button" data-action="go-project">← Project Details</button><button class="button primary" data-action="go-release">Continue to release metrics →</button></div>`;}
function reportFilterStatus(){const details=reportFilterDetails(snapshot.draft,reportFilters);return `Showing ${details.visible} of ${details.total} metric entries${details.visible?'':' · No matches'}`;}
function reportFilterControls(){return `<section class="panel report-filters" aria-labelledby="report-filters-title"><div class="filter-heading"><h2 id="report-filters-title">Filter Report</h2><button type="button" class="button" data-action="clear-report-filters" ${reportFilterDetails(snapshot.draft,reportFilters).active?'':'disabled'}>Clear filters</button></div><div class="filter-fields">${Object.entries(reportFilterOptions).map(([key,options])=>`<label for="report-filter-${key}">${key==='label'?'Label':'Component'}<select id="report-filter-${key}" data-report-filter="${key}" aria-controls="report-content" aria-describedby="report-filter-help">${options.map(option=>`<option value="${h(option.value)}" ${reportFilters[key]===option.value?'selected':''}>${h(option.name)}</option>`).join('')}</select></label>`).join('')}</div><p id="report-filter-help">Match both filters. Metric tables and thresholds follow your selection, including in downloads and print. Summary scores and all five trend charts use all original measurements. Use Hide Trend Charts or Hide Weekly Details to control what appears in the report, HTML, and PDF.</p><div id="report-filter-status" role="status" aria-live="polite">${reportFilterStatus()}</div></section>`;}
function refreshReportFilters(){
  const chartDataOpen=document.querySelector('#report-content .trend-data')?.open;
  document.querySelector('#report-content').innerHTML=reportBody(snapshot,reportFilters,{showTrends:reportShowTrends,showWeeklyDetails:reportShowWeeklyDetails});
  const chartData=document.querySelector('#report-content .trend-data');if(chartData&&chartDataOpen)chartData.open=true;
  document.querySelector('#report-filter-status').textContent=reportFilterStatus();
  document.querySelector('[data-action="clear-report-filters"]').disabled=!reportFilterDetails(snapshot.draft,reportFilters).active;
}
function reportView(){if(!snapshot)return `<section class="panel empty-week"><span class="empty-week-icon">▤</span><h2>Your report will appear here</h2><p>Add project details and at least one live metric, then generate your report.</p><button class="button primary" data-action="generate">Generate report ↗</button></section>`;return `${stale()?'<div class="notice">Your inputs have changed since this report was generated. Regenerate to include your latest values. Downloads use the snapshot shown below.</div>':''}<div class="report-actions"><span>Report downloads</span><div><button class="button" data-action="download-csv">↓ CSV data</button><button class="button" data-action="download-html">↓ HTML report</button><button class="button primary" data-action="print">Print / Save PDF</button></div></div>${reportFilterControls()}<div id="report-content">${reportBody(snapshot,reportFilters,{showTrends:reportShowTrends,showWeeklyDetails:reportShowWeeklyDetails})}</div>`;}
function render(){disposeJiraPage();document.body.classList.toggle('report-page',page==='report');document.body.classList.toggle('weekly-page',page==='weekly');document.body.classList.toggle('jira-page',page==='jira');document.body.classList.toggle('builder-page',page!=='report'&&page!=='jira');document.querySelector('#crumb').textContent=pages[page];document.querySelector('#project-crumb').textContent=page==='jira'?'Jira':draft.project.name||'New project';document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});document.querySelector('#app').innerHTML=page==='jira'?jiraView():heading()+errorHTML()+(storageMessage?`<div class="notice">${h(storageMessage)}</div>`:'')+(page==='project'?projectView():page==='weekly'?weeklyView():page==='release'?releaseView():reportView());document.title=`Quality Measurement · ${pages[page]}${draft.project.name&&page!=='jira'?` · ${draft.project.name}`:''}`;if(page==='jira')mountJiraPage();}
function refreshLive(){document.querySelectorAll('[data-row]').forEach(row=>{const m=(page==='release'?releaseMetrics:weeklyMetrics).find(m=>m.id===row.dataset.row);const values=page==='release'?releaseValues(draft):draft.weeks[activeWeek].values;const value=values[m.id];const error=validateValue(m,value);row.querySelector('.input-error').textContent=error||'';row.querySelector('.live-score').textContent=scoreMetric(m,value)??'—';row.querySelector('.live-rag').innerHTML=error?'<span class="badge red">Invalid</span>':metricBadge(m,value);const share=row.querySelector('[data-uat-share]');if(share)share.textContent='UAT Discovery Rate: '+formatValue(m,value);const note=row.querySelector('.discovery-note');if(note)note.outerHTML=discoveryNoteHTML(m,values,draft.weeks);row.querySelectorAll('input,textarea').forEach(input=>input.setAttribute('aria-invalid',String(!!error)));});const strip=document.querySelector('#live-strip');if(strip)strip.innerHTML=scoreStrip(page);}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.project){draft.project[el.dataset.project]=el.value;document.querySelector('#project-crumb').textContent=draft.project.name||'New project';const summary=document.querySelector('#draft-summary');if(summary)summary.innerHTML=draftSummary();}
  else if(el.dataset.densityInput&&page==='release'){draft.release.density??=emptyDefectDensity();draft.release.density[el.dataset.densityInput]=el.value;refreshDensity();refreshLive();}
  else if(el.dataset.metric){const values=page==='release'?draft.release:draft.weeks[activeWeek].values;if(el.dataset.part){values[el.dataset.metric]??=emptyUatDiscovery();values[el.dataset.metric][el.dataset.part]=el.value;}else values[el.dataset.metric]=el.value;refreshLive();}
  else if(el.dataset.trend){draft.weeks[activeWeek].trends[el.dataset.trend]=el.value;const error=validateValue(trendMetrics.find(m=>m.id===el.dataset.trend),el.value);el.setCustomValidity(error||'');el.setAttribute('aria-invalid',String(!!error));}
  else if(el.dataset.weekDate){draft.weeks[activeWeek][el.dataset.weekDate]=el.value;const label=document.querySelector(`[data-week="${activeWeek}"] span`);label.textContent=draft.weeks[activeWeek].start?dateLabel(draft.weeks[activeWeek].start):'Set dates';}
  else return;
  if(errors.length){errors=[];document.querySelector('.validation-errors')?.remove();}
  queueSave();
});
document.addEventListener('change',e=>{
  const key=e.target.dataset.reportFilter;
  if(page!=='report'||!snapshot||!Object.hasOwn(reportFilterOptions,key))return;
  reportFilters=normalizeReportFilters({...reportFilters,[key]:e.target.value});
  refreshReportFilters();
});
function generate(){errors=validateDraft(draft,{requireReady:true});if(errors.length){render();document.querySelector('.validation-errors').focus();return;}snapshot={draft:structuredClone(draft),generatedAt:new Date().toISOString(),rulesVersion:RULE_VERSION};save();navigate('report');notify('Your measurement report is ready.');}
function download(content,type,extension,suffix='',projectName=draft.project.name){const base=(projectName||'measurement').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'measurement';const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=`${base}${suffix}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const actions={
  'toggle-report-trends':button=>{
    if(page!=='report'||!snapshot)return;
    reportShowTrends=!reportShowTrends;
    document.querySelector('#report-trend-content').hidden=!reportShowTrends;
    document.querySelector('.report-trend-section').classList.toggle('trends-hidden',!reportShowTrends);
    button.textContent=`${reportShowTrends?'Hide':'Show'} Trend Charts`;
    button.setAttribute('aria-expanded',String(reportShowTrends));
  },
  'toggle-report-weekly-details':button=>{
    if(page!=='report'||!snapshot)return;
    reportShowWeeklyDetails=!reportShowWeeklyDetails;
    document.querySelector('#report-weekly-details').hidden=!reportShowWeeklyDetails;
    button.textContent=`${reportShowWeeklyDetails?'Hide':'Show'} Weekly Details`;
    button.setAttribute('aria-expanded',String(reportShowWeeklyDetails));
  },
  'clear-report-filters':()=>{
    if(page!=='report'||!snapshot)return;
    reportFilters=normalizeReportFilters();
    document.querySelectorAll('[data-report-filter]').forEach(select=>{select.value='';});
    refreshReportFilters();
    document.querySelector('#report-filter-label').focus();
  },
  'go-weekly':()=>navigate('weekly'),'go-release':()=>navigate('release'),'go-project':()=>navigate('project'),
  generate,
  'reset-project':()=>{
    draft.project=blankDraft().project;
    errors=[];
    clearTimeout(saveTimer);
    save();
    render();
    document.querySelector('[data-project="name"]').focus();
    notify('Project details cleared.');
  },
  'reset-release-component':async(button)=>{
    if(page!=='release')return;
    const group=button.dataset.component;
    const metrics=releaseMetrics.filter(m=>m.group===group);
    if(!metrics.length)return;
    const confirmed=await confirmReplace(`Clear the entered measurements in ${group}? Calculated weekly averages and other components are kept.`,{title:`Reset ${group}?`,confirmLabel:'Reset component'});
    if(!confirmed)return;
    for(const m of metrics)if(!m.derived)draft.release[m.id]=m.unit==='uatShare'?emptyUatDiscovery():m.unit==='density'?emptyDefectDensity():'';
    if(metrics.some(m=>m.id==='uatDiscovery'))delete draft.release.comparison;
    if(metrics.some(m=>m.id==='density'))delete draft.release.legacyDensity;
    errors=[];
    clearTimeout(saveTimer);
    save();
    render();
    const first=metrics[0];
    document.getElementById(`input-release-${first.id}${first.unit==='uatShare'?'-preUat':first.unit==='density'?'-defects':''}`)?.focus();
    notify(`${group} cleared.`);
  },
  'reset-weeks':async()=>{
    if(!draft.weeks.length)return;
    const confirmed=await confirmReplace('Clear the entire Weekly Metrics page, removing all weeks, dates, and measurements? Project details and release measurements will be kept.',{title:'Reset all weeks?',confirmLabel:'Reset all weeks'});
    if(!confirmed)return;
    draft.weeks=[];
    activeWeek=0;
    errors=[];
    clearTimeout(saveTimer);
    save();
    render();
    document.querySelector('[data-action="add-week"]')?.focus();
    notify('All weekly metrics cleared.');
  },
  'reset-week':async()=>{
    const weekIndex=activeWeek;
    if(!draft.weeks[weekIndex])return;
    const confirmed=await confirmReplace(`Clear all dates and measurements for Week ${weekIndex+1}? The week will remain in your list. Other weeks, project details, and release measurements will be kept.`,{title:`Reset Week ${weekIndex+1}?`,confirmLabel:'Reset week'});
    if(!confirmed)return;
    draft.weeks[weekIndex]=emptyWeek();
    errors=[];
    clearTimeout(saveTimer);
    save();
    render();
    document.querySelector('[data-week-date="start"]').focus();
    notify(`Week ${weekIndex+1} cleared.`);
  },
  'add-week':()=>{if(draft.weeks.length>=104)return;const w=emptyWeek(),last=draft.weeks.at(-1);if(last?.start&&last?.end){const shift=date=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);};w.start=shift(last.start);w.end=shift(last.end);}draft.weeks.push(w);activeWeek=draft.weeks.length-1;save();render();},
  'remove-week':async()=>{if(!await confirmReplace('Remove this week and its measurements from the current draft?'))return;draft.weeks.splice(activeWeek,1);activeWeek=Math.max(0,activeWeek-1);save();render();},
  example:async()=>{if(hasInputs()&&!await confirmReplace('Replace the current draft with the Loyalty Migration example? Back up your inputs first if you want to keep them.'))return;draft=exampleDraft();snapshot=null;reportFilters=normalizeReportFilters();reportShowTrends=true;reportShowWeeklyDetails=true;errors=[];storageMessage='';save();render();notify('Example loaded. Scores use the new RAG thresholds.');},
  new:async()=>{if((hasInputs()||snapshot)&&!await confirmReplace('Start a new project? This replaces your current draft and generated report. Back up your inputs first to keep them.'))return;draft=blankDraft();snapshot=null;reportFilters=normalizeReportFilters();reportShowTrends=true;reportShowWeeklyDetails=true;errors=[];activeWeek=0;save();navigate('project');},
  backup:()=>{download(JSON.stringify(draft,null,2),'application/json','json','-inputs');notify('Input backup downloaded.');},
  import:()=>document.querySelector('#import-file').click(),
  'download-csv':()=>{if(snapshot){download(csvDocument(snapshot,reportFilters),'text/csv;charset=utf-8','csv','-report',snapshot.draft.project.name);notify('CSV report downloaded.');}},
  'download-html':async()=>{if(!snapshot)return;const selectedSnapshot=snapshot,selectedFilters={...reportFilters},selectedShowTrends=reportShowTrends,selectedShowWeeklyDetails=reportShowWeeklyDetails;try{const responses=await Promise.all(['styles.css','builder.css','print.css'].map(path=>fetch(path)));if(responses.some(response=>!response.ok))throw new Error('Report styles could not be loaded.');const css=(await Promise.all(responses.map(response=>response.text()))).join('\n');download(reportDocument(selectedSnapshot,css,selectedFilters,{showTrends:selectedShowTrends,showWeeklyDetails:selectedShowWeeklyDetails}),'text/html;charset=utf-8','html','-report',selectedSnapshot.draft.project.name);notify('Standalone HTML report downloaded.');}catch(error){notify(error.message);}},
  print:()=>window.print(),
};
document.addEventListener('click',async e=>{const nav=e.target.closest('[data-page]');if(nav){if(nav.tagName==='A'){if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();}errors=[];navigate(nav.dataset.page);return;}const week=e.target.closest('[data-week]');if(week){activeWeek=Number(week.dataset.week);render();return;}const action=e.target.closest('[data-action]');if(action&&!action.disabled)await actions[action.dataset.action]?.(action);});
document.querySelector('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Choose a JSON backup smaller than 1 MB.');const incoming=parseDraft(JSON.parse(await file.text()));if(hasInputs()&&!await confirmReplace('Replace your current draft with the imported backup?'))return;draft=incoming;snapshot=null;reportFilters=normalizeReportFilters();reportShowTrends=true;reportShowWeeklyDetails=true;errors=[];activeWeek=0;storageMessage='';save();navigate('project');notify('Input backup imported.');}catch(error){notify(error.message);}finally{e.target.value='';}});
function route(){const requested=location.hash.slice(1)||(['/jira','/jira.html'].includes(location.pathname)?'jira':'project');page=Object.hasOwn(pages,requested)?requested:'project';render();window.scrollTo(0,0);}
window.addEventListener('hashchange',route);route();
