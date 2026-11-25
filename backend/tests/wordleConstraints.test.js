const assert=require('node:assert/strict');
const {feedback,inspect,ledger}=require('../evaluation/wordle/constraints');
const {rows}=require('../evaluation/wordle/cases');
// Disclosed solution is used only for offline reference checks, never prompts.
for(const row of rows)assert.deepEqual(feedback(row.guess,'RIVER'),row.marks);
assert(inspect('RIVER',rows).consistent);
assert(inspect('RIDER',rows).consistent); // Feedback does not establish a unique answer.
assert(!inspect('FLIER',rows).consistent);
assert(!inspect('BRIER',rows).consistent);
assert(inspect('BRIER',rows).alreadyPlayed);
assert(!inspect('CRIME',rows.slice(0,1)).consistent);
assert(!inspect('BRAINN',rows).validShape);
assert(inspect('SLATE',[]).consistent);
assert.deepEqual(feedback('ARRAY','RIVER'),['gray','yellow','yellow','gray','gray']);
assert.deepEqual(feedback('RERER','RIVER'),['green','gray','gray','green','green']);
const state=ledger(rows);
assert.equal(state.positions[3].fixed,'E');assert.equal(state.positions[4].fixed,'R');
assert.equal(state.minimumCounts.R,2);assert.equal(state.minimumCounts.I,1);
assert.equal(state.maximumCounts.B,0);assert.equal(state.maximumCounts.C,0);
assert(state.positions[2].excluded.includes('I'));assert(state.positions[3].excluded.includes('I'));
assert.throws(()=>ledger([{guess:'BRAIN',marks:['green']}]),/colors/);
console.log('Wordle feedback: duplicate counts, positions, exclusions and non-unique solutions passed.');
