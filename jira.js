import {escapeHTML as h} from './report.js';
import {jiraColumns,jiraRateColumns,jiraTableColumns,jiraRate,formatJiraRate,jiraDefaults,jiraWeeks,validateJiraFilters,weekLabel,monthLabel,isHighPriority,jiraSelectionFields,jiraScope,jiraQuery,shiftDate,jiraWeekRequest} from './jira-model.js';
import {jiraOverallColumns} from './jira-overall.js';

const state={filters:{...jiraDefaults},weeks:jiraWeeks(jiraDefaults),rows:new Map(),overallRows:new Map(),overallLoading:false,overallError:'',overallTimeZone:'',configured:null,site:'',loading:false,message:'',lastSync:null,draft:structuredClone(jiraDefaults),options:{errors:{}},optionsLoading:false,optionRun:0,validating:false,queryMessage:'',queryError:false};
let controller,root,run=0,returnFocus;
const projectField={id:'project',name:'Space (Project)',options:'projects',single:true};
const pickerFields=[projectField,...jiraSelectionFields];
function sectionNavigation(){
  const sections=[
    {id:'weekly',label:'Weekly',caption:'Weekly activity',icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>'},
    {id:'overall',label:'Overall',caption:'Cumulative totals',icon:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>'},
  ];
  return `<nav class="jira-section-nav" aria-label="Statistics sections">${sections.map(section=>`<button type="button" class="jira-section-link" data-jira-action="jump-${section.id}" aria-label="${section.label}" aria-describedby="jira-${section.id}-nav-description" aria-controls="jira-${section.id}-heading"><span class="jira-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${section.icon}</svg></span><span class="jira-section-text"><strong>${section.label}</strong><small id="jira-${section.id}-nav-description">${section.caption}</small></span><svg class="jira-section-arrow" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10m-4-4 4 4 4-4"/></svg></button>`).join('')}</nav>`;
}
const cellKey=(group,start,metric,kind)=>`${kind}-${group}-${start}-${metric}`;
function metricCell(week,metric,group,kind='weekly'){
  const row=(kind==='overall'?state.overallRows:state.rows).get(week.start),value=row?.metrics?.[metric.id];
  if(jiraRateColumns.some(rate=>rate.id===metric.id))return rateCell(row,metric,group);
  const count=group==='high'?value?.highCount:value?.count;
  if(!row)return `<span class="jira-pending" aria-label="Not loaded">—</span>`;
  const error=row.error||value?.error;
  return `<button type="button" class="jira-count ${error?'unavailable':metric.id}${count===0?' zero':''}" data-jira-cell="${cellKey(group,week.start,metric.id,kind)}" data-kind="${kind}" data-week-start="${week.start}" data-metric="${metric.id}" data-group="${group}" aria-label="${h(`${kind==='overall'?'Overall':'Weekly'}, ${group==='high'?'High Priority':'All Priorities'}, ${weekLabel(week)}, ${metric.name}: ${error?'unavailable':count+' issues'}`)}">${error?'N/A':count}<span>${error?'View error':count===1?'issue':'issues'}</span></button>`;
}
function rateCell(row,metric,group){
  if(!row)return '<span class="jira-pending" aria-label="Not loaded">—</span>';
  const rate=jiraRate(row,metric.id,group),label=formatJiraRate(rate.value);
  return `<span class="jira-rate ${rate.value===null?'unavailable':''}" title="${h(metric.description+' '+rate.reason)}" aria-label="${h(metric.name+': '+label+(rate.reason?'. '+rate.reason:''))}">${label}<small>${rate.value===null?(rate.denominator===0?'Zero denominator':'Count unavailable'):`${rate.numerator} ÷ ${rate.denominator}`}</small></span>`;
}
function tables(){return ['weekly','overall'].map(kind=>{
  const cumulative=kind==='overall',columns=cumulative?jiraOverallColumns:jiraTableColumns;
  return `<section class="jira-stat-section" data-stats-section="${kind}" aria-labelledby="jira-${kind}-heading"><div class="jira-stat-heading"><h2 id="jira-${kind}-heading" tabindex="-1">${cumulative?'Overall':'Weekly'}</h2><p>${cumulative?'Cumulative figures at the end of each period, including issues created before the First Monday. Each issue is counted once per column; weekly counts are not added together.':'Activity during each Monday–Sunday period.'}</p>${cumulative?`<button type="button" class="button" data-jira-action="overall-csv" ${state.loading||!state.overallRows.size?'disabled':''}>↓ Download Overall CSV</button>`:''}</div>${cumulative?`<p class="jira-overall-status ${state.overallError?'jira-error':''}" role="status">${h(state.overallLoading?'Retrieving cumulative counts and week-end status history…':state.overallError|| (state.overallRows.size?`Outstanding uses status at each period’s end. Cutoffs use ${state.overallTimeZone}. All columns exclude issues currently in Cancel.`:'Overall data will load with the selected query.'))}</p>`:''}${['overall','high'].map(group=>{
    let previous='';const title=group==='high'?'High Priority':'All Priorities';
    return `<section class="panel jira-table-panel" aria-labelledby="jira-${kind}-${group}-title"><div class="jira-section-heading"><div><span class="eyebrow">${cumulative?'CUMULATIVE TOTALS':'WEEKLY DEFECT FLOW'}</span><h3 id="jira-${kind}-${group}-title">${title}</h3><p>${group==='high'?'Current priority: High or Highest':'All priorities within your query'} · Click a count to view the matching issues and JQL.</p></div><span class="jira-scope-tag ${group}">${group==='high'?'High + Highest':'Selected Issues'}</span></div><div class="jira-table-scroll" tabindex="0" role="region" aria-label="${title} ${kind} defect statistics"><table class="jira-stats-table"><thead><tr><th scope="col">${cumulative?'Period Ending':'Period'}</th>${columns.map(m=>`<th scope="col" class="${m.id}" title="${h(m.description)}">${m.name}${m.subtitle?`<small>${m.subtitle}</small>`:''}</th>`).join('')}</tr></thead><tbody>${state.weeks.map(week=>{
      const heading=previous===week.month?'':`<tr class="jira-month"><th scope="rowgroup" colspan="${columns.length+1}">${monthLabel(week)}</th></tr>`;previous=week.month;
      const cutoff=weekLabel({start:week.end,end:week.end}).split(' - ')[0];
      return `${heading}<tr><th scope="row"><span>${cumulative?'As of '+cutoff:'Week '+week.number}</span><small>${weekLabel(week)}</small></th>${columns.map(m=>`<td>${metricCell(week,m,group,kind)}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div></section>`;
  }).join('')}</section>`;
}).join('');}
function summary(){
  const loaded=state.weeks.filter(w=>state.rows.has(w.start)).length,complete=loaded===state.weeks.length;
  const created=state.weeks.map(w=>state.rows.get(w.start)?.metrics?.created);
  const allCreated=complete&&created.every(m=>m?.count!=null);
  const total=key=>allCreated?created.reduce((n,m)=>n+m[key],0):'—';
  return `<div class="jira-summary-card"><span>Reporting Period</span><strong>${state.weeks.length} ${state.weeks.length===1?'Week':'Weeks'}</strong><small>${weekLabel({start:state.filters.start,end:state.filters.end})}</small></div><div class="jira-summary-card"><span>Weekly Created Total</span><strong>${total('count')}</strong><small>Created in selected days</small></div><div class="jira-summary-card"><span>High Priority Created</span><strong>${total('highCount')}</strong><small>High and Highest priorities</small></div><div class="jira-summary-card"><span>Weeks Retrieved</span><strong>${loaded}<small> / ${state.weeks.length}</small></strong><small>${state.loading?'Retrieving Jira data…':state.lastSync?'Last refreshed '+new Date(state.lastSync).toLocaleString():'Ready to retrieve'}</small></div>`;
}
function selectedText(field){
  const selected=field.single?[state.draft[field.id]]:state.draft[field.id]??[];
  if(!selected.length)return 'All';
  const options=state.options[field.options??field.id]??[];
  const names=selected.map(value=>optionText(field,options.find(o=>o.value===value)??{value,label:value}));
  return names.length>2?`${names.length} selected`:names.join(', ');
}
function optionText(field,option){return option.label+(field.single&&option.label!==option.value?' · '+option.value:'');}
function fieldPicker(field){
  const selected=field.single?[state.draft[field.id]]:state.draft[field.id]??[],options=[...(state.options[field.options??field.id]??[])];
  for(const value of selected)if(!options.some(o=>o.value===value))options.push({value,label:value});
  const error=state.options.errors?.[field.options??field.id];
  return `<details class="jira-field-picker" data-picker="${field.id}"><summary aria-label="${field.name} filter"><span>${field.name}</span><strong data-selection-summary>${h(selectedText(field))}</strong></summary><div class="jira-field-options"><div class="jira-picker-search"><input type="search" data-field-search aria-label="Search ${field.name}" aria-controls="jira-options-${field.id}" placeholder="Search by name or key…" autocomplete="off" spellcheck="false"></div>${field.single?'':`<button type="button" class="jira-clear-field" data-jira-action="clear-field" data-field="${field.id}">Clear Selection · All</button>`}${error?`<p class="jira-field-error">${h(error)}</p>`:''}<div class="jira-option-list" id="jira-options-${field.id}" role="${field.single?'radiogroup':'group'}" aria-label="${field.name} values">${options.length?options.map(option=>`<label data-option-search="${h((option.label+' '+option.value).toLocaleLowerCase())}"><input type="${field.single?'radio':'checkbox'}" name="${field.id}" value="${h(option.value)}" ${selected.includes(option.value)?'checked':''}>${h(optionText(field,option))}</label>`).join(''):`<p>${state.optionsLoading?'Loading values…':'No values available in this space.'}</p>`}</div><p class="jira-search-status" role="status" aria-live="polite" hidden></p></div></details>`;
}
function searchField(picker){
  const query=picker.querySelector('[data-field-search]').value.trim().toLocaleLowerCase();
  const options=[...picker.querySelectorAll('[data-option-search]')];
  for(const option of options)option.hidden=!option.dataset.optionSearch.includes(query);
  const count=options.filter(option=>!option.hidden).length,status=picker.querySelector('.jira-search-status');
  status.hidden=!query;
  status.textContent=count?`${count} of ${options.length} values match.`:'No matching values. Try a different search.';
}
function filterPanel(){
  const d=state.draft;
  return `<section class="panel jira-filter-panel" aria-label="Jira report filters"><form id="jira-filters"><div class="jira-filter-heading"><div><h2>Choose Your Issues</h2><p>Build a filter using Jira fields, or write your own JQL.</p></div><div class="jira-mode-switch" role="group" aria-label="Query mode"><button type="button" data-jira-mode="basic" aria-pressed="${d.mode==='basic'}">Fields</button><button type="button" data-jira-mode="jql" aria-pressed="${d.mode==='jql'}">JQL</button></div></div><fieldset class="jira-basic-fields" ${d.mode==='jql'?'hidden':''}><legend class="sr-only">Issue field filters</legend>${pickerFields.map(fieldPicker).join('')}<p class="jira-epic-help">Epic filters issues directly linked to the selected epics. Choose multiple epics to include any of them.</p></fieldset><div class="jira-jql-editor" ${d.mode==='basic'?'hidden':''}><label for="jira-base-jql">JQL</label><textarea id="jira-base-jql" name="jql" rows="4" maxlength="4000" spellcheck="false" placeholder='project = EFSGLYTY AND type = Bug'>${h(d.jql)}</textarea><p>JQL replaces the field selections. Use any Jira fields or functions to select issues. Weekly columns add their weekly dates and workflow rules. Creation-date filters apply only to Weekly Created; Resolved, Tested, QA Failed, and Escaped include issues created in earlier weeks. Overall replaces creation-date filters with each period’s cumulative cutoff; other JQL predicates still apply. ORDER BY is replaced by newest-created first.</p><div class="jira-date-mode"><label for="jira-date-mode">JQL Date Handling</label><select id="jira-date-mode" name="jqlDateMode"><option value="weekly" ${d.jqlDateMode!=='fixed'?'selected':''}>Move Dates with Each Week</option><option value="fixed" ${d.jqlDateMode==='fixed'?'selected':''}>Fixed Dates</option></select><p>By default, calendar dates in standard Jira date fields and history predicates describe the first selected week and advance by seven days for each later week. Date-like text in summaries and labels stays unchanged. Fixed Dates keeps a constant date filter.</p></div><button type="button" class="button" data-jira-action="copy-fields">Use Field Selections as JQL</button></div><p class="jira-options-status" role="status"></p>${Object.keys(state.options.errors??{}).length?'<button type="button" class="button" data-jira-action="retry-options">Retry Loading Fields</button>':''}<div class="jira-period-fields"><label>First Monday<input type="date" name="start" value="${h(d.start)}" required></label><label>Last Day<input type="date" name="end" value="${h(d.end)}" required></label><label class="jira-check"><input type="checkbox" name="excludePentest" ${d.excludePentest?'checked':''}>Exclude PENTEST Issues</label></div><p>Weeks run Monday–Sunday, up to 26 weeks. A Last Day before Sunday creates a partial final week. Priority, status, component, and version filters use current Jira values. Dates use the connected Jira account’s timezone.</p><details class="jira-query-preview"><summary>Preview Weekly JQL · Created</summary><pre></pre></details><div class="jira-filter-footer"><p class="jira-query-status" role="status" aria-live="polite"></p><div><button class="button" type="button" data-jira-action="validate">Validate Query</button><button class="button primary" type="submit">Retrieve Data</button></div></div></form></section>`;
}
function updatePreview(){
  if(!root)return;
  const preview=root.querySelector('.jira-query-preview pre');
  try{preview.textContent=jiraQuery({...state.draft,end:[shiftDate(state.draft.start,6),state.draft.end].sort()[0]},'created');}
  catch(error){preview.textContent=error.message;}
  root.querySelector('.jira-query-status').textContent=state.validating?'Validating with Jira…':state.queryMessage;
  root.querySelector('.jira-query-status').classList.toggle('has-error',state.queryError&&!state.validating);
  root.querySelector('.jira-options-status').textContent=state.optionsLoading?'Loading Jira field values…':Object.keys(state.options.errors??{}).length?'Some field values could not be loaded. Retry loading fields, or use JQL.':'';
  for(const field of pickerFields){const el=root.querySelector(`[data-picker="${field.id}"] [data-selection-summary]`);if(el)el.textContent=selectedText(field);}
}
function renderFilters(){
  if(!root?.isConnected)return;
  root.querySelector('.jira-filter-panel').outerHTML=filterPanel();
  updatePreview();syncControls();
}
function syncControls(){
  const busy=state.loading||state.validating||state.configured===false;
  root.querySelectorAll('#jira-filters input,#jira-filters select,#jira-filters textarea,#jira-filters button,[data-jira-action="refresh"]').forEach(el=>{el.disabled=busy;});
  root.querySelector('.jira-basic-fields').disabled=busy||state.optionsLoading;
  for(const picker of root.querySelectorAll('.jira-field-picker')){
    const disabled=busy||state.optionsLoading,summary=picker.querySelector('summary');
    summary.setAttribute('aria-disabled',String(disabled));summary.tabIndex=disabled?-1:0;
    if(disabled)picker.open=false;
  }
  root.querySelectorAll('#jira-filters [type="submit"],[data-jira-action="validate"]').forEach(el=>{el.disabled=busy||(state.draft.mode==='basic'&&state.optionsLoading);});
  root.querySelector('[data-jira-action="csv"]').disabled=state.loading||!state.rows.size;
}
function draftMatchesApplied(){
  try{return JSON.stringify(validateJiraFilters(state.draft))===JSON.stringify(validateJiraFilters(state.filters));}
  catch{return false;}
}
async function loadOptions(project,includeGlobal=false){
  const requestId=++state.optionRun,signal=controller.signal;
  state.optionsLoading=true;updatePreview();syncControls();
  const requests=includeGlobal?['/api/jira/options','/api/jira/options?project='+encodeURIComponent(project)]:['/api/jira/options?project='+encodeURIComponent(project)];
  const results=await Promise.allSettled(requests.map(url=>fetchJSON(url,signal)));
  if(signal.aborted||requestId!==state.optionRun)return;
  for(let i=0;i<results.length;i++){
    const keys=includeGlobal&&i===0?['projects','priorities']:['issueTypes','statuses','components','fixVersions','epics'];
    const result=results[i];
    for(const key of keys){
      state.options[key]=result.status==='fulfilled'?result.value[key]??[]:[];
      delete state.options.errors[key];
      const error=result.status==='rejected'?result.reason.message:result.value.errors?.[key];
      if(error)state.options.errors[key]=error;
    }
  }
  if(!state.options.errors.issueTypes)state.draft.issueTypes=state.draft.issueTypes.filter(value=>state.options.issueTypes.some(o=>o.value===value));
  state.optionsLoading=false;renderFilters();
}
async function submitQuery(retrieve){
  if(state.loading||state.validating||(state.draft.mode==='basic'&&state.optionsLoading))return;
  let filters;
  try{filters=validateJiraFilters(state.draft);}catch(error){state.queryError=true;state.queryMessage=error.message;updatePreview();return;}
  const signal=controller.signal;
  state.validating=true;state.queryError=false;updatePreview();syncControls();
  try{
    const result=await fetchJSON('/api/jira/validate',signal,filters);
    if(signal.aborted)return;
    state.queryError=!result.valid;
    state.queryMessage=result.valid?'Query is valid. '+(retrieve?'Retrieving weekly data…':'Ready to retrieve weekly data.'):result.errors.join(' ');
    state.validating=false;updatePreview();syncControls();
    if(result.valid&&retrieve)await loadData(filters);
  }catch(error){if(!signal.aborted){state.queryError=true;state.queryMessage=error.message;state.validating=false;updatePreview();syncControls();}}
}
export function jiraView(){return `<div class="jira-content"><div class="page-heading"><div><div class="eyebrow">JIRA · QUALITY MEASUREMENT</div><h1>Jira Defect Statistics</h1><p class="subtitle">Select Jira issues to view weekly activity and cumulative Overall statistics.</p></div><div class="heading-actions"><button type="button" class="button" data-jira-action="csv">↓ Download Weekly CSV</button><button type="button" class="button primary" data-jira-action="refresh">↻ Refresh Data</button></div></div>${filterPanel()}<div class="jira-load-status" role="status" aria-live="polite"></div><details class="jira-applied-query"><summary>Applied Query</summary><pre></pre></details><div class="jira-progress" aria-hidden="true"><span></span></div><div class="jira-summary">${summary()}</div>${sectionNavigation()}<div class="jira-tables">${tables()}</div><section class="panel jira-rules"><details><summary>How These Counts Are Retrieved</summary><p>Each cell counts distinct Jira issues, with all result pages retrieved. One issue can appear in multiple columns or weeks. All values are refreshed from Jira; the PDF’s saved counts are not used.</p><dl>${jiraTableColumns.map(m=>`<dt>${m.name}${m.subtitle?' ('+m.subtitle+')':''}</dt><dd>${m.description}</dd>`).join('')}</dl><p>Weeks run from Monday 00:00 to Sunday 23:59 for status history. Created uses Monday 00:00 up to, but excluding, the following Monday 00:00. If Last Day falls before Sunday, the final row ends on that day. Rates use the counts in the same row and priority group, show one decimal place, and display N/A when a required count is unavailable or the denominator is zero. Rates may exceed 100%.</p><p>The PENTEST setting applies consistently to all columns and weeks. Current priority and current status can affect historical results. Escaped retains the reference’s historical backlog definition. It does not calculate a production leakage rate.</p><h3>Overall Counts</h3><dl>${jiraOverallColumns.map(m=>`<dt>${m.name}</dt><dd>${m.description}</dd>`).join('')}</dl><p>Overall includes history before midnight after each period’s last day. Outstanding uses status at that cutoff; Resolved and QA Failed count issues that ever reached those states. Columns can overlap. The connected Jira account’s timezone is used, including daylight-saving changes.</p><p>Overall replaces creation-date predicates from custom JQL with a cumulative cutoff. Other predicates and the selected date-handling mode remain active. Current priority and current Cancel exclusion apply to every Overall column. Snapshot drill-down JQL lists the exact matching issue keys.</p><p>References: Loyalty Migration defects stats and EGM defects stats · 14 September 2026. EGM’s inconsistent Outstanding rules are standardized to status at each period’s end.</p></details></section><dialog id="jira-issues-dialog" aria-labelledby="jira-dialog-title"><div class="jira-dialog-content"></div></dialog></div>`;}
function syncView(){
  if(!root?.isConnected)return;
  root.querySelector('.jira-tables').innerHTML=tables();
  root.querySelector('.jira-summary').innerHTML=summary();
  const loaded=state.weeks.filter(w=>state.rows.has(w.start)).length;
  const failures=[...state.rows.values()].filter(row=>row.error||Object.values(row.metrics??{}).some(m=>m.error)).length;
  root.querySelector('.jira-load-status').textContent=state.message||(state.loading?`Retrieving ${state.filters.mode==='jql'?'custom JQL':state.filters.project} · ${loaded} of ${state.weeks.length} weekly rows loaded${state.overallLoading?'; Overall history loading':''}…`:failures?`${failures} week${failures===1?' has':'s have'} unavailable measurements. Click N/A for details, then refresh to retry.`:state.overallError?'Weekly retrieval finished. Overall statistics are unavailable; see the Overall section and refresh to retry.':state.lastSync?`Connected to ${state.site.replace('https://','')} · ${state.weeks.length} ${state.weeks.length===1?'week':'weeks'} retrieved · ${state.filters.excludePentest?'PENTEST excluded':'PENTEST included'}`:'Checking Jira connection…');
  root.querySelector('.jira-progress span').style.width=`${loaded/state.weeks.length*100}%`;
  root.querySelector('.jira-progress').hidden=!state.loading;
  root.querySelector('.jira-applied-query pre').textContent='('+jiraScope(state.filters)+')'+(state.filters.excludePentest?'\nAND summary !~ "PENTEST"':'')+(state.filters.mode==='jql'?'\n\nJQL dates: '+(state.filters.jqlDateMode==='fixed'?'Fixed dates':`Move with each week (reference week starts ${state.filters.jqlAnchorStart}).`)+'\nCreation-date filters apply only to Weekly Created. Other weekly columns use the remaining filters and weekly workflow rules. Overall uses the remaining filters with a cumulative creation cutoff at each period’s end.':'');
  syncControls();updatePreview();
}
async function fetchJSON(url,signal,body){
  const response=await fetch(url,{signal,credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Unable to load Jira data.');
  return data;
}
async function loadData(filters,refresh=false){
  const thisRun=++run,signal=controller.signal;
  state.filters=filters;state.weeks=jiraWeeks(filters);state.rows=new Map();state.overallRows=new Map();state.overallError='';state.overallTimeZone='';state.overallLoading=true;state.loading=true;state.message='';state.lastSync=null;syncView();
  let next=0;
  async function worker(){
    while(next<state.weeks.length&&thisRun===run&&!signal.aborted){
      const week=state.weeks[next++];
      const request=jiraWeekRequest(filters,week,refresh);
      let row;
      try{row=await fetchJSON('/api/jira/week',signal,request);}catch(error){if(signal.aborted)return;row={error:error.message};}
      if(thisRun!==run||signal.aborted)return;
      state.rows.set(week.start,row);syncView();
    }
  }
  async function overall(){
    try{
      const data=await fetchJSON('/api/jira/overall',signal,{...filters,refresh});
      if(thisRun!==run||signal.aborted)return;
      state.overallRows=new Map(data.rows.map(row=>[row.start,row]));state.overallTimeZone=data.timeZone;
    }catch(error){
      if(thisRun!==run||signal.aborted)return;
      state.overallError=error.message;
      state.overallRows=new Map(state.weeks.map(week=>[week.start,{error:error.message}]));
    }
    if(thisRun!==run||signal.aborted)return;
    state.overallLoading=false;syncView();
  }
  await Promise.all([worker(),worker(),overall()]);
  if(thisRun!==run||signal.aborted)return;
  state.loading=false;state.lastSync=new Date().toISOString();state.queryError=false;
  state.queryMessage=draftMatchesApplied()?'Query applied to the Weekly and Overall tables.':'Displayed data refreshed. Selection changes have not been applied.';syncView();
}
function openCell(button){
  const cumulative=button.dataset.kind==='overall';
  const week=state.weeks.find(w=>w.start===button.dataset.weekStart),metric=(cumulative?jiraOverallColumns:jiraColumns).find(m=>m.id===button.dataset.metric),group=button.dataset.group;
  const row=(cumulative?state.overallRows:state.rows).get(week.start),value=row?.metrics?.[metric.id],error=row?.error||value?.error;
  const issues=(value?.issues??[]).filter(issue=>group!=='high'||isHighPriority(issue));
  const jql=(group==='high'?value?.highJql:value?.jql)||'';
  const url=state.site+'/issues/?jql='+encodeURIComponent(jql),dialog=root.querySelector('#jira-issues-dialog');
  returnFocus=button.dataset.jiraCell;
  dialog.querySelector('.jira-dialog-content').innerHTML=`<div class="jira-dialog-heading"><div><span class="eyebrow">${cumulative?'OVERALL':'WEEKLY'} · ${group==='high'?'HIGH PRIORITY':'ALL PRIORITIES'} · ${h(weekLabel(week))}</span><h2 id="jira-dialog-title">${metric.name}${error?' · Unavailable':' · '+issues.length+' '+(issues.length===1?'Issue':'Issues')}</h2></div><button class="button" type="button" data-jira-action="close-dialog" aria-label="Close issue details">Close ×</button></div><p>${h(metric.description)}</p>${error?`<p class="jira-error" role="alert">${h(error)}</p>`:issues.length?`<p class="jira-current-note">Priority and Current Status are current Jira values.${cumulative?' Status at Cutoff is reconstructed at the end of '+h(week.end)+' ('+h(state.overallTimeZone)+').':''}</p><div class="jira-issue-scroll"><table class="jira-issue-table"><thead><tr><th>Issue</th><th>Summary</th><th>Priority</th><th>Current Status</th>${cumulative?'<th>Status at Cutoff</th>':''}</tr></thead><tbody>${issues.map(issue=>`<tr><td><a href="${h(issue.url)}">${h(issue.key)} ↗</a></td><td>${h(issue.summary)}</td><td><span class="jira-priority ${isHighPriority(issue)?'high':''}">${h(issue.priority)}</span></td><td>${h(issue.status)}</td>${cumulative?`<td>${h(issue.statusAtCutoff)}</td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="jira-empty">No Jira issues match this measurement.</div>'}${jql?`<details class="jira-query"><summary>View JQL</summary><pre>${h(jql)}</pre></details><a class="button" href="${h(url)}">Open Results in Jira ↗</a>`:''}`;
  dialog.showModal();
}
function downloadCSV(kind='weekly'){
  const cumulative=kind==='overall',columns=cumulative?jiraOverallColumns:jiraTableColumns;
  const rows=[['Section','Project','Period Start','Period End','Group',...columns.map(m=>m.name),'PENTEST Excluded','Retrieved At','Retrieval Errors','Query Mode','Base JQL','JQL Date Handling','JQL Reference Week','Created Scope JQL','Activity Scope JQL','Counting Rules']];
  for(const group of ['overall','high'])for(const week of state.weeks){
    const row=(cumulative?state.overallRows:state.rows).get(week.start);if(!row)continue;
    rows.push([cumulative?'Overall':'Weekly',state.filters.mode==='jql'?'Custom JQL':state.filters.project,week.start,week.end,group==='high'?'High Priority':'All Priorities',...columns.map(m=>!cumulative&&jiraRateColumns.some(rate=>rate.id===m.id)?formatJiraRate(jiraRate(row,m.id,group).value):row.metrics?.[m.id]?.[group==='high'?'highCount':'count']??'N/A'),state.filters.excludePentest?'Yes':'No',row.fetchedAt??'',row.error||columns.map(m=>row.metrics?.[m.id]?.error?`${m.name}: ${row.metrics[m.id].error}`:'').filter(Boolean).join('; '),state.filters.mode,jiraScope(state.filters),state.filters.mode==='jql'?state.filters.jqlDateMode:'N/A',state.filters.mode==='jql'?state.filters.jqlAnchorStart:'',jiraScope(jiraWeekRequest(state.filters,week),cumulative?'overall':'created'),jiraScope(jiraWeekRequest(state.filters,week),'resolved'),cumulative?`Cumulative through Period End (${state.overallTimeZone}); current Cancel excluded; Outstanding uses status at cutoff; Resolved and QA Failed count issues ever in those states.`:'Activity in the selected week; QA Failed is the reopened count.']);
  }
  const escape=value=>'"'+(/^[=+@\-\t\r]/.test(String(value))?"'"+String(value):String(value)).replace(/"/g,'""')+'"';
  const content=rows.map(row=>row.map(escape).join(',')).join('\r\n'),url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`${state.filters.mode==='jql'?'custom-query':state.filters.project}-jira-${kind}-${state.filters.start}-${state.filters.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function disposeJiraPage(){controller?.abort();controller=null;run++;root=null;state.loading=false;state.overallLoading=false;state.validating=false;state.optionsLoading=false;}
export function mountJiraPage(){
  root=document.querySelector('.jira-content');controller=new AbortController();const signal=controller.signal;
  syncView();
  root.addEventListener('submit',event=>{
    if(event.target.id!=='jira-filters')return;
    event.preventDefault();submitQuery(true);
  },{signal});
  root.addEventListener('input',event=>{
    if(!event.target.closest('#jira-filters'))return;
    if(event.target.matches('[data-field-search]')){searchField(event.target.closest('.jira-field-picker'));return;}
    const {name,value,type}=event.target;
    if(name==='project')return;
    if(jiraSelectionFields.some(field=>field.id===name)){
      state.draft[name]=[...root.querySelectorAll(`input[name="${name}"]:checked`)].map(el=>el.value);
    }else if(['start','end','jql','jqlDateMode','excludePentest'].includes(name))state.draft[name]=type==='checkbox'?event.target.checked:value;
    state.queryMessage='Selection changes have not been applied to the tables.';updatePreview();
  },{signal});
  root.addEventListener('toggle',event=>{
    const picker=event.target;
    if(!picker.matches('.jira-field-picker')||!picker.open)return;
    if(root.querySelector('.jira-basic-fields').disabled){picker.open=false;return;}
    for(const other of root.querySelectorAll('.jira-field-picker[open]'))if(other!==picker)other.open=false;
    picker.querySelector('[data-field-search]').focus();
  },{signal,capture:true});
  root.addEventListener('keydown',event=>{
    const picker=event.target.closest('.jira-field-picker');
    if(!picker?.open)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();picker.open=false;picker.querySelector('summary').focus();}
    else if(event.target.matches('[data-field-search]')&&['Enter','ArrowDown'].includes(event.key)){
      event.preventDefault();picker.querySelector('[data-option-search]:not([hidden]) input')?.focus();
    }
  },{signal});
  root.addEventListener('change',event=>{
    if(event.target.name!=='project')return;
    state.draft.project=event.target.value;
    for(const name of ['statuses','components','fixVersions','epics'])state.draft[name]=[];
    state.queryMessage='Space changed. Current Status, Component, Fix Version, and Epic selections were cleared.';
    loadOptions(state.draft.project);
  },{signal});
  root.addEventListener('click',event=>{
    const summary=event.target.closest('.jira-field-picker>summary');
    if(summary?.getAttribute('aria-disabled')==='true'){event.preventDefault();return;}
    const cell=event.target.closest('[data-jira-cell]');if(cell){openCell(cell);return;}
    const mode=event.target.closest('[data-jira-mode]');
    if(mode&&!mode.disabled){
      if(state.draft.mode===mode.dataset.jiraMode)return;
      if(mode.dataset.jiraMode==='jql'&&!state.draft.jql)state.draft.jql=jiraScope({...state.draft,mode:'basic'});
      state.draft.mode=mode.dataset.jiraMode;state.queryMessage='Mode changed. Retrieve data to apply it.';renderFilters();return;
    }
    const button=event.target.closest('[data-jira-action]');if(!button||button.disabled)return;
    const action=button.dataset.jiraAction;
    if(action==='refresh')loadData(state.filters,true);
    if(action==='validate')submitQuery(false);
    if(action==='copy-fields'){state.draft.jql=jiraScope({...state.draft,mode:'basic'});state.queryMessage='Field selections copied to the JQL editor.';renderFilters();}
    if(action==='retry-options')loadOptions(state.draft.project,true);
    if(action==='clear-field'){
      state.draft[button.dataset.field]=[];
      for(const input of button.closest('.jira-field-picker').querySelectorAll('input[type="checkbox"]'))input.checked=false;
      state.queryMessage='Selection changes have not been applied to the tables.';updatePreview();
    }
    if(action==='csv')downloadCSV();
    if(action==='overall-csv')downloadCSV('overall');
    if(action==='jump-weekly'||action==='jump-overall'){const heading=root.querySelector('#jira-'+action.slice(5)+'-heading');heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});}
    if(action==='close-dialog')root.querySelector('#jira-issues-dialog').close();
  },{signal});
  document.addEventListener('click',event=>{
    for(const picker of root?.querySelectorAll('.jira-field-picker[open]')??[])if(!picker.contains(event.target))picker.open=false;
  },{signal});
  root.querySelector('#jira-issues-dialog').addEventListener('close',()=>{root?.querySelector(`[data-jira-cell="${returnFocus}"]`)?.focus();},{signal});
  fetchJSON('/api/jira/status',signal).then(data=>{
    if(signal.aborted)return;
    state.configured=data.configured;state.site=data.site||'';
    if(!data.configured){state.message='Jira is not connected to the website. Configure JIRA_URL, JIRA_USERNAME, and JIRA_API_TOKEN on the server to retrieve data.';syncView();return;}
    state.message='';
    loadOptions(state.draft.project,true);
    if(state.rows.size!==state.weeks.length||state.overallRows.size!==state.weeks.length)loadData(state.filters);else syncView();
  }).catch(error=>{if(signal.aborted)return;state.message=error.message;syncView();});
}
