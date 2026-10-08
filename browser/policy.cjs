'use strict';
const {parse, getOperationAST}=require('graphql');
const ORIGIN='https://app.secureframe.com';
const PAGES=new Set(['/dashboard','/tests','/controls','/integrations/connected']);

function graphqlRead(body) {
  try {
    const payloads=Array.isArray(body)?body:[body];
    if (!payloads.length || payloads.length>20) return null;
    const fields=new Set();
    for (const p of payloads) {
      if (!p || typeof p.query!=='string' || p.query.length>100000) return null;
      const ast=parse(p.query);
      const operations=ast.definitions.filter(d=>d.kind==='OperationDefinition');
      // Fail closed on mixed documents, subscriptions, persisted queries and ambiguity.
      if (!operations.length || operations.some(d=>d.operation!=='query')) return null;
      const op=getOperationAST(ast,p.operationName);
      if (!op || op.operation!=='query') return null;
      for(const sel of op.selectionSet.selections) {
        if(sel.kind==='Field') fields.add(sel.name.value);
      }
    }
    return {operation_type:'query',batch_size:payloads.length,root_fields:[...fields].sort()};
  } catch { return null; }
}

function decide({url,method,resourceType,body}, origin=ORIGIN) {
  const u=new URL(url);
  if(u.origin===origin && u.pathname==='/graphql') {
    let payload;
    try {payload=method==='GET'?{query:u.searchParams.get('query'),operationName:u.searchParams.get('operationName')}:JSON.parse(body);} catch {payload=null;}
    const metadata=['GET','POST'].includes(method)?graphqlRead(payload):null;
    return {allow:!!metadata,record:{endpoint:'/graphql',method,allowed:!!metadata,...(metadata||{operation_type:'blocked-or-unknown'})}};
  }
  if(method==='GET' && resourceType==='document' && u.origin===origin && PAGES.has(u.pathname) && !u.search && !u.hash) return {allow:true};
  if(method==='GET' && u.origin===origin && ['script','stylesheet','image','font'].includes(resourceType) && /^\/(assets|static|_next)\//.test(u.pathname) && /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(u.pathname)) return {allow:true};
  return {allow:false};
}
async function guardRoute(route, records, origin=ORIGIN) {
  const req=route.request();
  const decision=decide({url:req.url(),method:req.method(),resourceType:req.resourceType(),body:req.postData()},origin);
  if(decision.record) records.push(decision.record);
  if(!decision.allow) return route.abort('blockedbyclient');
  try {
    // Browser route hooks do not re-run for each redirect hop. Fetch once with
    // redirects disabled, then fulfill only non-redirect responses.
    const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:15000});
    if(response.status()>=300 && response.status()<400) return route.abort('blockedbyclient');
    return route.fulfill({response});
  } catch {return route.abort('failed');}
}
module.exports={ORIGIN,PAGES,graphqlRead,decide,guardRoute};
