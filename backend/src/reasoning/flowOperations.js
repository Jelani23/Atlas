// Narrow source-linked operation relationships. Never runs source regexes/callbacks.
const ts=require('typescript');
function lengthCondition(node,stringNames){
    if(!ts.isBinaryExpression(node)||!ts.isPropertyAccessExpression(node.left)||node.left.questionDotToken||node.left.name.text!=='length'||!ts.isIdentifier(node.left.expression)||!stringNames.has(node.left.expression.text)||!ts.isNumericLiteral(node.right))return null;
    const relation=new Map([[ts.SyntaxKind.LessThanToken,'less than'],[ts.SyntaxKind.LessThanEqualsToken,'at most'],[ts.SyntaxKind.GreaterThanToken,'greater than'],[ts.SyntaxKind.GreaterThanEqualsToken,'at least'],[ts.SyntaxKind.EqualsEqualsEqualsToken,'equal to'],[ts.SyntaxKind.ExclamationEqualsEqualsToken,'not equal to']]).get(node.operatorToken.kind);
    return relation?`${node.left.expression.text}’s length is ${relation} ${Number(node.right.text)}`:null;
}
function regexSome(node,inputs,span){
    if(inputs?.status!=='lexical_references')return null;
    const negated=ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken;
    const call=negated?node.operand:node;
    if(!ts.isCallExpression(call)||call.questionDotToken||call.arguments.length!==1||!ts.isPropertyAccessExpression(call.expression)||call.expression.questionDotToken||call.expression.name.text!=='some'||!ts.isIdentifier(call.expression.expression))return null;
    const receiver=call.expression.expression,callback=call.arguments[0];
    if(!ts.isArrowFunction(callback)||callback.modifiers?.length||callback.parameters.length!==1||!ts.isIdentifier(callback.parameters[0].name)||callback.parameters[0].initializer||callback.parameters[0].dotDotDotToken)return null;
    const test=callback.body;
    if(!ts.isCallExpression(test)||test.questionDotToken||test.arguments.length!==1||!ts.isIdentifier(test.arguments[0])||!ts.isPropertyAccessExpression(test.expression)||test.expression.questionDotToken||test.expression.name.text!=='test'||!ts.isIdentifier(test.expression.expression)||test.expression.expression.text!==callback.parameters[0].name.text)return null;
    if(test.arguments[0].text===callback.parameters[0].name.text)return null;
    // No assumption about the input being a string is made; RegExp.test may coerce it.
    const reference=inputs.references.find(r=>r.span.start===receiver.getStart());
    if(!reference||reference.declarations.length!==1||!['module','local','closure'].includes(reference.ownership))return null;
    let declaration;const ast=node.getSourceFile();
    function find(n){if(n.getStart(ast)===reference.declarations[0].start&&ts.isVariableDeclaration(n))declaration=n;ts.forEachChild(n,find);}find(ast);
    if(!declaration||!ts.isIdentifier(declaration.name)||!declaration.initializer||!ts.isArrayLiteralExpression(declaration.initializer)||!(declaration.parent.flags&ts.NodeFlags.Const))return null;
    if(!declaration.initializer.elements.every(e=>e.kind===ts.SyntaxKind.RegularExpressionLiteral&&!/[gy]/.test(e.getText().slice(e.getText().lastIndexOf('/')+1))))return null;
    // Visible mutation/dynamic scope is rejected. Aliases and external mutation remain assumptions.
    let unsafe=false;
    function inspect(n){
        if(ts.isWithStatement(n)||ts.isCallExpression(n)&&n.expression.getText()==='eval')unsafe=true;
        if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)unsafe=true;
        if(ts.isDeleteExpression(n)||((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator)))unsafe=true;
        if(ts.isCallExpression(n)&&(/^(Object|Reflect)\.(defineProperty|defineProperties|setPrototypeOf|set)$/.test(n.expression.getText())||ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText()===receiver.text&&n.expression.name.text!=='some'))unsafe=true;
        ts.forEachChild(n,inspect);
    }
    // CommonJS export assignment is module wiring, not mutation of the array.
    for(const statement of ast.statements){
        if(ts.isExpressionStatement(statement)&&ts.isBinaryExpression(statement.expression)&&statement.expression.operatorToken.kind===ts.SyntaxKind.EqualsToken&&statement.expression.left.getText()==='module.exports'&&ts.isObjectLiteralExpression(statement.expression.right)){inspect(statement.expression.right);continue;}
        inspect(statement);
    }
    if(unsafe)return null;
    return {rule:'literal-regex-array-some',negated,array:receiver.text,input:test.arguments[0].text,span:span(node),declarationSpan:span(declaration),assumption:'The declared array, regexes and standard Array.some/RegExp.test behavior remain unmodified; reached calls complete normally.'};
}
module.exports={lengthCondition,regexSome};
