// Fixed imports of inspected, authored pure fixtures only. Never load a model-selected path.
const {manifest,typed}=require('./harness');
const fixtures={
    'fallback': require('./fixtures/fallback').renderValue,
    'numeric-prefix': require('./fixtures/numeric-prefix').prefixNumber,
    'guard-method': require('./fixtures/guard-method').lower,
    'delete-punctuation': require('./fixtures/delete-punctuation').joined,
    'set-order': require('./fixtures/set-order').unique,
    'branch-priority': require('./fixtures/branch-priority').status,
    'descending-bound': require('./fixtures/descending-bound').sizes,
    'helper-flow': require('./fixtures/helper-flow').twice,
    'alias-state': require('./fixtures/alias-state').aliasCount,
    'caller-normalizes': require('./fixtures/caller-normalizes').handle,
    'trim-pipeline': require('./fixtures/trim-pipeline').tokenCount,
    'nullish': require('./fixtures/nullish').defaultCount,
    'numeric-whole': require('./fixtures/numeric-whole').wholeNumber,
    'exception-boundary': require('./fixtures/exception-boundary').safeParse,
    'utf16': require('./fixtures/utf16').middleUnit,
    'map-reinsert': require('./fixtures/map-reinsert').reinsert,
    'finally-return': require('./fixtures/finally-return').finish,
    'loop-continue': require('./fixtures/loop-continue').sumOddSlots,
    'helper-shadow': require('./fixtures/helper-shadow').entry,
    'regex-state': require('./fixtures/regex-state').testTwice,
    'caller-truthiness': require('./fixtures/caller-truthiness').shouldSave,
    'short-circuit': require('./fixtures/short-circuit').choose
};
function observations() {
    return manifest.cases.filter(c=>c.executable).map(test=>({id:test.id,probes:test.probes.map(p=>{
        try {return {id:p.id,actual:{kind:'return',value:typed(fixtures[test.id](...structuredClone(p.args)))}};}
        catch(error) {return {id:p.id,actual:{kind:'throw',errorName:error.name}};}
    })}));
}
module.exports={observations};

