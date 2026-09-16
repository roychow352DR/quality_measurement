// Source thresholds: Measurement Metrics, pages 6–8; UAT discovery rate uses agreed internal pilot bands.
// Decimal gaps are treated as continuous intervals; see methodology in the UI.
export const RULE_VERSION = '2026-09-16.uat-rag-v5';
export const SOURCE_DOCUMENT = 'EQ-Measurement Metrics-110926-043342.pdf';
export const legacyWeeklyNames = {incidents:'Customer-reported incidents',escaped:'Escaped P0/P1 defects',hotfixes:'Rollback / hotfix count'};
export const perspectives = [
  {id:'qa',name:'QA',description:'Testing effectiveness, coverage, and automation reliability.'},
  {id:'development',name:'Development',description:'Defect prevention, fix effectiveness, and production stability.'},
];
const qaMetricIds = new Set(['functional','regression','firstRun','flaky','leakage','completion','coverage','uatDiscovery']);
const metric = (id, name, group, unit, direction, green, amber, formula, source) =>
  ({ id, name, group, unit, direction, green, amber, formula, source,
    scored:!['created','averageCreated'].includes(id),
    perspective:qaMetricIds.has(id)?'qa':'development' });
export const weeklyMetrics = [
  metric('created','P0/P1 defects created','Defect flow & backlog health','count','low',2,5,'Count of new P0/P1 defects created in the week','Jira'),
  // Retain the stored key so existing week-end measurements survive the label change.
  metric('open','Escaped P0/P1 defects (week-end)','Defect flow & backlog health','count','low',2,5,'Count of escaped P0/P1 defects at week-end','Jira'),
  metric('aging','Average P0/P1 defect aging','Defect flow & backlog health','days','low',3,7,'Average age of open P0/P1 defects at week-end','Jira'),
  metric('fixed','Defects fixed rate','Defect flow & backlog health','%','high',100,80,'Resolved in week ÷ created in week × 100%','Jira'),
  metric('reopened','Defects reopened rate','Defect flow & backlog health','%','low',5,10,'Reopened in week ÷ tested in week × 100%','Jira'),
  metric('functional','Functional test pass rate','Test execution / process monitoring','%','high',95,90,'Passed ÷ executed × 100%','Qase'),
  metric('regression','Regression pass rate','Test execution / process monitoring','%','high',95,90,'Passed ÷ executed × 100%','Qase'),
  metric('firstRun','Automation first-run pass rate','Test execution / process monitoring','%','high',90,80,'First-run passed ÷ first-run executed × 100%','Qase'),
  metric('flaky','Flaky test rate','Test execution / process monitoring','%','low',5,10,'Flaky executions ÷ total automated runs × 100%','Qase'),
];
export const releaseMetrics = [
  metric('escaped','Escaped P0/P1 defects','Product quality','count','low',2,5,'Count of P0/P1 defects in production','Jira'),
  metric('leakage','Defect leakage rate','Product quality','%','low',5,10,'Escaped P0/P1 ÷ total defects found × 100%','Jira'),
  metric('crashSessions','Crash-free session rate','Product quality','%','high',99,98,'(Total sessions − crashes) ÷ total sessions × 100%','Crashlytics'),
  metric('crashUsers','Crash-free users','Product quality','%','high',99,98,'Percentage of unique users without a crash','Crashlytics'),
  metric('incidents','Customer-reported incidents','Product quality','count','low',3,6,'Production issues reported by customers','Jira'),
  metric('hotfixes','Rollback / hotfix count','Product quality','count','low',0,1,'Number of production rollbacks or hotfixes','Jira'),
  metric('functional','Functional test pass rate','Process quality','%','high',95,90,'Passed ÷ executed × 100%','Qase'),
  metric('completion','Functional test completion rate','Process quality','%','high',98,95,'(Passed + failed) ÷ total cases × 100%','Qase'),
  metric('regression','Regression pass rate','Process quality','%','high',95,90,'Manual + automation passed ÷ executed × 100%','Qase'),
  metric('openAtRelease','Open P0/P1 at release time','Process quality','count','low',0,1,'Open Sev-1/2 defects at release time','Jira'),
  metric('density','Defect density','Process quality','ratio','low',0.2,0.35,'Total functional, regression and production defects ÷ total man-days','Jira + story point'),
  metric('coverage','Automation coverage','Efficiency & effectiveness','%','high',80,65,'Automated regression cases ÷ total regression cases × 100%','Qase'),
  metric('firstRun','Automation first-run pass rate','Efficiency & effectiveness','%','high',90,80,'First execution pass percentage','Qase'),
  metric('flaky','Flaky test rate','Efficiency & effectiveness','%','low',5,10,'Flaky executions ÷ total automated runs × 100%','Qase'),
  metric('uatDiscovery','UAT Discovery Rate','Efficiency & effectiveness','uatShare','low',10,20,'UAT discovered defects ÷ (Pre-UAT discovered defects + UAT discovered defects) x 100%','Jira'),
  {...metric('averageCreated','Average weekly P0/P1 created','Defect flow & backlog health','average','info',null,null,'Total P0/P1 created in measured weeks ÷ measured weeks; calculated from weekly records','Jira'),derived:true},
  metric('open','Open P0/P1 defects','Defect flow & backlog health','count','low',2,5,'Current open count','Jira'),
  metric('aging','Average P0/P1 defect aging','Defect flow & backlog health','days','low',3,7,'Average days open; enter your measured value','Jira'),
  metric('fixed','Defects fixed rate','Defect flow & backlog health','%','high',100,80,'Resolved defects ÷ created defects × 100%','Jira'),
  metric('reopened','Defects reopened rate','Defect flow & backlog health','%','low',5,10,'Enter the measured rate; the source formula is ambiguous (see methodology)','Jira'),
];
export const trendMetrics = [
  {id:'escapedP01',name:'Previous escaped P0/P1 trend value',unit:'count',archived:true},
  {id:'totalEscaped',name:'Total escaped defects',unit:'count'},
  {id:'totalCreated',name:'Total defects created',unit:'count'},
  {id:'totalResolved',name:'Total defects resolved',unit:'count'},
  {id:'totalReopened',name:'Total defects reopened',unit:'count'},
  {id:'p1Aging',name:'P1 average aging',unit:'days'},
].map(m=>({...m,perspective:'development'}));
export function metricSections(metrics) {
  return perspectives.map(p=>({...p,components:[...new Set(metrics.filter(m=>m.perspective===p.id).map(m=>m.group))].map(group=>({group,metrics:metrics.filter(m=>m.perspective===p.id&&m.group===group)}))})).filter(p=>p.components.length);
}
export const isBlank = value => value === '' || value === null || value === undefined;
export const isScored = m => m.scored !== false;
export const scoredCount = metrics => metrics.filter(isScored).length;
export const emptyUatDiscovery = () => ({preUat:'',uat:'',criticalUat:'',notes:''});
export function discoverySummary(weeks) {
  const summarizeCounts = values => {
    const measured=values.filter(value=>!isBlank(value)&&!validateValue({unit:'count'},value)).map(Number);
    const total=measured.reduce((sum,value)=>sum+value,0);
    return {total:measured.length?total:null,count:measured.length,average:measured.length?total/measured.length:null};
  };
  return {all:summarizeCounts(weeks.map(w=>w.trends.totalCreated)),p01:summarizeCounts(weeks.map(w=>w.values.created)),weeks:weeks.length};
}
export function releaseValues(draft) {
  return {...draft.release,averageCreated:discoverySummary(draft.weeks).p01.average};
}
export function uatDiscoveryShare(value) {
  if(validateValue({unit:'uatShare'},value)||isBlank(value?.preUat)||isBlank(value?.uat))return null;
  const total=Number(value.preUat)+Number(value.uat);
  return total?Number(value.uat)/total*100:null;
}
export function numberValue(value) {
  if (isBlank(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  if (typeof value === 'string' && !value.trim()) return NaN;
  return Number(value);
}
export function validateValue(m, value) {
  if (m.unit === 'uatShare') {
    if(isBlank(value))return null;
    if(typeof value!=='object'||Array.isArray(value))return 'Enter pre-UAT and UAT counts.';
    if(value.notes!==undefined&&(typeof value.notes!=='string'||value.notes.length>2000))return 'Use up to 2,000 characters for UAT notes.';
    for(const key of ['preUat','uat','criticalUat']) {
      const error=validateValue({unit:'count'},value[key]);if(error)return error;
    }
    // Incomplete counts are unmeasured, not zero; valid partial drafts can still be reported as N/A.
    if(!isBlank(value.criticalUat)&&!isBlank(value.uat)&&Number(value.criticalUat)>Number(value.uat))return 'P0/P1 UAT defects cannot exceed the UAT discovery count.';
    return null;
  }
  if (isBlank(value)) return null;
  const n=numberValue(value);
  if (!Number.isFinite(n) || n<0) return 'Enter a non-negative number.';
  if (m.unit==='count' && !Number.isSafeInteger(n)) return 'Enter a whole-number count.';
  if (m.unit==='%' && m.id!=='fixed' && n>100) return 'Enter a percentage from 0 to 100.';
  if (n>1e9) return 'Enter a value no larger than 1,000,000,000.';
  return null;
}
export function scoreMetric(m, value) {
  if(!isScored(m))return null;
  if (validateValue(m,value)) return null;
  if(m.unit==='uatShare') {
    const share=uatDiscoveryShare(value);
    if(share===null||isBlank(value.criticalUat))return null;
    if(Number(value.criticalUat)>0)return 0;
    return share<=m.green?100:share<=m.amber?60:0;
  }
  const n=numberValue(value);
  if (n===null) return null;
  return m.direction==='high' ? (n>=m.green?100:n>=m.amber?60:0) : (n<=m.green?100:n<=m.amber?60:0);
}
export function summarize(scores) {
  const valid=scores.filter(s=>Number.isFinite(s));
  const points=valid.reduce((a,b)=>a+b,0);
  return {count:valid.length,points,score:valid.length?points/valid.length:null};
}
export const rag = score => score===null?'neutral':score>=85?'green':score>=60?'amber':'red';
export const ragLabel = score => score===null?'N/A':score>=85?'Green':score>=60?'Amber':'Red';
export const formatScore = score => score===null?'—':score.toFixed(1);
export function formatValue(m,value) {
  if(m.unit==='uatShare') {const share=uatDiscoveryShare(value);return share===null?'N/A':`${share.toFixed(1)}%`;}
  if(isBlank(value)) return 'N/A';
  if(m.id==='averageCreated')return Number(value).toFixed(1);
  return `${value}${m.unit==='%'?'%':m.unit==='days'?' days':''}`;
}
export function thresholds(m) {
  if(!isScored(m))return ['Not scored','Not scored','Not scored'];
  if(m.unit==='uatShare')return [`Rate ≤ ${m.green}% and 0 P0/P1 UAT discoveries`,`Rate > ${m.green}% and ≤ ${m.amber}%, with 0 P0/P1 UAT discoveries`,`Rate > ${m.amber}% or ≥ 1 P0/P1 UAT discovery`];
  const u=m.unit==='%'?'%':m.unit==='days'?' days':'';
  return m.direction==='high' ? [`≥ ${m.green}${u}`,`≥ ${m.amber}${u} and < ${m.green}${u}`,`< ${m.amber}${u}`] : [`≤ ${m.green}${u}`,`> ${m.green}${u} and ≤ ${m.amber}${u}`,`> ${m.amber}${u}`];
}
export function emptyWeek() {return {start:'',end:'',values:{},trends:{}};}
export function blankDraft() {return {version:4,project:{name:'',owner:'',releaseDate:'',description:''},release:{uatDiscovery:emptyUatDiscovery()},weeks:[]};}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export function validateDraft(draft,{requireReady=false}={}) {
  const errors=[];
  if(requireReady) {
    if(!draft.project.name.trim()) errors.push('Project name is required.');
    if(!draft.project.owner.trim()) errors.push('QA owner is required.');
    if(!draft.project.releaseDate) errors.push('Release date is required.');
  }
  if(draft.project.releaseDate && !validDate(draft.project.releaseDate)) errors.push('Release date must be a valid date.');
  for(const m of releaseMetrics.filter(m=>!m.derived)) {const error=validateValue(m,draft.release[m.id]);if(error)errors.push(`${m.name}: ${error}`);}
  const periods=[];
  draft.weeks.forEach((w,i)=>{
    if(requireReady && (!w.start||!w.end)) errors.push(`Week ${i+1}: start and end dates are required.`);
    if(w.start&&!validDate(w.start)||w.end&&!validDate(w.end))errors.push(`Week ${i+1}: enter valid dates.`);
    if(w.start&&w.end&&w.start>w.end)errors.push(`Week ${i+1}: end date must be on or after start date.`);
    if(w.start&&w.end&&periods.some(p=>w.start<=p.end&&w.end>=p.start))errors.push(`Week ${i+1}: testing periods must not overlap.`);
    periods.push(w);
    for(const m of [...weeklyMetrics,...trendMetrics]) {const error=validateValue(m,(m.direction?w.values:w.trends)[m.id]);if(error)errors.push(`Week ${i+1}, ${m.name}: ${error}`);}
  });
  if(requireReady && calculate(draft).overall.count===0) errors.push('Enter at least one scored live metric to generate a report.');
  return errors;
}
function calculateMetrics(draft,weeklyDefinitions,releaseDefinitions) {
  const releaseScores=releaseDefinitions.map(m=>scoreMetric(m,draft.release[m.id]));
  const release=summarize(releaseScores);
  const weeklyScores=draft.weeks.flatMap(w=>weeklyDefinitions.map(m=>scoreMetric(m,w.values[m.id])));
  const weeks=draft.weeks.map(w=>summarize(weeklyDefinitions.map(m=>scoreMetric(m,w.values[m.id]))));
  const averageWeeks=summarize(weeks.map(w=>w.score));
  // Keep observation totals for coverage; the weekly score gives each measured week equal weight.
  const weekly={...summarize(weeklyScores),score:averageWeeks.score,totalWeekScores:averageWeeks.points,measuredWeeks:averageWeeks.count};
  return {release,weekly,overall:summarize([...weeklyScores,...releaseScores]),weeks};
}
export function calculate(draft) {
  const overall=calculateMetrics(draft,weeklyMetrics,releaseMetrics);
  const byPerspective=Object.fromEntries(perspectives.map(p=>[p.id,calculateMetrics(draft,weeklyMetrics.filter(m=>m.perspective===p.id),releaseMetrics.filter(m=>m.perspective===p.id))]));
  return {...overall,perspectives:byPerspective};
}
// Accept only our documented JSON shape, then validate values before applying imported data.
export function parseDraft(input,{allowInvalid=false}={}) {
  if(!input || ![1,2,3,4].includes(input.version) || !input.project || !input.release || !Array.isArray(input.weeks) || input.weeks.length>104) throw new Error('Choose a valid Measure JSON backup (up to 104 weeks).');
  const d=blankDraft();
  for(const key of Object.keys(d.project)) {
    if(typeof input.project[key]!=='string' || input.project[key].length>(key==='description'?2000:200)) throw new Error('Project details in this file are invalid.');
    d.project[key]=input.project[key];
  }
  for(const m of releaseMetrics) {
    const value=input.release[m.id];
    if(m.unit==='uatShare') {
      if(!isBlank(value)&&(typeof value!=='object'||Array.isArray(value)))throw new Error('UAT discovery inputs are invalid.');
      d.release[m.id]=Object.fromEntries(Object.keys(emptyUatDiscovery()).map(key=>[key,value?.[key]??'']));
      if(typeof d.release[m.id].notes!=='string'||d.release[m.id].notes.length>2000)throw new Error('Use up to 2,000 characters for UAT notes.');
    }else d.release[m.id]=value??'';
  }
  // Regression-only legacy counts cannot establish the full pre-UAT population.
  if(input.release.comparison!==undefined) {
    const value=input.release.comparison;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Previous regression/UAT inputs are invalid.');
    d.release.comparison={regression:value.regression??'',uat:value.uat??''};
  }
  d.weeks=input.weeks.map(w=>{
    if(!w||typeof w.start!=='string'||typeof w.end!=='string'||!w.values||!w.trends)throw new Error('A weekly record in this file is invalid.');
    const legacyValues=Object.fromEntries(Object.keys(legacyWeeklyNames).map(id=>[id,w.legacyValues?.[id]??w.values[id]]).filter(([,v])=>!isBlank(v)));
    const trends=Object.fromEntries(trendMetrics.map(m=>[m.id,w.trends[m.id]??'']));
    // Preserve the earlier trend value in backups; the report now reads the week-end field.
    if(input.version<3 && isBlank(trends.escapedP01) && !isBlank(legacyValues.escaped))trends.escapedP01=legacyValues.escaped;
    return {start:w.start,end:w.end,values:Object.fromEntries(weeklyMetrics.map(m=>[m.id,w.values[m.id]??''])),trends,...(Object.keys(legacyValues).length?{legacyValues}:{})};
  });
  const scalars=[...releaseMetrics.flatMap(m=>m.unit==='uatShare'?['preUat','uat','criticalUat'].map(key=>d.release[m.id][key]):[d.release[m.id]]),...Object.values(d.release.comparison??{}),...d.weeks.flatMap(w=>[...Object.values(w.values),...Object.values(w.trends),...Object.values(w.legacyValues??{})])];
  if(scalars.some(v=>!['string','number'].includes(typeof v)||(typeof v==='string'&&v.length>100)))throw new Error('Metric values must be numbers or numeric text.');
  const errors=validateDraft(d);if(!allowInvalid&&errors.length)throw new Error(errors[0]);
  return d;
}
export function exampleDraft() {
  const d=blankDraft();
  d.project={name:'Loyalty Migration',owner:'Hawick',releaseDate:'2026-08-24',description:'Example values from the original Loyalty Migration report, recalculated using the new Measurement Metrics thresholds. Missing measurements remain N/A.'};
  d.release={escaped:4,leakage:66.6,crashSessions:100,crashUsers:100,incidents:0,hotfixes:0,functional:99.7,completion:100,regression:100,openAtRelease:0,density:1.05,comparison:{regression:1,uat:6},averageCreated:3,open:1,fixed:91,reopened:16};
  const escapedP01=[1,2,9,2,3,1,2,5,0,0,0,1];
  const created=[19,15,7,4,4,3,7,2,2,4,2,4],p01Created=[11,2,3,1,4,2,3,1,1,2,1,1],fixed=[5,20,143,275,100,233,43,500,100,50,150,100],reopened=[0,40,0,8,25,40,33,8,100,0,0,0];
  d.weeks=created.map((n,i)=>{const start=new Date(Date.UTC(2026,5,1+i*7)),end=new Date(Date.UTC(2026,5,5+i*7));return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),values:{created:p01Created[i],open:escapedP01[i],fixed:fixed[i],reopened:reopened[i]},trends:{totalCreated:n}};});
  return parseDraft(d);
}
