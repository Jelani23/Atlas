// Unified source-derived inventory. This module never loads or executes analyzed code.
const ts=require('typescript');
const crypto=require('node:crypto');
const VERSION=`function-behavior-5/ts-${ts.version}`;
function buildFunctionRecords(bundle){
    const manifest=bundle.files.map(f=>({path:f.path,version:f.version})).sort((a,b)=>a.path.localeCompare(b.path));
    const records=[];
    for(const source of bundle.files){
        if(!source.complete)throw new Error('Function records require complete, unprojected source.');
        if(!/^[a-f0-9]{64}$/.test(source.version))throw new Error('Function records require a source version.');
        if(source.path.endsWith('.json'))continue;
        const text=source.source.split('\n').map((line,i)=>{
            const match=/^(\d+): (.*)$/.exec(line);
            if(!match||Number(match[1])!==i+1)throw new Error('Function record source must be contiguous.');
            return match[2];
        }).join('\n');
        const ast=ts.createSourceFile(source.path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
        if(ast.parseDiagnostics.length)throw new Error('Function record source could not be parsed.');
        const span=n=>({path:source.path,version:source.version,start:n.getStart(ast),end:n.end,line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,endLine:ast.getLineAndCharacterOfPosition(Math.max(n.getStart(ast),n.end-1)).line+1});
        const symbols=bundle.symbols.filter(s=>s.span.path===source.path);
        const inputInventory=require('./functionInputs').createInputInventory(ast,span);
        function collect(fn){
            if(ts.isFunctionLike(fn)&&fn.body){
                const symbol=symbols.find(s=>s.span.start===fn.getStart(ast)&&s.span.end===fn.end);
                const id=source.path+':'+fn.getStart(ast);
                const record={schema:1,analyzerVersion:VERSION,id,symbolId:symbol?.id||null,name:fn.name?.getText(ast)||fn.parent?.name?.getText(ast)||'<anonymous>',
                    source:span(fn),async:Boolean(fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)),generator:Boolean(fn.asteriskToken),parameters:fn.parameters.map(p=>p.getText(ast)),
                    provenance:{kind:'SOURCE_OBSERVED',manifest,unresolvedDependencies:bundle.dependencies.filter(d=>d.status!=='source_included')},
                    conditions:[],exceptionRegions:[],exits:[],calls:[],stateAccessCandidates:[],
                    derivedEvidence:[],executedObservations:[],modelInterpretations:[],
                    coverage:{paths:'structural_enclosures_only',completion:'unresolved',stateAccess:'syntactic_candidates_not_external_state_resolution',gaps:['Path feasibility and fallthrough are not derived.','Implicit exceptions, asynchronous rejection propagation and finally overrides are not resolved.','Parameter initializer effects and lexical read/write ownership are not resolved.']}};
                const handlers=regions=>regions.slice().reverse().filter(r=>r.part==='try'&&record.exceptionRegions.find(e=>e.id===r.id)?.catchSpan).map(r=>r.id);
                function exit(n,kind,expression,conditions,regions){record.exits.push({id:id+':exit'+record.exits.length,kind,expression,expressionStatus:'source_expression_not_evaluated',span:span(n),conditions:[...conditions],regions:[...regions],handlerCandidates:handlers(regions),completion:'unresolved'});}
                function walk(n,conditions=[],regions=[]){
                    if(n!==fn&&ts.isFunctionLike(n))return;
                    if(ts.isClassDeclaration(n)||ts.isClassExpression(n)){record.coverage.gaps.push('Class initialization effects are not expanded.');return;}
                    if(ts.isIfStatement(n)){
                        const condition={id:id+':condition'+record.conditions.length,expression:n.expression.getText(ast),span:span(n.expression)};record.conditions.push(condition);
                        walk(n.expression,conditions,regions);
                        walk(n.thenStatement,[...conditions,{id:condition.id,branch:'then'}],regions);
                        if(n.elseStatement)walk(n.elseStatement,[...conditions,{id:condition.id,branch:'else'}],regions);
                        return;
                    }
                    if(ts.isTryStatement(n)){
                        const region={id:id+':region'+record.exceptionRegions.length,span:span(n),trySpan:span(n.tryBlock),catchSpan:n.catchClause?span(n.catchClause):null,catchBinding:n.catchClause?.variableDeclaration?.name.getText(ast)||null,finallySpan:n.finallyBlock?span(n.finallyBlock):null};
                        record.exceptionRegions.push(region);
                        walk(n.tryBlock,conditions,[...regions,{id:region.id,part:'try'}]);
                        if(n.catchClause)walk(n.catchClause.block,conditions,[...regions,{id:region.id,part:'catch'}]);
                        if(n.finallyBlock)walk(n.finallyBlock,conditions,[...regions,{id:region.id,part:'finally'}]);
                        return;
                    }
                    if(ts.isReturnStatement(n))exit(n,'return',n.expression?.getText(ast)||null,conditions,regions);
                    if(ts.isThrowStatement(n))exit(n,'throw',n.expression.getText(ast),conditions,regions);
                    if(ts.isCallExpression(n)||ts.isNewExpression(n)){
                        const origin=bundle.facts.find(f=>f.span.path===source.path&&f.span.start===n.getStart(ast)&&f.span.end===n.end&&['call','construct'].includes(f.kind));
                        const relation=origin&&bundle.facts.find(f=>f.rule==='unique-unwritten-top-level-call-binding'&&f.relatedIds.includes(origin.id));
                        record.calls.push({id:id+':call'+record.calls.length,kind:ts.isNewExpression(n)?'construct':'call',callee:n.expression.getText(ast),arguments:n.arguments?.map(a=>a.getText(ast))||[],span:span(n),conditions:[...conditions],regions:[...regions],handlerCandidates:handlers(regions),resolution:relation?{status:'statically_linked',evidenceId:relation.id,relatedIds:relation.relatedIds}:{status:'unresolved'}});
                    }
                    if(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))record.stateAccessCandidates.push({kind:'property_access',expression:n.getText(ast),span:span(n),ownership:'unresolved'});
                    if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)record.stateAccessCandidates.push({kind:'assignment',expression:n.getText(ast),span:span(n),ownership:'unresolved'});
                    if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator)||ts.isDeleteExpression(n))record.stateAccessCandidates.push({kind:'mutation',expression:n.getText(ast),span:span(n),ownership:'unresolved'});
                    if(ts.isIterationStatement(n,false)||ts.isSwitchStatement(n)||ts.isConditionalExpression(n)||ts.isAwaitExpression(n)||ts.isYieldExpression(n))record.coverage.gaps.push('Loop, switch, expression branching or suspension encountered; no complete path claim.');
                    ts.forEachChild(n,c=>walk(c,conditions,regions));
                }
                if(ts.isBlock(fn.body))walk(fn.body);
                else {exit(fn.body,'return',fn.body.getText(ast),[],[]);walk(fn.body);}
                record.coverage.gaps=[...new Set(record.coverage.gaps)];
                record.inputs=inputInventory(fn);
                record.booleanReturn=require('./booleanReturnOutline').deriveBooleanReturn(fn,span);
                record.coverage.stateAccess='lexical_reference_inventory_with_unresolved_property_effects';
                record.coverage.gaps=record.coverage.gaps.filter(g=>!g.includes('lexical read/write ownership'));
                record.coverage.gaps.push('Lexical bindings do not establish runtime values, parameter initializer effects, aliases or call side effects.');
                record.derivedEvidence=bundle.facts.filter(f=>symbol&&f.owner===symbol.id&&f.class==='STATICALLY_DERIVED'&&f.inputId===undefined).map(f=>({id:f.id,rule:f.rule,relatedIds:f.relatedIds,assumptions:f.assumptions||null}));
                record.completion=require('./functionCompletion').deriveCompletion(fn,record);
                record.coverage.completion=record.completion.status;
                record.cacheKey=crypto.createHash('sha256').update(JSON.stringify({bundleVersion:bundle.version,record})).digest('hex');
                if(JSON.stringify(record).length>64000)throw new Error('Function record exceeds bounded inventory size.');
                records.push(record);
                if(records.length>128)throw new Error('Function record count limit exceeded.');
            }
            ts.forEachChild(fn,collect);
        }
        collect(ast);
    }
    return {schema:1,analyzerVersion:VERSION,records};
}
module.exports={buildFunctionRecords,VERSION};
