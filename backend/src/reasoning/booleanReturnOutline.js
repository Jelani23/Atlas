// Structural return rules, not execution or resolution of the leaf expressions.
const ts=require('typescript');
function spokenExpression(n){
    const words=text=>text.replace(/([a-z0-9])([A-Z])/g,'$1 $2');
    if(ts.isParenthesizedExpression(n))return spokenExpression(n.expression);
    if(ts.isIdentifier(n))return words(n.text);
    if(ts.isStringLiteral(n))return 'the string '+JSON.stringify(n.text);
    if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression))return words(n.expression.text)+'’s '+words(n.name.text)+' property';
    if(ts.isCallExpression(n)){
        const callee=n.expression;
        if(ts.isPropertyAccessExpression(callee))return 'the result of the '+words(callee.name.text)+' call';
        if(ts.isIdentifier(callee))return 'the result of the '+words(callee.text)+' call';
    }
    return n.getText();
}
function deriveBooleanReturn(fn,span){
    if(fn.asteriskToken||fn.parameters.some(p=>!ts.isIdentifier(p.name)||p.initializer))return null;
    const body=fn.body;
    const expression=ts.isBlock(body)?body.statements.length===1&&ts.isReturnStatement(body.statements[0])?body.statements[0].expression:null:body;
    if(!expression)return null;
    let count=0;
    function parse(n,depth=0){
        if(++count>24||depth>8)return null;
        if(ts.isParenthesizedExpression(n))return parse(n.expression,depth+1);
        if(n.kind===ts.SyntaxKind.TrueKeyword||n.kind===ts.SyntaxKind.FalseKeyword)return {kind:'constant',value:n.kind===ts.SyntaxKind.TrueKeyword};
        if(ts.isPrefixUnaryExpression(n)&&n.operator===ts.SyntaxKind.ExclamationToken){
            if(n.operand.getText().length>180)return null;
            return {kind:'falsy',expression:n.operand.getText(),spokenExpression:spokenExpression(n.operand)};
        }
        if(!ts.isBinaryExpression(n))return null;
        const op=n.operatorToken.kind;
        if([ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(op)){
            if(n.left.getText().length+n.right.getText().length>180)return null;
            return {kind:op===ts.SyntaxKind.EqualsEqualsEqualsToken?'equal':'unequal',left:n.left.getText(),right:n.right.getText(),spokenLeft:spokenExpression(n.left),spokenRight:spokenExpression(n.right)};
        }
        if(![ts.SyntaxKind.BarBarToken,ts.SyntaxKind.AmpersandAmpersandToken].includes(op))return null;
        const left=parse(n.left,depth+1),right=parse(n.right,depth+1);
        // JS && and || return operands. Only compose independently Boolean operands.
        return left&&right?{kind:op===ts.SyntaxKind.BarBarToken?'or':'and',left,right}:null;
    }
    const condition=parse(expression);
    return condition?{version:'boolean-return-1',kind:'structural_boolean_return',condition,async:Boolean(fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)),span:span(expression),assumptions:['Describes the result only if evaluation completes normally. Leaf calls, property access, coercion and possible exceptions are not resolved.']}:null;
}
function describe(n,spoken=false){
    if(n.kind==='constant')return String(n.value);
    if(n.kind==='falsy')return spoken?n.spokenExpression+' is falsy':'the value of `'+n.expression+'` is falsy';
    if(n.kind==='equal'||n.kind==='unequal')return (spoken?n.spokenLeft:'`'+n.left+'`')+' '+(n.kind==='equal'?'strictly equals':'does not strictly equal')+' '+(spoken?n.spokenRight:'`'+n.right+'`');
    return '('+describe(n.left,spoken)+') '+(n.kind==='or'?'or':'and')+' ('+describe(n.right,spoken)+')';
}
function presentBooleanReturn(outline){
    if(!outline)return [];
    const condition=outline.condition;
    const action=outline.async?'returns a promise that fulfills with':'returns';
    const text=condition.kind==='constant'?`If evaluation completes normally, this function ${action} ${condition.value}.`:`If evaluation completes normally, this function ${action} true when ${describe(condition)}. Otherwise, it ${action} false.`;
    const speech=condition.kind==='constant'?text:`If evaluation completes normally, this function ${action} true when ${describe(condition,true)}. Otherwise, it ${action} false.`;
    const claims=[{text,speech,citations:[outline.span],lines:[outline.span.line]}];
    if(['or','and'].includes(condition.kind))claims.push({text:`The left condition is evaluated first. The right condition is evaluated only when the left is ${condition.kind==='or'?'false':'true'}.`,citations:[outline.span],lines:[outline.span.line]});
    claims.push({text:'This establishes the Boolean return rule; it does not establish the behavior of calls or property access inside that rule.',citations:[outline.span],lines:[outline.span.line]});
    return claims;
}
module.exports={deriveBooleanReturn,presentBooleanReturn};
