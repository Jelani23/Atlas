// Projection only: the full read/version manifest remains owned by the builder.
const ts=require('typescript');
function scopeBundle(bundle,name){
    const root=bundle.files[0];
    const matches=bundle.symbols.filter(s=>s.span.path===root.path&&s.name===name);
    if(matches.length!==1)throw new Error('Target symbol must resolve uniquely in the selected file.');
    const target=matches[0];
    if(!target.owner.endsWith(':module'))throw new Error('Nested symbol selection requires enclosing-context support.');
    const selected=new Set([target.id]);
    let changed=true;
    while(changed){
        changed=false;
        for(const symbol of bundle.symbols)if(selected.has(symbol.owner)&&!selected.has(symbol.id)){selected.add(symbol.id);changed=true;}
        for(const fact of bundle.facts){
            if(fact.rule!=='unique-unwritten-top-level-call-binding'||!selected.has(fact.owner))continue;
            for(const id of fact.relatedIds){const next=bundle.facts.find(f=>f.id===id&&f.kind==='function');if(next&&!selected.has(next.owner)){selected.add(next.owner);changed=true;}}
        }
    }
    const raw=root.source.split('\n').map(l=>l.replace(/^\d+: /,'')).join('\n');
    const ast=ts.createSourceFile(root.path,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const eligible=ast.statements.some(s=>
        ts.isFunctionDeclaration(s)&&s.getStart(ast)===target.span.start ||
        ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))&&d.initializer.getStart(ast)===target.span.start));
    if(!eligible)throw new Error('Target scoping currently supports top-level function declarations and variable-bound functions only.');
    const ranges=bundle.symbols.filter(s=>s.span.path===root.path&&selected.has(s.id)).map(s=>[s.span.start,s.span.end]);
    // Keep module initialization/configuration, but exclude export wiring and
    // unrelated function declarations. Mixed declarations remain visible.
    for(const statement of ast.statements){
        if(ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement))continue;
        if(ts.isExpressionStatement(statement)&&ts.isBinaryExpression(statement.expression)&&/^(?:module\.exports|exports\.)/.test(statement.expression.left.getText(ast)))continue;
        if(ts.isVariableStatement(statement)&&statement.declarationList.declarations.every(d=>d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))))continue;
        ranges.push([statement.getStart(ast),statement.end]);
    }
    const inside=span=>span.path!==root.path||ranges.some(([start,end])=>span.start>=start&&span.end<=end);
    const facts=bundle.facts.filter(f=>inside(f.span));
    const ids=new Set(facts.map(f=>f.id));
    const masked=raw.split('').map((c,i)=>c==='\n'||ranges.some(([a,b])=>i>=a&&i<b)?c:' ').join('');
    const source=masked.split('\n').map((line,i)=>`${i+1}: ${line}`).join('\n');
    return {...bundle,target:{symbolId:target.id,name,path:root.path,mode:'symbol_source'},
        files:bundle.files.map(f=>f===root?{...f,complete:false,source,coverage:'Projected source excerpts; original line numbers retained.'}:f),
        symbols:bundle.symbols.filter(s=>inside(s.span)),
        facts:facts.map(f=>f.parentId&&!ids.has(f.parentId)?{...f,parentId:null,scopeBoundary:true}:f),
        coverage:{...bundle.coverage,omittedSymbols:bundle.symbols.filter(s=>s.span.path===root.path&&!inside(s.span)).map(s=>({id:s.id,name:s.name})),gaps:[...bundle.coverage.gaps,{path:root.path,reason:'Symbol projection excludes unselected functions and export wiring. Only statically resolved helpers are retained; unresolved helpers may be missing. Module initialization and inspected dependency source remain context; no caller behavior inferred.'}]}};
}
module.exports={scopeBundle};
