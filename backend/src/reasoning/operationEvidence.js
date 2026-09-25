// Developer-authored operation rules. Source is parsed as data, never executed.
const ts=require('typescript');
function deriveOperationEvidence(bundle){
    const target=bundle.symbols.find(s=>s.id===bundle.target?.symbolId);
    if(!target)return [];
    const source=bundle.files.find(f=>f.path===target.span.path);
    const text=source.source.split('\n').map(l=>l.replace(/^\d+: /,'')).join('\n');
    const ast=ts.createSourceFile(source.path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(ast.parseDiagnostics.length)return [];
    let unsafe=false,setShadowed=false;
    function inspect(n){
        if(n.name&&(ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isClassExpression(n)||ts.isClassDeclaration(n)||ts.isImportClause(n)||ts.isImportSpecifier(n)||ts.isNamespaceImport(n))&&/\bSet\b/.test(n.name.getText(ast)))setShadowed=true;
        if(ts.isWithStatement(n)||ts.isCallExpression(n)&&n.expression.getText(ast)==='eval')unsafe=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)unsafe=true;
        ts.forEachChild(n,inspect);
    }
    inspect(ast);if(unsafe)return [];
    const originals=bundle.facts.filter(f=>f.owner===target.id&&!f.clipped);
    const results=[];
    function add(origin,rule,consequence,support=[]){
        if(results.length>=8)return;
        results.push({id:'operation'+results.length,class:'STATICALLY_DERIVED',kind:'operation-rule',owner:target.id,parentId:null,span:origin.span,relatedIds:[origin.id,...support],rule,expression:consequence,clipped:false,
            summary:rule==='ordinary-set-uniqueness'?'An ordinary Set keeps duplicate equal values only once, in first-insertion order. This applies to the processed values supplied to the Set.':rule==='string-whitespace-split'?'For string input, this split separates at runs of whitespace, including tabs and line breaks. Punctuation alone is not a separator. An empty string produces one empty element.':rule==='string-ascii-filter-removal'?'For string input, this replacement deletes characters outside lowercase ASCII letters, digits and whitespace. It does not insert spaces, so pieces separated only by punctuation can join together.':consequence.split(' The surrounding try')[0],
            assumptions:'Conditional on reaching this operation with the stated receiver type and ordinary unmodified JavaScript intrinsics. Not an executed test or whole-function result.'});
    }
    function visit(n){
        const origin=originals.find(f=>f.span.start===n.getStart(ast)&&f.span.end===n.end&&['call','construct'].includes(f.kind));
        if(origin&&ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='Set'&&!setShadowed){
            add(origin,'ordinary-set-uniqueness','Constructing this ordinary Set retains one entry per distinct value. Repeated equal strings become one entry; first insertion order is retained. This describes values supplied to the constructor, not necessarily the original input words.');
        }
        if(origin&&ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&!n.questionDotToken&&!n.expression.questionDotToken){
            const member=n.expression,receiver=member.expression.getText(ast);
            if(member.name.text==='split'&&n.arguments.length===1&&n.arguments[0].getText(ast)==='/\\s+/')add(origin,'string-whitespace-split','For a string receiver, this split uses one or more whitespace characters as separators. Punctuation alone is not a separator. Splitting the empty string yields one empty element.');
            if(member.name.text==='replace'&&n.arguments.length===2&&n.arguments[0].getText(ast)==='/[^a-z0-9\\s]/g'&&ts.isStringLiteral(n.arguments[1])&&n.arguments[1].text==='')add(origin,'string-ascii-filter-removal','For a string receiver, this replacement deletes characters other than lowercase ASCII letters, digits and whitespace. It does not insert spaces: punctuation between two retained characters joins them together.');
            if(ts.isIdentifier(member.expression)&&target.parameters.includes(receiver)){
                let parent=n.parent,handler=null;
                while(parent&&!ts.isFunctionLike(parent)){
                    if(ts.isTryStatement(parent)&&n.getStart(ast)>=parent.tryBlock.getStart(ast)&&n.end<=parent.tryBlock.end){handler=parent.catchClause; if(handler)break;}
                    parent=parent.parent;
                }
                const catchReturn=handler?.block.statements.length===1&&ts.isReturnStatement(handler.block.statements[0])?handler.block.statements[0]:null;
                const returnFact=catchReturn&&originals.find(f=>f.kind==='return'&&f.span.start===catchReturn.getStart(ast)&&f.span.end===catchReturn.end);
                let consequence=`If ${receiver} is undefined or null when this non-optional property access is reached, accessing ${member.name.text} throws TypeError before the method is called. An omitted ordinary parameter without a default starts as undefined.`;
                if(returnFact)consequence+=' The surrounding try has a catch whose body returns '+catchReturn.expression?.getText(ast)+'. The error message is runtime-dependent; an enclosing finally may override completion.';
                add(origin,'nullish-property-access',consequence,returnFact?[returnFact.id]:[]);
            }
        }
        ts.forEachChild(n,visit);
    }
    visit(ast);return results;
}
function selectOperations(ids,facts){
    if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)throw new Error('Invalid operation selection.');
    return ids.map(id=>{const fact=facts.find(f=>f.id===id);if(!fact)throw new Error('Unknown operation selection.');return fact;});
}
module.exports={deriveOperationEvidence,selectOperations};
