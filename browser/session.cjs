#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline/promises');
const {parseArgs}=require('node:util');
const {chromium}=require('playwright');
const {ORIGIN,PAGES,guardRoute}=require('./policy.cjs');

function privatePath(value) {
  if(!value || !path.isAbsolute(value)) throw Error('Use an absolute private file path outside the checkout.');
  const target=path.resolve(value), parent=path.dirname(target);
  if(!fs.existsSync(parent)) fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const real=fs.realpathSync(parent);
  for(const root of [process.cwd(),path.resolve(__dirname,'..')]) {
    const rel=path.relative(fs.realpathSync(root),real);
    if(!rel || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel))) throw Error('Session/output must be outside the working directory and skill checkout.');
  }
  if(fs.lstatSync(parent).isSymbolicLink()) throw Error('Refusing symlink directory.');
  if(process.platform!=='win32' && (fs.statSync(parent).mode&0o077)) throw Error('Private directory must have mode 0700.');
  if(fs.existsSync(target)) {
    const st=fs.lstatSync(target);
    if(!st.isFile() || st.isSymbolicLink() || (process.platform!=='win32' && (st.mode&0o077))) throw Error('Existing private file must be regular with mode 0600.');
  }
  return target;
}
function writePrivate(file,value) {
  const fd=fs.openSync(file,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');} finally {fs.closeSync(fd);}
}
async function main() {
  const {values:v,positionals}=parseArgs({allowPositionals:true,options:{state:{type:'string'},out:{type:'string'},page:{type:'string',default:'/dashboard'},help:{type:'boolean'}}});
  const command=positionals[0];
  if(v.help || !command) {
    console.log('node browser/session.cjs login --state /private/session/state.json\nnode browser/session.cjs capture --state /private/session/state.json --out /private/captures/run.json [--page /dashboard|/tests|/controls|/integrations/connected]\nManual login is user-driven. Capture allows parsed GraphQL queries and blocks unknown API writes. Never share session state.');return;
  }
  if(!['login','capture'].includes(command)) throw Error('Unknown command.');
  const state=privatePath(v.state);
  if(!PAGES.has(v.page)) throw Error('Select a supported read-only navigation page.');
  let output;
  if(command==='login' && fs.existsSync(state)) throw Error('Use a new state filename; existing sessions are not overwritten.');
  if(command==='capture') {
    if(!fs.existsSync(state)) throw Error('Complete manual login first.');
    output=privatePath(v.out);
    if(fs.existsSync(output)) throw Error('Use a new output filename.');
  }
  const browser=await chromium.launch({headless:command!=='login'});
  try {
    const context=await browser.newContext({storageState:command==='capture'?state:undefined,serviceWorkers:'block',acceptDownloads:false});
    const rows=[];
    if(command==='capture') {
      await context.routeWebSocket('**/*',ws=>ws.close());
      await context.route('**/*',route=>guardRoute(route,rows));
    }
    const page=await context.newPage();
    await page.goto(ORIGIN+(command==='login'?'':v.page),{waitUntil:'domcontentloaded',timeout:45000});
    if(command==='login') {
      const rl=readline.createInterface({input:process.stdin,output:process.stdout});
      try {await rl.question('Complete login/MFA yourself in the browser, then press Enter to save private session state. ');} finally {rl.close();}
      if(new URL(page.url()).origin!==ORIGIN) throw Error('Return to the Secureframe app before saving.');
      writePrivate(state,await context.storageState());
      console.log(JSON.stringify({saved:true,login_verified:false,note:'Session saved; capture will test access. No session content printed.'}));
    } else {
      await page.waitForTimeout(5000);
      writePrivate(output,{mode:'graphql-query-metadata',page:v.page,requests:rows,limitations:'Unknown APIs and writes blocked; page may be incomplete. No response bodies or session data recorded.'});
      console.log(JSON.stringify({saved:true,request_count:rows.length,allowed:rows.filter(x=>x.allowed).length,blocked:rows.filter(x=>!x.allowed).length}));
    }
  } finally {await browser.close();}
}
if(require.main===module) main().catch(()=>{console.error('Browser operation failed. Check private paths, browser installation and session access; sensitive error details suppressed.');process.exitCode=2;});
module.exports={privatePath,writePrivate};
