(function(root){
 'use strict';
 const signature=deck=>JSON.stringify(deck.filter(Boolean).sort());
 function createAdviceEngine(model,meta,rules,context={}){
  const core=root.createClashEngine(model),team=model.teamSize===2,own=context.own;
  if(meta.mode?.id!==model.mode?.id||meta.modelVersion!==model.modelVersion)throw new Error('Référence de mode incompatible.');
  if(team&&!rules.validate(own).valid)throw new Error('Complète ton deck de départ.');
  let reference=context.enemies?[{decks:team?context.enemies:context.enemies[0],weight:1}]:(team?meta.teams.map(row=>({decks:row.decks.map(deck=>rules.arrange(deck)),weight:row.weight})):meta.decks.map(row=>({decks:rules.arrange(row.cards),weight:row.weight})));
  const total=reference.reduce((sum,row)=>sum+row.weight,0);
  if(!(total>0)||reference.some(row=>!(row.weight>0)||(team?row.decks.length!==2:false)||(team?row.decks: [row.decks]).some(deck=>!deck||!rules.validate(deck).valid)))throw new Error('Méta invalide.');
  reference=reference.map(row=>({...row,weight:row.weight/total}));
  const preview=reference.length<=4?reference:Array.from({length:2},(_,i)=>{let sum=0;return {...(reference.find(row=>(sum+=row.weight)>=(i+.5)/2)||reference.at(-1)),weight:.5};});
  const memo=new Map();let tested=0;
  const against=(deck,enemies)=>core.predict(team?[own,deck]:deck,enemies).raw;
  function score(deck,full=true){const key=signature(deck)+(full?'F':'P');if(!memo.has(key)){tested++;memo.set(key,(full?reference:preview).reduce((sum,row)=>sum+against(deck,row.decks)*row.weight,0));}return memo.get(key);}
  const names=deck=>deck.filter(Boolean).map(key=>rules.entry(key).name);
  function availability(constraints={}){
   const cards=new Set(constraints.cards||[]),evos=new Set(constraints.evolutions||[]),heroes=new Set(constraints.heroes||[]);
   return deck=>deck.every(key=>{const card=rules.entry(key);return card&&!cards.has(card.name)&&!(card.mode==='evolution'&&evos.has(card.name))&&!(card.mode==='hero'&&heroes.has(card.name));});
  }
  function choices(families,preferred,layout,constraints){
   const allowed=availability(constraints),config=rules.layoutOptions(layout),unique=new Map();
   for(let bits=0;bits<8;bits++){
    const options={...config,evolution:config.evolution&&!(bits&1),hero:config.hero&&!(bits&2),mixedActive:config.mixedActive&&!(bits&4)};
    for(const choice of rules.placementOptions(families,preferred,options)){
     if(!allowed(choice.deck)||!rules.validate(choice.deck).valid)continue;
     const key=signature(choice.deck),previous=unique.get(key);
     if(!previous||choice.changeCost<previous.changeCost)unique.set(key,choice);
    }
   }
   return [...unique.values()];
  }
  function describe(original,deck,layout){
   const before=new Map(original.filter(Boolean).map((key)=>[rules.entry(key).name,key])),after=new Map(deck.filter(Boolean).map(key=>[rules.entry(key).name,key]));
   const removed=[...before].filter(([name])=>!after.has(name)).map(([,key])=>key),added=[...after].filter(([name])=>!before.has(name)).map(([,key])=>key);
   const moves=[],forms=[];
   for(const [name,key] of before){if(!after.has(name))continue;const from=original.indexOf(key),to=deck.indexOf(after.get(name));if(from!==to)moves.push({name,from,to});if(key!==after.get(name))forms.push({name,from:key,to:after.get(name)});}
   return {removed,added,moves,forms,layout};
  }
  function improve(original,layout,constraints={},excluded=[],progress){
   if(!rules.validate(original).valid||rules.coverage(original).unknown.length)throw new Error('Un deck complet connu du modèle est nécessaire.');
   const baseline=score(original),rejected=new Set(excluded),shortlist=new Map(),families=names(original),available=model.cardNames.filter(name=>rules.entry(name)&&!(constraints.cards||[]).includes(name));
   const priors=new Map();
   function formPrior(key){
    if(!key.includes('::'))return 0;
    if(!priors.has(key)){const name=rules.entry(key).name,base=[...families];let index=base.indexOf(name);if(index<0){index=0;base[0]=name;}const variant=[...base];variant[index]=key;priors.set(key,score(variant,false)-score(base,false));}
    return priors.get(key);
   }
   function consider(values){
    let options=choices(values,original,layout,constraints);
    if(reference.length>4&&options.length>8){
     const nearest=[...options].sort((a,b)=>a.changeCost-b.changeCost).slice(0,4);
     options.sort((a,b)=>b.deck.reduce((sum,key)=>sum+formPrior(key),0)-a.deck.reduce((sum,key)=>sum+formPrior(key),0)||a.changeCost-b.changeCost);
     options=[...new Map([...options.slice(0,4),...nearest].map(choice=>[signature(choice.deck),choice])).values()];
    }
    for(const choice of options){const key=signature(choice.deck);if(rejected.has(key))continue;const preliminary=score(choice.deck,false),previous=shortlist.get(key);if(!previous||choice.changeCost<previous.changeCost)shortlist.set(key,{...choice,signature:key,preview:preliminary});}
   }
   consider(families);
   for(let index=0;index<8;index++){
    const used=new Set(families.filter((_,i)=>i!==index));
    for(const name of available){if(used.has(name)||name===families[index])continue;consider(families.map((value,i)=>i===index?name:value));}
    if(progress)progress(index+1,9);
   }
   const candidates=[...shortlist.values()].sort((a,b)=>b.preview-a.preview||a.changeCost-b.changeCost).slice(0,reference.length<=4?shortlist.size:96);
   const suggestions=candidates.map(choice=>{const raw=score(choice.deck);return {...choice,raw,probability:raw*100,gain:(raw-baseline)*100,changes:describe(original,choice.deck,choice.layout)};}).filter(choice=>choice.raw>baseline+1e-7).sort((a,b)=>b.raw-a.raw||a.changeCost-b.changeCost).slice(0,64);
   if(progress)progress(9,9);
   return {baseline:baseline*100,raw:baseline,original:[...original],suggestions,best:suggestions[0]||null,tested,opponents:reference.length,sourceBattles:meta.sourceBattles,method:'Remplacements et réorganisations des formes comparés, puis classement sur la même référence. Meilleur changement trouvé parmi les compositions évaluées.'};
  }
  function generate(pinned,layout,goal='meta',progress){
   if(!rules.validate(pinned,false).valid||pinned.filter(Boolean).length>7)throw new Error('Choisis de zéro à sept cartes.');
   const selected=new Set(names(pinned)),candidates=model.cardNames.filter(name=>rules.entry(name)),ranked=new Map();
   function retain(choice){const raw=score(choice.deck);const key=signature(choice.deck),previous=ranked.get(key);if(!previous||raw>previous.raw)ranked.set(key,{...choice,raw});return {...choice,raw};}
   function arrange(values){return choices(values,pinned,layout,{}).map(choice=>({...choice,preview:score(choice.deck,false)})).sort((a,b)=>b.preview-a.preview||a.changeCost-b.changeCost).slice(0,4).map(retain).sort((a,b)=>b.raw-a.raw)[0];}
   const seeds=team?reference.flatMap(row=>row.decks):reference.map(row=>row.decks);const seen=new Set();
   for(const seed of seeds.slice(0,40)){
    const values=[...selected];for(const name of [...names(seed),...candidates])if(values.length<8&&!values.includes(name))values.push(name);
    const key=JSON.stringify([...values].sort());if(seen.has(key))continue;seen.add(key);arrange(values);
   }
   if(!ranked.size)throw new Error('Aucun deck compatible avec les cartes conservées.');
   const starts=[...ranked.values()].sort((a,b)=>b.raw-a.raw).slice(0,3);
   for(let seed=0;seed<starts.length;seed++){
    let best=starts[seed];
    for(let pass=0;pass<2;pass++){
     const start=best.raw;
     for(let index=0;index<8;index++){
      const previous=best,used=new Set(names(previous.deck));if(selected.has(rules.entry(previous.deck[index]).name))continue;
      for(const name of candidates){if(used.has(name))continue;const next=[...previous.deck];next[index]=name;const deck=rules.autoDeck(next,previous.layout);if(!deck||!rules.validate(deck).valid)continue;const candidate=retain({deck,layout:previous.layout,changeCost:0});if(candidate.raw>best.raw+1e-7)best=candidate;}
      if(progress)progress(seed*16+pass*8+index+1,starts.length*16+8);
     }
     const rearranged=arrange(names(best.deck));if(rearranged&&rearranged.raw>best.raw)best=rearranged;
     if(best.raw<=start+1e-7)break;
    }
   }
   const evaluated=[...ranked.values()].sort((a,b)=>b.raw-a.raw),metaBest=evaluated[0];let best=metaBest;
   function adversary(deck){
    let response=reference.map(row=>({deck:row.decks,raw:against(deck,row.decks)})).sort((a,b)=>a.raw-b.raw)[0];
    const generated=team?root.createClashTeamEngine(model,meta,rules).counter([own,deck],[rules.layoutOptions(),rules.layoutOptions()]).decks:core.counterLegal(deck,rules).deck;
    const value=against(deck,generated);if(value<response.raw)response={deck:generated,raw:value};
    if(!team){
     // Refine both an observed counter and the generated counter with full legal decks.
     for(const seed of [response.deck,generated]){
      let counter=seed,value=against(deck,counter);const config=rules.layoutOptions();
      for(let pass=0;pass<2;pass++)for(let slot=0;slot<8;slot++){
       const start=[...counter],used=new Set(names(start));
       for(const name of model.cardNames){if(used.has(name))continue;const next=[...start];next[slot]=name;const arranged=rules.autoDeck(next,config);if(!arranged||!rules.validate(arranged).valid)continue;const current=against(deck,arranged);if(current<value){value=current;counter=arranged;}}
      }
      if(value<response.raw)response={deck:counter,raw:value};
     }
    }
    return response;
   }
   const robustCandidates=goal==='robust'?[...new Map([...evaluated.slice(0,4),...evaluated.map(choice=>({...choice,floor:Math.min(...preview.map(row=>against(choice.deck,row.decks)))})).sort((a,b)=>b.floor-a.floor).slice(0,4)].map(choice=>[signature(choice.deck),choice])).values()]:[metaBest];
   let selectedCounter;
   for(let i=0;i<robustCandidates.length;i++){
    const candidate=robustCandidates[i],counter=adversary(candidate.deck);candidate.counter=counter;
    if(!selectedCounter||goal==='robust'&&(counter.raw>selectedCounter.raw+1e-7||Math.abs(counter.raw-selectedCounter.raw)<=1e-7&&candidate.raw>best.raw)){best=candidate;selectedCounter=counter;}
    if(progress)progress(i+1,robustCandidates.length);
   }
   return {...best,probability:best.raw*100,metaProbability:best.raw*100,counterProbability:selectedCounter.raw*100,counterLoss:(1-selectedCounter.raw)*100,counterDeck:selectedCounter.deck,goal,tested,opponents:reference.length,sourceBattles:meta.sourceBattles,added:best.deck.filter(key=>!selected.has(rules.entry(key).name)),method:goal==='robust'?'Résistance comparée aux meilleurs contres trouvés pour plusieurs compositions. Les contres sont recherchés puis améliorés, sans preuve de contre parfait ni de maximum global.':'Compositions observées, placements et remplacements successifs : meilleur score moyen trouvé. Le contre affiché est le meilleur trouvé, sans preuve de contre parfait.'};
  }
  return {improve,generate,score};
 }
 root.createClashAdviceEngine=createAdviceEngine;
 if(typeof module!=='undefined')module.exports={createAdviceEngine,signature};
})(typeof self!=='undefined'?self:globalThis);
