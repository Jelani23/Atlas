// Conservative syntax relations, not runtime dispatch or general execution proofs.
const ts=require('typescript');
function analyze(file){
    const raw=file.source.split('\n').map(l=>l.replace(/^\d+: /,'')).join('\n');
    const ast=ts.createSourceFile(file.path,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const names=new Map(),writes=new Set(),calls=[],functions=new Map(),imports=[];
    let dynamicScope=false;
    const declare=(name,node)=>{if(ts.isIdentifier(name)){const a=names.get(name.text)||[];a.push(node);names.set(name.text,a);}else if(ts.isObjectBindingPattern(name)||ts.isArrayBindingPattern(name))for(const e of name.elements)if(ts.isBindingElement(e))declare(e.name,node);};
    function walk(n){
        if((ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isClassDeclaration(n)||ts.isImportClause(n)||ts.isImportSpecifier(n)||ts.isNamespaceImport(n))&&n.name)declare(n.name,n);
        if(ts.isWithStatement(n)||(ts.isCallExpression(n)&&n.expression.getText(ast)==='eval'))dynamicScope=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment){
            const mark=x=>{if(ts.isIdentifier(x))writes.add(x.text);ts.forEachChild(x,mark);};mark(n.left);
        }
        if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator)&&ts.isIdentifier(n.operand))writes.add(n.operand.text);
        if(ts.isCallExpression(n))calls.push(n);
        ts.forEachChild(n,walk);
    }
    walk(ast);
    const stable=name=>!dynamicScope&&names.get(name)?.length===1&&!writes.has(name);
    for(const statement of ast.statements){
        if(ts.isFunctionDeclaration(statement)&&statement.name&&stable(statement.name.text))functions.set(statement.name.text,statement);
        if(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const))for(const d of statement.declarationList.declarations){
            if(ts.isIdentifier(d.name)&&stable(d.name.text)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))functions.set(d.name.text,d.initializer);
            const init=d.initializer;
            if(init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&init.expression.text==='require'&&!names.has('require')&&!writes.has('require')&&init.arguments.length===1&&ts.isStringLiteral(init.arguments[0])&&ts.isObjectBindingPattern(d.name)){
                for(const binding of d.name.elements)if(!binding.dotDotDotToken&&!binding.initializer&&ts.isIdentifier(binding.name)&&(!binding.propertyName||ts.isIdentifier(binding.propertyName))&&stable(binding.name.text))imports.push({local:binding.name.text,exported:binding.propertyName?.text||binding.name.text,specifier:init.arguments[0].text,node:d});
            }
        }
    }
    // Only one plain top-level module.exports object assignment is supported.
    // Any other use of exports/module makes the export mapping unknown.
    const exports=new Map();let exportObject,exportUses=0;
    function scanExports(n){
        if(ts.isIdentifier(n)&&['module','exports'].includes(n.text))exportUses++;
        ts.forEachChild(n,scanExports);
    }
    scanExports(ast);
    for(const statement of ast.statements){
        if(!ts.isExpressionStatement(statement)||!ts.isBinaryExpression(statement.expression))continue;
        const b=statement.expression;
        if(b.operatorToken.kind===ts.SyntaxKind.EqualsToken&&b.left.getText(ast)==='module.exports'&&ts.isObjectLiteralExpression(b.right))exportObject=b.right;
    }
    if(exportObject&&exportUses===2&&!names.has('module')&&!names.has('exports')){
        const entries=[];let valid=true;
        for(const p of exportObject.properties){
            if(ts.isShorthandPropertyAssignment(p))entries.push([p.name.text,p.name.text]);
            else if(ts.isPropertyAssignment(p)&&ts.isIdentifier(p.name)&&ts.isIdentifier(p.initializer))entries.push([p.name.text,p.initializer.text]);
            else valid=false;
        }
        if(valid&&new Set(entries.map(e=>e[0])).size===entries.length)for(const [key,name] of entries)if(functions.has(name))exports.set(key,functions.get(name));
    }
    return {ast,functions,imports,exports,calls,stable};
}
function deriveRelations(bundle){
    const modules=new Map(bundle.files.filter(f=>f.path.endsWith('.js')).map(f=>[f.path,analyze(f)]));
    const relations=[];
    const factAt=(path,node,kind)=>bundle.facts.find(f=>f.span.path===path&&f.span.start===node.getStart()&&f.kind===kind&&!f.clipped);
    function add(rule,origin,relatedIds,detail){
        if(!origin||relatedIds.some(id=>!id))return;
        relations.push({id:`r${relations.length}`,class:'STATICALLY_DERIVED',kind:'relation',rule,owner:origin.owner,parentId:null,span:origin.span,relatedIds:[origin.id,...relatedIds],expression:detail,clipped:false,
            assumptions:'Static source relationship only; not runtime invocation, purity, or branch outcome.'});
    }
    for(const [file,m] of modules){
        for(const call of m.calls){
            if(!ts.isIdentifier(call.expression)||!m.stable(call.expression.text))continue;
            const name=call.expression.text;let target=m.functions.get(name),targetFile=file;
            if(!target){
                const imp=m.imports.find(i=>i.local===name);
                const edge=imp&&bundle.dependencies.find(e=>e.from===file&&e.specifier===imp.specifier&&e.status==='source_included');
                if(edge&&edge.target!==file){target=modules.get(edge.target)?.exports.get(imp.exported);targetFile=edge.target;}
            }
            const destination=target&&factAt(targetFile,target,'function');
            if(destination)add('unique-unwritten-top-level-call-binding',factAt(file,call,'call'),[destination.id],`${name} is statically bound to ${targetFile}:${destination.span.line}.`);
        }
        for(const fn of m.functions.values()){
            if(!fn.body||!ts.isBlock(fn.body))continue;
            const statements=fn.body.statements;
            for(let i=0;i<statements.length-1;i++){
                const guard=statements[i];if(!ts.isIfStatement(guard)||guard.elseStatement)continue;
                const branch=ts.isBlock(guard.thenStatement)?guard.thenStatement.statements:[guard.thenStatement];
                if(branch.length!==1||!ts.isReturnStatement(branch[0]))continue;
                const ret=factAt(file,branch[0],'return'),condition=factAt(file,guard,'if');
                if(ret&&condition)add('direct-guard-return-skips-later-statements',condition,[ret.id],`If this condition is truthy and its return completes, later statements in this function body are not reached. Next statement starts on line ${m.ast.getLineAndCharacterOfPosition(statements[i+1].getStart()).line+1}. This does not determine the condition for a particular input.`);
            }
        }
    }
    return relations;
}
module.exports={deriveRelations};
