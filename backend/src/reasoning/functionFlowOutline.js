// Ordered source structure only; leaf expressions are not evaluated.
const ts=require('typescript');
const {spokenExpression}=require('./booleanReturnOutline');
function deriveFlowOutline(fn,span,inputs){
    if(fn.asteriskToken||!ts.isBlock(fn.body)||fn.parameters.some(p=>!ts.isIdentifier(p.name)||p.initializer))return null;
    const steps=[];let stopped=null,ended=false;
    const stringNames=new Set();
    const expression=n=>n&&n.getText().length<=240?{source:n.getText(),speech:spokenExpression(n)}:null;
    const result=n=>n.expression?expression(n.expression):{source:'undefined',speech:'undefined'};
    const names=new Set(fn.parameters.map(p=>p.name.text));
    for(const statement of fn.body.statements){
        if(ended)break;
        if(steps.length>=8){stopped={reason:'outline size limit',span:span(statement)};break;}
        if(ts.isVariableStatement(statement)&&statement.declarationList.flags&ts.NodeFlags.Const){
            const pending=[];
            for(const declaration of statement.declarationList.declarations){
                const value=expression(declaration.initializer);
                if(!ts.isIdentifier(declaration.name)||names.has(declaration.name.text)||!value){pending.length=0;break;}
                names.add(declaration.name.text);
                pending.push({kind:'initialize',name:declaration.name.text,value,transformation:require('./inputTransformations').describeTransformation(declaration.initializer,inputs),span:span(declaration)});
            }
            if(pending.length&&steps.length+pending.length<=8){steps.push(...pending);for(const step of pending)if(step.transformation)stringNames.add(step.name);continue;}
        }
        if(ts.isIfStatement(statement)&&!statement.elseStatement){
            const branch=ts.isBlock(statement.thenStatement)&&statement.thenStatement.statements.length===1?statement.thenStatement.statements[0]:statement.thenStatement;
            const condition=expression(statement.expression);
            if(ts.isReturnStatement(branch)&&condition&&result(branch)){
                condition.predicate=ts.isPrefixUnaryExpression(statement.expression)&&statement.expression.operator===ts.SyntaxKind.ExclamationToken?spokenExpression(statement.expression.operand)+' is falsy':condition.speech+' is truthy';
                condition.explanation=require('./flowOperations').lengthCondition(statement.expression,stringNames);
                steps.push({kind:'guard_return',condition,value:result(branch),span:span(statement)});continue;
            }
        }
        if(ts.isReturnStatement(statement)&&result(statement)){
            steps.push({kind:'return',value:result(statement),operation:statement.expression&&!fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)?require('./flowOperations').regexSome(statement.expression,inputs,span):null,span:span(statement)});ended=true;continue;
        }
        stopped={reason:ts.SyntaxKind[statement.kind],span:span(statement)};break;
    }
    // A sequence of opaque initializers alone is not a useful behavior outline.
    if(!steps.some(s=>s.kind==='guard_return'))return null;
    return {version:'function-flow-3',steps,async:Boolean(fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)),status:stopped?'partial':'structural',stopped,fallsThrough:!stopped&&!ended,span:span(fn)};
}
function presentFlowOutline(outline){
    if(!outline)return [];
    const claims=[];
    const add=(text,speech,span)=>claims.push({text,speech,citations:[span],lines:[span.line]});
    const assumptions=[...(outline.steps.some(s=>s.transformation)?['standard built-in String and string methods']:[]),...(outline.steps.some(s=>s.operation)?['the declared pattern array and regexes remaining unmodified, with standard array and regex methods']:[])];
    const preface='In source order, assuming normal completion'+(assumptions.length?' and '+assumptions.join('; and '):'')+':';
    add(preface,preface,outline.span);
    const outcome=(value,speech)=>{
        const phrase=speech?value.speech:'`'+value.source+'`';
        return outline.async?'returns the value of '+phrase+' from the async body; the eventual promise outcome is not derived':'returns the value of '+phrase;
    };
    for(const step of outline.steps){
        if(step.kind==='initialize'&&step.transformation){const text=require('./inputTransformations').explainTransformation(step.transformation,step.name);add(text,text,step.span);}
        else if(step.kind==='initialize')add(`If reached, initializes ${step.name} with the value of \`${step.value.source}\`.`,`If reached, sets ${step.name.replace(/([a-z])([A-Z])/g,'$1 $2')} to ${step.value.speech}.`,step.span);
        else if(step.kind==='guard_return')add(`If ${step.condition.explanation||'`'+step.condition.source+'` is truthy'}, ${outcome(step.value,false)} and skips later body statements. Otherwise, execution continues.`,`If ${step.condition.explanation||step.condition.predicate}, it ${outcome(step.value,true)} and skips later body statements. Otherwise, execution continues.`,step.span);
        else if(step.operation){
            const op=step.operation;
            const text=`If execution reaches the final return, tests ${op.input} against the patterns in ${op.array}. It returns ${op.negated?'false':'true'} on the first match, and ${op.negated?'true':'false'} if none match. No particular match result has been evaluated.`;
            const speech=text.replaceAll(op.array,op.array.toLowerCase().replaceAll('_',' '));
            claims.push({text,speech,citations:[step.span,op.declarationSpan],lines:[step.span.line,op.declarationSpan.line]});
        }
        else add('If execution reaches the final return, '+outcome(step.value,false)+'.','If execution reaches the final return, it '+outcome(step.value,true)+'.',step.span);
    }
    if(outline.stopped)add('The outline stops before '+outline.stopped.reason+'. Later behavior and final outcomes on continuing paths remain unresolved.','The remaining control flow is outside this outline. The final result on continuing paths remains unresolved.',outline.stopped.span);
    else if(outline.fallsThrough)add('If all guards continue normally, the body falls through with undefined.','If all guards continue normally, the body falls through with undefined.',outline.span);
    return claims;
}
module.exports={deriveFlowOutline,presentFlowOutline};
