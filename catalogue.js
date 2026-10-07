(function(root) {
  'use strict';
  const sources = {
    cards:'https://raw.githubusercontent.com/n-zad/cr-deck-organizer/main/src/data/cards.json',
    heroes:'https://raw.githubusercontent.com/n-zad/cr-deck-organizer/main/src/lib/heroes.ts'
  };
  function namesInExport(text, name) {
    const match = text.match(new RegExp(`export const ${name} = new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`));
    if (!match) throw new Error('La liste des formes de héros a changé de format.');
    return new Set([...match[1].matchAll(/'([^']+)'/g)].map(match=>match[1]));
  }
  function merge(snapshot, heroText, previous, overrides, checkedAt = new Date().toISOString()) {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.cards) || snapshot.cards.length < 100) throw new Error('Catalogue distant incomplet.');
    const heroes = namesInExport(heroText, 'HERO_CARD_NAMES');
    const heroEvos = namesInExport(heroText, 'HERO_EVOLUTION_NAMES');
    const existing = new Map(previous.cards.map(card=>[card.name,card]));
    const cards = snapshot.cards.map(raw=> {
      if (!Number.isSafeInteger(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() || !['troop','building','spell'].includes(raw.type) || !['common','rare','epic','legendary','champion'].includes(raw.rarity) || !(raw.elixir === null || Number.isInteger(raw.elixir) && raw.elixir >= 0 && raw.elixir <= 10)) throw new Error('Métadonnées de carte invalides.');
      const old = existing.get(raw.name);
      const isHero = raw.hasHero === true || heroes.has(raw.name);
      return {id:raw.id, name:raw.name, fr:old?.fr || overrides.names?.[raw.name] || raw.name, cost:raw.name === 'Mirror' ? null : raw.elixir, rarity:raw.rarity, type:raw.type,
        hasHero:isHero, hasEvolution:raw.hasHero === undefined && isHero ? heroEvos.has(raw.name) : raw.hasEvolution === true,
        image:old?.image || `assets/catalogue-${raw.id}.png`, sourceImage:`https://raw.githubusercontent.com/n-zad/cr-deck-organizer/main/public/cards/${raw.id}.png`,
        images:old?.images || {}};
    });
    if (new Set(cards.map(card=>card.name)).size !== cards.length || new Set(cards.map(card=>card.id)).size !== cards.length) throw new Error('Identités de carte dupliquées.');
    if ([...existing.keys()].some(name=>!cards.some(card=>card.name===name))) throw new Error('La source omet des cartes déjà présentes. Le dernier catalogue est conservé.');
    for (const [name, change] of Object.entries(overrides.cards || {})) {
      const card = cards.find(card=>card.name===name);
      if (!card) throw new Error('Une correction vérifiée ne correspond à aucune carte.');
      for (const field of ['hasHero','hasEvolution']) if (typeof change[field] === 'boolean') card[field] = change[field];
    }
    return {schemaVersion:1, checkedAt, sourceUpdatedAt:snapshot.scrapedAt, source:sources.cards, heroSource:sources.heroes, rulesVersion:'evo-hero-wild-2026', cards};
  }
  function validate(catalogue) {
    if (catalogue?.schemaVersion !== 1 || !Array.isArray(catalogue.cards) || catalogue.cards.length < 100 || !Number.isFinite(Date.parse(catalogue.checkedAt))) throw new Error('Catalogue local invalide.');
    if (catalogue.cards.some(card=>typeof card.name!=='string' || !card.name || typeof card.fr!=='string' || !card.fr || typeof card.hasEvolution!=='boolean' || typeof card.hasHero!=='boolean' || !['common','rare','epic','legendary','champion'].includes(card.rarity) || !/^assets\/[a-z0-9-]+\.png$/.test(card.image))) throw new Error('Catalogue local invalide.');
    if (new Set(catalogue.cards.map(card=>card.name)).size !== catalogue.cards.length) throw new Error('Catalogue local dupliqué.');
    return catalogue;
  }
  root.ClashCatalogue = {sources, namesInExport, merge, validate};
  if (typeof module !== 'undefined') module.exports = root.ClashCatalogue;
})(typeof self !== 'undefined' ? self : globalThis);
