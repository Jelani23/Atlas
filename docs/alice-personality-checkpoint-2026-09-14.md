# Alice personality restoration — September 14, 2026

## App acceptance received

The user accepted all four personality replies: original music interests, water aversion, Alice's games distinguished from the user's Minecraft preference, and Raphael/Tensura inspiration. These four questions all skipped memory extraction, so these turns did not copy Alice's tastes into the user profile through the extraction path.

The user then supplied a real correction: `Actually my favorite game is Minecraft and Celeste`. Logs show deterministic extraction as preference/user/favorite_game with value `Minecraft and Celeste`, an update to the existing identity, and Save Result `saved` (background total 563 ms). This validates the reported write path for this correction; fresh-session retrieval of both favorites has not yet been demonstrated. The foreground promise to remember preceded the background save, so it is not a general guarantee of successful persistence on future turns.

The personality app check below is completed and should not be requested again. Current priority recommendation: capability/pipeline awareness, with memory correction/recall and factual-response reliability kept in the V1 acceptance list. Agent-profile storage, contextual thinking modes, voice canonicalization and passive sourced knowledge remain planned. No code or SQL was changed while recording this acceptance.

The authorized first step is implemented and ready for an app tone check. The existing `backend/src/core/atlasState.js` remains unchanged. Its complete character is still the source: Raphael inspiration, composed/analytical warmth, dry humor, music and game interests, water/horror/loudness quirks, aesthetics, values and avoidance preferences. No database migration or production memory write was performed. These changes are uncommitted on top of `eb45502`; the user handles commits.

## What changed

`personalityEngine.js` now compiles the actual profile fields instead of reading only identity and substituting a short hardcoded personality. Core identity, traits and values stay present in ordinary replies. Detailed interests and quirks are selected for the current topic, and broad self-description requests receive the full profile. Simple follow-ups can inherit the previous user topic. Selection is currently a bounded lexical implementation; this is not yet semantic agent-profile retrieval.

`contextBuilder.js` passes the current request/history to that compiler. `response/controller.js` controls length and layout, leaving personality and mode tone to the compiler. Mode guidance changes delivery without replacing Alice's identity. Ownership guidance separates Alice's preferences from user profile records, and separates personality from factual memory, capabilities and completed actions. Existing memory/action evidence rules remain in place. The accepted deterministic tool-report templates are unchanged.

The compiler accepts a supplied profile, providing a boundary for a later storage change. No agent-profile table, self-editing preferences, new mode classifier, capability catalogue or heavy-thinking runtime was added. Those need separate implementation. The current general-model configuration remains Qwen 3.5 4B with native thinking disabled.

## Validation and limits

- `cd backend; npm run test:memory`: **63/63 offline test files passed**. The new personality test verifies every original profile string survives a full render in every mode, relevant topic selection, Alice/user ownership, retained memory/action rules and no source-profile mutation. Structural tests do not prove model compliance.
- `cd backend; node scripts/evaluatePersonality.js`: isolated real local Ollama checks through the actual context builder and response processor. Database access is blocked; no extraction, tool execution or production memory writes occur. Reports include prompts and source snapshots in ignored `backend/.local/personality-evaluations/`.
- Latest replay: `1789389340440.json`. Music, games, water aversion, Raphael inspiration, aesthetic and Alice-versus-user game preferences were recognizable and correctly attributed. The urgent reply stayed practical. These are small smoke checks; tone still needs the user's judgment in the full app.
- The latest report originally recorded **10/11 pattern passes**, but manual review caught an additional failure: after denying a memory of last night, Alice invented that it probably was not Celeste or Spelunky. The evaluator now rejects that observed pattern. Treat this as at least **two failed cases**, not a 10/11 reliability claim. The raw report is retained without rewriting it.
- The SQLite statement was still incorrectly called a misconception. A committed-prompt baseline (`1789331232432.json`, run with `--baseline`) also showed this failure, alongside denial of existing tastes and confusion with the user's Minecraft preference. Personality restoration improves character access; it does not close the factual-answer work.
- The coding reply correctly identified null property access and suggested optional chaining, but its general explanation of JavaScript type safety remained imprecise. The humor case followed the subject loosely. Passing keyword checks should not be presented as proof of technical accuracy or joke quality.

The older semantic comparator result remains 49/61. The previously accepted 27-record user profile recall and tool routing tests remain separate evidence. This is not V1 acceptance or completion of semantic/canonicalization work.

## Completed app check (historical instructions)

Restart Atlas and use a new chat so earlier generic replies do not steer this check. No SQL is needed. Use ordinary speech-compatible prompts:

1. What kinds of music and artists do you like
2. How do you feel about water
3. What games do you like and which game do I like
4. Who inspired your personality

Expect the original tastes and playful water aversion, Alice's games kept separate from Jelani's Minecraft preference, and Raphael from Tensura as inspiration. She should sound natural rather than recite configuration labels or bring every interest into every answer. The user should judge whether this feels like the intended character and share the replies. No need to repeat the known SQLite failure just to reconfirm it.

Next reliability work remains capability/pipeline awareness, unsupported factual corrections, and invented claims about missing memories. Once the character foundation is accepted, plan the agent-scoped profile storage and controlled evolution separately, preserving these existing preferences as the seed. Passive news/topic learning and broader voice canonicalization remain roadmap items.
