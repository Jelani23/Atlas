function reportInputs(record){
    if(!record)return '';
    const groups=new Map();
    for(const reference of record.inputs.references){
        if(reference.ownership==='local')continue;
        const key=reference.ownership+':'+reference.name;
        if(!groups.has(key))groups.set(key,{...reference,accesses:new Set()});
        groups.get(key).accesses.add(reference.access);
    }
    const labels={parameter:'parameter',closure:'surrounding function',module:'module binding',unresolved:'unresolved binding',unresolved_receiver:'unresolved receiver'};
    const items=[...groups.values()];
    return '\n\nAtlas source reference inventory (not runtime values):\n'+(items.length?items.slice(0,12).map(r=>`${r.name}: ${labels[r.ownership]}; ${[...r.accesses].join(', ')}. Source: ${r.span.path}:${r.span.line}`).join('\n'):'No nonlocal references identified in the inspected function body and parameter initializers.')+(items.length>12?'\nAdditional references omitted from this display.':'')+'\nCall results, object aliasing and property-write effects are not established by this inventory.';
}
module.exports={reportInputs};
