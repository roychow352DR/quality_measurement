import {jiraColumns,jiraQuery,jiraWeeks,jiraWeekRequest,validateJiraFilters,validateProject,isHighPriority,quoteJql} from './jira-model.js';
import {jiraOverallColumns,jiraOverallQuery,jiraLocalDateFormatter,jiraStatusTimeline,jiraOverallSnapshot} from './jira-overall.js';

export class JiraError extends Error{constructor(message,status=502){super(message);this.status=status;}}
export function jiraConfig(env=process.env){
  let url;
  try{url=new URL(env.JIRA_URL);}catch{return null;}
  if(url.protocol!=='https:'||!url.hostname.endsWith('.atlassian.net')||url.port||url.username||url.password||!env.JIRA_USERNAME||!env.JIRA_API_TOKEN)return null;
  return {site:url.origin,authorization:'Basic '+Buffer.from(`${env.JIRA_USERNAME}:${env.JIRA_API_TOKEN}`).toString('base64')};
}
export function createJiraService({config=jiraConfig(),fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const cache=new Map(),inFlight=new Map(),metadataCache=new Map(),metadataPending=new Map(),waiting=[];let active=0;
  const overallCache=new Map(),overallPending=new Map();
  async function limited(work){
    if(active>=4)await new Promise(resolve=>waiting.push(resolve));else active++;
    try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}
  }
  async function request(path,body){
    if(!config)throw new JiraError('Jira is not configured on the server.',503);
    return limited(async()=>{
      for(let attempt=0;attempt<3;attempt++){
        let response;
        try{response=await fetchImpl(config.site+'/rest/api/3'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:config.authorization,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});}
        catch{throw new JiraError('Jira could not be reached. Check the connection and try again.');}
        if(response.status===429&&attempt<2){
          const wait=Number(response.headers.get('retry-after'));
          if(Number.isFinite(wait)&&wait>30)throw new JiraError('Jira rate limit reached. Wait before refreshing again.',429);
          await sleep((Number.isFinite(wait)&&wait>0?wait:2*(attempt+1))*1000);continue;
        }
        if(response.status===401)throw new JiraError('Jira authentication failed. Check the server’s Jira credentials.',401);
        if(response.status===403)throw new JiraError('Jira denied access. Check the account’s project permissions.',403);
        if(response.status===429)throw new JiraError('Jira rate limit reached. Wait before refreshing again.',429);
        if(!response.ok)throw new JiraError(response.status===400?'Jira rejected the query. Check the JQL, selected values, and workflow status names.':'Jira returned an error. Try refreshing again.',response.status===400?400:502);
        let data;try{data=await response.json();}catch{throw new JiraError('Jira returned an unreadable response.');}

        return data;
      }
    });
  }
  async function search(jql){
    if(!config)throw new JiraError('Jira is not configured on the server.',503);
    const issues=new Map(),tokens=new Set();let nextPageToken;
    for(let page=0;page<100;page++){
      const data=await request('/search/jql',{jql,fields:['summary','priority','status','created'],maxResults:100,...(nextPageToken?{nextPageToken}:{})});
      if(!Array.isArray(data.issues))throw new JiraError('Jira returned an incomplete response.');
      for(const issue of data.issues){
        if(typeof issue.key!=='string'||!issue.fields)throw new JiraError('Jira returned an incomplete issue.');
        issues.set(issue.key,{id:String(issue.id??''),key:issue.key,summary:String(issue.fields.summary??''),priority:String(issue.fields.priority?.name??'Unspecified'),status:String(issue.fields.status?.name??'Unknown'),created:String(issue.fields.created??''),url:config.site+'/browse/'+encodeURIComponent(issue.key)});
      }
      if(data.isLast===true||!data.nextPageToken){
        if(data.isLast===false&&!data.nextPageToken)throw new JiraError('Jira did not provide the next results page. No partial count is shown.');
        return [...issues.values()];
      }
      if(typeof data.nextPageToken!=='string'||tokens.has(data.nextPageToken))throw new JiraError('Jira pagination did not complete. No partial count is shown.');
      nextPageToken=data.nextPageToken;tokens.add(nextPageToken);
    }
    throw new JiraError('Too many matching issues. Narrow the project or date range. No partial count is shown.');
  }
  async function allValues(path){
    const values=[];let startAt=0;
    for(let page=0;page<50;page++){
      const data=await request(`${path}?maxResults=100&startAt=${startAt}`);
      if(!Array.isArray(data.values))throw new JiraError('Jira returned an incomplete field list.');
      values.push(...data.values);startAt+=data.values.length;
      if(data.isLast===true||(Number.isFinite(data.total)&&startAt>=data.total))return values;
      if(!data.values.length)throw new JiraError('Jira field pagination did not complete. Try loading the fields again.');
    }
    throw new JiraError('The Jira field list is too large to load. Use JQL to select the required values.');
  }
  async function getOptions(project){
    let key='global';
    if(project){try{key=validateProject(project);}catch(error){throw new JiraError(error.message,400);}}
    const cached=metadataCache.get(key);
    if(cached&&now()-cached.time<300000)return cached.data;
    if(metadataPending.has(key))return metadataPending.get(key);
    if(metadataPending.size>=8)throw new JiraError('Jira fields are loading. Please try again shortly.',429);
    const work=(async()=>{
      const paths=key==='global'?[
        ['projects',()=>allValues('/project/search')],['priorities',()=>allValues('/priority/search')],
      ]:[
        ['workflow',()=>request('/project/'+encodeURIComponent(key)+'/statuses')],
        ['components',()=>allValues('/project/'+encodeURIComponent(key)+'/component')],
        ['fixVersions',()=>allValues('/project/'+encodeURIComponent(key)+'/version')],
        ['epics',()=>search('project = '+quoteJql(key)+' AND issuetype = Epic ORDER BY key ASC')],
      ];
      const results=await Promise.allSettled(paths.map(([,read])=>read()));
      const data={errors:{}};
      const options=(values,idField='name')=>{
        if(!Array.isArray(values))throw new JiraError('Jira returned an incomplete field list.');
        return [...new Map(values.filter(v=>v&&v[idField]!=null&&typeof v.name==='string').map(v=>[String(v[idField]),{value:String(v[idField]),label:v.name}])).values()];
      };
      for(let i=0;i<paths.length;i++){
        const field=paths[i][0],result=results[i];
        try{
          if(result.status==='rejected')throw result.reason;
          if(field==='epics'){
            data.epics=result.value.map(issue=>({value:issue.key,label:issue.key+' · '+issue.summary}));
          }else if(field==='workflow'){
            data.issueTypes=options(result.value);
            data.statuses=options(result.value.flatMap(type=>type.statuses??[])).sort((a,b)=>a.label.localeCompare(b.label));
          }else data[field]=options(result.value,field==='projects'?'key':['components','fixVersions'].includes(field)?'id':'name');
        }catch(error){
          for(const name of field==='workflow'?['issueTypes','statuses']:[field]){data[name]=[];data.errors[name]=error instanceof JiraError?error.message:'Unable to load these Jira field values.';}
        }
      }
      if(!Object.keys(data.errors).length){
        if(metadataCache.size>=32)metadataCache.delete(metadataCache.keys().next().value);
        metadataCache.set(key,{time:now(),data});
      }
      return data;
    })();
    metadataPending.set(key,work);
    try{return await work;}finally{metadataPending.delete(key);}
  }
  async function validate(input){
    let filters;try{filters=validateJiraFilters(input);}catch(error){throw new JiraError(error.message,400);}
    const weeks=jiraWeeks(filters);
    const samples=[weeks[0],...(weeks.length>1?[weeks.at(-1)]:[])];
    const queries=samples.flatMap(week=>jiraColumns.map(metric=>jiraQuery(jiraWeekRequest(filters,week),metric.id)));
    const data=await request('/jql/parse?validation=strict',{queries});
    if(!Array.isArray(data.queries)||data.queries.length!==queries.length||data.queries.some(q=>!q||(!q.structure&&!q.errors?.length)))throw new JiraError('Jira could not validate the complete query.');
    const errors=[...new Set(data.queries.flatMap(q=>q.errors??[]).map(e=>String(e).slice(0,1000)))];
    return {valid:errors.length===0,errors,preview:queries[0]};
  }
  async function getWeek(input,{refresh=false}={}){
    if(!config)throw new JiraError('Jira is not configured on the server.',503);
    let filters;try{filters=validateJiraFilters(input,{singleWeek:true});}catch(error){throw new JiraError(error.message,400);}
    const key=JSON.stringify(filters),saved=cache.get(key);
    if(!refresh&&saved&&now()-saved.time<60000)return saved.data;
    if(inFlight.has(key))return inFlight.get(key);
    if(inFlight.size>=8)throw new JiraError('Jira refresh is busy. Please try again shortly.',429);
    const work=(async()=>{
      const metrics=Object.fromEntries(await Promise.all(jiraColumns.map(async metric=>{
        const jql=jiraQuery(filters,metric.id),highJql=jiraQuery(filters,metric.id,{highPriority:true});
        try{
          const issues=await search(jql);
          return [metric.id,{count:issues.length,highCount:issues.filter(isHighPriority).length,issues,jql,highJql,error:null}];
        }catch(error){return [metric.id,{count:null,highCount:null,issues:[],jql,highJql,error:error instanceof JiraError?error.message:'Unable to retrieve this measurement.'}];}
      })));
      const data={...filters,site:config.site,fetchedAt:new Date(now()).toISOString(),metrics};
      if(Object.values(metrics).every(metric=>!metric.error)){
        if(cache.size>=156)cache.delete(cache.keys().next().value);
        cache.set(key,{time:now(),data});
      }
      return data;
    })();
    inFlight.set(key,work);
    try{return await work;}finally{inFlight.delete(key);}
  }
  async function statusHistories(issues){
    const histories=new Map();
    for(let offset=0;offset<issues.length;offset+=1000){
      const batch=issues.slice(offset,offset+1000),ids=new Set(batch.map(issue=>issue.id));
      if(batch.some(issue=>!/^\d+$/.test(issue.id)))throw new JiraError('Jira returned an issue without its history identifier.');
      // Bulk history omits issues with no matching status changes (including
      // issues still in their initial status); a complete empty result is valid.
      for(const id of ids)histories.set(id,new Map());
      let nextPageToken,complete=false;const tokens=new Set();
      for(let page=0;page<1000;page++){
        const data=await request('/changelog/bulkfetch',{issueIdsOrKeys:[...ids],fieldIds:['status'],maxResults:1000,...(nextPageToken?{nextPageToken}:{})});
        if(!Array.isArray(data.issueChangeLogs))throw new JiraError('Jira returned incomplete status history. No partial Overall counts are shown.');
        for(const group of data.issueChangeLogs){
          const id=String(group.issueId);
          if(!ids.has(id)||!Array.isArray(group.changeHistories))throw new JiraError('Jira returned incomplete status history. No partial Overall counts are shown.');
          if(!histories.has(id))histories.set(id,new Map());
          for(const history of group.changeHistories){
            if(history.id==null)throw new JiraError('Jira returned incomplete status history.');
            histories.get(id).set(String(history.id),history);
          }
        }
        if(!data.nextPageToken){complete=true;break;}
        if(typeof data.nextPageToken!=='string'||tokens.has(data.nextPageToken))throw new JiraError('Jira history pagination did not complete. No partial Overall counts are shown.');
        nextPageToken=data.nextPageToken;tokens.add(nextPageToken);
      }
      if(!complete)throw new JiraError('Jira did not return complete status history. Refresh to retry. No partial Overall counts are shown.');
    }
    return histories;
  }
  async function getOverall(input,{refresh=false}={}){
    if(!config)throw new JiraError('Jira is not configured on the server.',503);
    let filters;try{filters=validateJiraFilters(input);}catch(error){throw new JiraError(error.message,400);}
    const key=JSON.stringify(filters),saved=overallCache.get(key);
    if(!refresh&&saved&&now()-saved.time<60000)return saved.data;
    if(overallPending.has(key))return overallPending.get(key);
    if(overallPending.size>=2)throw new JiraError('Overall statistics are loading. Please try again shortly.',429);
    const work=(async()=>{
      const weeks=jiraWeeks(filters),cohorts=new Map();let next=0;
      async function worker(){
        while(next<weeks.length){
          const week=weeks[next++];
          cohorts.set(week.start,await search(jiraOverallQuery(jiraWeekRequest(filters,week))));
        }
      }
      const profilePromise=request('/myself');
      const results=await Promise.allSettled([profilePromise,worker(),worker()]);
      for(const result of results)if(result.status==='rejected')throw result.reason;
      const timeZone=results[0].value.timeZone;
      let localDate;
      try{if(!timeZone)throw new Error();localDate=jiraLocalDateFormatter(timeZone);}catch{throw new JiraError('Jira did not provide a valid account timezone. Overall cutoffs could not be calculated.');}
      const issues=[...new Map([...cohorts.values()].flat().map(issue=>[issue.id,issue])).values()];
      const histories=await statusHistories(issues),timelines=new Map();
      try{for(const issue of issues)timelines.set(issue.id,jiraStatusTimeline(issue,[...histories.get(issue.id).values()],localDate));}
      catch(error){throw new JiraError(error.message);}
      const fetchedAt=new Date(now()).toISOString();
      const rows=weeks.map(week=>{
        const selected=cohorts.get(week.start).map(issue=>({issue,snapshot:jiraOverallSnapshot(timelines.get(issue.id),week.end)})).filter(item=>item.snapshot);
        const requestFilters=jiraWeekRequest(filters,week);
        const metrics=Object.fromEntries(jiraOverallColumns.map(metric=>{
          const matching=selected.filter(item=>item.snapshot[metric.id]).map(({issue,snapshot})=>({...issue,statusAtCutoff:snapshot.statusAtCutoff}));
          const high=matching.filter(isHighPriority);
          return [metric.id,{count:matching.length,highCount:high.length,issues:matching,jql:jiraOverallQuery(requestFilters,{keys:metric.id==='created'?undefined:matching.map(i=>i.key)}),highJql:jiraOverallQuery(requestFilters,{highPriority:true,keys:metric.id==='created'?undefined:high.map(i=>i.key)}),error:null}];
        }));
        return {...week,metrics,fetchedAt};
      });
      const data={...filters,site:config.site,timeZone,fetchedAt,rows};
      if(overallCache.size>=8)overallCache.delete(overallCache.keys().next().value);
      overallCache.set(key,{time:now(),data});
      return data;
    })();
    overallPending.set(key,work);
    try{return await work;}finally{overallPending.delete(key);}
  }
  return {configured:!!config,site:config?.site??null,getWeek,getOverall,search,getOptions,validate};
}
