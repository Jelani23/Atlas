const ts = require('typescript');

// Syntax observations, not a control-flow solver. Never execute inspected code.
function extractOperations(path, source, hash) {
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    if (sf.parseDiagnostics.length) return { facts: [], omitted: 0, limitation: 'Syntax errors: operation extraction withheld.' };
    const facts = []; let omitted = 0;
    const text = node => node.getText(sf);
    const functionLike = node => ts.isFunctionLike(node);
    const location = node => ({ path, hash, start: node.getStart(sf), end: node.end,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    function observe(node, operation) {
        if (facts.length >= 300) { omitted++; return; }
        const conditions = [], regions = [], priorExits = [], priorAwaits = [];
        let child = node, parent = node.parent, owner = '<module>';
        while (parent) {
            if (functionLike(parent)) { owner = ts.isConstructorDeclaration(parent) ? 'constructor' : parent.name ? text(parent.name) : '<callback>'; break; }
            if (ts.isIfStatement(parent) && child !== parent.expression) conditions.push({ expression: text(parent.expression), branch: child === parent.thenStatement ? 'then' : 'else' });
            if (ts.isConditionalExpression(parent) && child !== parent.condition) conditions.push({ expression: text(parent.condition), branch: child === parent.whenTrue ? 'then' : 'else' });
            if (ts.isBinaryExpression(parent) && child === parent.right && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind))
                regions.push(`right operand of ${text(parent.left)} ${text(parent.operatorToken)}`);
            if (ts.isTryStatement(parent)) regions.push(child === parent.tryBlock ? 'try body; exceptions may transfer to catch/finally' : child === parent.catchClause ? 'catch handler' : 'finally');
            if (ts.isIterationStatement(parent, false) || ts.isSwitchStatement(parent)) regions.push(ts.SyntaxKind[parent.kind]);
            if (ts.isCaseClause(parent)) regions.push(`case ${text(parent.expression)}`);
            if (ts.isDefaultClause(parent)) regions.push('default case');
            if (ts.isBlock(parent)) {
                const index = parent.statements.indexOf(child);
                for (const earlier of parent.statements.slice(0, Math.max(0, index))) {
                    const awaits = n => {
                        if (functionLike(n)) return;
                        if (ts.isAwaitExpression(n)) priorAwaits.push(text(n));
                        ts.forEachChild(n, awaits);
                    };
                    awaits(earlier);
                    // Retain literal prior exits; do not claim their negations prove reachability.
                    const directExit = statement => ts.isReturnStatement(statement) || ts.isThrowStatement(statement);
                    if (directExit(earlier)) priorExits.push(text(earlier));
                    if (ts.isIfStatement(earlier) && (directExit(earlier.thenStatement) ||
                        ts.isBlock(earlier.thenStatement) && earlier.thenStatement.statements.some(directExit))) priorExits.push(text(earlier));
                }
            }
            child = parent; parent = parent.parent;
        }
        const fact = { id: `o${facts.length}`, class: 'TOOL_FINDING', ...operation, owner, location: location(node),
            source: text(node), conditions: conditions.reverse(), priorExits: priorExits.reverse(), priorAwaits: priorAwaits.reverse(), regions: regions.reverse(),
            status: 'syntax_observation_not_runtime_proof' };
        if (JSON.stringify(fact).length > 6000) { omitted++; return; }
        facts.push(fact);
    }
    function walk(node) {
        if (ts.isIfStatement(node)) {
            let numericComparison = false;
            const inspect = n => {
                if (functionLike(n)) return;
                if (ts.isBinaryExpression(n) && [ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
                    ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken].includes(n.operatorToken.kind) &&
                    (ts.isNumericLiteral(n.left) || ts.isNumericLiteral(n.right))) numericComparison = true;
                ts.forEachChild(n, inspect);
            };
            inspect(node.expression);
            // Record the actual rejecting branch, not a guessed accepted range or unit.
            if (numericComparison && (ts.isThrowStatement(node.thenStatement) || ts.isReturnStatement(node.thenStatement)))
                observe(node, { kind: 'numeric_guard', predicate: text(node.expression),
                    consequence: text(node.thenStatement), interpretation: 'Literal rejecting/returning branch only; units, accepted domain and runtime reachability are not inferred.' });
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(sf) === 'isCancelled' &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
            observe(node, { kind: 'cancellation_probe', interpretation: 'Callback property named isCancelled. Exposing a callback does not prove callers invoke it or that work stops.' });
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            if (['emit', 'on', 'once', 'addListener'].includes(method)) observe(node, {
                kind: method === 'emit' ? 'event_emit' : 'event_listener', receiver: text(node.expression.expression),
                key: node.arguments[0] ? text(node.arguments[0]) : null });
            if (['abort', 'cancelTask', 'interrupt', 'terminate'].includes(method)) observe(node, {
                kind: 'cancellation_call', receiver: text(node.expression.expression), method,
                interpretation: 'Named call site only; receiver behavior and actual interruption are not established.' });
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left) && ['status', 'state'].includes(node.left.name.text))
            observe(node, { kind: 'state_assignment', receiver: text(node.left), value: text(node.right) });
        ts.forEachChild(node, walk);
    }
    walk(sf);
    return { facts, omitted, limitation: 'Selected direct event/cancellation calls, status/state assignments, numeric rejecting branches and isCancelled callback properties. Conditions are lexical branches; prior exits and awaits are earlier syntax, not solved paths or guaranteed execution. Numeric units and accepted domains are not inferred. A callback or named call does not establish stopping work. Exceptions, aliasing, callbacks, loops and dynamic dispatch prevent runtime guarantees. No absence conclusions.' };
}

function attachOperations(packet, graph, maxChars) {
    const file = graph.snapshot.files[packet.target];
    const extracted = graph.records[packet.target].operations || extractOperations(packet.target, file.source, file.hash);
    const scope = packet.scope?.location;
    const candidates = extracted.facts.filter(f => !scope || f.location.start >= scope.start && f.location.end <= scope.end);
    const facts = [];
    packet.operations = { facts, omitted: extracted.omitted + candidates.length, limitation: extracted.limitation };
    if (JSON.stringify(packet).length > maxChars - 150) {
        delete packet.operations;
        packet.omitted.operationFacts = extracted.omitted + candidates.length;
        return packet;
    }
    // All statements remain accessible in the original evidence; prioritize emits
    // over registrations so completion/failure evidence survives a bounded packet.
    const priority = fact => ({ numeric_guard: 40, cancellation_probe: 30, event_emit: 20, cancellation_call: 10 }[fact.kind] || 0) +
        (fact.kind === 'event_emit' ? (fact.conditions.length ? 2 : fact.priorExits.length ? 1 : 0) : 0);
    for (const fact of [...candidates].sort((a,b) => priority(b) - priority(a))) {
        facts.push(fact);
        if (JSON.stringify(packet).length > maxChars - 150) facts.pop(); else packet.operations.omitted--;
    }
    return packet;
}
module.exports = { extractOperations, attachOperations };
