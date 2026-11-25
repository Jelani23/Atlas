# Conditional operation relationships

The flow outline composes recognized string conversion with numeric length comparisons (<, <=, >, >=, ===, !==). It describes length without conflating UTF-16 code units with user-perceived characters. Unknown receiver types keep the original source expression.

An additional rule handles direct or negated array.some(p => p.test(identifier)) returns when the receiver resolves to a const array literal containing only regex literals without global/sticky flags. Source citations include both the return and array declaration. The authored explanation preserves first-match termination, negation, and the no-match result. Empty arrays correctly have no match. It does not evaluate any source regex, callback or particular input.

This rule assumes the declared array, regexes and standard methods remain unmodified and calls complete normally. Visible assignments, mutations and dynamic scope are conservatively excluded; ordinary CommonJS export wiring is allowed, but its right-hand side is still inspected. Async callbacks, optional calls, stateful regex flags, nonliteral entries, ambiguous/shadowed receiver bindings and unsupported callback forms are excluded. The assumption is not a proof against mutations through aliases/dependencies or coercion side effects.

Normal-completion and built-in assumptions now share one opening sentence. Guards avoid repeating the reachability preamble. The screen retains source citations and inventory; speech uses authored operation wording rather than reading the callback expression. General helper composition, loops, concrete pattern results and model-based follow-up explanations remain outside this change.

Function record version 8 and flow outline version 3 invalidate older structures. No persistence, production data, global defaults, background automation or generated/source execution changes.

Validation: authored fixtures cover comparisons, both some polarities, empty arrays, first-match behavior and conservative exclusions. Real-source pipeline tests verify the search-evidence explanation, speech and citation route without calling a model. Full suite log: backend/.local/flow-operations-tests.log.

Live check after restart, in a new chat: “Analyze the search evidence file function is usable search result.” Expect conversion and end trimming; a length-less-than-20 guard; then false on the first pattern match and true if none match, under the stated assumptions. No claim that any input was tested. Log stage remains flow_outline. Check that speech does not read the arrow function, and that assumptions are grouped once at the beginning.
