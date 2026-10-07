'use strict';
importScripts('engine.js','deck-rules.js');
let engine;
let meta;
Promise.all(['model.json','meta-decks.json'].map(path=>fetch(path).then(response => {
  if (!response.ok) throw new Error('Model loading failed');
  return response.json();
}))).then(([model,reference]) => {
  meta=reference;
  engine = createClashEngine(model);
  if(model.mode?.id!=='classic-1v1'||meta.mode?.id!=='classic-1v1'||meta.modelVersion!==model.modelVersion||model.deckInputContract!=='slot-activation-v1')throw new Error('Mode ou contrat de cartes incompatible');
  self.postMessage({type: 'ready', cards: engine.cardNames, schemaVersion:engine.schemaVersion,mode:engine.mode,modelVersion:model.modelVersion,deckInputContract:model.deckInputContract});
}).catch(() => self.postMessage({type: 'error', message: 'Le modèle n’a pas pu être chargé. Recharge la page pour réessayer.'}));
self.onmessage = event => {
  const {id, type, deck1, deck2, enemy, partial, deck, catalogue, options, layout} = event.data;
  try {
    if (!engine) throw new Error('Le modèle est encore en cours de chargement.');
    const rules=ClashDeckRules.createRules(catalogue,engine.cardNames);
    const decks=type==='predict'?[deck1,deck2]:type==='complete'?[partial]:type==='improve'?[deck]:[enemy];
    for(const deck of decks) {
      const validation=rules.validate(deck,type!=='complete');
      if(!validation.valid) throw new Error(validation.reason);
      if(layout&&JSON.stringify(rules.autoDeck(deck,layout))!==JSON.stringify(deck))throw new Error('Les formes actives ne correspondent pas aux emplacements.');
      const coverage=rules.coverage(deck);
      if(coverage.unknown.length) throw new Error(`Le modèle ne connaît pas : ${coverage.unknown.join(', ')}. Aucun pourcentage fiable ne peut être calculé.`);
    }
    let result;
    if (type === 'predict') result = engine.predict(engine.schemaVersion>=2?deck1:rules.coverage(deck1).names, engine.schemaVersion>=2?deck2:rules.coverage(deck2).names);
    else if (type === 'counter') result = engine.counterLegal(enemy,rules,options,step => self.postMessage({id, type: 'progress', step}));
    else if (type === 'complete') result = engine.completeDeck(partial,rules,meta,(step,total) => self.postMessage({id,type:'progress',action:'complete',step,total}),layout);
    else if (type === 'improve') result = engine.improveDeck(deck,rules,meta,(step,total) => self.postMessage({id,type:'progress',action:'improve',step,total}),layout);
    else throw new Error('Action inconnue.');
    self.postMessage({id, type: 'result', result});
  } catch(error) { self.postMessage({id, type: 'request-error', message: error.message}); }
};
