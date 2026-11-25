// Conditional authored semantics; no analyzed expression is executed.
const ts=require('typescript');
function describeTransformation(node,inputs){
    if(!inputs||inputs.status!=='lexical_references')return null;
    let conversion=node,trim=false;
    if(ts.isCallExpression(node)&&!node.questionDotToken&&node.arguments.length===0&&ts.isPropertyAccessExpression(node.expression)&&!node.expression.questionDotToken&&node.expression.name.text==='trim'){
        trim=true;conversion=node.expression.expression;
    }
    if(!ts.isCallExpression(conversion)||conversion.questionDotToken||!ts.isIdentifier(conversion.expression)||conversion.expression.text!=='String'||conversion.arguments.length!==1)return null;
    const binding=inputs.references.find(r=>r.span.start===conversion.expression.getStart());
    if(!binding||binding.ownership!=='unresolved'||binding.declarations.length)return null;
    let argument=conversion.arguments[0],fallback=false;
    if(ts.isBinaryExpression(argument)&&argument.operatorToken.kind===ts.SyntaxKind.BarBarToken&&ts.isStringLiteral(argument.right)&&argument.right.text===''){
        fallback=true;argument=argument.left;
    }
    if(!ts.isIdentifier(argument))return null;
    let hazard=false;
    function inspect(n){
        if(ts.isWithStatement(n)||ts.isCallExpression(n)&&n.expression.getText()==='eval')hazard=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&(n.left.getText().includes('String')||n.left.getText().includes('prototype')))hazard=true;
        if(ts.isCallExpression(n)&&/^(Object|Reflect)\.(defineProperty|defineProperties|setPrototypeOf|set)$/.test(n.expression.getText()))hazard=true;
        ts.forEachChild(n,inspect);
    }
    inspect(node.getSourceFile());
    if(hazard)return null;
    return {rule:'standard-string-conversion'+(fallback?'-falsy-fallback':'')+(trim?'-trim':''),input:argument.text,fallback,trim,resultType:'string',assumption:'String and string methods have their standard built-in behavior; conversion completes normally.'};
}
function explainTransformation(fact,name){
    const words=s=>s.replace(/([a-z0-9])([A-Z])/g,'$1 $2');
    return (fact.fallback?`Uses an empty string when ${words(fact.input)} is falsy; otherwise converts it to text`:`Converts ${words(fact.input)} to text`)+(fact.trim?', then removes whitespace from both ends':'')+`, storing the resulting string in ${words(name)}.`;
}
module.exports={describeTransformation,explainTransformation};
