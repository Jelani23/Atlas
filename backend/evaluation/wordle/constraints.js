// Evaluation-only checker for authored feedback. No dictionary or answer lookup.
function word(value) {
    if(typeof value!=='string'||!/^[a-z]{5}$/i.test(value))throw new Error('Expected five letters.');
    return value.toUpperCase();
}
function feedback(guess,answer){
    guess=word(guess);answer=word(answer);
    const marks=Array(5).fill('gray'),remaining={};
    for(let i=0;i<5;i++)if(guess[i]===answer[i])marks[i]='green';else remaining[answer[i]]=(remaining[answer[i]]||0)+1;
    for(let i=0;i<5;i++)if(marks[i]!=='green'&&remaining[guess[i]]>0){marks[i]='yellow';remaining[guess[i]]--;}
    return marks;
}
function validate(rows){
    if(!Array.isArray(rows)||rows.length>6)throw new Error('Expected at most six feedback rows.');
    return rows.map(r=>({guess:word(r.guess),marks:(()=>{
        if(!Array.isArray(r.marks)||r.marks.length!==5||r.marks.some(m=>!['gray','yellow','green'].includes(m)))throw new Error('Invalid feedback colors.');
        return [...r.marks];
    })()}));
}
function inspect(candidate,rows){
    rows=validate(rows);
    try{candidate=word(candidate);}catch{return {validShape:false,consistent:false,alreadyPlayed:false,conflicts:[]};}
    const conflicts=rows.flatMap(r=>{
        const actual=feedback(r.guess,candidate);
        return actual.every((m,i)=>m===r.marks[i])?[]:[{guess:r.guess,supplied:r.marks,wouldProduce:actual}];
    });
    return {validShape:true,consistent:conflicts.length===0,alreadyPlayed:rows.some(r=>r.guess===candidate),conflicts};
}
function ledger(rows){
    rows=validate(rows);
    const fixed=Array(5).fill(null),excludedAt=Array.from({length:5},()=>new Set()),min={},max={};
    for(const row of rows){
        const present={},gray=new Set();
        [...row.guess].forEach((letter,i)=>{
            if(row.marks[i]==='green')fixed[i]=letter;
            else excludedAt[i].add(letter);
            if(row.marks[i]==='gray')gray.add(letter);else present[letter]=(present[letter]||0)+1;
        });
        for(const letter of new Set(row.guess)){
            min[letter]=Math.max(min[letter]||0,present[letter]||0);
            if(gray.has(letter))max[letter]=Math.min(max[letter]??5,present[letter]||0);
        }
    }
    return {positions:fixed.map((letter,i)=>({position:i+1,fixed:letter,excluded:[...excludedAt[i]].sort()})),minimumCounts:min,maximumCounts:max,played:rows.map(r=>r.guess)};
}
module.exports={feedback,inspect,ledger};
