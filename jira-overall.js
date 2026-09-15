import {jiraScope,validateJiraFilters,shiftDate,quoteJql} from './jira-model.js';

export const jiraOverallColumns=[
  {id:'created',name:'Total Created',description:'Distinct issues created by the end of the period, including issues created before the First Monday. Issues currently in Cancel are excluded from every Overall column.'},
  {id:'outstanding',name:'Outstanding',description:'Issues whose status at the end of the period was outside Done, Ready for Deploy, Released Prod, QA Ready, QA In Progress, UAT Ready, UAT In Progress, and Cancel.'},
  {id:'tested',name:'Tested',description:'Issues that entered QA In Progress or UAT In Progress at least once by the end of the period.'},
  {id:'resolved',name:'Resolved',description:'Issues that had reached Ready for Deploy, Released Prod, or Done by the end of the period, even if subsequently reopened.'},
  {id:'failed',name:'QA Failed',description:'Issues that had reached QA Failed or UAT Failed by the end of the period. Each issue is counted once, regardless of repeat failures.'},
];
export function jiraOverallQuery(input,{highPriority=false,keys}={}){
  const filters=validateJiraFilters(input,{singleWeek:true}),scope=jiraScope(filters,'overall');
  const clauses=scope?['('+scope+')']:[];
  if(highPriority)clauses.push('priority IN (High, Highest)');
  if(filters.excludePentest)clauses.push('summary !~ "PENTEST"');
  clauses.push(`created < "${shiftDate(filters.end,1)} 00:00"`,'status != CANCEL');
  // Snapshot membership is calculated from complete history. Exact keys keep
  // the Jira drill-down faithful even when an issue's current status differs.
  if(keys)clauses.push(keys.length?'key IN ('+keys.map(quoteJql).join(', ')+')':`created >= "${shiftDate(filters.end,1)} 00:00"`);
  return clauses.join('\nAND ')+'\nORDER BY created DESC';
}
const statusName=value=>String(value??'').trim().toLowerCase();
const testing=new Set(['qa in progress','uat in progress']);
const resolved=new Set(['ready for deploy','released prod','done']);
const failed=new Set(['qa failed','uat failed']);
const notOutstanding=new Set([...testing,...resolved,'qa ready','uat ready','cancel']);

export function jiraLocalDateFormatter(timeZone){
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  return value=>{
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))throw new Error('Jira returned an invalid history date.');
    const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}
export function jiraStatusTimeline(issue,histories,localDate){
  if(!issue.status||issue.status==='Unknown'||!Array.isArray(histories))throw new Error('Jira returned incomplete status history.');
  const changes=histories.flatMap(history=>{
    if(!Array.isArray(history.items))throw new Error('Jira returned incomplete status history.');
    return history.items.filter(item=>item.fieldId==='status'||item.field==='status').map(item=>{
      if(!item.toString)throw new Error('Jira returned incomplete status history.');
      return {id:String(history.id),time:new Date(history.created).getTime(),date:localDate(history.created),from:item.fromString||item.toString,to:item.toString};
    });
  }).sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id,undefined,{numeric:true}));
  return {created:localDate(issue.created),initial:changes[0]?.from||issue.status,changes};
}
export function jiraOverallSnapshot(timeline,end){
  const cutoff=shiftDate(end,1);
  if(timeline.created>=cutoff)return null;
  let status=timeline.initial,tested=false;
  const reached=new Set([statusName(status)]);
  for(const change of timeline.changes){
    if(change.date>=cutoff)break;
    status=change.to;reached.add(statusName(status));
    if(testing.has(statusName(status)))tested=true;
  }
  return {statusAtCutoff:status,created:true,outstanding:!notOutstanding.has(statusName(status)),tested,resolved:[...resolved].some(s=>reached.has(s)),failed:[...failed].some(s=>reached.has(s))};
}
