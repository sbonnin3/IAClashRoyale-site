(function(root){
 'use strict';
 function createTeamEngine(model,meta,rules){
  if(model.teamSize!==2||meta.mode?.id!==model.mode?.id||meta.modelVersion!==model.modelVersion||!meta.teams?.length)throw new Error('Modèle et référence 2c2 incompatibles.');
  const core=root.createClashEngine(model),total=meta.teams.reduce((sum,row)=>sum+row.weight,0);
  if(!(total>0))throw new Error('Méta 2c2 vide.');
  const pool=meta.teams.map(row=>({decks:row.decks,weight:row.weight/total}));
  for(const row of pool){if(row.decks?.length!==2||row.decks.some(deck=>!rules.arrange(deck)))throw new Error('Équipe de référence invalide.');}
  function objective(own,enemies=null){
   if(!rules.validate(own).valid)throw new Error('Complète le premier deck allié.');
   const reference=enemies?[{decks:enemies,weight:1}]:pool;
   if(enemies&&(enemies.length!==2||enemies.some(deck=>!rules.validate(deck).valid)))throw new Error('Complète les deux decks adverses.');
   const cache=new Map();
   return deck=>{const signature=JSON.stringify([...deck].filter(Boolean).sort());if(!cache.has(signature))cache.set(signature,reference.reduce((sum,row)=>sum+core.predict([own,deck],row.decks).raw*row.weight,0));return cache.get(signature);};
  }
  function optimize(own,pinned,layout,enemies=null,allowed=null,progress=null){
   if(!rules.validate(pinned,false).valid||pinned.filter(Boolean).length>7)throw new Error('La génération accepte de zéro à sept cartes conservées.');
   const selected=new Set(pinned.filter(Boolean).map(value=>rules.entry(value).name)),score=objective(own,enemies);
   const candidates=core.cardNames.filter(name=>rules.entry(name)&&(!allowed||allowed.includes(name)));
   if(candidates.length<8||[...selected].some(name=>!candidates.includes(name)))throw new Error('Le choix de cartes ne permet pas huit familles compatibles.');
   let tested=0,best=null;
   function evaluate(families,all=false){
    const choices=rules.placementOptions(families,pinned,layout);
    // Seed search favors a small set of layouts; a seven-card completion is exhaustive.
    for(const choice of all?choices:choices.slice(0,24)){tested++;const raw=score(choice.deck);if(!best||raw>best.raw+1e-7||Math.abs(raw-best.raw)<=1e-7&&choice.changeCost<best.changeCost)best={...choice,raw};}
   }
   if(selected.size===7){for(const name of candidates)if(!selected.has(name))evaluate([...selected,name],true);}
   else{
    const seeds=pool.flatMap(row=>row.decks).slice(0,32);const seen=new Set();
    for(const seed of seeds){const families=[...selected];for(const value of seed){const name=rules.entry(value).name;if(!families.includes(name)&&candidates.includes(name)&&families.length<8)families.push(name);}for(const name of candidates)if(families.length<8&&!families.includes(name))families.push(name);const signature=JSON.stringify([...families].sort());if(!seen.has(signature)){seen.add(signature);evaluate(families);}}
    if(!best)throw new Error('Aucune composition légale.');
    // Coordinate search measures full eight-card decks, and only replaces added families.
    for(let pass=0;pass<2;pass++){
     const start=best.raw;
     for(let index=0;index<8;index++){
      const previous=best,from=rules.entry(previous.deck[index]).name;if(selected.has(from))continue;
      const used=new Set(previous.deck.map(value=>rules.entry(value).name));
      for(const name of candidates){if(used.has(name))continue;const next=[...previous.deck];next[index]=name;const deck=rules.autoDeck(next,previous.layout);if(!deck)continue;tested++;const raw=score(deck);if(raw>best.raw+1e-7)best={...previous,deck,raw};}
      if(progress)progress(pass*8+index+1,16);
     }
     evaluate(best.deck.map(value=>rules.entry(value).name),true);
     if(best.raw<=start+1e-7)break;
    }
   }
   if(!best)throw new Error('Aucune composition légale.');
   return {...best,probability:best.raw*100,tested,added:best.deck.filter(value=>!selected.has(rules.entry(value).name)),
    opponents:enemies?1:pool.length,sourceBattles:meta.sourceBattles,
    method:selected.size===7?'Tous les ajouts et toutes les répartitions légales des formes sont comparés.':'Compositions observées, placements puis remplacements successifs ; meilleur score trouvé, sans garantie de maximum global.'};
  }
  function improve(own,deck,layout,enemies=null,allowed=null,progress=null){
   if(!rules.validate(deck).valid)throw new Error('Complète les huit cartes du deck allié.');
   const score=objective(own,enemies),baseline=score(deck),cards=[];let tested=0;
   for(let index=0;index<8;index++){
    const from=deck[index],used=new Set(deck.map(value=>rules.entry(value).name));let best=null;
    for(const name of core.cardNames){if(used.has(name)||allowed&&!allowed.includes(name))continue;
     const value=rules.forSlot(index,name,layout);if(value===undefined)continue;const next=[...deck];next[index]=value;if(!rules.validate(next).valid)continue;
     tested++;const raw=score(next);if(raw>baseline+1e-7&&(!best||raw>best.raw))best={index,from,to:value,deck:next,raw,probability:raw*100,gain:(raw-baseline)*100};
    }
    cards.push({index,from,suggestion:best});if(progress)progress(index+1,8);
   }
   const best=cards.map(row=>row.suggestion).filter(Boolean).sort((a,b)=>b.raw-a.raw)[0]||null;
   return {baseline:baseline*100,original:deck,cards,best,tested,opponents:enemies?1:pool.length,sourceBattles:meta.sourceBattles};
  }
  function counter(enemies,layouts,progress){
   let best=null;
   for(const row of pool){const decks=row.decks.map((deck,i)=>rules.autoDeck(rules.arrange(deck),layouts[i]));if(decks.some(deck=>!deck))continue;const raw=core.predict(decks,enemies).raw;if(!best||raw>best.raw)best={decks,raw,layouts};}
   if(!best)throw new Error('Aucune équipe légale.');
   for(let side=0;side<2;side++){
    const result=optimize(best.decks[1-side],Array(8).fill(null),best.layouts[side],enemies,null,progress);
    if(result.raw>best.raw){best.decks[side]=result.deck;best.layouts[side]=result.layout;best.raw=result.raw;}
   }
   return {...best,probability:best.raw*100,sourceBattles:meta.sourceBattles,method:'Deux decks optimisés successivement contre l’équipe adverse ; meilleur résultat trouvé.'};
  }
  return {predict:core.predict,optimize,improve,counter};
 }
 root.createClashTeamEngine=createTeamEngine;
 if(typeof module!=='undefined')module.exports={createTeamEngine};
})(typeof self!=='undefined'?self:globalThis);
