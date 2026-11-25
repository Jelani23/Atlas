# Alice puzzle helper

A separate, local puzzle pipeline checks Alice's Wordle guesses in the background.
Say “Let's play Wordle” and relay the colors for the guess she gives you. For example:

> You: Let's play Wordle.
>
> Alice: Let's start with **SLATE**. What colors do you get?
>
> You: T is yellow, the rest are gray.
>
> Alice: Got it. Let's try **TRUCK**. It fits all the colors so far. What colors do you get?

Mention Wordle to invite Alice to play; no exact opening phrase is required.
While active, every turn goes through the local model for intent classification.
Color reports get a separate observation-extraction pass. Code maps the extracted
letters or positions to tiles and checks them against the saved board. Missing
colors stay unknown; repeated letters may need positions. Corrections to older
rows should name the word. Suggestions are not played until colors are reported.
Unrelated chat returns to ordinary routing. Pausing preserves the game.

The checker filters a bundled 14,855-word vocabulary against recorded clues and
rejected words. The model chooses a familiar word from a shortlist ranked by letter
coverage; invalid choices fall back to a checked word. Invented strings like LOLVE
cannot pass. A Wordle variant can still reject a listed word: report that naturally
and Alice excludes it without recording a row or searching the web.

The vocabulary is from [Tab Atkins's MIT-licensed wordle-list](https://github.com/tabatkins/wordle-list),
pinned at revision 255b9469c4dad99a3b95cc4ddbe139b3d3747868. License, checksum and
provenance are bundled beside the data. It is not a daily-answer lookup.

Model understanding is imperfect. Source-excerpt and board checks limit errors,
but cannot prove every interpretation correct. Ambiguity can still require a
focused clarification. No raw interpretation output is displayed as Alice's reply.

Complete five-color lists are mapped directly to positions, including an
unambiguous single omitted character such as `yello`. Natural follow-ups receive
the saved partial row, so references to missing tiles can be resolved. Questions
about missing colors are answered from that row rather than generated freely.
A success report about the pending guess can finish the game without requiring
the phrase "all green"; confirming a partial color report does not finish it.

Explicit commands remain available for inspection and for the Connections helper.
Conversational play currently applies to Wordle; Connections still uses commands.

## Optional Wordle commands

Send each command as its own message:

```text
Wordle: new
Wordle: suggest
Wordle: SLATE BBBYB
Wordle: hint
Wordle: check CRANE
Wordle: candidates CRANE, BRAIN, GRAIN
Wordle: correct SLATE BBBBB
Wordle: status
```

Use five colors in guess order: `G` green, `Y` yellow, `B` gray. Square emoji
are also accepted. A row is recorded only when you provide its exact guess and
all five colors. Suggestions never become observations. `correct` replaces
feedback for that named guess; conflicting or impossible feedback leaves the
previous state intact. `new` or `reset` starts over.

The checker consumes green letters before yellow letters, tracks minimum and
maximum duplicate counts, and checks each candidate against every recorded row.
It rejects contradictory feedback by testing whether any five-letter string
could produce it. This is not a dictionary check. There are at most six rows.

`suggest` checks and ranks your supplied candidate pool, if present (up to 256
words). Otherwise it asks the installed local general model for up to 32 words
and rejects invalid shapes and inconsistent/repeated guesses. Ranking uses
feedback information within that pool, assuming equal likelihood. No daily
answer or exhaustive dictionary is bundled: a single surviving word does not
prove a unique answer, and a zero-result pool does not prove no solution exists.
The game may reject a suggested word that is absent from its dictionary.

`hint` shows only constraints already implied by your feedback. It does not
invoke a model or reveal a candidate answer. This first version supports standard
five-letter Wordle and games with the same feedback rules.

## Connections

```text
Connections: new RED, BLUE, GREEN, GOLD, CAT, DOG, HORSE, COW
Connections: hint
Connections: suggest
Connections: check RED, BLUE, GREEN, CAT
Connections: one away RED, BLUE, GREEN, CAT
Connections: rejected RED, BLUE, CAT, DOG
Connections: solved CAT, DOG, HORSE, COW
Connections: status
```

Boards contain 4, 8, 12 or 16 distinct comma-separated entries; multiword entries
are supported. Only explicitly reported `solved` feedback removes entries.
`rejected` and `one away` groups are retained (up to 32); reporting contradictory
feedback requires resetting the board. `check` checks membership and prior
rejection without calling a model.

For suggestions, the local model proposes categories and alternative groups.
The checker rejects invented entries, duplicate entries and already rejected
groups, then finds complete partitions without overlap. Every partition must
also satisfy recorded one-away feedback, including groups already solved.
Search is bounded to 32 proposed groups and 100 partitions. The displayed count
is only within the proposal pool, not all possible solutions.

Category meanings remain unverified model suggestions. A valid partition is
not proof of the intended answer. A hint presents one proposed category without
listing its members; nothing is marked solved automatically. If no proposal
passes the checks, Alice reports that instead of presenting unchecked groups.

## State and model behavior

Wordle saves a small JSON checkpoint per conversation under
`backend/.local/wordle-games/` (or `WORDLE_STATE_DIR` if configured). Hashed
conversation IDs select separate files. Each checkpoint contains recorded rows,
candidate/rejected-word pools, partial feedback, and the pending guess, with a
version and update time. Derived letter constraints are rebuilt from the rows.
Writes replace the file atomically, and loaded records are checked before use.

The board now survives backend restarts and switching away from a conversation.
A new game overwrites that conversation's previous game; clearing or deleting
the conversation removes its save. A corrupt save prompts a fresh game instead
of inventing a board. A disk-write failure is reported while retaining in-memory
state. Connections remains in-memory only. No database or learning writes are
made by this tool. Only one puzzle request can run per conversation at a time;
late results cannot restore a closed session or overwrite its saved board.

Intent, observation extraction, word selection and game discussion use the configured
local Ollama general model, with bounded calls and no remote or paid fallback.
Native thinking is disabled here: a live test exhausted its token budget without
a usable result. Separate focused passes performed better in these checks.
The vocabulary requires no runtime download. Explicit commands retain their bounded
proposal flow, now with vocabulary filtering before suggestions are returned.

Use `Wordle: help` or `Connections: help` for optional command reminders. Other
game families need their own state and checking rules. No screen/monitor vision
is included; the user supplies observed colors.

## Verification

`node backend/tests/puzzleHelper.test.js` covers duplicate letters, contradictory
feedback, explicit corrections, candidate filtering, hints, malformed/unavailable
models, Connections coverage and one-away constraints, tool routing, concurrent
requests, and session isolation/closure. It is also included in
`npm --prefix backend run test:memory`, whose tests disable network access.
`wordleConversation.test.js` additionally checks normal turns, pending-guess
attribution, partial clues, corrections, pausing, unrelated chat, semantic intent
fallback, rejected words, saved feedback on model failure, and closed sessions.
`wordleStore.test.js` restores a board in a fresh Node process without chat
history, and checks replacement, per-conversation isolation, partial feedback,
corrupt saves, deletion, and closed-session writes.

The production semantic route is `wordleDialogue.js`. The older parser tests in
`wordleConversation.test.js` remain compatibility coverage; the new route has its
own `wordleDialogue.test.js` for observations, vocabulary, rejection, partial state
and persistence. Run `node backend/scripts/evaluateWordleDialogue.js` for opt-in
live model checks. Seven cases passed on October 12, 2026, including grouped
feedback, a paraphrase, unknown colors and word rejection. This is a smoke test,
not a guarantee of understanding every sentence.
