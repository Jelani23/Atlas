const assert=require('node:assert/strict'),Module=require('node:module'),{EventEmitter}=require('node:events');
const file=require.resolve('../src/voice/tts/providers/kokoroProcess'),load=Module._load;
let installed=true,children=[];
Module._load=function(name,parent,...args){
 if(parent?.filename===file){
  if(name==='fs')return {existsSync:()=>installed};
  if(name==='../ttsConfig')return {kokoro:{root:'fixture'}};
  if(name==='child_process')return {spawn:(_exe,_args,options)=>{assert.equal(options.windowsHide,true);const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true;};children.push(child);return child;}};
 }
 return load.call(this,name,parent,...args);
};
const manager=require(file);Module._load=load;
async function main(){
 installed=false;await assert.rejects(manager.start(),/not found/);
 installed=true;await manager.start();assert.equal(children.length,1);
 await manager.start();assert.equal(children.length,1);
 children[0].emit('exit',1,null);assert(!manager.isRunning());
 await manager.start();assert.equal(children.length,2);assert(manager.isRunning());
 manager.stop();await manager.start();assert.equal(children.length,3);
 children[1].emit('exit',0,null);assert(manager.isRunning());
 children[1].emit('error',new Error('Late error from stopped child'));assert(manager.isRunning());
 children[2].emit('error',new Error('Spawn failed'));assert(!manager.isRunning());
 await manager.start();assert.equal(children.length,4);manager.stop();
 console.log('Kokoro process: restart after failed installation, exit and spawn error; no duplicate child or stale-exit interference passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
