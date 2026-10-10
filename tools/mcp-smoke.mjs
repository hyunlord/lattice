import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export async function verifyMcp(cli, root) {
  mkdirSync(root, {recursive:true});
  execFileSync('git',['init','-q',root]);
  writeFileSync(join(root,'.gitignore'),'.lattice/cache/\n');
  const data = name => JSON.stringify([{id:'a',name,targetId:'b'},{id:'b',name:'Worker'}]);
  writeFileSync(join(root,'data.json'),data('API'));
  execFileSync('git',['-C',root,'add','.']);
  execFileSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=test@example.invalid','commit','-qm','fixture']);
  const child = spawn(process.execPath,[cli,'mcp','--root',root],{stdio:['pipe','pipe','pipe']});
  const closed = new Promise(resolve => child.once('close',resolve));
  let serial=0, stderr=''; const pending=new Map();
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  const reader=createInterface({input:child.stdout});
  reader.on('line',line=>{const message=JSON.parse(line); const entry=pending.get(message.id); assert.ok(entry,'only JSON-RPC responses on stdout'); pending.delete(message.id); entry(message);});
  const send = (method,params) => new Promise((resolve,reject)=>{
    const id=++serial; const timer=setTimeout(()=>reject(new Error(`MCP timeout: ${method}`)),20000);
    pending.set(id,message=>{clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
  try {
    const initialized=await send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'installed-package-smoke',version:'1'}});
    assert.equal(initialized.protocolVersion,'2025-11-25');
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const catalog=await send('tools/list',{}); assert.equal(catalog.tools.length,8);
    const argumentsByName={lattice_overview:{},lattice_find:{kind:'data-record'},lattice_node:{id:'a'},lattice_trace:{from:'a',to:'b'},lattice_matrix:{},lattice_findings:{},lattice_diff:{ref:'HEAD'},lattice_freshness:{}};
    const hashes=new Set();
    for (const [name,args] of Object.entries(argumentsByName)) {
      writeFileSync(join(root,'data.json'),data(`API-${name}`));
      const response=await send('tools/call',{name,arguments:args}); assert.equal(response.isError,false,JSON.stringify(response));
      const payload=response.structuredContent; assert.deepEqual(JSON.parse(response.content[0].text),payload);
      assert.equal(payload.freshness.rebuilt,true); assert.equal(payload.freshness.mode,'content-hash');
      const graph=JSON.parse(readFileSync(join(root,'.lattice/cache/graph.json'),'utf8'));
      assert.equal(payload.graphHash,graph.hash); hashes.add(graph.hash);
      assert.equal(graph.nodes.find(node=>node.id==='a').name,`API-${name}`);
    }
    assert.equal(hashes.size,8);
    const warm=await send('tools/call',{name:'lattice_freshness',arguments:{}}); assert.equal(warm.structuredContent.freshness.rebuilt,false);
    console.log('Installed MCP: eight tools refresh edited inputs, match persisted graph and reuse unchanged content; stdio EOF clean.');
  } finally { child.stdin.end(); const code=await closed; assert.equal(code,0); assert.equal(stderr,''); }
}
