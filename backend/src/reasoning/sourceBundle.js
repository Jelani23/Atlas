// Reads and parses source as data. Never loads analyzed modules into Node.
const ts=require('typescript');
const path=require('node:path').posix;
const {readRange}=require('../core/sourceReader');
const VERSION=`source-bundle-2/ts-${ts.version}`;
function extract(source,prefix){
    if(!source.complete||source.clippedLine)throw new Error('Bundle requires complete source.');
    const text=source.text.split('\n').map((line,i)=>{
        if(!line && !source.text)return '';
        const m=/^(\d+): (.*)$/.exec(line);
        if(!m||Number(m[1])!==i+1)throw new Error('Noncontiguous bundle source.');
        return m[2];
    }).join('\n');
    const result={facts:[],symbols:[],imports:[],gaps:[]};
    if(source.path.endsWith('.json')){JSON.parse(text);result.gaps.push('JSON data; no JavaScript symbols.');return result;}
    const file=ts.createSourceFile(source.path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(file.parseDiagnostics.length)throw new Error('Source bundle parse failed.');
    const span=node=>({path:source.path,start:node.getStart(file),end:node.end,
        line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,
        endLine:file.getLineAndCharacterOfPosition(Math.max(node.getStart(file),node.end-1)).line+1});
    const add=(kind,node,owner,parentId,expression=node.getText(file))=>{
        if(result.facts.length>=80){result.gaps.push('Fact limit reached.');return null;}
        const id=`${prefix}:f${result.facts.length}`;
        result.facts.push({id,class:'SOURCE_OBSERVED',kind,owner,parentId,span:span(node),expression:expression.slice(0,300),clipped:expression.length>300});return id;
    };
    // Conservative: if require is declared anywhere, do not resolve its calls.
    let shadowedRequire=false;
    function bindings(n){
        if((ts.isVariableDeclaration(n)||ts.isParameter(n)||ts.isFunctionDeclaration(n))&&n.name && /\brequire\b/.test(n.name.getText(file)))shadowedRequire=true;
        ts.forEachChild(n,bindings);
    }
    bindings(file);
    function visit(node,owner=`${prefix}:module`,parentId=null){
        if(ts.isFunctionLike(node)&&node.body){
            const name=node.name?.getText(file)||node.parent?.name?.getText(file)||'<anonymous>';
            const id=`${prefix}:s${node.pos}`;
            result.symbols.push({id,name,owner,span:span(node),parameters:node.parameters.map(p=>p.getText(file))});owner=id;
            parentId=add('function',node,owner,parentId,name);
        }
        if(ts.isIfStatement(node)){
            const id=add('if',node,owner,parentId,node.expression.getText(file));
            if(id)result.facts.find(f=>f.id===id).hasElse=Boolean(node.elseStatement);
            visit(node.expression,owner,id);
            const yes=add('then',node.thenStatement,owner,id,'condition true');visit(node.thenStatement,owner,yes);
            if(node.elseStatement){const no=add('else',node.elseStatement,owner,id,'condition false');visit(node.elseStatement,owner,no);}return;
        }
        if(ts.isVariableDeclaration(node))add('binding',node,owner,parentId);
        if(ts.isReturnStatement(node))add('return',node,owner,parentId,node.expression?.getText(file)||'<undefined>');
        if(ts.isThrowStatement(node))add('throw',node,owner,parentId);
        if(ts.isAwaitExpression(node))add('await',node,owner,parentId);
        if(ts.isConditionalExpression(node))add('conditional',node,owner,parentId);
        if(ts.isBinaryExpression(node)){
            const op=node.operatorToken.kind;
            if([ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(op))add('short-circuit',node,owner,parentId);
            if(op===ts.SyntaxKind.EqualsToken)add('assignment',node,owner,parentId);
        }
        if(ts.isImportDeclaration(node)){
            const id=add('import',node,owner,parentId);
            if(ts.isStringLiteral(node.moduleSpecifier))result.imports.push({factId:id,specifier:node.moduleSpecifier.text});
        }
        if(ts.isNewExpression(node))add('construct',node,owner,parentId);
        if(ts.isCallExpression(node)){
            const id=add('call',node,owner,parentId);
            if(ts.isIdentifier(node.expression)&&node.expression.text==='require'){
                const arg=node.arguments[0];
                if(!shadowedRequire&&node.arguments.length===1&&arg&&ts.isStringLiteral(arg))result.imports.push({factId:id,specifier:arg.text});
                else result.gaps.push('Dynamic or shadowed require not resolved.');
            }
        }
        if(ts.isIterationStatement(node,false)||ts.isTryStatement(node)||ts.isSwitchStatement(node))result.gaps.push('Loop/try/switch control flow not derived.');
        ts.forEachChild(node,child=>visit(child,owner,parentId));
    }
    visit(file);result.gaps=[...new Set(result.gaps)];return result;
}
async function buildBundle(source,{read=readRange,question='',agentId,maxChars=16000,cancelled=()=>{}}={}){
    const bundle={version:VERSION,project:'atlas',agentId,request:{exactText:question},files:[],symbols:[],facts:[],dependencies:[],coverage:{callers:'not_inspected',dataFlow:'syntax_only',gaps:[]}};
    const sources=[];
    function include(s){
        const parsed=extract(s,`v${bundle.files.length}`);
        const entry={path:s.path,version:s.version,complete:true,source:s.text};
        const candidate={...bundle,files:[...bundle.files,entry],symbols:[...bundle.symbols,...parsed.symbols],facts:[...bundle.facts,...parsed.facts]};
        if(bundle.files.length && JSON.stringify(candidate).length>maxChars){
            // Keep complete dependency source when its detailed map will not fit.
            // Function declarations stand alone; do not leave dangling branch IDs.
            candidate.facts=[...bundle.facts,...parsed.facts.filter(f=>f.kind==='function').map(f=>({...f,parentId:null}))];
            parsed.gaps.push('Dependency body facts omitted for budget; complete source and function declarations included.');
        }
        if(JSON.stringify(candidate).length>maxChars)throw new Error('Evidence bundle budget exceeded.');
        bundle.files=candidate.files;bundle.symbols=candidate.symbols;bundle.facts=candidate.facts;
        bundle.coverage.gaps.push(...parsed.gaps.map(reason=>({path:s.path,reason})));sources.push({path:s.path,version:s.version});return parsed;
    }
    cancelled();const root=include(source);
    for(const imp of root.imports){
        cancelled();const edge={...imp,from:source.path,status:'unresolved'};bundle.dependencies.push(edge);
        if(!imp.specifier.startsWith('.')){edge.reason='External dependency not inspected.';continue;}
        const base=path.normalize(path.join(path.dirname(source.path),imp.specifier));
        if(!base.startsWith('src/')){edge.reason='Outside source boundary.';continue;}
        const candidates=path.extname(base)?[base]:[base+'.js',base+'.json',base+'/index.js'];
        const existing=bundle.files.find(f=>candidates.includes(f.path));
        if(existing){edge.status='source_included';edge.target=existing.path;continue;}
        if(bundle.files.length>=3){edge.reason='Dependency file limit.';continue;}
        for(const candidate of candidates){
            try{
                const dep=await read(candidate,1,200);cancelled();const parsed=include(dep);
                edge.status='source_included';edge.target=dep.path;
                // One hop only. A read is not proof of binding/call resolution.
                if(parsed.imports.length)bundle.coverage.gaps.push({path:dep.path,reason:'Transitive imports not expanded.'});
                break;
            }catch(error){cancelled();edge.reason=/budget|complete|parse/i.test(error.message)?error.message:'Dependency source unavailable.';if(/budget|complete|parse/i.test(error.message))break;}
        }
    }
    bundle.coverage.bindingResolution='Subset: unique unwritten top-level functions and const destructured CommonJS imports with plain module.exports objects. Other call targets remain unresolved.';
    bundle.coverage.dataFlow='Syntax plus direct top-level guard-return relationships; no input evaluation.';
    for(const relation of require('./staticRelations').deriveRelations(bundle)){
        bundle.facts.push(relation);
        if(JSON.stringify(bundle).length>maxChars-150){bundle.facts.pop();bundle.coverage.gaps.push({reason:'Static relation budget reached.'});break;}
    }
    if(JSON.stringify(bundle).length>maxChars)throw new Error('Evidence bundle budget exceeded.');
    return {bundle,async assertCurrent(){for(const s of sources){cancelled();const current=await read(s.path,1,200,s.version);if(current.version!==s.version)throw new Error('Bundle source changed.');}}};
}
function citableFacts(bundle){
    const facts=new Map(bundle.facts.map(f=>[f.id,f]));
    const valid=(id,seen=new Set())=>{
        const fact=facts.get(id);
        if(!fact||fact.clipped||seen.has(id))return false;
        const next=new Set(seen);next.add(id);
        return (fact.relatedIds||[]).every(ref=>valid(ref,next));
    };
    return bundle.facts.filter(f=>valid(f.id));
}
function bindClaims(answer,bundle){
    const facts=new Map(citableFacts(bundle).map(f=>[f.id,f]));
    if(!Array.isArray(answer.claims)||!answer.claims.length||answer.claims.length>5)throw new Error('Invalid evidence claims.');
    return answer.claims.map(c=>{
        if(typeof c.text!=='string'||!c.text.trim()||c.text.length>2000||!Array.isArray(c.evidenceIds)||!c.evidenceIds.length||c.evidenceIds.length>6)throw new Error('Invalid evidence claim.');
        const citations=[],seen=new Set();
        const cite=id=>{
            const fact=facts.get(id);if(!fact)throw new Error('Unknown or clipped evidence reference.');
            if(seen.has(id))return;seen.add(id);
            const span={...fact.span,version:bundle.files?.find(f=>f.path===fact.span.path)?.version};
            if(!citations.some(s=>s.path===span.path&&s.start===span.start&&s.end===span.end))citations.push(span);
            for(const ref of fact.relatedIds||[])cite(ref);
        };
        c.evidenceIds.forEach(cite);
        return {text:c.text,evidenceIds:c.evidenceIds,status:'MODEL_INFERRED',citations};
    });
}
module.exports={extract,buildBundle,bindClaims,citableFacts,VERSION};
