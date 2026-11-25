# Ordered early-return outline

Fresh opt-in analysis without supplied/quoted inputs can now render an ordered structural outline of const initializers, single-return guards without else branches, and a final return or fallthrough. Return expressions remain expressions, not predicted values. A minimum of one supported guard is required. Parameter initialization, generators and destructuring are excluded. Unsupported statements and size limits stop the outline with an explicit unresolved remainder; later returns cannot be presented as unconditional outcomes. Async body returns do not claim promise settlement for unknown values.

The shared rules are independent of filenames. Function record version 6 adds the outline and invalidates older record keys. Existing Boolean outlines retain priority. Concrete input scenarios retain their existing analysis. The outline route makes no model call and logs flow_outline. It does not create verified memories, execute analyzed/generated code, change global model defaults or enable background work.

Recovery append now distinguishes the normalized local recovered from the original recoveredReply argument. Its first two guards are recorded in order. The outline stops at the for loop; overlap detection is still unsupported. Search evidence provides a second real-source case with two guard returns and a final helper call: the helper expression is identified without pretending its value is known. These are structural explanations, not complete semantic analyses of normalizers or dependencies.

The first full suite caught a follow-up regression: a general outline bypassed a question-specific punctuation explanation. New flow outlines now apply only to fresh analysis requests, not contextQuestion follow-ups. Follow-ups keep the existing unverified model path. This boundary is important; the new outline does not answer every hypothetical or purpose question.

Validation uses authored source fixtures and fixed oracles, plus real-source question-pipeline tests with a model stub. Tests cover guard order, returned expression identity, async limits, fallthrough, unsupported loops/try/else/defaults, no competing model prose and existing scenario/routing regressions. Final suite log: backend/.local/flow-outline-tests-final.log. No real local-model accuracy audit is implied by these deterministic-route checks.

## Live checkpoint

Restart backend and open a new Alice chat:

1. Analyze the recovery file function get recovery append.
2. Analyze the search evidence file function has verified search evidence.

First: ordered initializers and guards, returns local recovered on the first guard and the empty string on the second, explicit stop before the loop. No claim of a fully solved overlap algorithm. Second: false guard, then true guard, then return the result of isUsableSearchResult(text) if reached. No invented result for that helper. Both should log flow_outline and avoid generic model-generated missing-evidence paragraphs. Assess speech separately; source-oriented wording remains less conversational than the intended final experience.
