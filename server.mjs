import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {methodologyDocument} from './report.js';
import {referenceDocument} from './reference.js';
import {createJiraService,JiraError} from './jira-service.mjs';
const publicFiles=new Map([
  ['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/builder.css','builder.css'],['/print.css','print.css'],
  ['/app.js','app.js'],['/metrics.js','metrics.js'],['/report.js','report.js'],
  ['/jira','index.html'],['/jira.html','index.html'],['/jira.js','jira.js'],['/jira-model.js','jira-model.js'],['/jira-overall.js','jira-overall.js'],['/jira.css','jira.css'],
  ['/metrics-source.pdf','metrics-source.pdf'],['/measurement-source.pdf','measurement-source.pdf'],
]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',pdf:'application/pdf'};
async function readJSON(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new JiraError('Send JSON data.',415);
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>32768)throw new JiraError('The query request is too large.',413);chunks.push(chunk);}
  try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();return data;}
  catch{throw new JiraError('Send a valid JSON object.',400);}
}
export function createServer({jira=createJiraService()}={}){return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-cache');
  try{
    const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
    if(pathname.startsWith('/api/jira/')){
      res.setHeader('Cache-Control','no-store');
      const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      const host=new URL('http://'+(req.headers.host||'invalid'));
      if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&new URL(req.headers.origin).host!==host.host))return json(403,{error:'Jira data is only available from this local website.'});
      const methods={'/api/jira/status':['GET'],'/api/jira/options':['GET'],'/api/jira/week':['GET','POST'],'/api/jira/overall':['POST'],'/api/jira/validate':['POST']};
      if(!methods[pathname])return json(404,{error:'Not found'});
      if(!methods[pathname].includes(req.method)){res.setHeader('Allow',methods[pathname].join(', '));return json(405,{error:'Unsupported request method.'});}
      try{
        if(pathname==='/api/jira/status')return json(200,{configured:jira.configured,site:jira.site});
        if(pathname==='/api/jira/options')return json(200,await jira.getOptions(url.searchParams.get('project')));
        const input=req.method==='POST'?await readJSON(req):Object.fromEntries(url.searchParams);
        if(pathname==='/api/jira/validate')return json(200,await jira.validate(input));
        if(pathname==='/api/jira/overall')return json(200,await jira.getOverall(input,{refresh:input.refresh===true||input.refresh==='1'}));
        return json(200,await jira.getWeek(input,{refresh:input.refresh===true||input.refresh==='1'}));
      }catch(error){
        return json(error instanceof JiraError?error.status:502,{error:error instanceof JiraError?error.message:'Unable to retrieve Jira data.'});
      }
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
    if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',service:'measure-report-builder'}));}
    if(pathname==='/methodology.html'||pathname==='/methodology'){
      const html=methodologyDocument();
      res.writeHead(200,{'Content-Type':types.html,'Content-Length':Buffer.byteLength(html)});
      return res.end(req.method==='HEAD'?undefined:html);
    }
    if(pathname==='/reference.html'||pathname==='/reference'){
      const html=referenceDocument();
      res.writeHead(200,{'Content-Type':types.html,'Content-Length':Buffer.byteLength(html)});
      return res.end(req.method==='HEAD'?undefined:html);
    }
    const filename=publicFiles.get(pathname);
    if(!filename){res.writeHead(404);return res.end('Not found');}
    const data=await readFile(new URL(filename,import.meta.url));
    res.writeHead(200,{'Content-Type':types[filename.split('.').at(-1)],'Content-Length':data.length});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(500);res.end('Unable to load resource');}
});}
export const server=createServer();
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||3000,host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`Measure report builder listening on ${host}:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
