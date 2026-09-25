# Evidence-reference validation and deterministic coverage

## Changes

The experimental bundle question path now computes an explicit citable-ID set. Clipped facts, relations with missing/clipped support, and cyclic relationships cannot be cited. The structured generation schema enumerates only those IDs; server-side validation remains independent of generation constraints. Empty citable sets fail before model generation.

Derived-relation citations expand to their supporting source facts. A call-binding claim therefore retains both the caller location and callee declaration, rather than showing only the origin span. Citation spans are deduplicated, source versions remain attached, and claims retain MODEL_INFERRED status.

The model packet no longer repeats target source both outside and inside the bundle. This reduces duplicate input without removing inspected source. Audit reports now retain raw responses and generation schemas so future validation failures can be diagnosed directly.

Atlas computes inspected files, unresolved imports and extraction limits from the bundle and returns them independently of model prose. The on-screen response lists inspected paths and limit counts; speech retains the concise explanation and uncertainty notice. This does not automatically correct contradictory model prose about missing dependencies.

## Verification

Targeted sourceBundle, staticRelations, projectQuestion and real sourceConversationRouting tests passed. New assertions cover cyclic/dangling/clipped support graphs, schema allowed IDs, caller-plus-callee citation expansion, coverage provenance and speech separation. Existing invalid-reference rejection remains active. The previously completed full suite was 97/97; this pass reran the affected suites, not the full suite.

Sequential regression report: `backend/.local/source-bundle-audit/1790194296570.json`. Six calls completed and all answers passed reference validation. This is a rerun of known development probes, not held-out evidence of quality. The empty-string word-count error remained. The bundle character-count response regressed to 2/1 instead of 3/2, while still describing whitespace removal correctly. The conversion response again called an included dependency uninspected. Valid IDs therefore did not establish factual accuracy.

## Decision and remaining work

Keep bundle-backed answering development-only. No production enablement, global model changes, generated test execution, database writes, migration or commits. No live acceptance request is needed for this change.

Reference validity, inspected-source coverage and behavioral correctness are now visibly separate. Future semantic work must test exact input fidelity and preserve established outcomes through explanation; repeatedly refining the same three development prompts or adding file-specific answers would not establish general progress. Broader binding support and deterministic expression semantics remain separate, bounded tasks rather than implied capabilities of the current AST map.
