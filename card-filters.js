(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const rarityOrder=['common','rare','epic','legendary','champion'];
  function filterCards(cards, options={}){
    const query=normalize(options.query).trim();
    const result=cards.filter(card=>{
      if(query&&!normalize(card.fr).includes(query)&&!normalize(card.name).includes(query))return false;
      if(options.rarity&&options.rarity!=='all'&&card.rarity!==options.rarity)return false;
      if(options.type&&options.type!=='all'&&card.type!==options.type)return false;
      if(options.elixir&&options.elixir!=='all'){
        if(options.elixir==='variable'){if(card.cost!==null)return false;}
        else if(options.elixir==='10+'){if(card.cost===null||card.cost<10)return false;}
        else if(card.cost===null||card.cost!==Number(options.elixir))return false;
      }
      if(options.availability==='evolution'&&!card.hasEvolution)return false;
      if(options.availability==='hero'&&!card.hasHero)return false;
      if(options.availability==='champion'&&card.rarity!=='champion')return false;
      return true;
    });
    return result.sort((a,b)=>{
      const main=options.sort==='elixir'?(a.cost??Infinity)-(b.cost??Infinity):options.sort==='rarity'?rarityOrder.indexOf(a.rarity)-rarityOrder.indexOf(b.rarity):0;
      return main||a.fr.localeCompare(b.fr,'fr')||a.name.localeCompare(b.name);
    });
  }
  root.ClashCardFilters={filterCards};
  if(typeof module!=='undefined')module.exports=root.ClashCardFilters;
})(typeof self!=='undefined'?self:globalThis);
