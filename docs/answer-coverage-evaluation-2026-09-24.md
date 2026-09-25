# Response coverage evaluation and input boundaries

## Live changes retained

Explicit speech delimiter: "with text set to hello end input." binds hello. Unmarked "hello." remains hello. rather than silently altering possible data. JSON-quoted strings may be followed by sentence punctuation, which is outside the quoted value; quoted punctuation and the literal words end input are preserved. Existing Inputs understood exposes actual bindings. No automatic STT punctuation inference.

Repeated source path/line pairs are deduplicated within each displayed claim, while recursive source evidence remains intact internally. Exactly identical presented claims are deduplicated. Coverage metadata now calls projection/extraction limitations scope notes rather than implying every projection is an extraction failure. The redundant blanket caller/runtime warning was removed from that metadata line; the common unverified-reading notice remains. Conditional expression results retain a short unexecuted label. These presentation changes do not promote model claims to verified knowledge.

## Experiment withheld from live use

answerCoverage.js splits simple unquoted conjunctions/question boundaries into request parts; explicit assignments remain one request so their data is not split. A development-only coverageContract requests per-claim addresses IDs, reports missing links and rejects unknown references. All coverage is explicitly model-reported, verified:false. It is a structural diagnostic, not proof of topical entailment. The additional prompt requests causal chains and question-relevant unknowns instead of generic scope disclaimers.

Four sequential local-model calls: backend/.local/spoken-analysis-audit/1790260884840.json. At that time the experiment was enabled for the audit; it has since been gated behind coverageContract:false by default. auditSpokenAnalysis.js --coverage-contract reproduces the experimental setting. No global model changes or production writes.

Manual assessment rejected promotion: duplicate handling was still omitted, the wordCount explanation incorrectly said splitting on non-whitespace, and missing-input reasoning remained generic. Correct concrete outcomes were repeated in multiple claims. Per-part links did not prove meaningful coverage. No further tuning loop was attempted. Live answering retains the prior prompt/schema.

## Validation and next step

104/104 offline test files passed before the default-off gate and final presentation shortening. After those changes, spokenAnalysis, answerCoverage, projectQuestion and real sourceConversationRouting tests passed; the coverage integration test also checks missing-part reporting and citation deduplication. No migration or commit.

Next analysis work should evaluate operation-to-consequence evidence across varied held-out examples, including output containers and exception paths, rather than treating the model's own coverage checklist as semantic verification. No repeat live semantic test is requested from this experiment. The delimiter can be exercised opportunistically in the next live checkpoint.
