const assert=require('node:assert/strict'),http=require('node:http');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {requestEnvelope}=require('../src/models/providers/ollamaEnvelopeTransport');
const original=http.request;
let scenario,requests=0,lastRequest;
http.request=(options,callback)=>{
    requests++;assert.equal(options.hostname,'localhost');assert.equal(options.port,11434);
    const req=lastRequest=new EventEmitter();req.destroyed=false;
    req.destroy=error=>{req.destroyed=true;if(error)queueMicrotask(()=>req.emit('error',error));};
    const abort=()=>req.destroy(Object.assign(new Error('aborted'),{code:'ABORT_ERR'}));
    options.signal?.addEventListener('abort',abort,{once:true});
    req.end=payload=>{
        assert.equal(JSON.parse(payload).stream,false);
        if(options.signal?.aborted)return abort();
        queueMicrotask(()=>scenario(req,callback));
    };
    return req;
};
const body={stream:false,messages:[]};
async function main(){
    const envelope={done:true,done_reason:'stop',message:{role:'assistant',content:'café',thinking:'native'}};
    scenario=(req,callback)=>{const res=new PassThrough();res.statusCode=200;callback(res);const bytes=Buffer.from(JSON.stringify(envelope));res.write(bytes.subarray(0,bytes.length-3));res.end(bytes.subarray(bytes.length-3));};
    assert.deepEqual(await requestEnvelope(body,{timeoutMs:600000}),envelope);
    assert.deepEqual(await require('../src/models/providers/ollama').completeEnvelope([],{timeoutMs:600000}),envelope);
    scenario=(req,callback)=>{const res=new PassThrough();res.statusCode=503;callback(res);};
    await assert.rejects(requestEnvelope(body,{timeoutMs:100}),e=>e.code==='OLLAMA_HTTP_ERROR');
    scenario=(req,callback)=>{const res=new PassThrough();res.statusCode=200;callback(res);res.end('PRIVATE_INVALID_RESPONSE');};
    await assert.rejects(requestEnvelope(body,{timeoutMs:100}),e=>e.code==='OLLAMA_RESPONSE_JSON'&&!e.message.includes('PRIVATE'));
    scenario=(req,callback)=>{const res=new PassThrough();res.statusCode=200;callback(res);res.end(Buffer.alloc(2*1024*1024+1));};
    await assert.rejects(requestEnvelope(body,{timeoutMs:100}),e=>e.code==='OLLAMA_RESPONSE_SIZE');
    scenario=()=>{};
    await assert.rejects(requestEnvelope(body,{timeoutMs:10}),e=>e.code==='OLLAMA_TIMEOUT');assert(lastRequest.destroyed);
    const controller=new AbortController();
    const pending=requestEnvelope(body,{timeoutMs:100,signal:controller.signal});controller.abort();
    await assert.rejects(pending,e=>e.code==='ABORT_ERR');assert(lastRequest.destroyed);
    await assert.rejects(requestEnvelope(body,{timeoutMs:100,signal:controller.signal}),e=>e.code==='ABORT_ERR');
    scenario=(req,callback)=>{const res=new PassThrough();res.statusCode=200;callback(res);res.write('{');res.emit('aborted');res.destroy();};
    await assert.rejects(requestEnvelope(body,{timeoutMs:100}),e=>e.code==='OLLAMA_RESPONSE_ABORTED');
    scenario=req=>req.emit('error',Object.assign(new Error('socket details'),{code:'ECONNRESET'}));
    await assert.rejects(requestEnvelope(body,{timeoutMs:100}),e=>e.code==='ECONNRESET'&&e.message==='Local model connection failed.');
    assert.equal(requests,10,'Failures are never retried automatically.');
    console.log('Bounded envelope transport: response, errors, size, timeout, cancellation, no retries passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{http.request=original;});
