(function(root){
 'use strict';
 const signature=deck=>JSON.stringify(deck.filter(Boolean).sort());
 function createWarEngine(model,meta,rules){
  if(model.mode?.id!=='classic-1v1'||model.teamSize===2||meta.mode?.id!==model.mode.id||meta.modelVersion!==model.modelVersion)throw new Error('Les decks de guerre utilisent le modèle du 1c1 classique.');
  const core=root.createClashEngine(model),candidates=model.cardNames.filter(name=>rules.entry(name));
  const reference=meta.decks.map(row=>({deck:rules.arrange(row.cards),weight:row.weight}));
  const total=reference.reduce((sum,row)=>sum+row.weight,0);
  if(!(total>0)||reference.some(row=>!(row.weight>0)||!row.deck||!rules.validate(row.deck).valid))throw new Error('Méta classique invalide.');
  reference.forEach(row=>row.weight/=total);
  const preview=reference.length<=4?reference:Array.from({length:3},(_,index)=>{let sum=0;return {...(reference.find(row=>(sum+=row.weight)>=(index+.5)/3)||reference.at(-1)),weight:1/3};});
  const cache=new Map();let tested=0;
  const names=deck=>deck.filter(Boolean).map(key=>rules.entry(key).name);
  function score(deck,full=false){
   const key=signature(deck)+(full?'F':'P');
   if(!cache.has(key)){tested++;cache.set(key,(full?reference:preview).reduce((sum,row)=>sum+core.predict(deck,row.deck).raw*row.weight,0));}
   return cache.get(key);
  }
  function validate(decks){
   if(!Array.isArray(decks)||decks.length!==4||decks.some(deck=>!rules.validate(deck).valid||rules.coverage(deck).unknown.length))throw new Error('Quatre decks complets et connus du modèle sont nécessaires.');
   if(new Set(decks.flatMap(names)).size!==32)throw new Error('Les quatre decks doivent utiliser 32 cartes différentes, toutes formes confondues.');
   return true;
  }
  function generate(pinned=Array(8).fill(null),layout={},goal='balanced',progress){
   if(candidates.length<32)throw new Error('Il faut au moins 32 cartes disponibles dans le modèle.');
   if(!rules.validate(pinned,false).valid||rules.coverage(pinned).unknown.length)throw new Error('Les cartes conservées doivent être compatibles avec le modèle.');
   if(!['balanced','meta'].includes(goal))throw new Error('Priorité de guerre inconnue.');
   const locked=new Set(names(pinned)),config=rules.layoutOptions(layout),finalists=[];
   const clone=set=>set.map(choice=>({deck:[...choice.deck],layout:{...choice.layout}}));
   const value=(set,full=false)=>{const scores=set.map(choice=>score(choice.deck,full));return {scores,mean:scores.reduce((sum,p)=>sum+p,0)/4,min:Math.min(...scores)};};
   const better=(a,b)=>goal==='balanced'?(a.min>b.min+1e-8||Math.abs(a.min-b.min)<=1e-8&&a.mean>b.mean+1e-8):a.mean>b.mean+1e-8;
   function forms(values,preferred){
    const choices=new Map();
    for(const bits of [0,1,2,4,7]){
     const options={...config,evolution:config.evolution&&!(bits&1),hero:config.hero&&!(bits&2),mixedActive:config.mixedActive&&!(bits&4)};
     for(const choice of rules.placementOptions(values,preferred,options))if(rules.validate(choice.deck).valid)choices.set(signature(choice.deck),choice);
    }
    return [...choices.values()].sort((a,b)=>score(b.deck)-score(a.deck)||a.changeCost-b.changeCost)[0];
   }
   const seeds=[...reference].sort((a,b)=>score(b.deck)-score(a.deck)).map(row=>row.deck);
   function fill(seed,used,keep){
    const values=[...keep];
    for(const name of [...names(seed),...candidates]){
     if(values.length===8)break;if(used.has(name)||values.includes(name))continue;
     if(rules.arrange([...values,name]))values.push(name);
    }
    return values.length===8?forms(values,keep.length?pinned:seed):null;
   }
   // Several allocations are searched jointly, rather than committing to the first deck.
   const starts=Math.min(3,seeds.length),steps=starts*5;
   for(let start=0;start<starts;start++){
    const used=new Set(),set=[];
    for(let index=0;index<4;index++){
     let best=null;const keep=index===0?[...locked]:[];
     const ordered=[...seeds.slice(start),...seeds.slice(0,start)].slice(0,12);
     for(const seed of ordered){const choice=fill(seed,used,keep);if(choice&&(!best||score(choice.deck)>score(best.deck)))best=choice;}
     if(!best)throw new Error('Aucune répartition légale de 32 cartes trouvée.');
     set.push(best);names(best.deck).forEach(name=>used.add(name));
    }
    validate(set.map(choice=>choice.deck));finalists.push(clone(set));
    for(let index=0;index<4;index++){
     for(let slot=0;slot<8;slot++){
      const original=set[index],from=rules.entry(original.deck[slot]).name;
      if(index===0&&locked.has(from))continue;
      let best=original,bestValue=value(set);
      for(const name of candidates){
       if(used.has(name))continue;
       const next=[...original.deck];next[slot]=name;const deck=rules.autoDeck(next,original.layout);if(!deck||!rules.validate(deck).valid)continue;
       const candidate={deck,layout:original.layout};set[index]=candidate;const current=value(set);
       if(better(current,bestValue)){best=candidate;bestValue=current;}
      }
      set[index]=best;
      if(best!==original){used.delete(from);used.add(rules.entry(best.deck[slot]).name);}
     }
     const next=forms(names(set[index].deck),set[index].deck);if(next&&score(next.deck)>score(set[index].deck))set[index]=next;
     if(progress)progress(start*5+index+1,steps);
    }
    // Cards can move between decks when the overall allocation improves.
    const swaps=[];
    for(let first=0;first<3;first++)for(let second=first+1;second<4;second++)for(let a=0;a<8;a++)for(let b=0;b<8;b++){
     if(first===0&&locked.has(rules.entry(set[first].deck[a]).name))continue;
     const left=[...set[first].deck],right=[...set[second].deck];[left[a],right[b]]=[right[b],left[a]];
     const one=rules.autoDeck(left,set[first].layout),two=rules.autoDeck(right,set[second].layout);if(!one||!two||!rules.validate(one).valid||!rules.validate(two).valid)continue;
     const candidate=clone(set);candidate[first].deck=one;candidate[second].deck=two;
     if(better(value(candidate),value(set)))swaps.push(candidate);
    }
    swaps.sort((a,b)=>{const one=value(a),two=value(b);return goal==='balanced'?two.min-one.min||two.mean-one.mean:two.mean-one.mean;});
    finalists.push(clone(set),...swaps.slice(0,8));
    if(progress)progress(start*5+5,steps);
   }
   let best=finalists[0],metrics=value(best,true);
   for(const candidate of finalists){validate(candidate.map(choice=>choice.deck));const next=value(candidate,true);if(better(next,metrics)){best=candidate;metrics=next;}}
   if([...locked].some(name=>!names(best[0].deck).includes(name)))throw new Error('Une carte conservée manque au premier deck.');
   return {decks:best.map(choice=>choice.deck),layouts:best.map(choice=>choice.layout),probabilities:metrics.scores.map(p=>p*100),meanProbability:metrics.mean*100,minimumProbability:metrics.min*100,uniqueCards:32,goal,tested,opponents:reference.length,sourceBattles:meta.sourceBattles,
    method:'Plusieurs répartitions de 32 cartes sont comparées avec remplacements, placements des formes et échanges entre decks. Les propositions finales sont évaluées face à toute la méta classique. Meilleure répartition trouvée, sans garantie de maximum global ni de victoire.'};
  }
  return {generate,validate};
 }
 root.createClashWarEngine=createWarEngine;
 if(typeof module!=='undefined')module.exports={createWarEngine};
})(typeof self!=='undefined'?self:globalThis);
