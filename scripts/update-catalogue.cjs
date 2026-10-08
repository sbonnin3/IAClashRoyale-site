'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const dirIndex=process.argv.indexOf('--web-dir');
const web = path.resolve(root,dirIndex<0?'web':process.argv[dirIndex+1]);
const {sources,merge,validate} = require(path.join(web,'catalogue.js'));
const read = file=>JSON.parse(fs.readFileSync(path.join(web,file),'utf8'));
async function get(url, json = false) {
  const response = await fetch(url,{signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Source indisponible : HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
async function main() {
  const existing = fs.existsSync(path.join(web,'catalogue.json')) ? read('catalogue.json') : {cards:read('data.json').cards};
  const [snapshot,heroText] = await Promise.all([get(sources.cards,true),get(sources.heroes)]);
  const catalogue = validate(existing.source==='https://api.clashroyale.com/v1/cards' && Date.parse(existing.sourceUpdatedAt)>Date.parse(snapshot.scrapedAt) ? existing : merge(snapshot,heroText,existing,read('catalogue-overrides.json')));
  const requests = [];
  for (const card of catalogue.cards) {
    if (!fs.existsSync(path.join(web,card.image))) requests.push({card, dest:card.image, url:card.sourceImage});
    const slug = card.name==='Mini P.E.K.K.A'?'mini-pekka':card.name.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/ +/g,'-');
    for (const [mode,suffix] of [['evolution','-ev1'],['hero','-hero-ev1']]) {
      if (!card[mode==='hero'?'hasHero':'hasEvolution']) continue;
      const heroOnly=mode==='hero'&&!card.hasEvolution,dest=`assets/variant-${card.id}-${heroOnly?'hero-only':mode}.png`;
      if(card.images[mode]===dest&&fs.existsSync(path.join(web,dest)))continue;
      const heroUrl=`https://cdn.royaleapi.com/static/img/cards-150/${slug}-hero.png`;
      const urls=heroOnly?[heroUrl]:[`https://cdn.royaleapi.com/static/img/cards-150/${slug}${suffix}.png`,...(mode==='hero'?[heroUrl]:[])];
      requests.push({card,mode,dest,urls});
    }
  }
  let downloaded=0, fallback=0, index=0;
  async function download() {
    while(index<requests.length) {
      const request = requests[index++];
      try {
        let buffer;
        for(const url of request.urls||[request.url]){
          try{
            const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
            if(!response.ok)continue;
            const candidate=Buffer.from(await response.arrayBuffer());
            if(candidate.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){buffer=candidate;break;}
          }catch{}
        }
        if(!buffer)throw new Error('image');
        fs.writeFileSync(path.join(web,request.dest),buffer);
        if(request.mode) request.card.images[request.mode]=request.dest;
        downloaded++;
      } catch {
        if(!request.mode) throw new Error(`Illustration manquante : ${request.card.name}`);
        fallback++;
      }
    }
  }
  await Promise.all(Array.from({length:6},download));
  const dest=path.join(web,'catalogue.json');
  fs.writeFileSync(dest+'.tmp',JSON.stringify(catalogue,null,2)+'\n');
  fs.renameSync(dest+'.tmp',dest);
  console.log(JSON.stringify({cards:catalogue.cards.length,evolutions:catalogue.cards.filter(c=>c.hasEvolution).length,heroes:catalogue.cards.filter(c=>c.hasHero).length,downloaded,variantBaseArtFallback:fallback,checkedAt:catalogue.checkedAt,sourceUpdatedAt:catalogue.sourceUpdatedAt}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
