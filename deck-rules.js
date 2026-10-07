(function (root) {
  'use strict';
  const slots = ['Évolution', 'Héros / champion', 'Mixte', 'Classique', 'Classique', 'Classique', 'Classique', 'Classique'];
  const key = (name, mode = 'normal') => mode === 'normal' ? name : `${name}::${mode}`;
  function createRules(catalogue, modelNames = []) {
    const cards = new Map(catalogue.cards.map(card => [card.name, card]));
    const known = new Set(modelNames);
    function entry(value) {
      if (!value || typeof value !== 'string') return null;
      const parts=value.split('::');
      if(parts.length>2) return null;
      const [name, mode = 'normal'] = parts;
      const card = cards.get(name);
      if (!card || !['normal', 'evolution', 'hero'].includes(mode) || (mode === 'evolution' && !card.hasEvolution) || (mode === 'hero' && !card.hasHero)) return null;
      return {...card, mode, key: key(name, mode), category: mode === 'evolution' ? 'evolution' : mode === 'hero' || card.rarity === 'champion' ? 'hero' : 'normal'};
    }
    function accepts(index, value) {
      const item = typeof value === 'string' ? entry(value) : value;
      return !!item && (item.category === 'normal' || item.category === 'evolution' && (index === 0 || index === 2) || item.category === 'hero' && (index === 1 || index === 2));
    }
    function layoutOptions(options = {}) {
      return {evolution:options.evolution!==false,hero:options.hero!==false,mixedActive:options.mixedActive!==false,mixedMode:options.mixedMode==='hero'?'hero':'evolution'};
    }
    function forSlot(index, value, options = {}) {
      if(value===null)return null;
      const card=entry(value);
      if(!card||!Number.isInteger(index)||index<0||index>7)return undefined;
      if(card.rarity==='champion')return index===1||index===2?card.name:undefined;
      const config=layoutOptions(options);
      const mixedMode=card.hasEvolution&&card.hasHero?config.mixedMode:card.hasEvolution?'evolution':card.hasHero?'hero':'normal';
      const mode=index===0&&config.evolution?'evolution':index===1&&config.hero?'hero':index===2&&config.mixedActive?mixedMode:'normal';
      return key(card.name,mode==='evolution'&&card.hasEvolution?'evolution':mode==='hero'&&card.hasHero?'hero':'normal');
    }
    function autoDeck(deck, options = {}) {
      if(!Array.isArray(deck)||deck.length!==8)return null;
      const result=deck.map((value,index)=>forSlot(index,value,options));
      return result.some(value=>value===undefined)||!validate(result,false).valid?null:result;
    }
    function swapAuto(deck, from, to, options = {}) {
      if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>7||to>7||!validate(deck,false).valid)return null;
      const result=[...deck];[result[from],result[to]]=[result[to],result[from]];
      return autoDeck(result,options);
    }
    function placementOptions(values, preferred = Array(8).fill(null), options = {}) {
      const items=values.map(entry);
      if(items.length>8||items.some(item=>!item)||new Set(items.map(item=>item.name)).size!==items.length)return [];
      const config=layoutOptions(options),modes=config.mixedActive?[config.mixedMode,config.mixedMode==='hero'?'evolution':'hero']:[config.mixedMode];
      const original=new Map(preferred.map((value,index)=>[entry(value)?.name,{value,index}]).filter(([name])=>name));
      const unique=new Map();
      for(const mode of modes){
        const layout={...config,mixedMode:mode},deck=Array(8).fill(null),used=new Set();
        function place(slot){
          if(slot===3){
            const remaining=items.filter(item=>!used.has(item.name));
            if(remaining.length>5||remaining.some(item=>item.rarity==='champion'))return;
            const result=[...deck];
            // Keep ordinary positions when equivalent; the five ordinary slots
            // have identical model features and need no permutation search.
            for(const item of remaining){const index=original.get(item.name)?.index;if(index>=3)result[index]=item.name;}
            for(const item of remaining){if(result.includes(item.name))continue;result[result.findIndex((value,index)=>index>=3&&!value)]=item.name;}
            let changeCost=mode===config.mixedMode?0:1;
            for(const [name,before] of original){const index=result.findIndex(value=>value?.split('::')[0]===name);if(index!==before.index)changeCost+=100;if(result[index]!==before.value)changeCost+=10;}
            const signature=JSON.stringify(result.filter(Boolean).sort()),previous=unique.get(signature);
            if(!previous||changeCost<previous.changeCost)unique.set(signature,{deck:result,layout,changeCost});
            return;
          }
          deck[slot]=null;place(slot+1);
          for(const item of items){
            if(used.has(item.name))continue;
            const value=forSlot(slot,item.name,layout);if(value===undefined)continue;
            used.add(item.name);deck[slot]=value;place(slot+1);used.delete(item.name);
          }
          deck[slot]=null;
        }
        place(0);
      }
      return [...unique.values()];
    }
    function arrange(values, preferred = null, layout = null) {
      const items = values.filter(Boolean).map(entry);
      if (items.length > 8 || items.some(item => !item) || new Set(items.map(item => item.name)).size !== items.length) return null;
      const result = Array(8).fill(null), remaining = [...items];
      if (preferred) {
        const item = remaining.find(item => item.key === preferred.key);
        if (!item || !accepts(preferred.slot, item) || layout && forSlot(preferred.slot,item.key,layout)!==item.key) return null;
        result[preferred.slot] = item.key; remaining.splice(remaining.indexOf(item), 1);
      }
      remaining.sort((a,b) => (a.category === 'normal') - (b.category === 'normal'));
      function place(index) {
        if (index === remaining.length) return true;
        const item = remaining[index];
        const order = item.category === 'normal' ? [3,4,5,6,7,0,1,2] : item.category === 'evolution' ? [0,2] : [1,2];
        for (const slot of order) if (!result[slot] && accepts(slot, item) && (!layout || forSlot(slot,item.key,layout)===item.key)) {
          result[slot] = item.key;
          if (place(index + 1)) return true;
          result[slot] = null;
        }
        return false;
      }
      return place(0) ? result : null;
    }
    function validate(deck, complete = true) {
      if (!Array.isArray(deck) || deck.length !== 8) return {valid:false, reason:'Le deck doit avoir huit emplacements.'};
      const items = deck.filter(Boolean).map(entry);
      if (items.some(item=>!item)) return {valid:false, reason:'Une carte ou une variante est indisponible.'};
      if (new Set(items.map(item=>item.name)).size !== items.length) return {valid:false, reason:'Une même carte ne peut pas être utilisée dans plusieurs formes.'};
      if (deck.some((value,index)=>value && !accepts(index,value))) return {valid:false, reason:'Cette forme ne peut pas occuper cet emplacement.'};
      if (complete && items.length !== 8) return {valid:false, reason:'Complète les huit emplacements.'};
      return {valid:true, items, evolutions:items.filter(item=>item.category==='evolution').length, heroes:items.filter(item=>item.category==='hero').length};
    }
    function fillPinned(pinned, additions, layout = null) {
      if(!validate(pinned,false).valid)return null;
      const items=additions.map(entry),result=[...pinned];
      if(items.some(item=>!item)||pinned.filter(Boolean).length+items.length>8)return null;
      const names=[...pinned.filter(Boolean).map(value=>entry(value).name),...items.map(item=>item.name)];
      if(new Set(names).size!==names.length)return null;
      items.sort((a,b)=>(a.category==='normal')-(b.category==='normal'));
      function place(index){
        if(index===items.length)return true;
        const item=items[index],order=item.category==='normal'?[3,4,5,6,7,0,1,2]:item.category==='evolution'?[0,2]:[1,2];
        for(const slot of order)if(!result[slot]&&accepts(slot,item)&&(!layout||forSlot(slot,item.key,layout)===item.key)){
          result[slot]=item.key;if(place(index+1))return true;result[slot]=null;
        }
        return false;
      }
      return place(0)?result:null;
    }
    function coverage(deck) {
      const items = deck.filter(Boolean).map(entry).filter(Boolean);
      return {unknown:items.filter(item=>!known.has(item.name)).map(item=>item.fr), variants:items.filter(item=>item.mode!=='normal').map(item=>`${item.fr} (${item.mode==='hero'?'héros':'évolution'})`), names:items.map(item=>item.name)};
    }
    return {entry, accepts, arrange, fillPinned, validate, coverage, forSlot, autoDeck, swapAuto, layoutOptions, placementOptions, slots, cards:[...cards.values()], key};
  }
  root.ClashDeckRules = {createRules, slots, key};
  if (typeof module !== 'undefined') module.exports = root.ClashDeckRules;
})(typeof self !== 'undefined' ? self : globalThis);
