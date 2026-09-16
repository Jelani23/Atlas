// Shared, side-effect-free recognition for tool-inventory questions. Match
// the entire request: a quoted question or a mixed action is not an inventory.
function isToolInventoryRequest(message) {
    const text = String(message || '').trim().toLowerCase().replace(/’/g, "'")
        .replace(/^(?:(?:please|alice)[,\s]+)+/, '').replace(/[?!.]+$/, '').trim()
        .replace(/[,\s]+please$/, '').trim();
    const object = '(?:(?:all|all of) )?(?:the |your )?(?:available )?tools';
    const ownership = '(?:(?:that )?you have(?: available)?(?: to (?:use|access))?|do you have(?: available)?(?: to (?:use|access))?|can you (?:use|access)|you can (?:use|access)|are available(?: to you)?)';
    const suffix = '(?: and (?:what are )?their limitations)?';
    return new RegExp(`^(?:(?:can|could|would) you )?(?:give|show) me (?:a |the )?list of ${object}(?: ${ownership})?${suffix}$`).test(text)
        || new RegExp(`^(?:(?:can|could|would) you )?tell me (?:what|which) tools (?:you (?:can (?:use|access)|have(?: available)?))${suffix}$`).test(text)
        || new RegExp(`^(?:what|which) (?:are )?${object}(?: ${ownership})?${suffix}$`).test(text)
        || new RegExp(`^(?:(?:can|could|would) you )?(?:list|show|tell me)(?: me)? ${object}(?: ${ownership})?${suffix}$`).test(text);
}

module.exports = { isToolInventoryRequest };
