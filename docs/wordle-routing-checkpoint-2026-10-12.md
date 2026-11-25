# Wordle routing and local checkpoints — October 12, 2026

The supplied transcript begins with “Alright Alice, I want to test out the new
Wordle integration we added. Can you give me your first guess?” The previous
start detector did not recognize that request. In source-level replay it fell
through to ordinary chat, bypassing recorded constraints and checked guesses.
The transcript lacks runtime routing logs, so it cannot establish which backend
revision was running. The separately reported refusal to guess without seeing
the board also differs from the helper's response format.

The detector now accepts that opening and follow-up requests to continue
solving. Feedback accepts “RIVER had everything as gray.” Named partial reports
stay inside the helper and block another guess until complete. Partial or
unsupported reports do not silently become ordinary-chat guesses.

The long looping passage in the transcript is not proof that native reasoning
tokens were shown. The interface forwards only content-channel tokens; the
ordinary-chat filter uses tags and limited prose heuristics, which do not
identify every self-correction loop. The transcript does not provide raw token
types. This change fixes the Wordle bypass; it does not claim to solve all
content-channel narration in general chat. Puzzle generation returns checked
structured candidates, never raw model narration, including malformed outputs.

Wordle checkpoints now live in backend/.local/wordle-games, one hashed filename
per conversation. They persist rows, partial observations and pending guesses
without using chat history or learned memory. Files are atomically replaced,
validated on restore, reset for a new game, and removed on conversation clear or
delete. Closing a session preserves its checkpoint but blocks late writes.
Save errors are reported without discarding the live board.

Verification: 133 offline test files passed. Additional focused checks cover
save failure, clear/delete hooks and raw-prose rejection. A fresh-process test
restored a pending guess without chat history. In a local-model smoke test, the
exact opening produced TRAIN; reporting RIVER as all gray recorded BBBBB and
produced CLOUD, which obeys those exclusions. This is an integration check, not
a puzzle-solving accuracy benchmark or evidence of dictionary eligibility.

Restart the running backend to load these edits. Existing failed chats do not
have a reliable structured board to import automatically; start a new game or
explicitly provide the recorded guesses and colors.
