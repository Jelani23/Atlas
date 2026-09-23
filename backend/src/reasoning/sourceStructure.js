// Syntax only. Never evaluates source, resolves imports, or executes tests.
const ts = require('typescript');
const STRUCTURE_VERSION = `syntax-map-1/typescript-${ts.version}`;
function extractStructure(source) {
    if (!source.complete || source.clippedLine) throw new Error('Structure extraction requires complete source.');
    const lines = source.text ? source.text.split('\n').map((line,index) => {
        const match = /^(\d+): (.*)$/.exec(line);
        if (!match || Number(match[1]) !== index + 1) throw new Error('Noncontiguous numbered source.');
        return match[2];
    }) : [];
    const result = {version:STRUCTURE_VERSION, status:'parsed',
        scope:'Syntactic locations only; not a control-flow proof. Imports are not resolved; dependencies are not read.',
        entries:[],truncated:false};
    if (source.path.endsWith('.json')) return {...result,status:'not_applicable',scope:'JavaScript structure extraction does not apply to JSON.'};
    const file = ts.createSourceFile(source.path, lines.join('\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (file.parseDiagnostics.length) return {...result,status:'parse_error',scope:'Could not parse source; no structure supplied.'};
    let used = 0;
    function add(kind,node,owner,detail) {
        const entry = {kind,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
            endLine:file.getLineAndCharacterOfPosition(Math.max(node.getStart(file),node.end - 1)).line + 1,
            owner,detail:detail.length > 180 ? detail.slice(0,180)+' [excerpt]' : detail};
        const size=JSON.stringify(entry).length;
        if(result.entries.length >= 40 || used+size > 5000) {result.truncated=true;return;}
        result.entries.push(entry); used+=size;
    }
    function visit(node,owner='<module>') {
        if(ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
            const parent=node.parent;
            const name=node.name?.getText(file) || (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ? parent.name.getText(file) : '<anonymous>');
            owner=name;
            add('function',node,owner,`(${node.parameters.map(p=>p.getText(file)).join(', ')})`);
        }
        if(ts.isImportDeclaration(node)) add('import',node,owner,node.moduleSpecifier.getText(file));
        if(ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
            add('require-expression',node,owner,node.arguments.map(a=>a.getText(file)).join(', '));
        }
        if(ts.isIfStatement(node)) add('if-condition',node,owner,node.expression.getText(file));
        if(ts.isConditionalExpression(node)) add('conditional-expression',node,owner,node.condition.getText(file));
        if(ts.isReturnStatement(node)) add('return',node,owner,node.expression?.getText(file) || '<no expression>');
        if(ts.isThrowStatement(node)) add('throw',node,owner,node.expression.getText(file));
        if(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const left=node.left.getText(file);
            if(left === 'module.exports' || left.startsWith('exports.')) add('export-assignment',node,owner,node.getText(file));
        }
        ts.forEachChild(node,child=>visit(child,owner));
    }
    visit(file);
    return result;
}
module.exports={extractStructure,STRUCTURE_VERSION};
