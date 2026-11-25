# Case review

Reviewed by the primary development agent from source before inspecting answers for these cases. Expected values are independent of Alice output. Fixed execution is a separate cross-check, not a substitute for reviewing branch explanations. No external reviewer has signed off.

Version 2 groups parseFloat/Number together in heldout and ||/?? together in development to reduce adjacent-function leakage. This split adjustment preceded all numeric/fallback model evaluations. The initial three-case screen used version 1; those three case assignments and questions are unchanged.

| Target case | Split | Source reasoning checked | Reference method |
| --- | --- | --- | --- |
| fallback | development | Apply || before String; 0 and false choose empty text. Trim only after conversion; return a string. | Fixed pure execution |
| numeric-prefix | heldout | parseFloat consumes a numeric prefix but does not search later text. NaN is a number value, not an exception. | Fixed pure execution |
| guard-method | development | Falsy input returns before the method call. Truthy numeric input has no toLowerCase method; no implicit String conversion. | Fixed pure execution |
| delete-punctuation | development | Deletion joins adjacent fragments; no lowercase or transliteration occurs. Split runs on retained whitespace after deletion. | Fixed pure execution |
| set-order | development | Set iteration preserves first insertion order. Adding an existing element does not move it. | Fixed pure execution |
| branch-priority | development | DENY wins when both markers occur. ALLOW returns before the length fallback; true does not establish authorization. | Fixed pure execution |
| descending-bound | development | Start is min(n,5); lower bound 3 is inclusive. No iteration happens if the starting value is below 3. | Fixed pure execution |
| helper-flow | development | Both helper bodies are supplied; inner call precedes outer call. The + operator concatenates when the supplied operand is a string. | Fixed pure execution |
| alias-state | development | Alias and state refer to the same object; const does not freeze it. Postincrement coerces count numerically before storing it. | Fixed pure execution |
| missing-helper | development | Conditional on the dependency loading, exact output requires price implementation/result. The supplied source establishes multiplication by 2, but does not supply price. | Source review only |
| caller-normalizes | development | Question asks handle calls; falsy fallback and String belong to the caller. handle(7) passes string 7 of length 1; handle(null) passes empty string. | Fixed pure execution |
| trim-pipeline | development | Trimming whitespace-only text produces empty string. Splitting empty string gives one empty element, not an empty array. | Fixed pure execution |
| nullish | development | Nullish fallback preserves 0 and false. Only null or undefined choose 9 for these inputs. | Fixed pure execution |
| numeric-whole | heldout | Number parses the whole trimmed input and recognizes hexadecimal syntax. Empty whitespace is zero; trailing nonnumeric characters yield NaN. | Fixed pure execution |
| exception-boundary | heldout | trim is outside try; its TypeError escapes. JSON parse errors are caught and return null. | Fixed pure execution |
| utf16 | heldout | length and slice use UTF-16 code units, not code points. The selected unit of the emoji is the low surrogate 56832. | Fixed pure execution |
| map-reinsert | heldout | Deleting removes the insertion position. Reinsertion puts a at the end regardless of its prior position. | Fixed pure execution |
| finally-return | heldout | finally return replaces the pending return when true. finally return also suppresses the thrown Error when false. | Fixed pure execution |
| loop-continue | heldout | continue still runs the for update expression. Upper bound is exclusive; for n=4 only 1 and 3 contribute. | Fixed pure execution |
| helper-shadow | heldout | The parameter convert shadows the module function. entry supplies the callback, which returns 6; do not use module convert. | Fixed pure execution |
| regex-state | heldout | The same global regex retains lastIndex between tests in one invocation. A failed test resets lastIndex to zero; each invocation constructs a fresh regex. | Fixed pure execution |
| unknown-runtime | heldout | Actual cache contents/get behavior are unspecified. If get returns nullish, selected returns missing; other values are preserved. | Source review only |
| caller-truthiness | heldout | Nonempty string no is truthy, regardless of its English meaning. The caller converts check output to boolean; direct output is not the caller output. | Fixed pure execution |
| short-circuit | heldout | && returns an operand, not necessarily a boolean. Falsy input short circuits; truthy input yields the right operand. | Fixed pure execution |

All executable cases recreate their own objects/collections on each invocation. Inputs are cloned before fixed calls. Missing dependencies are not stubbed with invented implementations. Unknown cache state is not treated as an empty Map. No fixture reads files, writes state outside its invocation, accesses a database, invokes a model, or runs generated tests.

The set is small and handcrafted. Passing all cases would still not establish general repository understanding, asynchronous behavior, large dependency graphs, or production reliability.

