// Bounded completion of literal/simple-binding control flow. Never executes source.
const ts=require('typescript');
const VERSION='bounded-completion-2';
const {evaluate,UNKNOWN}=require('./primitiveSemantics');
function deriveCompletion(fn,record,{bindings=new Map()}={}){
    const gaps=new Set();let steps=0;
    const unknown=(reason,state)=>{gaps.add(reason);return {...state,kind:'unresolved',reason};};
    const typed=value=>value===undefined?{type:'undefined'}:value===null?{type:'null',value:null}:typeof value==='number'?{type:'number',value:Object.is(value,-0)?'-0':String(value)}:{type:Array.isArray(value)?'string-array':typeof value,value};
    function expression(n,env,depth=0){
        if(depth>16)return {known:false};
        if(!n)return {known:true,value:undefined};
        if(ts.isParenthesizedExpression(n))return expression(n.expression,env,depth+1);
        if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return {known:true,value:n.text};
        if(ts.isNumericLiteral(n))return {known:true,value:Number(n.text)};
        if(n.kind===ts.SyntaxKind.TrueKeyword)return {known:true,value:true};
        if(n.kind===ts.SyntaxKind.FalseKeyword)return {known:true,value:false};
        if(n.kind===ts.SyntaxKind.NullKeyword)return {known:true,value:null};
        if(ts.isIdentifier(n)&&env.has(n.text))return {known:true,value:env.get(n.text)};
        if(ts.isPrefixUnaryExpression(n)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken,ts.SyntaxKind.ExclamationToken].includes(n.operator)){
            const v=expression(n.operand,env,depth+1);if(!v.known)return v;
            if(n.operator===ts.SyntaxKind.ExclamationToken)return {known:true,value:!v.value};
            if(typeof v.value==='number')return {known:true,value:n.operator===ts.SyntaxKind.MinusToken?-v.value:v.value};
        }
        if(ts.isTemplateExpression(n)){
            let value=n.head.text;
            for(const part of n.templateSpans){const item=expression(part.expression,env,depth+1);if(!item.known||item.value!==null&&!['undefined','string','number','boolean'].includes(typeof item.value))return {known:false};value+=String(item.value)+part.literal.text;if(value.length>2000)return {known:false};}
            return {known:true,value};
        }
        // Share the existing bounded primitive rules, but disable identifier-call
        // intrinsics until module-level binding analysis is joined to this evaluator.
        const value=evaluate(n,fn.getSourceFile(),null,UNKNOWN,new Set(['Number','parseFloat','isNaN']),0,env);
        if(value!==UNKNOWN&&JSON.stringify(typed(value)).length<=2400)return {known:true,value};
        return {known:false};
    }
    const exitAt=n=>record.exits.find(e=>e.span.start===n.getStart()&&e.span.end===n.end);
    function walk(n,state){
        if(++steps>512)return [unknown('Completion traversal limit reached.',state)];
        if(ts.isBlock(n)){
            // Hoisted functions and lexical shadowing affect reads even before their
            // declaration is visited. Refuse these blocks rather than reuse outer values.
            if(n.statements.some(s=>ts.isFunctionDeclaration(s)||ts.isClassDeclaration(s)||ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>!ts.isIdentifier(d.name)||state.env.has(d.name.text))))return [unknown('Block declaration shadowing or hoisting is unsupported.',state)];
            let states=[state];
            for(const statement of n.statements){
                states=states.flatMap(s=>s.kind==='normal'?walk(statement,s):[s]);
                if(states.length>32)return [unknown('Completion path limit reached.',state)];
            }
            return states.map(s=>({...s,env:state.env}));
        }
        if(ts.isEmptyStatement(n)||ts.isFunctionDeclaration(n))return [state];
        if(ts.isReturnStatement(n)||ts.isThrowStatement(n)){
            const value=expression(n.expression,state.env),exit=exitAt(n);
            if(!value.known)return [unknown('Exit expression evaluation is unsupported; return versus evaluation failure is unresolved.',{...state,exitId:exit?.id})];
            return [{...state,kind:ts.isReturnStatement(n)?'return':'throw',value:value.value,exitId:exit?.id}];
        }
        if(ts.isVariableStatement(n)&&n.declarationList.flags&ts.NodeFlags.Const){
            const env=new Map(state.env);
            for(const d of n.declarationList.declarations){
                if(!ts.isIdentifier(d.name)||env.has(d.name.text))return [unknown('Destructured or shadowed binding is unsupported.',state)];
                const value=expression(d.initializer,env);if(!d.initializer||!value.known)return [unknown('Initializer evaluation is unsupported.',state)];
                env.set(d.name.text,value.value);
            }
            return [{...state,env}];
        }
        if(ts.isIfStatement(n)){
            const condition=record.conditions.find(c=>c.span.start===n.expression.getStart()&&c.span.end===n.expression.end);
            const value=expression(n.expression,state.env);
            if(value.known)return value.value?walk(n.thenStatement,state):n.elseStatement?walk(n.elseStatement,state):[state];
            // Only a simple uninitialized-by-this-analysis parameter can branch without
            // claiming arbitrary expression evaluation cannot throw.
            if(!ts.isIdentifier(n.expression)||!record.parameters.includes(n.expression.text))return [unknown('Condition evaluation is unsupported.',state)];
            return [true,false].flatMap(truth=>{
                const next={...state,conditions:[...state.conditions,{conditionId:condition.id,truth}]};
                return truth?walk(n.thenStatement,next):n.elseStatement?walk(n.elseStatement,next):[next];
            });
        }
        if(ts.isTryStatement(n)){
            let outcomes=walk(n.tryBlock,state);
            if(n.catchClause)outcomes=outcomes.flatMap(pending=>{
                if(pending.kind!=='throw')return [pending];
                const env=new Map(pending.env),binding=n.catchClause.variableDeclaration?.name;
                if(binding&&!ts.isIdentifier(binding))return [unknown('Catch destructuring is unsupported.',pending)];
                if(binding)env.set(binding.text,pending.value);
                return walk(n.catchClause.block,{kind:'normal',env,conditions:pending.conditions,handled:[...(pending.handled||[]),pending.exitId]}).map(s=>({...s,env:state.env}));
            });
            if(n.finallyBlock)outcomes=outcomes.flatMap(pending=>{
                if(pending.kind==='unresolved')return [pending];
                return walk(n.finallyBlock,{kind:'normal',env:new Map(pending.env),conditions:pending.conditions,handled:pending.handled}).map(final=>final.kind==='normal'?{...pending,conditions:final.conditions}:{...final,overridden:[...(pending.overridden||[]),...(pending.exitId?[pending.exitId]:[])]});
            });
            return outcomes;
        }
        return [unknown('Unsupported statement: '+ts.SyntaxKind[n.kind]+'.',state)];
    }
    let outcomes;
    const initial={kind:'normal',env:new Map(bindings),conditions:[]};
    if(record.generator||record.parameters.some(p=>!/^[$a-zA-Z_][$\w]*$/.test(p)))outcomes=[unknown('Generator execution or parameter initialization is unsupported.',initial)];
    else if(ts.isBlock(fn.body))outcomes=walk(fn.body,initial);
    else {
        const value=expression(fn.body,initial.env);
        outcomes=value.known?[{...initial,kind:'return',value:value.value,exitId:record.exits[0]?.id}]:[unknown('Arrow return expression evaluation is unsupported.',initial)];
    }
    const paths=outcomes.map(s=>({kind:s.kind==='normal'?'fallthrough':s.kind,conditions:s.conditions,exitId:s.exitId||null,handledExitIds:s.handled||[],overriddenExitIds:s.overridden||[],...(s.kind==='unresolved'?{reason:s.reason}:{result:typed(s.kind==='normal'?undefined:s.value)})}));
    return {version:VERSION,status:paths.some(p=>p.kind==='unresolved')?'partial':'derived',boundary:record.async?'async_body_completion_not_promise_settlement':'synchronous_body',paths,gaps:[...gaps],assumptions:'Body entry with parameters initialized. Unknown parameter conditions describe alternatives, not proven feasible paths. Ordinary unmodified JavaScript intrinsics for supported string operations. No source executed.'};
}
function exactOutcome(record){
    const completion=record.completion;
    if(record.generator||completion.status!=='derived'||completion.paths.length!==1||completion.paths[0].conditions.length)return {status:'unresolved',reason:'No single unconditional outcome established.'};
    const path=completion.paths[0];
    if(record.async&&!['string','number','boolean','null','undefined'].includes(path.result?.type))return {status:'unresolved',reason:'Async non-primitive result assimilation is unsupported.'};
    const kind=record.async?(path.kind==='throw'?'reject':'resolve'):(path.kind==='fallthrough'?'return':path.kind);
    return {status:'derived',kind,result:path.result,exitId:path.exitId,assumptions:completion.assumptions};
}
function completionReport(record){
    return {functionId:record.id,source:record.source,kind:'STATICALLY_DERIVED',...record.completion,finalOutcome:exactOutcome(record),
        outcomes:record.completion.paths.map(p=>({...p,meaning:p.kind==='unresolved'?'No final outcome established.':p.kind==='return'?'Returned body value; not an intermediate expression.':p.kind==='throw'?(record.async?'Explicit throw reaches the async body boundary; promise settlement is not evaluated.':'Explicit throw escapes the modeled synchronous body.'):'Body falls through with undefined.'}))};
}
module.exports={deriveCompletion,completionReport,exactOutcome,VERSION};
