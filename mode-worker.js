'use strict';
importScripts(...['engine.js','deck-rules.js','team-engine.js','advice-engine.js','war-engine.js'].map(file=>file+(self.location?.search||'')));
let model,meta,mode,generation=0;
self.onmessage=async event=>{
 const message=event.data,{id,type,catalogue}=message;
 try{
  if(type==='load'){
   const token=++generation;mode=message.mode;model=null;meta=null;
   const get=async path=>{if(!/^(?:modes\/[a-z0-9-]+\/)?(?:model|meta-decks)\.json$/.test(path))throw new Error('Chemin de modèle invalide.');const url=message.modelVersion?`${path}?version=${encodeURIComponent(message.modelVersion)}`:path;const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('Modèle indisponible.');return response.json();};
   const [next,reference]=await Promise.all([get(message.modelPath),get(message.metaPath)]);if(token!==generation)return;
   if(next.mode?.id!==mode.id||reference.mode?.id!==mode.id||next.modelVersion!==reference.modelVersion||next.deckInputContract!=='slot-activation-v1'||(next.teamSize||1)!==mode.teamSize)throw new Error('Le modèle ne correspond pas au mode choisi.');
   model=next;meta=reference;self.postMessage({id,type:'ready',modelVersion:model.modelVersion,cards:model.cardNames});return;
  }
  if(!model)throw new Error('Le modèle du mode se prépare.');
  const rules=ClashDeckRules.createRules(catalogue,model.cardNames),{own,ally,enemies,layout,layouts,allowed,goal,constraints,excluded}=message;
  if(type==='war'){
   const result=createClashWarEngine(model,meta,rules).generate(message.keepWarCards?own:Array(8).fill(null),layout,goal,(step,total)=>self.postMessage({id,type:'progress',step,total}));
   self.postMessage({id,type:'result',result});return;
  }
  const validate=(deck,complete=true)=>{const v=rules.validate(deck,complete);if(!v.valid)throw new Error(v.reason);if(rules.coverage(deck).unknown.length)throw new Error('Une carte est absente du modèle de ce mode.');};
  if(type!=='counter')validate(own,!(type==='complete'&&mode.teamSize===1));if(enemies)enemies.forEach(deck=>validate(deck));
  if(ally&&!['counter','generate'].includes(type))validate(ally,type==='improve'||type==='predict');
  if(mode.strategy==='draft'&&type!=='predict'&&(!allowed||allowed.length<8))throw new Error('Indique au moins huit cartes disponibles pour ce tirage.');
  if(mode.strategy==='draft'&&['complete','improve'].includes(type)&&(mode.teamSize===2?ally:own).filter(Boolean).some(key=>!allowed.includes(rules.entry(key).name)))throw new Error('Ajoute les cartes conservées au choix disponible dans ce tirage.');
  const progress=(step,total)=>self.postMessage({id,type:'progress',step,total});let result;
  if(type==='improve'||type==='generate'||type==='complete'&&(mode.teamSize===2?ally:own).filter(Boolean).length===0){
   const advice=createClashAdviceEngine(allowed?{...model,cardNames:model.cardNames.filter(name=>allowed.includes(name))}:model,meta,rules,{own,enemies});
   result=type==='improve'?advice.improve(mode.teamSize===2?ally:own,layout,constraints,excluded,progress):advice.generate(type==='generate'?Array(8).fill(null):mode.teamSize===2?ally:own,layout,goal,progress);
  }else if(mode.teamSize===2){
   const engine=createClashTeamEngine(model,meta,rules);
   if(type==='predict')result=engine.predict([own,ally],enemies);
   else if(type==='generate'||type==='complete')result=engine.optimize(own,type==='generate'?Array(8).fill(null):ally,layout,enemies,allowed,progress);
   else if(type==='improve')result=engine.improve(own,ally,layout,enemies,allowed,progress);
   else if(type==='counter')result=engine.counter(enemies,layouts,progress);
   else throw new Error('Action inconnue.');
  }else{
   const engine=createClashEngine(allowed?{...model,cardNames:model.cardNames.filter(name=>allowed.includes(name))}:model);
   const reference=enemies?{...meta,decks:[{cards:enemies[0],weight:1}]}:meta;
   if(type==='predict')result=engine.predict(own,enemies[0]);
   else if(type==='counter')result=engine.counterLegal(enemies[0],rules,{layout},progress);
   else if(type==='complete')result=engine.completeDeck(own,rules,reference,progress,layout);
   else if(type==='improve')result=engine.improveDeck(own,rules,reference,progress,layout);
   else throw new Error('Action inconnue.');
  }
  self.postMessage({id,type:'result',result});
 }catch(error){self.postMessage({id,type:'error',message:error.message});}
};
