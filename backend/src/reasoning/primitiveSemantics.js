// Bounded expression rules. No eval, Function, module loading or source callbacks.
const ts=require('typescript');
const UNKNOWN=Symbol('unsupported');
function evaluate(node,file,parameter,value,blocked,depth=0,locals=new Map()){
    if(!node||depth>16)return UNKNOWN;
    const recur=n=>evaluate(n,file,parameter,value,blocked,depth+1,locals);
    if(ts.isParenthesizedExpression(node))return recur(node.expression);
    if(ts.isIdentifier(node))return node.text===parameter?value:locals.has(node.text)?locals.get(node.text):UNKNOWN;
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;
    if(ts.isNumericLiteral(node))return Number(node.text);
    if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
    if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
    if(node.kind===ts.SyntaxKind.NullKeyword)return null;
    if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken){const v=recur(node.operand);return v===UNKNOWN?UNKNOWN:!v;}
    if(ts.isBinaryExpression(node)){
        const left=recur(node.left);if(left===UNKNOWN)return UNKNOWN;
        const op=node.operatorToken.kind;
        if(op===ts.SyntaxKind.BarBarToken)return left||recur(node.right);
        if(op===ts.SyntaxKind.AmpersandAmpersandToken)return left?recur(node.right):left;
        const right=recur(node.right);if(right===UNKNOWN)return UNKNOWN;
        if(op===ts.SyntaxKind.EqualsEqualsEqualsToken)return left===right;
        if(op===ts.SyntaxKind.ExclamationEqualsEqualsToken)return left!==right;
        return UNKNOWN;
    }
    if(ts.isPropertyAccessExpression(node)&&node.name.text==='length'){
        const base=recur(node.expression);return typeof base==='string'||Array.isArray(base)?base.length:UNKNOWN;
    }
    if(!ts.isCallExpression(node)||node.questionDotToken)return UNKNOWN;
    if(ts.isIdentifier(node.expression)&&node.arguments.length===1&&!blocked.has(node.expression.text)){
        const arg=recur(node.arguments[0]);if(arg===UNKNOWN||!['string','number','boolean'].includes(typeof arg))return UNKNOWN;
        if(node.expression.text==='isNaN')return Number.isNaN(Number(arg));
        if(node.expression.text==='parseFloat')return Number.parseFloat(arg);
        if(node.expression.text==='Number')return Number(arg);
    }
    if(!ts.isPropertyAccessExpression(node.expression))return UNKNOWN;
    const receiver=recur(node.expression.expression);if(typeof receiver!=='string')return UNKNOWN;
    const name=node.expression.name.text,args=node.arguments;
    if(!args.length&&name==='trim')return receiver.trim();
    if(!args.length&&name==='toLowerCase')return receiver.toLowerCase();
    // Source regexes are never compiled. These are developer-authored exact rules.
    if(name==='split'&&args.length===1&&args[0].getText(file)==='/\\s+/')return receiver.split(/\s+/);
    if(name==='replace'&&args.length===2&&args[0].getText(file)==='/\\s/g'&&recur(args[1])==='')return receiver.replace(/\s/g,'');
    return UNKNOWN;
}
function encode(value){
    if(typeof value==='number')return {type:'number',value:Number.isNaN(value)?'NaN':Object.is(value,-0)?'-0':String(value)};
    return {type:Array.isArray(value)?'string-array':value===null?'null':typeof value,value};
}
function derivePrimitiveFacts(bundle,bindings){
    if(!Array.isArray(bindings)||bindings.length>4||!bundle.target)throw new Error('Semantic rules require an explicit target and at most four input bindings.');
    const target=bundle.symbols.find(s=>s.id===bundle.target.symbolId);
    if(!target)throw new Error('Semantic target unavailable.');
    const source=bundle.files.find(f=>f.path===target.span.path);
    // Projection preserves line numbers, but drops no lines or columns.
    const raw=source.source.split('\n').map(l=>l.replace(/^\d+: /,'')).join('\n');
    const file=ts.createSourceFile(source.path,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(file.parseDiagnostics.length)throw new Error('Semantic source could not be parsed.');
    const declarations=new Map(),writes=new Set(),blocked=new Set();let dynamic=false;
    const names=n=>{if(ts.isIdentifier(n))return [n.text];if(ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n))return n.elements.flatMap(e=>ts.isBindingElement(e)?names(e.name):[]);return [];};
    function scan(n){
        if(n.name&&(ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isImportSpecifier(n)||ts.isImportClause(n)||ts.isNamespaceImport(n)||ts.isClassDeclaration(n)))for(const name of names(n.name)){declarations.set(name,(declarations.get(name)||0)+1);blocked.add(name);}
        if(ts.isWithStatement(n)||(ts.isCallExpression(n)&&n.expression.getText(file)==='eval'))dynamic=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){if(ts.isPropertyAccessExpression(n.left)||ts.isElementAccessExpression(n.left))dynamic=true;const mark=x=>{if(ts.isIdentifier(x))writes.add(x.text);ts.forEachChild(x,mark);};mark(n.left);}
        if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator)&&ts.isIdentifier(n.operand))writes.add(n.operand.text);
        ts.forEachChild(n,scan);
    }
    scan(file);
    for(const name of writes)blocked.add(name);
    const facts=[],gaps=[],seen=new Set();
    for(const binding of bindings){
        if(Object.keys(binding).some(k=>!['inputId','parameter','arguments'].includes(k)))throw new Error('Unsupported semantic input binding.');
        const input=bundle.request.quotedInputs?.find(i=>i.id===binding.inputId);
        if(!input||!target.parameters.includes(binding.parameter)||seen.has(binding.inputId))throw new Error('Invalid semantic input binding.');
        seen.add(binding.inputId);
        const argumentsMap=binding.arguments===undefined?{}:binding.arguments;
        if(!argumentsMap||typeof argumentsMap!=='object'||Array.isArray(argumentsMap)||Object.keys(argumentsMap).length>8)throw new Error('Invalid semantic scenario arguments.');
        for(const [name,arg] of Object.entries(argumentsMap)){
            if(name===binding.parameter||!target.parameters.includes(name)||!(typeof arg==='string'&&arg.length<=2000||typeof arg==='number'&&Number.isFinite(arg)||typeof arg==='boolean'))throw new Error('Invalid semantic scenario argument.');
        }
        let value;try{value=JSON.parse(input.exactText);}catch{gaps.push('Only explicit JSON primitive inputs are supported.');continue;}
        if(!(typeof value==='string'&&value.length<=2000||typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')){gaps.push('Semantic input is not a supported bounded primitive.');continue;}
        if(dynamic||[binding.parameter,...Object.keys(argumentsMap)].some(name=>declarations.get(name)!==1||writes.has(name))){gaps.push('Dynamic, shadowed or written parameter; no expression result derived.');continue;}
        const candidates=new Map(bundle.facts.filter(f=>f.owner===target.id&&!f.clipped&&['binding','call','return','if'].includes(f.kind)).map(f=>[f.span.start,f]));
        const prefix=[];let targetNode;
        function findTarget(n){if(n.getStart(file)===target.span.start&&ts.isFunctionLike(n)&&n.body)targetNode=n;ts.forEachChild(n,findTarget);}
        findTarget(file);
        const localValues=new Map(Object.entries(argumentsMap)),support=[];
        // Enter only an initial try body, conditionally if reached; never infer catch/finally outcomes.
        let statements=targetNode&&ts.isBlock(targetNode.body)?targetNode.body.statements:[];
        if(statements.length&&ts.isTryStatement(statements[0]))statements=statements[0].tryBlock.statements;
        for(const statement of statements){
            if(ts.isIfStatement(statement)){
                prefix.push({start:statement.getStart(file),end:statement.expression.end,locals:new Map(localValues),support:[...support],guardEnd:statement.end});break;
            }
            if(ts.isReturnStatement(statement)){prefix.push({start:statement.getStart(file),end:statement.end,locals:new Map(localValues),support:[...support]});break;}
            if(!ts.isVariableStatement(statement)||!(statement.declarationList.flags&ts.NodeFlags.Const)||statement.declarationList.declarations.length!==1)break;
            const declaration=statement.declarationList.declarations[0];
            if(!ts.isIdentifier(declaration.name)||declarations.get(declaration.name.text)!==1||writes.has(declaration.name.text))break;
            const origin=candidates.get(declaration.getStart(file));
            const resolved=evaluate(declaration.initializer,file,binding.parameter,value,blocked,0,localValues);
            if(!origin||resolved===UNKNOWN)break;
            prefix.push({start:statement.getStart(file),end:statement.end,locals:new Map(localValues),support:[...support]});
            localValues.set(declaration.name.text,resolved);support.push(origin.id);
        }
        function visit(n){
            const origin=candidates.get(n.getStart(file));
            const expression=ts.isVariableDeclaration(n)?n.initializer:ts.isReturnStatement(n)||ts.isIfStatement(n)?n.expression:n;
            if(origin&&expression&&n.end===origin.span.end&&((origin.kind==='binding'&&ts.isVariableDeclaration(n))||(origin.kind==='return'&&ts.isReturnStatement(n))||(origin.kind==='call'&&ts.isCallExpression(n))||(origin.kind==='if'&&ts.isIfStatement(n)))){
                const context=prefix.find(p=>n.getStart(file)>=p.start&&(n.end<=p.end||ts.isIfStatement(n)&&n.end===p.guardEnd));
                const result=evaluate(expression,file,binding.parameter,value,blocked,0,context?.locals||new Map(Object.entries(argumentsMap)));
                if(result!==UNKNOWN&&JSON.stringify(encode(result)).length<=1200&&facts.length<12)facts.push({id:`semantic${facts.length}`,class:'STATICALLY_DERIVED',kind:'expression-result',rule:'bounded-primitive-expression-v3',owner:target.id,parentId:null,span:origin.span,relatedIds:[origin.id,...(context?.support||[])],inputId:input.id,parameter:binding.parameter,arguments:argumentsMap,result:encode(result),expressionText:expression.getText(file),expression:`For ${input.id} bound to ${binding.parameter}, additional arguments ${JSON.stringify(argumentsMap)}, this expression yields ${JSON.stringify(encode(result))} if reached.`,clipped:false,
                    assumptions:'Explicit JSON-decoded primary argument and recorded additional primitive arguments; ordinary unmodified JavaScript intrinsics; expression reached with the supplied parameter value. Not proof of reachability or the whole function return.'});
            }
            ts.forEachChild(n,visit);
        }
        visit(file);
    }
    return {facts,gaps};
}
module.exports={derivePrimitiveFacts,evaluate,UNKNOWN};
