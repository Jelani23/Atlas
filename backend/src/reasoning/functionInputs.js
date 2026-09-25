// Lexical references only. The compiler host cannot read files or load dependencies.
const ts=require('typescript');
function createInputInventory(ast,span){
    const host={getSourceFile:name=>name===ast.fileName?ast:undefined,getDefaultLibFileName:()=>'',writeFile:()=>{},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:name=>name===ast.fileName,readFile:()=>undefined,getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'};
    const program=ts.createProgram([ast.fileName],{allowJs:true,noLib:true,noResolve:true},host);
    const checker=program.getTypeChecker();
    let dynamic=false;
    function hazards(n){
        if(ts.isWithStatement(n)||(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='eval'))dynamic=true;
        ts.forEachChild(n,hazards);
    }
    hazards(ast);
    const enclosingFunction=n=>{for(let p=n.parent;p;p=p.parent)if(ts.isFunctionLike(p))return p;return null;};
    const within=(n,parent)=>{for(let p=n;p;p=p.parent)if(p===parent)return true;return false;};
    function reference(n){
        const p=n.parent;
        if((ts.isPropertyAccessExpression(p)&&p.name===n)||ts.isLabeledStatement(p)||ts.isBreakStatement(p)||ts.isContinueStatement(p))return false;
        if(ts.isBindingElement(p)&&p.propertyName===n)return false;
        if(p.name===n&&!ts.isShorthandPropertyAssignment(p))return false;
        return true;
    }
    function mode(n){
        const p=n.parent;
        if(ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&p.operatorToken.kind<=ts.SyntaxKind.LastAssignment)return p.operatorToken.kind===ts.SyntaxKind.EqualsToken?'write':'read_write';
        if((ts.isPrefixUnaryExpression(p)||ts.isPostfixUnaryExpression(p))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(p.operator))return 'read_write';
        return 'read';
    }
    return function inventory(fn){
        const references=[];
        function walk(n){
            if(n!==fn&&(ts.isFunctionLike(n)||ts.isClassDeclaration(n)||ts.isClassExpression(n)))return;
            if(ts.isIdentifier(n)&&reference(n)){
                const symbol=ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);
                const declarations=symbol?.declarations||[];
                let ownership='unresolved';
                if(!dynamic&&declarations.length===1){
                    const declaration=declarations[0];
                    if(within(declaration,fn))ownership=ts.isParameter(declaration)||(ts.isBindingElement(declaration)&&fn.parameters.some(p=>within(declaration,p)))?'parameter':'local';
                    else ownership=enclosingFunction(declaration)?'closure':'module';
                }
                references.push({name:n.text,access:mode(n),ownership,span:span(n),declarations:declarations.slice(0,4).map(span)});
            }
            if(n.kind===ts.SyntaxKind.ThisKeyword)references.push({name:'this',access:'read',ownership:'unresolved_receiver',span:span(n),declarations:[]});
            ts.forEachChild(n,walk);
        }
        for(const parameter of fn.parameters)walk(parameter);
        walk(fn.body);
        return {status:dynamic?'unresolved_dynamic_scope':'lexical_references',references,limits:['References do not establish runtime values, execution order, object ownership, aliasing or side effects of calls.','Unresolved names may be globals or missing bindings; built-in behavior is not assumed.','Nested function bodies and class initialization are inventoried separately or omitted.','Destructuring assignment effects are not classified; receiver references are reads even when a property is written.']};
    };
}
module.exports={createInputInventory};
