// Abridged from the user's supplied Alice transcript. The disclosed solution is
// deliberately absent: this benchmark checks consistency, not secret-word recall.
const rows=[
    {guess:'BRAIN',marks:['gray','yellow','gray','yellow','gray']},
    {guess:'CRIME',marks:['gray','yellow','yellow','gray','yellow']},
    {guess:'BRIER',marks:['gray','yellow','yellow','green','green']}
];
const history=[
    {role:'user',content:'I started with Brain. The R and I are yellow, the rest are gray.'},
    {role:'assistant',content:'A strong candidate is CRIME.'},
    {role:'user',content:'I tried Crime. R, I and E are yellow. C and M are gray.'},
    {role:'assistant',content:'A strong candidate is BRIER.'},
    {role:'user',content:'For BRIER, B is gray, the first R and I are yellow, and E and the last R are green.'},
    {role:'assistant',content:'A strong candidate is FLIER.'},
    {role:'user',content:'No, that feedback was for BRIER. We have not played FLIER. E and the last R are green; the first R and I are yellow. Give a new candidate consistent with all feedback.'}
];
module.exports={rows,history};
