const ts = require('typescript');

// Select complete syntax units, never fixed line windows. This is not control-flow evaluation.
function sourceUnits(name, source, { focus = [], anchors = [] } = {}) {
    const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    if (sf.parseDiagnostics.length) return { units: [], reason: 'Syntax errors prevent coherent source selection.' };
    const units = [];
    const span = node => ({ start: node.getStart(sf), end: node.getEnd(),
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        endLine: sf.getLineAndCharacterOfPosition(Math.max(node.getStart(sf), node.getEnd() - 1)).line + 1 });
    const label = node => node.name?.getText(sf) || (ts.isIfStatement(node) ? `if (${node.expression.getText(sf)})` : ts.SyntaxKind[node.kind]);
    function add(node, enclosing = []) {
        const location = span(node), text = node.getText(sf);
        const focusHits = focus.reduce((n, word) => n + text.toLowerCase().split(word.toLowerCase()).length - 1, 0);
        const anchorHits = anchors.filter(line => line >= location.line && line <= location.endLine).length;
        units.push({ ...location, text, unitKind: ts.SyntaxKind[node.kind], label: label(node).slice(0, 160),
            enclosing, score: Math.min(20, focusHits) * 10 + Math.min(10, anchorHits) * 5 });
    }
    function children(statements, enclosing) {
        for (const statement of statements) {
            add(statement, enclosing);
            // A large try is selectable as a whole. Its direct children are alternatives,
            // with explicit surrounding try/catch/finally locations retained.
            if (ts.isTryStatement(statement)) {
                const context = { kind: 'try', ...span(statement),
                    catch: statement.catchClause ? span(statement.catchClause) : null,
                    finally: statement.finallyBlock ? span(statement.finallyBlock) : null,
                    uncertainty: 'Surrounding handlers/finally may be omitted; this unit does not establish the final outcome.' };
                children(statement.tryBlock.statements, [...enclosing, context]);
            }
        }
    }
    for (const statement of sf.statements) {
        add(statement);
        if (ts.isFunctionDeclaration(statement) && statement.body) {
            children(statement.body.statements, [{ kind: 'function', label: label(statement), ...span(statement), partial: true }]);
        }
        if (ts.isClassDeclaration(statement)) for (const member of statement.members) {
            add(member, [{ kind: 'class', label: label(statement), ...span(statement), partial: true }]);
            if (ts.isMethodDeclaration(member) && member.body) children(member.body.statements,
                [{ kind: 'method', label: label(member), ...span(member), partial: true }]);
        }
    }
    // Score ties prefer the larger enclosing unit so guards/handlers remain together when affordable.
    units.sort((a,b) => b.score - a.score || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    return { units, reason: null };
}
module.exports = { sourceUnits };
