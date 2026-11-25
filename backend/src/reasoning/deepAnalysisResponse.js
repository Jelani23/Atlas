// Diagnostics only: preserve returned content, including legitimate source examples.
const VERSION='deep-response-1';
function inspectResponse(data){
    const message=data?.message;
    const answer=typeof message?.content==='string'?message.content:'';
    const issues=[];
    if(message?.role!=='assistant')issues.push('unexpected_message_role');
    if(typeof message?.content!=='string')issues.push('invalid_content_type');
    if(message?.thinking!==undefined&&typeof message.thinking!=='string')issues.push('invalid_thinking_type');
    if(data?.done!==true)issues.push('transport_not_done');
    if(data?.done_reason!=='stop')issues.push(data?.done_reason==='length'?'token_budget_exhausted':'unconfirmed_stop_reason');
    if(!answer.trim())issues.push('empty_content');
    if(message?.tool_calls?.length)issues.push('unexpected_tool_calls');
    const warnings=[];
    if(/<\/?think>/i.test(answer))warnings.push('literal_thinking_tag_in_content');
    if(/(?:^|\n)\s*(?:Okay,? let me|Let me (?:think|analyze)|We need to|I need to|Thinking:|Analysis:)/i.test(answer))warnings.push('possible_drafting_in_content');
    return {version:VERSION,answer,thinkingChars:typeof message?.thinking==='string'?message.thinking.length:0,
        status:issues.length?'incomplete':'complete',issues,warnings,
        channelReview:warnings.length?'manual_review_required':'not_automatically_verified',semanticStatus:'unreviewed'};
}
module.exports={inspectResponse,VERSION};
