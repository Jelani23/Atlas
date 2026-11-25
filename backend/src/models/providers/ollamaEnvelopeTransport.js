const http=require('node:http');

// Deep analysis can take longer than fetch's transport-level header deadline.
// Bound the entire non-streaming request explicitly; never retry it implicitly.
function requestEnvelope(body,{signal,timeoutMs}){
    if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>600000)throw new Error('Invalid local model timeout.');
    return new Promise((resolve,reject)=>{
        let settled=false,timer,response;
        const finish=(error,value)=>{
            if(settled)return;
            settled=true;clearTimeout(timer);
            if(error)reject(error);else resolve(value);
        };
        const payload=JSON.stringify(body);
        const req=http.request({hostname:'localhost',port:11434,path:'/api/chat',method:'POST',signal,
            headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
            response=res;
            let bytes=0;const chunks=[];
            res.on('error',error=>finish(error));
            res.on('aborted',()=>finish(Object.assign(new Error('Local model connection closed before its answer completed.'),{code:'OLLAMA_RESPONSE_ABORTED'})));
            if(res.statusCode!==200){
                finish(Object.assign(new Error('Local model request failed (HTTP '+res.statusCode+').'),{code:'OLLAMA_HTTP_ERROR'}));
                res.destroy();return;
            }
            res.on('data',chunk=>{
                bytes+=chunk.length;
                if(bytes>2*1024*1024){
                    finish(Object.assign(new Error('Local model response exceeded the size limit.'),{code:'OLLAMA_RESPONSE_SIZE'}));
                    res.destroy();req.destroy();return;
                }
                chunks.push(chunk);
            });
            res.on('end',()=>{
                if(settled)return;
                try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}
                catch{finish(Object.assign(new Error('Local model returned invalid response JSON.'),{code:'OLLAMA_RESPONSE_JSON'}));}
            });
        });
        req.on('error',error=>{
            finish(Object.assign(new Error(signal?.aborted?'Local model request cancelled.':'Local model connection failed.'),{code:error.code||'OLLAMA_CONNECTION_ERROR'}));
        });
        timer=setTimeout(()=>{
            const error=Object.assign(new Error('Local model request timed out.'),{code:'OLLAMA_TIMEOUT'});
            finish(error);response?.destroy();req.destroy(error);
        },timeoutMs);
        req.end(payload);
    });
}
module.exports={requestEnvelope};
