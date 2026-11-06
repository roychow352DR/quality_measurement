import {escapeHTML as h} from './report.js';
import {dateUTC,shiftDate,shiftJqlDates,validateJiraFilters,jiraWeeks,jiraWeekRequest,jiraTableColumns,jiraMetricValue,formatJiraMetric} from './jira-model.js';
import {jiraOverallExportColumns} from './jira-overall.js';

// Export through today, starting no earlier than the selected First Monday.
// Once the project spans five weeks, keep only the latest five. Rebase moving
// JQL dates while preserving their relationship to the original reference week.
export function jiraExportFilters(input,now=new Date()){
  const filters=validateJiraFilters(input);
  const end=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if(filters.start>end)throw new Error('The project start date (First Monday) is after today. No weeks are available to export.');
  const monday=shiftDate(end,-((dateUTC(end).getUTCDay()+6)%7)),earliest=shiftDate(monday,-28);
  const start=filters.start>earliest?filters.start:earliest;
  const days=(dateUTC(start)-dateUTC(filters.jqlAnchorStart||filters.start))/86400000;
  const jql=filters.mode==='jql'&&filters.jqlDateMode==='weekly'?shiftJqlDates(filters.jql,days):filters.jql;
  return validateJiraFilters({...filters,start,end,jql,jqlAnchorStart:filters.mode==='jql'?start:''});
}

export async function loadJiraExportData(input,{section='weekly',fetchWeek,fetchOverall,signal,now=new Date(),onProgress=()=>{}}){
  const filters=jiraExportFilters(input,now),weeks=jiraWeeks(filters),rows=new Map();
  if(section==='overall'){
    signal?.throwIfAborted();
    const data=await fetchOverall(filters,signal);
    signal?.throwIfAborted();
    if(!Array.isArray(data?.rows)||!data.timeZone)throw new Error('Overall statistics returned incomplete snapshots or no cutoff timezone. Please retry.');
    // Read true cumulative snapshots, including history before the export window.
    // Weekly activity cannot be summed to reconstruct these counts.
    for(const week of weeks){
      const row=data.rows.find(row=>row.start===week.start&&row.end===week.end);
      rows.set(week.start,row??{error:'The cumulative snapshot for this period is unavailable.'});
    }
    onProgress(weeks.length,weeks.length);
    return {section,filters,weeks,rows,timeZone:data.timeZone,generatedAt:new Date().toISOString()};
  }
  let next=0;
  async function worker(){
    while(next<weeks.length){
      signal?.throwIfAborted();
      const week=weeks[next++];
      let row;
      try{row=await fetchWeek(jiraWeekRequest(filters,week),signal);}
      catch(error){signal?.throwIfAborted();row={error:error.message};}
      signal?.throwIfAborted();rows.set(week.start,row);onProgress(rows.size,weeks.length);
    }
  }
  await Promise.all([worker(),worker()]);
  return {section,filters,weeks,rows,generatedAt:new Date().toISOString()};
}

export const jiraTrendColumns=[
  {id:'created',name:'Total Defects Created',heading:['Total Created'],color:'#2864b4'},
  {id:'resolved',name:'Resolved',color:'#16776e'},
  {id:'failed',name:'QA Failed',color:'#bd4b46'},
  {id:'fixedRate',name:'Fixed Rate',color:'#16776e'},
  {id:'reopenedRate',name:'Failed Rate',heading:['Failed Rate'],color:'#bd4b46'},
];
const groupName=group=>group==='high'?'High Priority':'All Priorities';
const overallTableColumns=jiraOverallExportColumns.map(metric=>({...metric,heading:metric.heading||[metric.name]}));
const overallTrendColumns=jiraTrendColumns.map(metric=>metric.id==='resolved'?{...metric,heading:['Resolved']}:metric);
const exportColumns=(data,kind,group='overall')=>{
  const columns=data.section==='overall'?(kind==='trend'?overallTrendColumns:overallTableColumns):(kind==='trend'?jiraTrendColumns:jiraTableColumns);
  return data.section==='overall'&&kind==='table'&&group==='high'?columns.filter(m=>m.id!=='highPriorityCreatedRate'):columns;
};
const sectionName=data=>data.section==='overall'?'Overall':'Weekly';
const shortDate=date=>dateUTC(date).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
export function jiraExportIssues(data){
  return data.weeks.flatMap(week=>{
    const row=data.rows.get(week.start);
    if(row?.error)return [`${week.start}: ${row.error}`];
    return exportColumns(data,'table').filter(m=>!['netResolved','fixedRate','reopenedRate','highPriorityCreatedRate'].includes(m.id)).flatMap(m=>{
      const metric=row?.metrics?.[m.id];
      return metric?.error||jiraMetricValue(row,m.id)===null||jiraMetricValue(row,m.id,'high')===null?[`${week.start}, ${m.name}: ${metric?.error||'Count unavailable.'}`]:[];
    });
  });
}

export function jiraExportDataTable(data,group,kind){
  const columns=exportColumns(data,kind,group),cumulative=data.section==='overall';
  return `<table class="jira-export-data"><caption>${h(groupName(group))} - ${sectionName(data)} ${kind==='trend'?'trend data':'statistics'}</caption><thead><tr><th scope="col">${cumulative?'Period Ending':'Period'}</th>${columns.map(m=>`<th scope="col">${h(m.name)}</th>`).join('')}</tr></thead><tbody>${data.weeks.map((week,i)=>`<tr><th scope="row">${cumulative?'As of '+week.end:week.start+' to '+week.end}${i===data.weeks.length-1?' (current week)':''}</th>${columns.map(m=>`<td>${formatJiraMetric(data.rows.get(week.start),m.id,group)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const text=(x,y,value,{size=18,fill='#18344f',weight=400,anchor='start'}={})=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${h(value)}</text>`;
const rect=(x,y,width,height,fill,extra='')=>`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
const line=(x1,y1,x2,y2,color='#dce5ec',extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
function header(data,group,kind){
  const {filters}=data;
  const scope=filters.mode==='jql'?'Custom JQL':filters.project;
  return rect(0,0,1440,10,'#16776e')+
    text(48,51,'JIRA / QUALITY MEASUREMENT',{size:15,weight:700,fill:'#16776e'})+
    text(48,96,`${sectionName(data)} defect ${kind==='trend'?'trends':'statistics'}`,{size:34,weight:700})+
    text(48,130,`${scope}  /  ${groupName(group)}  /  ${group==='high'?'High + Highest':'All selected priorities'}`,{size:19})+
    text(48,162,`${filters.start} to ${filters.end}  |  ${data.weeks.length} ${data.weeks.length===1?'week':'weeks'}  |  Current week through ${filters.end}`,{size:17,fill:'#536577'});
}
function footer(data,y,kind,group){
  const cumulative=data.section==='overall';
  return line(48,y,1392,y)+
    text(48,y+29,cumulative?`Cumulative history includes issues before First Monday. Current Cancel excluded. Cutoffs: ${data.timeZone}.`:'Net Resolved = Resolved - Created. Informational only; measurement scores are unchanged.',{size:16})+
    text(48,y+55,cumulative?'Rates use each cumulative snapshot: Fixed = Resolved / Total Created x 100%. Failed = QA Failed / Tested x 100%.':'Fixed Rate = Resolved / Created x 100%. Failed Rate = QA Failed / Tested x 100% (the table\'s Reopened Rate).',{size:16})+
    (cumulative&&kind==='table'&&group!=='high'?text(48,y+81,'High Priority Created % = High + Highest Created / All Priorities Created x 100%, within the applied query.',{size:16}):'');
}
const tableHeadings={created:['Created'],resolved:['Resolved','Ready for Deploy'],netResolved:['Net','Resolved'],tested:['Tested'],failed:['QA Failed'],escaped:['Escaped'],fixedRate:['Fixed Rate'],reopenedRate:['Reopened Rate']};
function tableSVG(data,group,columns,y,{rowHeight=65,headerHeight=64}={}){
  const first=244,width=(1344-first)/columns.length,top=y+headerHeight,cumulative=data.section==='overall';
  let svg=rect(48,y,1344,headerHeight,'#18344f')+text(68,y+38,cumulative?'Period Ending':'Period',{size:17,weight:700,fill:'#fff'});
  columns.forEach((m,i)=>{
    const labels=m.heading||tableHeadings[m.id]||[m.name],cx=48+first+width*(i+.5);
    svg+=labels.map((label,j)=>text(cx,y+(labels.length===1?38:27+j*22),label,{size:j?13:17,fill:j?'#c9dae7':'#fff',weight:j?400:700,anchor:'middle'})).join('');
  });
  data.weeks.forEach((week,i)=>{
    const rowY=top+i*rowHeight,current=i===data.weeks.length-1;
    svg+=rect(48,rowY,1344,rowHeight,current?'#eaf5f3':i%2?'#f2f6f9':'#fff')+line(48,rowY+rowHeight,1392,rowY+rowHeight);
    svg+=text(68,rowY+27,cumulative?'As of '+shortDate(week.end):`${shortDate(week.start)} - ${shortDate(week.end)}`,{size:17,weight:700});
    svg+=text(68,rowY+48,`${(cumulative?week.end:week.start).slice(0,4)}${current?' / Current week':''}`,{size:13,fill:'#536577'});
    columns.forEach((m,j)=>{svg+=text(48+first+width*(j+.5),rowY+37,formatJiraMetric(data.rows.get(week.start),m.id,group),{size:20,weight:700,anchor:'middle'});});
  });
  return svg;
}

function chartSVG(data,group,columns,{x,y,width,height,title,percent=false}){
  const values=columns.flatMap(m=>data.weeks.map(w=>jiraMetricValue(data.rows.get(w.start),m.id,group))).filter(Number.isFinite);
  const maximum=Math.max(percent?100:4,...values),rawStep=maximum/4,magnitude=10**Math.floor(Math.log10(rawStep));
  const step=Math.ceil(rawStep/magnitude)*magnitude,ceiling=step*4;
  const left=x+60,right=x+width-28,top=y+85,bottom=y+height-48;
  const count=data.weeks.length,spacing=(right-left)/Math.max(1,count-1);
  const px=i=>count===1?(left+right)/2:left+i*spacing,py=value=>bottom-value/ceiling*(bottom-top);
  let svg=rect(x,y,width,height,'#fff','rx="10" stroke="#dce5ec"')+text(x+22,y+32,title,{size:20,weight:700});
  columns.forEach((m,i)=>{const lx=x+22+i*(percent?180:190);svg+=line(lx,y+57,lx+22,y+57,m.color,'stroke-width="3"'+(i===1?' stroke-dasharray="7 4"':i===2?' stroke-dasharray="2 4"':''))+text(lx+30,y+62,m.id==='created'?'Total Created':m.name,{size:15});});
  const currentStart=Math.max(left,px(count-1)-spacing/2);
  svg+=rect(currentStart,top,right-currentStart,bottom-top,'#eaf5f3');
  for(let i=0;i<=4;i++){
    const value=step*i,cy=py(value);
    svg+=line(left,cy,right,cy)+text(left-12,cy+5,`${value}${percent?'%':''}`,{size:14,anchor:'end',fill:'#536577'});
  }
  data.weeks.forEach((week,i)=>{svg+=text(px(i),bottom+25,shortDate(data.section==='overall'?week.end:week.start),{size:14,anchor:'middle',fill:'#536577'});});
  columns.forEach((m,series)=>{
    let path='',connected=false;
    data.weeks.forEach((week,i)=>{
      const value=jiraMetricValue(data.rows.get(week.start),m.id,group);
      if(value===null){connected=false;return;}
      const cx=px(i),cy=py(value);
      path+=`${connected?'L':'M'}${cx.toFixed(2)},${cy.toFixed(2)} `;connected=true;
      svg+=`<circle cx="${cx}" cy="${cy}" r="4" fill="${m.color}"><title>${h(`${m.name}, ${data.section==='overall'?'as of '+week.end:week.start}: ${formatJiraMetric(data.rows.get(week.start),m.id,group)}`)}</title></circle>`;
    });
    svg+=`<path d="${path}" fill="none" stroke="${m.color}" stroke-width="3"${series===1?' stroke-dasharray="7 4"':series===2?' stroke-dasharray="2 4"':''}/>`;
  });
  if(!values.length)svg+=text((left+right)/2,(top+bottom)/2,'No available data',{size:20,anchor:'middle'});
  return svg;
}

// Self-contained SVGs use system fonts and no external images/styles. The same
// drawing is previewed, rasterized for PNG, and embedded in the PDF.
export function jiraExportSVG(data,group='overall',kind='table'){
  const trend=kind==='trend',footerY=trend?595:289+data.weeks.length*65,height=footerY+(!trend&&data.section==='overall'&&group!=='high'?114:88);
  const columns=exportColumns(data,kind,group),cumulative=data.section==='overall';
  let body=header(data,group,kind);
  if(trend){
    body+=chartSVG(data,group,columns.slice(0,3),{x:48,y:190,width:660,height:344,title:cumulative?'Cumulative defects / issue count':'Defect activity / issue count'});
    body+=chartSVG(data,group,columns.slice(3),{x:732,y:190,width:660,height:344,title:cumulative?'Cumulative rates / percent':'Rates / percent',percent:true});
    body+=text(48,564,cumulative?'Dates show each snapshot cutoff. Shaded area = current week to date. Missing values leave gaps.':'Weeks start on Monday. Shaded area = current week to date. Missing values leave gaps.',{size:16,fill:'#536577'});
    body+=footer(data,footerY,kind,group);
  }else{
    body+=tableSVG(data,group,columns,194);
    body+=footer(data,footerY,kind,group);
  }
  return {width:1440,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="${height}" viewBox="0 0 1440 ${height}" role="img" aria-label="${h(groupName(group)+' '+sectionName(data)+' defect '+(trend?'trends':'statistics'))}"><rect width="1440" height="${height}" fill="#fff"/><g font-family="Arial, Helvetica, sans-serif">${body}</g></svg>`};
}

// A single-page PDF containing the high-resolution rendered chart/table. Keeping
// the writer small avoids third-party scripts and works without a CDN connection.
export function jiraImagePDF(jpeg,width,height){
  const encode=value=>new TextEncoder().encode(value),parts=[],offsets=[0];let size=0;
  const add=value=>{const bytes=typeof value==='string'?encode(value):value;parts.push(bytes);size+=bytes.length;};
  const object=(id,value)=>{offsets[id]=size;add(`${id} 0 obj\n${value}\nendobj\n`);};
  add('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const pageWidth=841.89,pageHeight=595.28,scale=Math.min((pageWidth-40)/width,(pageHeight-40)/height),w=width*scale,ht=height*scale;
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=size;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
  const drawing=`q\n${w.toFixed(3)} 0 0 ${ht.toFixed(3)} ${((pageWidth-w)/2).toFixed(3)} ${((pageHeight-ht)/2).toFixed(3)} cm\n/Im0 Do\nQ\n`;
  object(5,`<< /Length ${encode(drawing).length} >>\nstream\n${drawing}endstream`);
  const xref=size;add('xref\n0 6\n0000000000 65535 f \n');
  for(let i=1;i<=5;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}

export async function jiraExportBlob(drawing,format){
  if(!['png','pdf'].includes(format))throw new Error('Choose PNG or PDF.');
  const url=URL.createObjectURL(new Blob([drawing.svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Unable to render the export. Please try again.'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=drawing.width*2;canvas.height=drawing.height*2;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Image exports are unavailable in this browser.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,format==='pdf'?'image/jpeg':'image/png',.98));
    if(!blob)throw new Error('Unable to create the export. Please try again.');
    return format==='pdf'?jiraImagePDF(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height):blob;
  }finally{URL.revokeObjectURL(url);}
}

export function jiraExportFilename(data,group,kind,format){
  return `${data.filters.mode==='jql'?'custom-query':data.filters.project}-jira-${data.section==='overall'?'overall-':''}${kind}-${group==='high'?'high-priority':'all-priorities'}-${data.filters.start}-${data.filters.end}.${format}`;
}
