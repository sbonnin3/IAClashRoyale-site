(function (root) {
  'use strict';
  const f = Math.fround;
  function roundEven(x) {
    const n = Math.floor(x), r = x - n;
    return r < 0.5 ? n : r > 0.5 ? n + 1 : n % 2 ? n + 1 : n;
  }
  function percent(p) { return f(roundEven(f(f(p * 100) * 100)) / 100); }
  function createEngine(model) {
    const count = model.cardNames.length;
    const featureKeys = model.featureKeys || model.cardNames;
    const featureCount = featureKeys.length;
    const featureIndices = new Map(featureKeys.map((name,index)=>[name,index]));
    const indices = new Map(model.cardNames.map((name, index) => [name, index]));
    // Slot order and teammate order do not change the model's input. Reuse exact
    // results when the search examines equivalent placements, with bounded memory.
    const predictionCache = new Map();
    function vectorFor(deck1, deck2) {
      if(model.teamSize===2&&[deck1,deck2].some(team=>!Array.isArray(team)||team.length!==2||team.some(deck=>!Array.isArray(deck))))throw new Error('Le modèle 2c2 exige deux decks par équipe.');
      const vector = new Uint8Array(featureCount * 2);
      [deck1,deck2].forEach((decks,side)=>(model.teamSize===2?decks:[decks]).forEach(deck=>deck.forEach(key=>{
        if(!key)return;
        const name=key.split('::')[0];
        if(featureIndices.has(name))vector[side*featureCount+featureIndices.get(name)]+=1;
        if(model.featureKeys && key!==name && featureIndices.has(key))vector[side*featureCount+featureIndices.get(key)]+=1;
      })));
      return vector;
    }
    function rawProbability(vector) {
      let margin = f(model.baseMargin);
      for (const tree of model.trees) {
        let node = 0;
        while (tree.left[node] !== -1) {
          node = vector[tree.feature[node]] < tree.threshold[node] ? tree.left[node] : tree.right[node];
        }
        margin = f(margin + tree.threshold[node]);
      }
      if(model.calibrationScale)margin=f(margin*model.calibrationScale);
      return f(1 / f(1 + f(Math.exp(-margin))));
    }
    function probability(vector) {
      const forward=rawProbability(vector);
      if(!model.symmetric)return forward;
      const reverse=new Uint8Array(vector.length);
      reverse.set(vector.subarray(featureCount),0);reverse.set(vector.subarray(0,featureCount),featureCount);
      return f(f(f(forward+1)-rawProbability(reverse))/2);
    }
    function predict(deck1, deck2) {
      if(model.teamSize===2&&[deck1,deck2].some(team=>!Array.isArray(team)||team.length!==2||team.some(deck=>!Array.isArray(deck))))throw new Error('Le modèle 2c2 exige deux decks par équipe.');
      const canonical=deck=>(model.teamSize===2?deck.flat():deck).filter(Boolean).slice().sort();
      const key=JSON.stringify([canonical(deck1),canonical(deck2)]);
      const cached=predictionCache.get(key);
      if(cached!==undefined)return {p1:percent(cached),p2:percent(f(1-cached)),raw:cached};
      const p1 = probability(vectorFor(deck1, deck2));
      if(predictionCache.size>=10000)predictionCache.delete(predictionCache.keys().next().value);
      predictionCache.set(key,p1);
      return { p1: percent(p1), p2: percent(f(1 - p1)), raw: p1 };
    }
    function counter(enemy, progress) {
      const deck = [];
      const history = [];
      let bestProb = 0;
      const vector = vectorFor([], enemy);
      for (let slot = 0; slot < 8; slot++) {
        let bestIndex = -1;
        bestProb = -1;
        for (let index = 0; index < count; index++) {
          if (vector[index]) continue;
          vector[index] = 1;
          const prob = probability(vector);
          vector[index] = 0;
          if (prob > bestProb) { bestProb = prob; bestIndex = index; }
        }
        vector[bestIndex] = 1;
        deck.push(model.cardNames[bestIndex]);
        history.push({card: model.cardNames[bestIndex], probability: percent(bestProb)});
        if (progress) progress(slot + 1);
      }
      return {deck, probability: percent(bestProb), raw: bestProb, history};
    }
    function counterLegal(enemy, rules, options = {}, progress) {
      const limits = {evolution: options.evolutions ?? null, hero: options.heroes ?? null};
      for (const value of Object.values(limits)) if (value !== null && (!Number.isInteger(value) || value < 0 || value > 2)) throw new Error('Choisis entre zéro et deux formes spéciales de chaque type.');
      if ((limits.evolution || 0) + (limits.hero || 0) > 3) throw new Error('Le deck ne peut pas contenir deux évolutions et deux héros.');
      const candidates = [];
      for (const name of model.cardNames) {
        const card = rules.entry(name);
        if (!card) continue;
        candidates.push(card);
        if ((limits.evolution > 0 || model.featureKeys && limits.evolution===null) && card.hasEvolution) candidates.push(rules.entry(rules.key(name,'evolution')));
        if ((limits.hero > 0 || model.featureKeys && limits.hero===null) && card.hasHero) candidates.push(rules.entry(rules.key(name,'hero')));
      }
      function feasible(deck) {
        if (!rules.arrange(deck.map(item=>item.key),null,options.layout)) return false;
        const counts = {evolution:0,hero:0};
        deck.forEach(item=>{if(item.category !== 'normal') counts[item.category]++;});
        let missing=0;
        const used = new Set(deck.map(item=>item.name));
        const pools=[];
        for(const category of ['evolution','hero']) {
          if(limits[category] === null) continue;
          const need=limits[category]-counts[category];
          if(need < 0) return false;
          missing+=need;
          const pool=new Set(candidates.filter(item=>item.category===category && !used.has(item.name)).map(item=>item.name));
          if(pool.size<need) return false;
          if(need) pools.push(pool);
        }
        return missing <= 8-deck.length && new Set(pools.flatMap(pool=>[...pool])).size >= missing;
      }
      const deck=[], history=[];
      let vector=vectorFor([],model.featureKeys ? enemy : rules.coverage(enemy).names);
      let bestProb=0;
      for(let slot=0;slot<8;slot++) {
        let best=null;bestProb=-1;
        for(const candidate of candidates) {
          if(deck.some(item=>item.name===candidate.name) || !feasible([...deck,candidate])) continue;
          const candidateVector=vectorFor([...deck.map(item=>item.key),candidate.key],model.featureKeys ? enemy : rules.coverage(enemy).names);
          const value=probability(candidateVector);
          if(value>bestProb) {bestProb=value;best=candidate;}
        }
        if(!best) throw new Error('Aucun contre-deck ne respecte ces choix avec les cartes du modèle.');
        deck.push(best);vector=vectorFor(deck.map(item=>item.key),model.featureKeys ? enemy : rules.coverage(enemy).names);
        history.push({card:best.key,probability:percent(bestProb)});
        if(progress) progress(slot+1);
      }
      return {deck:rules.arrange(deck.map(item=>item.key),null,options.layout),probability:percent(bestProb),raw:bestProb,history};
    }
    function metaReference(rules,meta) {
      if(!Array.isArray(meta?.decks)||!meta.decks.length||meta.modelVersion!==model.modelVersion||meta.mode?.id!==model.mode?.id)throw new Error('La référence de ce mode est indisponible ou incompatible.');
      const pool=meta.decks.map(row=>{
        const deck=rules.arrange(row.cards);
        if(!deck||!rules.validate(deck).valid||rules.coverage(deck).unknown.length||!(row.weight>0&&Number.isFinite(row.weight)))throw new Error('Référence de méta invalide.');
        return {deck,weight:row.weight};
      });
      const weightSum=pool.reduce((sum,row)=>sum+row.weight,0);
      pool.forEach(row=>row.weight/=weightSum);
      return pool;
    }
    function allCandidates(rules) {
      return model.cardNames.flatMap(name=>{
        const card=rules.entry(name);if(!card)return [];
        return [card,...(card.hasEvolution?[rules.entry(rules.key(name,'evolution'))]:[]),...(card.hasHero?[rules.entry(rules.key(name,'hero'))]:[])];
      });
    }
    function improveDeck(original,rules,meta,progress,layout=null) {
      const validation=rules.validate(original);
      if(!validation.valid)throw new Error(validation.reason);
      if(rules.coverage(original).unknown.length)throw new Error('Une carte choisie ne possède pas encore de données dans le modèle.');
      const pool=metaReference(rules,meta),candidates=allCandidates(rules),memo=new Map();
      function score(deck){
        const signature=JSON.stringify([...deck].sort());
        if(!memo.has(signature))memo.set(signature,pool.reduce((sum,row)=>sum+probability(vectorFor(deck,row.deck))*row.weight,0));
        return memo.get(signature);
      }
      const baseline=score(original),cards=[];let tested=0;
      original.forEach((from,index)=>{
        const others=original.filter((_,i)=>i!==index),used=new Set(others.map(key=>rules.entry(key).name));
        let best=null;
        for(const candidate of candidates){
          if(candidate.key===from||used.has(candidate.name))continue;
          const direct=original.map((key,i)=>i===index?candidate.key:key);
          const conforms=!layout||JSON.stringify(rules.autoDeck(direct,layout))===JSON.stringify(direct);
          const deck=rules.validate(direct).valid&&conforms?direct:rules.arrange([...others,candidate.key],null,layout);
          if(!deck||!rules.validate(deck).valid)continue;
          tested++;
          const raw=score(deck);
          if(!best||raw>best.raw)best={index,from,to:candidate.key,deck,raw,probability:percent(raw),gain:(raw-baseline)*100};
        }
        cards.push({index,from,suggestion:best&&best.raw>baseline+1e-7?best:null});
        if(progress)progress(index+1,8);
      });
      const suggestions=cards.map(row=>row.suggestion).filter(Boolean).sort((a,b)=>b.raw-a.raw||a.index-b.index);
      return {original:[...original],baseline:percent(baseline),raw:baseline,cards,best:suggestions[0]||null,
        opponents:pool.length,sourceBattles:meta.sourceBattles,updatedAt:meta.updatedAt,tested,
        mode:meta.mode,method:'Tous les remplacements légaux d’une seule carte sont évalués sur la même méta. Les gains des propositions ne se cumulent pas.'};
    }
    function completeDeck(pinned,rules,meta,progress,layout=null) {
      const n=pinned.filter(Boolean).length;
      if(n<1||n>7)throw new Error('Choisis entre une et sept cartes avant de compléter le deck.');
      const validation=rules.validate(pinned,false);
      if(!validation.valid)throw new Error(validation.reason);
      if(rules.coverage(pinned).unknown.length)throw new Error('Une carte choisie ne possède pas encore de données dans le modèle.');
      const pool=metaReference(rules,meta).map(row=>({...row,enemy:vectorFor([],row.deck).slice(featureCount)}));
      const preview=[];
      for(let i=0;i<4;i++){
        const target=(i+.5)/4;let cumulative=0;
        const row=pool.find(row=>(cumulative+=row.weight)>=target)||pool[pool.length-1];
        preview.push({...row,weight:1/4});
      }
      const memo=new Map();
      function score(deck,full=true){
        const signature=JSON.stringify(deck.filter(Boolean).sort())+(full?'F':'P');
        if(memo.has(signature))return memo.get(signature);
        let value=0;const vector=vectorFor(deck,[]);
        for(const row of full?pool:preview){vector.set(row.enemy,featureCount);value+=probability(vector)*row.weight;}
        memo.set(signature,value);return value;
      }
      const selected=pinned.filter(Boolean).map(key=>rules.entry(key).name),selectedSet=new Set(selected);
      const candidates=model.cardNames.filter(name=>rules.entry(name));
      let beam=[{families:selected}],tested=0;
      const missing=8-n;
      const exact=missing===1,familyMemo=new Map();
      const compare=(a,b)=>b.score-a.score||a.changeCost-b.changeCost;
      function preliminary(families){
        const identity=JSON.stringify([...families].sort());
        if(familyMemo.has(identity))return familyMemo.get(identity);
        const choices=rules.placementOptions(families,pinned,layout||{});
        tested+=choices.length;
        const result=choices.map(choice=>({...choice,families,preview:exact?0:score(choice.deck,false)})).sort((a,b)=>b.preview-a.preview||a.changeCost-b.changeCost);
        familyMemo.set(identity,result);return result;
      }
      function evaluate(choices,exhaustive=false){
        return (exhaustive?choices:choices.slice(0,4)).map(choice=>({...choice,score:score(choice.deck)})).sort(compare)[0];
      }
      for(let step=0;step<missing;step++){
        const expanded=[],seen=new Set();
        for(const state of beam){
          const used=new Set(state.families),familiesToTry=[];
          for(const candidate of candidates){
            if(used.has(candidate))continue;
            const families=[...state.families,candidate],identity=JSON.stringify([...families].sort());
            if(seen.has(identity))continue;seen.add(identity);
            const choices=preliminary(families);if(choices.length)familiesToTry.push(choices);
          }
          familiesToTry.sort((a,b)=>b[0].preview-a[0].preview||a[0].changeCost-b[0].changeCost);
          for(const choices of (exact?familiesToTry:familiesToTry.slice(0,10)))expanded.push(evaluate(choices,exact));
        }
        expanded.sort(compare);beam=expanded.slice(0,3);
        if(!beam.length)throw new Error('Aucune composition légale ne conserve toutes tes cartes.');
        if(progress)progress(step+1,exact?missing:missing*2);
      }
      let best=beam[0];
      // Only added families may be replaced. Reconsider every family's position
      // and active form for each alternative, including the chosen mixed mode.
      const addedFamilies=best.families.filter(name=>!selectedSet.has(name));
      for(let position=0;!exact&&position<addedFamilies.length;position++){
        const replaced=addedFamilies[position],alternatives=[],used=new Set(best.families.filter(name=>name!==replaced));
        for(const candidate of candidates){
          if(used.has(candidate))continue;
          const choices=preliminary(best.families.map(name=>name===replaced?candidate:name));if(choices.length)alternatives.push(choices);
        }
        alternatives.sort((a,b)=>b[0].preview-a[0].preview||a[0].changeCost-b[0].changeCost);
        for(const choices of alternatives.slice(0,8)){
          const alternative=evaluate(choices);
          if(alternative.score>best.score+1e-7||Math.abs(alternative.score-best.score)<=1e-7&&alternative.changeCost<best.changeCost)best=alternative;
        }
        addedFamilies[position]=best.families.find(name=>!used.has(name));
        if(progress)progress(missing+position+1,missing*2);
      }
      const moves=[],formChanges=[];
      pinned.forEach((from,index)=>{if(!from)return;const name=rules.entry(from).name,toIndex=best.deck.findIndex(key=>rules.entry(key)?.name===name);if(toIndex!==index)moves.push({name,from:index,to:toIndex});if(best.deck[toIndex]!==from)formChanges.push({name,from,to:best.deck[toIndex]});});
      return {deck:best.deck,layout:best.layout,added:best.deck.filter(key=>!selectedSet.has(rules.entry(key).name)),moves,formChanges,mixedChanged:best.layout.mixedMode!==rules.layoutOptions(layout||{}).mixedMode,probability:percent(best.score),raw:best.score,
        opponents:pool.length,sourceBattles:meta.sourceBattles,updatedAt:meta.updatedAt,tested,
        method:exact?'Tous les ajouts et toutes les répartitions légales des formes sont comparés. Les cartes choisies sont conservées.':'Recherche de plusieurs compositions, positions et formes, puis amélioration des cartes ajoutées ; meilleur score moyen trouvé, sans garantie de maximum absolu.'};
    }
    return {predict, counter, counterLegal, completeDeck, improveDeck, probability, vectorFor, cardNames: model.cardNames, featureKeys, mode:model.mode, schemaVersion:model.schemaVersion||1};
  }
  root.createClashEngine = createEngine;
  if (typeof module !== 'undefined') module.exports = {createEngine};
})(typeof self !== 'undefined' ? self : globalThis);
