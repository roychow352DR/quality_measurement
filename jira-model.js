export const jiraColumns=[
  {id:'created',name:'Created',description:'Issues created in the week, excluding issues currently in Cancel.'},
  {id:'resolved',name:'Resolved',subtitle:'Ready for Deploy',description:'Issues that moved from QA In Progress or UAT In Progress to Ready for Deploy during the week.'},
  {id:'tested',name:'Tested',description:'Issues that entered QA In Progress or UAT In Progress during the week. Issues currently in Cancel are excluded, as in the reference.'},
  {id:'failed',name:'QA Failed',description:'Issues that moved from QA In Progress to QA Failed, or UAT In Progress to UAT Failed, during the week.'},
  {id:'escaped',name:'Escaped',description:'The reference’s historical backlog rule: issues in development or failure statuses during the week, with none of its testing, completed, deployment, or Cancel statuses during that same week.'},
];
export const jiraRateColumns=[
  {id:'fixedRate',name:'Defects Fixed Rate',numerator:'resolved',denominator:'created',description:'Resolved in week ÷ Created in week × 100%.'},
  {id:'reopenedRate',name:'Defects Reopened Rate',numerator:'failed',denominator:'tested',description:'QA Failed in week ÷ Tested in week × 100%. QA Failed is the reopened count: transitions to QA Failed or UAT Failed.'},
];
export const jiraTableColumns=[...jiraColumns,...jiraRateColumns];
export function jiraRate(row,id,group='overall'){
  const metric=jiraRateColumns.find(m=>m.id===id);
  if(!metric)throw new Error('Unknown Jira rate.');
  const key=group==='high'?'highCount':'count';
  const top=row?.metrics?.[metric.numerator],bottom=row?.metrics?.[metric.denominator];
  const numerator=top?.[key],denominator=bottom?.[key];
  const error=row?.error||top?.error||bottom?.error;
  if(error||![numerator,denominator].every(n=>Number.isFinite(n)&&n>=0))return {value:null,numerator,denominator,reason:'A required count is unavailable.'};
  if(denominator===0)return {value:null,numerator,denominator,reason:`No ${metric.denominator==='created'?'Created':'Tested'} issues in this period; the rate is undefined.`};
  return {value:numerator/denominator*100,numerator,denominator,reason:''};
}
export const formatJiraRate=value=>Number.isFinite(value)?value.toFixed(1)+'%':'N/A';
export const jiraSelectionFields=[
  {id:'issueTypes',name:'Type',jql:'issuetype'},
  {id:'priorities',name:'Priority',jql:'priority'},
  {id:'statuses',name:'Current Status',jql:'status'},
  {id:'components',name:'Component',jql:'component'},
  {id:'fixVersions',name:'Fix Version',jql:'fixVersion'},
  {id:'epics',name:'Epic',jql:'parent'},
];
export const jiraDefaults={project:'EFSGLYTY',mode:'basic',issueTypes:['Bug'],priorities:[],statuses:[],components:[],fixVersions:[],epics:[],jql:'',jqlDateMode:'weekly',start:'2026-06-01',end:'2026-08-23',excludePentest:true};
export function validateProject(value){
  const project=String(value??'').trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(project))throw new Error('Select a Jira space (project), for example EFSGLYTY.');
  return project;
}
export const quoteJql=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export function normalizeJql(value){
  const source=String(value??'').trim();
  if(!source)throw new Error('Enter JQL to select the issues to measure.');
  if(source.length>4000)throw new Error('Keep JQL within 4,000 characters.');
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(source))throw new Error('Remove control characters from JQL.');
  let quote='',depth=0,mask='';
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quote){
      mask+=' ';
      if(c==='\\'){i++;mask+=' ';}
      else if(c===quote)quote='';
    }else if(c==='"'||c==="'"){quote=c;mask+=' ';}
    else if(c==='('){depth++;mask+=' ';}
    else if(c===')'){if(--depth<0)throw new Error('Check the parentheses in your JQL.');mask+=' ';}
    else mask+=depth?' ':c;
  }
  if(quote||depth)throw new Error('Close all quotes and parentheses in your JQL.');
  const order=/\border\s+by\b/i.exec(mask);
  const clause=(order?source.slice(0,order.index):source).trim();
  if(!clause)throw new Error('Add a filter before ORDER BY.');
  return clause;
}
function selections(value,fallback=[]){
  const values=value===undefined?fallback:value;
  if(!Array.isArray(values)||values.length>50||values.some(v=>typeof v!=='string'||!v.trim()||v.length>256||/[\x00-\x1F]/.test(v)))throw new Error('Select valid field values (up to 50 per field).');
  return [...new Set(values)].sort();
}
function jqlTokens(source){
  return [...source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|>=|<=|!=|!~|&&|\|\||[=<>!~(),&|]|[^\s=<>!~(),&|]+/g)].map(match=>({raw:match[0],start:match.index,end:match.index+match[0].length}));
}
// Remove complete creation predicates, simplifying their boolean groups without
// touching quoted values, other fields, function arguments, or history predicates.
export function withoutCreatedDates(source){
  const tokens=jqlTokens(source);
  function prune(start,end){
    if(start===end)return '';
    const original=source.slice(tokens[start].start,tokens[end-1].end);
    let depth=0;const and=[],or=[];
    for(let i=start;i<end;i++){
      const raw=tokens[i].raw.toUpperCase();
      if(raw==='(')depth++;
      else if(raw===')')depth--;
      else if(depth===0){
        if(raw==='OR'||raw==='||')or.push(i);
        if(raw==='AND'||raw==='&&')and.push(i);
      }
    }
    // OR is the outer operation because AND binds more tightly in JQL.
    const operators=or.length?or:and;
    if(operators.length){
      const parts=[];let from=start,changed=false;
      for(const to of [...operators,end]){
        if(from===to)return original; // Let Jira report incomplete boolean expressions.
        const part=prune(from,to);
        if(part!==source.slice(tokens[from].start,tokens[to-1].end))changed=true;
        if(part)parts.push(part);
        from=to+1;
      }
      return changed?parts.join(or.length?' OR ':' AND '):original;
    }
    if(tokens[start].raw==='('&&tokens[end-1].raw===')'){
      const inner=prune(start+1,end-1);
      return inner?'('+inner+')':'';
    }
    if(['NOT','!'].includes(tokens[start].raw.toUpperCase())){
      const inner=prune(start+1,end);
      return inner?tokens[start].raw+' '+inner:'';
    }
    const field=tokens[start].raw.replace(/^(["'])(.*)\1$/s,'$2');
    return /^(created|createddate)$/i.test(field)&&end>start+1?'':original;
  }
  return prune(0,tokens.length);
}
// Only date operands move: date-like summaries, labels, versions, and issue keys stay literal.
export function shiftJqlDates(source,days){
  if(!days)return source;
  const tokens=jqlTokens(source);
  const value=token=>token?.raw.replace(/^(["'])(.*)\1$/s,'$2');
  const keyword=(token,word)=>token?.raw.toUpperCase()===word;
  const positions=new Set();
  const mark=index=>{
    const text=value(tokens[index]);
    if(text&&/^\d{4}[-/]\d{2}[-/]\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text))positions.add(index);
  };
  const list=index=>{
    if(tokens[index]?.raw!=='(')return;
    for(let i=index+1;i<tokens.length;i++){
      if(tokens[i].raw===')'||tokens[i].raw==='(')break;
      if(tokens[i].raw!==',')mark(i);
    }
  };
  const dateFields=new Set(['created','createddate','updated','updateddate','resolved','resolutiondate','due','duedate','lastviewed']);
  for(let i=0;i<tokens.length;i++){
    if(dateFields.has(value(tokens[i])?.toLowerCase())){
      const next=tokens[i+1];
      if(next&&/^(>=|<=|!=|=|>|<)$/.test(next.raw))mark(i+2);
      else if(keyword(next,'IN'))list(i+2);
      else if(keyword(next,'NOT')&&keyword(tokens[i+2],'IN'))list(i+3);
    }
    if(keyword(tokens[i],'DURING'))list(i+1);
    if(['AFTER','BEFORE','ON'].some(word=>keyword(tokens[i],word)))mark(i+1);
  }
  let result=source;
  for(const index of [...positions].sort((a,b)=>b-a)){
    const token=tokens[index],text=value(token),date=text.slice(0,10).replaceAll('/','-');
    let moved=shiftDate(date,days);
    if(text[4]==='/')moved=moved.replaceAll('-','/');
    moved+=text.slice(10);
    const quote=/^["']/.test(token.raw)?token.raw[0]:'';
    result=result.slice(0,token.start)+quote+moved+quote+result.slice(token.end);
  }
  return result;
}
export function jiraScope(input,metric){
  if(input.mode==='jql'){
    let source=normalizeJql(input.jql);
    if(['resolved','tested','failed','escaped','overall'].includes(metric))source=withoutCreatedDates(source);
    if(input.jqlDateMode==='fixed')return source;
    const days=(dateUTC(input.start)-dateUTC(input.jqlAnchorStart||input.start))/86400000;
    return shiftJqlDates(source,days);
  }
  const clauses=['project = '+quoteJql(validateProject(input.project))];
  for(const field of jiraSelectionFields){
    const values=selections(input[field.id],field.id==='issueTypes'?['Bug']:[]);
    if(values.length)clauses.push(field.jql+' IN ('+values.map(quoteJql).join(', ')+')');
  }
  return clauses.join('\nAND ');
}
export function dateUTC(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Use a valid date in YYYY-MM-DD format.');
  const date=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Use a valid calendar date.');
  return date;
}
export function shiftDate(value,days){const date=dateUTC(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function validateJiraFilters(input,{singleWeek=false}={}){
  const mode=input.mode??'basic';
  if(!['basic','jql'].includes(mode))throw new Error('Choose Fields or JQL mode.');
  const project=mode==='basic'?validateProject(input.project):'';
  const jql=mode==='jql'?normalizeJql(input.jql):'';
  const fields=Object.fromEntries(jiraSelectionFields.map(f=>[f.id,mode==='jql'?[]:selections(input[f.id],f.id==='issueTypes'?['Bug']:[])]));
  const start=String(input.start??''),end=String(input.end??''),first=dateUTC(start),last=dateUTC(end);
  if(first.getUTCDay()!==1)throw new Error('Choose a Monday as the start date.');
  const days=(last-first)/86400000;
  if(days<0||days>181||(singleWeek&&days>6))throw new Error(singleWeek?'Each request must stay within one Monday–Sunday week.':'Choose a Last Day on or after the First Monday, covering no more than 26 weeks.');
  const excludePentest=input.excludePentest===true||input.excludePentest==='1'||input.excludePentest==='true';
  const jqlDateMode=mode==='jql'?(input.jqlDateMode??'weekly'):'weekly';
  if(!['weekly','fixed'].includes(jqlDateMode))throw new Error('Choose weekly or fixed JQL dates.');
  const jqlAnchorStart=mode==='jql'?(input.jqlAnchorStart||start):'';
  if(jqlAnchorStart){
    const anchor=dateUTC(jqlAnchorStart),offset=(first-anchor)/86400000;
    if(anchor.getUTCDay()!==1||offset<0||offset>175||offset%7!==0)throw new Error('The JQL reference week must be a Monday within the selected reporting period.');
  }
  return {project,mode,...fields,jql,jqlDateMode,jqlAnchorStart,start,end,excludePentest};
}
export function jiraWeekRequest(input,week,refresh=false){
  // Normalize the whole report before replacing its dates, preserving one reference week.
  const filters=validateJiraFilters(input);
  return {...filters,start:week.start,end:week.end,refresh};
}
export function jiraWeeks(filters){
  const {start,end}=validateJiraFilters(filters),weeks=[];let month='',number=0;
  for(let day=start;day<=end;day=shiftDate(day,7)){
    const finish=[shiftDate(day,6),end].sort()[0],key=finish.slice(0,7);
    number=key===month?number+1:1;month=key;
    weeks.push({start:day,end:finish,month:key,number});
  }
  return weeks;
}
export function weekLabel(week){
  const format=value=>dateUTC(value).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
  return `${format(week.start)} - ${format(week.end)}`;
}
export function monthLabel(week){return dateUTC(week.end).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'});}
export function jiraQuery(input,metric,{highPriority=false}={}){
  const filters=validateJiraFilters(input,{singleWeek:true});
  const {start,end,excludePentest}=filters;
  const during=`DURING ("${start} 00:00", "${end} 23:59")`;
  const scope=jiraScope(filters,metric),clauses=scope?['('+scope+')']:[];
  if(highPriority)clauses.push('priority IN (High, Highest)');
  if(excludePentest)clauses.push('summary !~ "PENTEST"');
  const conditions={
    created:`created >= "${start} 00:00" AND created < "${shiftDate(end,1)} 00:00"\nAND status != CANCEL`,
    resolved:`(status CHANGED FROM "QA In Progress" TO "Ready for Deploy" ${during}\nOR status CHANGED FROM "UAT In Progress" TO "Ready for Deploy" ${during})`,
    tested:`(status CHANGED TO "QA In Progress" ${during}\nOR status CHANGED TO "UAT In Progress" ${during})\nAND status NOT IN ("Cancel")`,
    failed:`(status CHANGED FROM "QA In Progress" TO "QA Failed" ${during}\nOR status CHANGED FROM "UAT In Progress" TO "UAT Failed" ${during})`,
    escaped:`status WAS IN ("Code Review", "Dev Done", "Dev In Progress", "QA Failed", "To Do", "UAT Failed") ${during}\nAND status WAS NOT IN ("Done", "Ready for Deploy", "Released Prod", "Cancel", "QA Ready", "QA In Progress", "UAT Ready", "UAT In Progress") ${during}`,
  };
  if(!Object.hasOwn(conditions,metric))throw new Error('Unknown Jira metric.');
  return [...clauses,conditions[metric]].join('\nAND ')+'\nORDER BY created DESC';
}
export const isHighPriority=issue=>['high','highest'].includes(String(issue.priority??'').toLowerCase());
