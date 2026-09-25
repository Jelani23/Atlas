# Lexical input inventory checkpoint

Function records now contain compiler-resolved lexical references, separate from runtime values and syntactic property-access candidates. The compiler uses a source-only host with no filesystem/dependency loading. Parameters, locals, closure bindings, module bindings and unresolved names are distinguished. Reference spans and declaration spans retain the owning source version. Direct identifier writes and updates are recorded; receiver references remain reads, not claims about property effects. Analyzer version 4 invalidates older record keys.

Direct eval or with anywhere in the inspected file conservatively disables ownership classification. Globals such as String and Math are unresolved bindings, not assertions that those names necessarily refer to native intrinsics. Destructuring assignment effects, aliases, runtime call effects and execution order remain unresolved. Nested bodies are separate records; references in a callback are not silently attributed to its enclosing function. Function parameter initializers are inspected, but computed method names and class initialization are not attributed to body execution.

Opt-in analysis displays a bounded source reference inventory after the existing evidence details. It is not fed back as verified behavioral prose or used to broaden completion evaluation. The screen shows at most twelve distinct nonlocal bindings; speech is unchanged and does not read this inventory aloud. Ordinary questions retain their existing behavior. No database persistence, background work, generated-code execution, migration or model-policy changes.

Validation: 109/109 offline test files passed in backend/.local/function-input-tests.log. Subsequent focused tests passed after excluding computed method names and adding real-source question-pipeline tests for both recovery functions. Those pipeline tests use a stubbed model; no real model accuracy claim is made. Source-only inspection of unitConversionRequest and recovery produced backend/.local/function-behavior/1790294100770.json. Tests cover shadowing, hoisting, closures, shorthand references, catch scope, destructured parameters, defaults, imported bindings and dynamic-scope exclusion.

Known separate limit: a question-pipeline probe of unitConversionRequest exceeded the existing 16000-character evidence bundle budget after projection/metadata. Its function records can be inspected offline, but it is not a live acceptance example for this pass. No budget increase or evidence truncation workaround was added.

## Live acceptance

Restart backend, open a new Alice chat, then ask:

1. Analyze the recovery file function should recover response.
2. Analyze the recovery file function get recovery append.

In the screen's Atlas source reference inventory, the first should list reply and completionMeta as parameters and String as unresolved. It should not list Math from the other function. The second should list existingReply and recoveredReply as parameters, with String and Math unresolved; it should not carry over completionMeta. The inventory should not be spoken aloud. This checks source binding ownership and target isolation, not the factual accuracy of free-form model explanations or complete runtime understanding.
