function renderStats(data) {
  if(data.schemaVersion>=2){
    const cm=data.confusion, n=data.testBattles;
    $('#stats-content').innerHTML=`<div class="metrics"><article class="metric"><p>Modèle actualisé</p><strong>XGBoost</strong><small>Entraîné le ${new Date(data.trainedAt).toLocaleDateString('fr-FR')} · ${data.treeCount} arbres</small></article><article class="metric"><p>Cartes et formes</p><strong>${data.cards.length} cartes</strong><small>${data.featureCount} entrées : bases, évolutions et héros actifs, dans les deux decks</small></article><article class="metric"><p>Précision sur le test séparé</p><strong>${number(data.metrics.accuracy*100)} %</strong><small>${n.toLocaleString('fr-FR')} combats jamais utilisés pour apprendre ni régler le modèle</small></article></div><div class="stats-layout"><article class="stats-panel"><h3>Apprentissage sur la méta actuelle</h3><p>${data.sourceBattles.toLocaleString('fr-FR')} duels officiels du 1V1 classique, à niveaux comparables : trophées, ligue et autres files aux mêmes règles normales, regroupés dans un seul modèle. Les tirages, decks imposés et modes aux règles différentes sont exclus. Séparation chronologique : environ 70 % apprentissage, 15 % validation et 15 % test. Les deux orientations d’un combat restent toujours dans le même lot.</p><p>La collecte locale fonctionne quand le PC est allumé : passages réguliers et collecte intensive par lots pour enrichir les trois modes et les formes récentes. Un entraînement quotidien produit un nouveau modèle uniquement si suffisamment de nouveaux combats et la validation le permettent.</p><p><a href="training-report.json" target="_blank" rel="noopener">Rapport détaillé du modèle publié</a></p></article><article class="stats-panel"><h3>Qualité des estimations</h3><p>AUC : ${number(data.metrics.auc)} · Score de Brier : ${number(data.metrics.brier)} · Perte logarithmique : ${number(data.metrics.log_loss)}</p><p>La probabilité est calibrée sur le lot de validation. La précision mesure les exemples de test dans les deux orientations ; le nombre de combats uniques figure ci-dessus.</p><p>Matrice du test : ${cm[0][0]} défaites et ${cm[1][1]} victoires correctement prédites, ${cm[0][1]+cm[1][0]} erreurs.</p></article></div><article class="model-explanation"><h3>Une estimation de la confrontation</h3><p>Les formes actives des évolutions et des héros sont des entrées distinctes. Les règles des huit emplacements restent appliquées. Les niveaux sont conservés dans la collecte et servent à sélectionner des confrontations comparables.</p><p>Les compétences du joueur, les troupes de tour et les décisions pendant la partie ne sont pas modélisées. Les formes peu jouées ont moins de données. Un contre suggéré est une recherche carte par carte, sans garantie de victoire.</p></article>`;
    if(data.frozenAudit)$('#stats-content .stats-panel').insertAdjacentHTML('beforeend',`<p>Après l’entraînement, le test a été élargi avec ${Number(data.frozenAudit.additional_test_battles).toLocaleString('fr-FR')} combats supplémentaires. Le modèle et sa calibration sont restés figés pendant ce contrôle.</p>`);
    return;
  }
  const cm = data.confusion, total = cm.flat().reduce((a,b)=>a+b,0), accuracy = (cm[0][0] + cm[1][1]) / total * 100;
  const top = data.importance.slice(0, 10), max = Number(top[0].importance);
  $('#stats-content').innerHTML = `<div class="metrics"><article class="metric"><p>Modèle original</p><strong>XGBoost</strong><small>500 arbres · Classification binaire</small></article><article class="metric"><p>Cartes du modèle</p><strong>${data.cards.length}</strong><small>242 entrées : alliées et adverses</small></article><article class="metric"><p>Précision sur l’échantillon</p><strong>${number(accuracy)} %</strong><small>${total.toLocaleString('fr-FR')} exemples d’apprentissage, sans test indépendant</small></article></div><div class="stats-layout"><article class="stats-panel"><h3>Cartes les plus influentes</h3><p>Importance cumulée des positions alliée et adverse. Une importance élevée ne signifie pas qu’une carte est meilleure.</p>${top.map(row => `<div class="importance-row"><span>${escapeHtml(state.rules.entry(row.card)?.fr || row.card)}</span><div class="importance-track"><span style="width:${Number(row.importance)/max*100}%"></span></div><small>${(Number(row.importance)*100).toFixed(1).replace('.',',')} %</small></div>`).join('')}</article><article class="stats-panel"><h3>Matrice de confusion</h3><p>Résultats fournis dans le dépôt, calculés sur les premiers exemples d’apprentissage.</p><table><caption class="result-note">Réalité en ligne, prédiction en colonne</caption><thead><tr><th scope="col">Résultat réel</th><th scope="col">Défaite prédite</th><th scope="col">Victoire prédite</th></tr></thead><tbody><tr><th scope="row">Défaite</th><td class="correct">${cm[0][0].toLocaleString('fr-FR')}</td><td class="wrong">${cm[0][1].toLocaleString('fr-FR')}</td></tr><tr><th scope="row">Victoire</th><td class="wrong">${cm[1][0].toLocaleString('fr-FR')}</td><td class="correct">${cm[1][1].toLocaleString('fr-FR')}</td></tr></tbody></table></article></div><article class="model-explanation"><h3>Le même calcul, dans ton navigateur.</h3><p>Le modèle entraîné du dépôt a été exporté pour conserver ses prédictions. Le script d’apprentissage utilise jusqu’à un million de matchs et présente chaque confrontation dans les deux sens. Les huit cartes de chaque deck sont encodées par leur présence ou leur absence.</p><p>Le catalogue est actualisé régulièrement. Les effets des évolutions et des héros nécessitent de nouvelles données et un réentraînement ; les pourcentages actuels portent sur les cartes de base.</p></article>`;
}

'use strict';
const $ = selector=>document.querySelector(selector);
const state={cards:[],catalogue:null,rules:null,modelNames:[],data:null,decks:{deck1:Array(8).fill(null),deck2:Array(8).fill(null),enemy:Array(8).fill(null),complete:Array(8).fill(null),improve:Array(8).fill(null),counter:Array(8).fill(null)},layouts:{},ready:false,busy:false,selector:null,slot:null,filter:'all'};
const panels={deck1:{title:'Ton deck',element:'#deck1-panel'},deck2:{title:'Deck adverse',element:'#deck2-panel'},enemy:{title:'Deck adverse',element:'#enemy-panel'},complete:{title:'Mon deck à compléter',element:'#complete-panel'},improve:{title:'Mon deck à améliorer',element:'#improve-panel'},counter:{title:'Mon contre-deck',element:'#counter-result'}};
const pending=new Map();let worker,nextId=0,toastTimer,refreshing=false;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number=value=>value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const count=deck=>deck.filter(Boolean).length;
const gainLabel=value=>value<.005?'moins de 0,01 point':`+${number(value)} points`;
const specialLabel=item=>item.mode==='hero'?'Héros':item.mode==='evolution'?'Évolution':item.rarity==='champion'?'Champion':'';
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,7000);}
function art(item){const image=item.images?.[item.mode]||item.image;return `<img class="card-art" src="${escapeHtml(image)}" data-fallback="${escapeHtml(item.image)}" data-remote="${escapeHtml(item.sourceImage||'')}" alt="" loading="lazy" decoding="async" width="100" height="100"><span class="elixir" aria-label="Élixir : ${item.cost===null?'variable':item.cost}">${item.cost===null?'?':item.cost}</span><span class="card-name">${escapeHtml(item.fr)}</span>${specialLabel(item)?`<span class="variant-badge ${item.category}">${specialLabel(item)}</span>`:''}`;}
function bindImages(container){container.querySelectorAll('img[data-fallback]').forEach(img=>{img.onerror=()=>{if(!img.dataset.triedBase){img.dataset.triedBase='1';img.src=img.dataset.fallback;}else if(img.dataset.remote&&!img.dataset.triedRemote){img.dataset.triedRemote='1';img.src=img.dataset.remote;}else{img.onerror=null;img.style.visibility='hidden';}};});}
function meanCost(deck){const items=deck.filter(Boolean).map(state.rules.entry).filter(Boolean);if(!items.length)return 'Élixir moyen —';if(items.some(item=>item.cost===null))return 'Élixir moyen variable · Miroir';return `Élixir moyen ${number(items.reduce((sum,item)=>sum+item.cost,0)/items.length)}`;}

function layoutFor(key){return state.layouts[key]||(state.layouts[key]=state.rules.layoutOptions());}
function adoptDeck(key,deck){
  const special=deck[2]&&state.rules.entry(deck[2]);
  if(special&&special.category!=='normal')layoutFor(key).mixedMode=special.category;
  state.decks[key]=state.rules.autoDeck(deck,layoutFor(key));
  if(!state.decks[key])throw new Error('Composition incompatible avec les emplacements.');
}
function slotControls(key,index,deck){
  const config=layoutFor(key),card=state.rules.entry(deck[index]);
  if(!card)return '<span class="slot-auto-note">Choisis une carte</span>';
  if(card.rarity==='champion')return '<span class="slot-auto-note">Champion</span>';
  const modes=index===0?(card.hasEvolution?['evolution']:[]):index===1?(card.hasHero?['hero']:[]):index===2?['evolution','hero'].filter(mode=>mode==='evolution'?card.hasEvolution:card.hasHero):[];
  if(!modes.length)return '<span class="slot-auto-note">Forme normale</span>';
  const name=index===2?'mixedActive':modes[0],form=modes.length===2?'la forme':modes[0]==='evolution'?'l’évolution':'le héros';
  const toggle=`<button class="activation-toggle" data-activation="${name}" role="switch" aria-checked="${config[name]}" aria-label="Activer ${form} dans cet emplacement${index===2?' mixte':''}">${config[name]?'Activée':'Désactivée'}</button>`;
  if(modes.length===1)return toggle;
  return `<div class="mixed-controls"><div class="mixed-lever" role="group" aria-label="Forme de l’emplacement mixte"><button data-mixed="evolution" aria-pressed="${config.mixedMode==='evolution'}">Évo</button><button data-mixed="hero" aria-pressed="${config.mixedMode==='hero'}">Héros</button></div>${toggle}</div>`;
}
function slotsHtml(deck,editable=false,key=null){return deck.map((value,index)=>{
  const item=state.rules.entry(value),tag=`<span class="slot-label">${ClashDeckRules.slots[index]}</span>`;
  const content=item?`${art(item)}${editable?'<span class="drag-grip" aria-hidden="true">⠿</span>':''}`:'+';
  return `<div class="slot-wrap ${index<3?'special-slot slot-'+index:''}" ${editable?`data-slot="${index}" data-deck="${key}"`:''}>${tag}<${editable?'button':'div'} class="card-slot ${item?'filled':'empty'}" ${editable?`data-choose="${index}" data-drag-card="${index}" draggable="false" aria-label="${item?'Changer '+escapeHtml(item.fr)+(specialLabel(item)?', '+specialLabel(item):''):'Ajouter une carte'}, emplacement ${escapeHtml(ClashDeckRules.slots[index])}"`:''}>${content}</${editable?'button':'div'}>${editable&&item?`<button class="remove-card" data-remove="${index}" aria-label="Retirer ${escapeHtml(item.fr)}${specialLabel(item)?', '+specialLabel(item):''}">×</button>`:''}${editable?slotControls(key,index,deck):''}</div>`;
}).join('');}
function bindDeck(container,key){
  bindImages(container);
  container.querySelectorAll('[data-choose]').forEach(button=>button.onclick=()=>{if(Date.now()<(state.suppressClickUntil||0))return;openSelector(key,button.dataset.choose==='all'?null:Number(button.dataset.choose));});
  container.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{state.decks[key][Number(button.dataset.remove)]=null;deckChanged(key);});
  container.querySelector('[data-clear]')?.addEventListener('click',()=>{state.decks[key]=Array(8).fill(null);deckChanged(key);});
  container.querySelector('[data-random]')?.addEventListener('click',()=>{
    const pool=state.cards.filter(card=>state.modelNames.includes(card.name));
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const deck=Array(8).fill(null);
    for(const card of pool){for(let i=0;i<8;i++){if(deck[i])continue;const value=state.rules.forSlot(i,card.name,layoutFor(key));if(value!==undefined){deck[i]=value;break;}}if(count(deck)===8)break;}
    state.decks[key]=deck;deckChanged(key);
  });
  container.querySelectorAll('[data-activation]').forEach(button=>button.onclick=()=>{const config=layoutFor(key);config[button.dataset.activation]=!config[button.dataset.activation];state.decks[key]=state.rules.autoDeck(state.decks[key],config);deckChanged(key);});
  container.querySelectorAll('[data-mixed]').forEach(button=>button.onclick=()=>{layoutFor(key).mixedMode=button.dataset.mixed;state.decks[key]=state.rules.autoDeck(state.decks[key],layoutFor(key));deckChanged(key);});
  bindCardDrag(container,key);
}
function renderDeck(key){
  if(key==='counter'){renderCounter();return;}
  const deck=state.decks[key],info=panels[key],container=$(info.element),validation=state.rules.validate(deck,false);
  container.innerHTML=`<div class="deck-head"><h3 class="deck-title">${info.title}</h3><span class="count">${count(deck)} / 8</span></div><div class="deck-details">${meanCost(deck)}</div><div class="deck-grid">${slotsHtml(deck,true,key)}</div><p class="deck-forms">${validation.valid?`${validation.evolutions} évolution(s) · ${validation.heroes} héros / champion(s)`:escapeHtml(validation.reason)}</p><p class="drag-hint">Glisse une carte sur une autre pour les échanger. La forme suit l’emplacement. Au clavier : Alt + flèches.</p><div class="deck-tools"><button class="button choose" data-choose="all">Choisir les cartes</button><button class="icon-button" data-random aria-label="Deck aléatoire : ${info.title}" title="Deck aléatoire">⚄</button><button class="icon-button" data-clear aria-label="Vider ${info.title.toLowerCase()}" title="Vider le deck">×</button></div>`;
  bindDeck(container,key);
}
function renderCounter(){
  const container=$('#counter-result'),deck=state.decks.counter;
  if(!count(deck)){container.className='counter-empty';container.innerHTML='<span class="empty-mark" aria-hidden="true">♜</span><h3>Ton prochain contre</h3><p>Ajoute les huit cartes de l’adversaire, puis lance la recherche.</p>';return;}
  container.className='deck-panel generated';
  const validation=state.rules.validate(deck,false);
  container.innerHTML=`<div class="deck-head"><h3 class="deck-title">Mon contre-deck</h3><span class="count">${count(deck)} / 8</span></div><div class="deck-details">${meanCost(deck)}</div><div class="deck-grid">${slotsHtml(deck,true,'counter')}</div><p class="deck-forms">${validation.evolutions} évolution(s) · ${validation.heroes} héros / champion(s)</p><p class="drag-hint">Tu peux échanger les cartes ou modifier les activations, puis recalculer le score.</p><div class="deck-tools"><button class="button choose" data-choose="all">Choisir les cartes</button><button class="icon-button" data-clear aria-label="Vider mon contre-deck">×</button></div><p id="counter-score" class="generation-note">${state.counterScore?`<span class="generated-score">${number(state.counterScore.p1??state.counterScore.probability)} %</span> de victoire estimée contre ce deck.`:'Deck modifié : recalcule son estimation.'}</p><button id="evaluate-counter" class="button subtle">Évaluer ce contre</button>`;
  bindDeck(container,'counter');$('#evaluate-counter').onclick=evaluateCounter;updateControls();
}
function bindCardDrag(container,key){
  container.querySelectorAll('[data-drag-card]').forEach(node=>{
    node.addEventListener('dragstart',event=>event.preventDefault());
    node.addEventListener('keydown',event=>{
      if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      event.preventDefault();const from=Number(node.dataset.dragCard),columns=getComputedStyle(container.querySelector('.deck-grid')).gridTemplateColumns.split(' ').length;
      const to=from+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key]);
      if(to<0||to>7)return;
      const changed=state.rules.swapAuto(state.decks[key],from,to,layoutFor(key));
      if(changed){state.decks[key]=changed;deckChanged(key);container.querySelector(`[data-drag-card="${to}"]`)?.focus();}else toast('Un champion doit rester dans un emplacement héros ou mixte.');
    });
    node.addEventListener('pointerdown',event=>{
      const from=Number(node.dataset.dragCard);if(event.button!==0||!state.decks[key][from])return;
      const snapshot=JSON.stringify(state.decks[key]);let active=false,target=null,ghost=null,lastPosition=null,scrollFrame=null;
      const cleanup=()=>{active=false;cancelAnimationFrame(scrollFrame);container.querySelectorAll('.drop-valid,.drop-invalid').forEach(el=>el.classList.remove('drop-valid','drop-invalid'));node.classList.remove('dragging');ghost?.remove();node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',up);node.removeEventListener('pointercancel',cancel);node.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',cancel);try{node.releasePointerCapture(event.pointerId);}catch{}};
      const updateTarget=position=>{
        container.querySelectorAll('.drop-valid,.drop-invalid').forEach(el=>el.classList.remove('drop-valid','drop-invalid'));
        const hit=document.elementFromPoint(position.clientX,position.clientY)?.closest('[data-slot]');
        target=hit&&hit.dataset.deck===key?Number(hit.dataset.slot):null;
        if(target!==null&&target!==from)hit.classList.add(state.rules.swapAuto(state.decks[key],from,target,layoutFor(key))?'drop-valid':'drop-invalid');
      };
      const scrollDrag=()=>{
        if(!active)return;
        const y=lastPosition.clientY,edge=70,speed=y<edge?-Math.ceil((edge-y)/edge*14):y>innerHeight-edge?Math.ceil((y-innerHeight+edge)/edge*14):0;
        if(speed){window.scrollBy(0,speed);updateTarget(lastPosition);}
        scrollFrame=requestAnimationFrame(scrollDrag);
      };
      const move=e=>{
        if(!active&&Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)<8)return;
        e.preventDefault();lastPosition={clientX:e.clientX,clientY:e.clientY};if(!active){active=true;node.classList.add('dragging');ghost=document.createElement('div');ghost.className='drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.innerHTML=art(state.rules.entry(state.decks[key][from]));document.body.append(ghost);scrollFrame=requestAnimationFrame(scrollDrag);}
        ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;
        updateTarget(lastPosition);
      };
      const up=()=>{
        if(active){state.suppressClickUntil=Date.now()+500;if(target!==null&&target!==from&&snapshot===JSON.stringify(state.decks[key])){const result=state.rules.swapAuto(state.decks[key],from,target,layoutFor(key));cleanup();if(result){state.decks[key]=result;deckChanged(key);}else toast('Un champion doit rester dans un emplacement héros ou mixte.');return;}}
        cleanup();
      };
      const cancel=()=>{if(active)state.suppressClickUntil=Date.now()+500;cleanup();};
      node.setPointerCapture(event.pointerId);node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',cancel);node.addEventListener('lostpointercapture',cancel);window.addEventListener('blur',cancel);
    });
  });
}
async function evaluateCounter(){
  const deck1=[...state.decks.counter],deck2=[...state.decks.enemy];state.busy=true;updateControls();
  try{const result=await request('predict',{deck1,deck2});if(JSON.stringify(deck1)===JSON.stringify(state.decks.counter)&&JSON.stringify(deck2)===JSON.stringify(state.decks.enemy)){state.counterScore=result;renderCounter();}}
  catch(error){toast(error.message);}finally{state.busy=false;updateControls();}
}

function resetCounter(){state.decks.counter=Array(8).fill(null);state.counterScore=null;renderCounter();}
function deckChanged(key){
  if(key==='improve'){state.improvement=null;$('#improvement-result').hidden=true;}
  if(key==='complete'){$('#completion-result').hidden=true;state.completion=null;}
  if(key==='counter')state.counterScore=null;
  renderDeck(key);if(key==='enemy')resetCounter();else $('#duel-result').hidden=true;updateControls();
  window.dispatchEvent(new CustomEvent('clash:changed',{detail:{key}}));
}

function deckHint(decks){if(!state.ready)return 'Le modèle se prépare…';for(const deck of decks){const validation=state.rules.validate(deck);if(!validation.valid)return validation.reason;}const unknown=decks.flatMap(deck=>state.rules.coverage(deck).unknown);if(unknown.length)return `Le modèle doit être réentraîné pour : ${[...new Set(unknown)].join(', ')}.`;if(state.schemaVersion>=2)return 'Deck valide : cartes et formes actives prises en compte.';if(decks.some(deck=>state.rules.coverage(deck).variants.length))return 'Deck valide. Estimation des cartes de base uniquement : effets des formes non évalués.';return 'Deck valide et prêt.';}
function options(){return {layout:{...layoutFor('counter')}};}
function usable(decks){return state.ready&&!state.busy&&decks.every(deck=>state.rules.validate(deck).valid&&!state.rules.coverage(deck).unknown.length);}
function updateControls(){
  $('#improve-deck').disabled=!usable([state.decks.improve]);
  $('#improvement-hint').textContent=deckHint([state.decks.improve]);
  document.querySelectorAll('[data-apply-swap]').forEach(button=>button.disabled=state.busy);

  const partial=state.decks.complete,n=count(partial),validPartial=state.rules?.validate(partial,false);
  $('#complete-deck').disabled=!state.ready||state.busy||n<1||n>7||!validPartial?.valid||!!state.rules?.coverage(partial).unknown.length;
  $('#completion-hint').textContent=!state.ready?'Le modèle se prépare…':n===0?'Choisis entre une et sept cartes pour commencer.':n===8?'Deck complet. Retire une carte pour rechercher une nouvelle composition.':!validPartial?.valid?validPartial.reason:state.rules.coverage(partial).unknown.length?'Une carte choisie nécessite un nouvel entraînement.':`${n} carte(s) conservée(s) · ${8-n} place(s) à compléter face à la méta récente.`;

$('#predict').disabled=!usable([state.decks.deck1,state.decks.deck2]);$('#generate').disabled=!usable([state.decks.enemy]);$('#duel-hint').textContent=deckHint([state.decks.deck1,state.decks.deck2]);$('#counter-hint').textContent=deckHint([state.decks.enemy]);if($('#evaluate-counter'))$('#evaluate-counter').disabled=!usable([state.decks.enemy,state.decks.counter]);window.dispatchEvent(new Event('clash:controls'));}
function openSelector(key,slot=null){
  state.selector=key;state.slot=slot;$('#selector-title').textContent=`Composer : ${panels[key]?.title||'mon deck'}`;$('#card-search').value='';
  $('#slot-target').textContent=slot===null?'Les cartes remplissent les emplacements libres. Tu peux ensuite les échanger en les faisant glisser.':`Emplacement ${ClashDeckRules.slots[slot]} : la forme disponible s’active automatiquement selon ton réglage.`;
  renderCatalogue();$('#selector').showModal();$('#card-search').focus();
}
function candidateDeck(name){
  const deck=state.decks[state.selector],card=state.rules.entry(name);if(!card)return null;
  const same=deck.findIndex(key=>state.rules.entry(key)?.name===card.name),target=state.slot!==null?state.slot:same>=0?same:deck.findIndex((key,index)=>!key&&state.rules.forSlot(index,name,layoutFor(state.selector))!==undefined);
  if(target<0)return null;
  const next=[...deck];if(same>=0&&same!==target)[next[same],next[target]]=[next[target],null];
  next[target]=name;return state.rules.autoDeck(next,layoutFor(state.selector));
}
function renderCatalogue(){
  const deck=state.decks[state.selector],options={query:$('#card-search').value,rarity:$('#filter-rarity').value,elixir:$('#filter-elixir').value,type:$('#filter-type').value,sort:$('#filter-sort').value,availability:state.filter};
  const filtered=ClashCardFilters.filterCards(state.cards,options),container=$('#card-catalogue'),scroll=container.scrollTop;
  $('#selection-count').textContent=`${count(deck)} / 8`;$('#selection-hint').textContent='Choisis la carte, pas sa forme. Les emplacements activent les évolutions et héros disponibles.';$('#catalogue-count').textContent=`${filtered.length} / ${state.cards.length} cartes`;
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===state.filter)));
  container.innerHTML=filtered.length?filtered.map(card=>{
    const selected=deck.find(key=>state.rules.entry(key)?.name===card.name),next=candidateDeck(card.name),value=selected||next?.find(key=>state.rules.entry(key)?.name===card.name)||card.name;
    return `<button class="catalogue-card ${selected?'selected':''}" data-card="${escapeHtml(card.name)}" aria-pressed="${!!selected}" aria-label="Choisir ${escapeHtml(card.fr)}${selected?', sélectionnée':''}" ${selected||next?'':'disabled'}>${art(state.rules.entry(value))}<span class="card-meta">${({common:'Commune',rare:'Rare',epic:'Épique',legendary:'Légendaire',champion:'Champion'})[card.rarity]}</span>${selected?'<span class="selected-mark" aria-hidden="true">✓</span>':''}</button>`;
  }).join(''):'<p class="no-cards">Aucune carte ne correspond à ces filtres.</p>';
  container.scrollTop=scroll;bindImages(container);
  container.querySelectorAll('[data-card]').forEach(button=>button.onclick=()=>{
    const name=button.dataset.card,same=state.decks[state.selector].findIndex(key=>state.rules.entry(key)?.name===name);
    if(same>=0&&(state.slot===null||state.slot===same))state.decks[state.selector][same]=null;
    else{const next=candidateDeck(name);if(!next){toast('Emplacement incompatible ou deck complet.');return;}state.decks[state.selector]=next;}
    deckChanged(state.selector);if(state.slot!==null){$('#selector').close();return;}renderCatalogue();
  });
}

function setTab(tab){if(document.body.dataset.interface==='unified'){$('#multi').hidden=false;window.clashChooseResearch?.(tab);return;}if(!['analyse','contre','completer','ameliorer','stats','multi'].includes(tab))tab='analyse';document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!==tab);document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===tab;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});if(location.hash!==`#${tab}`)history.replaceState(null,'',`#${tab}`);}
function request(type,payload){return new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({id,type,catalogue:state.catalogue,...payload});});}
function variantNote(decks){if(state.schemaVersion>=2)return 'Estimation pour le 1V1 classique, avec les formes actives. Niveaux comparables ; compétences individuelles et troupes de tour non modélisées.';return decks.some(deck=>state.rules.coverage(deck).variants.length)?'Les emplacements et variantes sont respectés. Ce modèle évalue les cartes de base : il ne mesure pas les capacités des héros ou les effets des évolutions.':'Estimation du modèle XGBoost d’origine, à interpréter avec les limites indiquées ci-dessous.';}
async function predict(){const deck1=[...state.decks.deck1],deck2=[...state.decks.deck2];state.busy=true;updateControls();$('#predict').textContent='Analyse en cours…';try{const result=await request('predict',{deck1,deck2});if(JSON.stringify([deck1,deck2])!==JSON.stringify([state.decks.deck1,state.decks.deck2]))return;$('#duel-result').innerHTML=`<h3 class="result-title">Estimation de la confrontation</h3><div class="probabilities"><div class="probability"><span>Ton deck</span><strong>${number(result.p1)} %</strong></div><div class="probability"><span>Deck adverse</span><strong>${number(result.p2)} %</strong></div></div><div class="probability-bar" aria-hidden="true"><span style="width:${result.p1}%"></span></div><p class="result-note">${variantNote([deck1,deck2])}</p>`;$('#duel-result').hidden=false;}catch(error){toast(error.message);}finally{state.busy=false;$('#predict').textContent='Analyser le duel';updateControls();}}
async function generate(){
  const enemy=[...state.decks.enemy],chosen=options();state.busy=true;updateControls();$('#generate').textContent='Recherche en cours…';
  try{const result=await request('counter',{enemy,options:chosen});if(JSON.stringify(enemy)!==JSON.stringify(state.decks.enemy)||JSON.stringify(chosen)!==JSON.stringify(options()))return;
    if(!state.rules.validate(result.deck).valid||JSON.stringify(state.rules.autoDeck(result.deck,chosen.layout))!==JSON.stringify(result.deck))throw new Error('Contre incompatible avec les activations.');
    state.decks.counter=result.deck;state.counterScore=result;renderCounter();
  }catch(error){toast(error.message);}finally{state.busy=false;$('#generate').textContent='Générer un contre-deck';updateControls();}
}

function applyCatalogue(catalogue){state.catalogue=ClashCatalogue.validate(catalogue);state.cards=catalogue.cards;state.rules=ClashDeckRules.createRules(catalogue,state.modelNames);Object.keys(state.decks).forEach(key=>{state.decks[key]=state.rules.autoDeck(state.decks[key],layoutFor(key))||Array(8).fill(null);});Object.keys(panels).forEach(renderDeck);$('#catalogue-status').textContent=`${state.cards.length} cartes · ${state.cards.filter(c=>c.hasEvolution).length} évolutions · ${state.cards.filter(c=>c.hasHero).length} héros · Vérifié le ${new Date(catalogue.checkedAt).toLocaleDateString('fr-FR')}`;if(state.data)renderStats(state.data);state.improvement=null;$('#improvement-result').hidden=true;if(document.querySelector('#completion-result'))document.querySelector('#completion-result').hidden=true;if($('#selector').open)renderCatalogue();$('#duel-result').hidden=true;resetCounter();updateControls();}
async function refreshCatalogue(manual=false){if(refreshing)return;refreshing=true;$('#refresh-catalogue').disabled=true;try{const get=async(url,json=true)=>{const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();return json?response.json():response.text();};const [snapshot,heroes,overrides]=await Promise.all([get(ClashCatalogue.sources.cards),get(ClashCatalogue.sources.heroes,false),get('catalogue-overrides.json')]);const catalogue=state.catalogue.source==='https://api.clashroyale.com/v1/cards'&&Date.parse(state.catalogue.sourceUpdatedAt)>Date.parse(snapshot.scrapedAt)?state.catalogue:ClashCatalogue.merge(snapshot,heroes,state.catalogue,overrides);applyCatalogue(catalogue);try{localStorage.setItem('clash-catalogue-v1',JSON.stringify(catalogue));}catch{}if(manual)toast('Catalogue vérifié et mis à jour.');}catch{if(manual)toast('Source temporairement indisponible. Le dernier catalogue est conservé.');}finally{refreshing=false;$('#refresh-catalogue').disabled=false;}}
async function start(){try{const get=async path=>{const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error();return response.json();};const [data,fallback]=await Promise.all([get('data.json'),get('catalogue.json')]);state.data=data;state.modelNames=data.cards.map(card=>card.name);let catalogue=fallback;try{const cached=ClashCatalogue.validate(JSON.parse(localStorage.getItem('clash-catalogue-v1')));if(Date.parse(cached.checkedAt)>Date.parse(fallback.checkedAt))catalogue=cached;}catch{}applyCatalogue(ClashCatalogue.withBundledImages(catalogue,fallback));worker=new Worker('worker.js');worker.onmessage=event=>{const message=event.data;if(message.type==='ready'){if(message.mode?.id!=='classic-1v1'||state.data.mode?.id!=='classic-1v1'||message.deckInputContract!=='slot-activation-v1'||state.data.deckInputContract!==message.deckInputContract||message.modelVersion!==state.data.modelVersion||JSON.stringify(message.cards)!==JSON.stringify(state.modelNames)){toast('Le catalogue du modèle est incompatible.');return;}state.schemaVersion=message.schemaVersion;state.ready=true;$('#model-status').textContent=`${message.cards.length} cartes évaluées · Modèle prêt`;updateControls();}else if(message.type==='error'){toast(message.message);}else if(message.type==='progress')$(message.action==='complete'?'#complete-deck':message.action==='improve'?'#improve-deck':'#generate').textContent=`Recherche : ${message.step} / ${message.total||8} cartes`;else{const call=pending.get(message.id);if(!call)return;pending.delete(message.id);if(message.type==='result')call.resolve(message.result);else call.reject(new Error(message.message));}};worker.onerror=()=>{state.ready=false;updateControls();pending.forEach(call=>call.reject(new Error('Calcul interrompu. Recharge la page.')));pending.clear();toast('Le calcul a été interrompu.');};const check=()=>{if(!document.hidden&&Date.now()-Date.parse(state.catalogue.checkedAt)>24*60*60*1000)refreshCatalogue();};check();setInterval(check,60*60*1000);document.addEventListener('visibilitychange',check);}catch{$('#model-status').textContent='Chargement interrompu';toast('Les cartes n’ont pas pu être chargées. Recharge la page.');}}
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));$('.brand').onclick=()=>setTab('analyse');window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
$('#close-selector').onclick=$('#done-selecting').onclick=()=>$('#selector').close();$('#selector').addEventListener('click',event=>{if(event.target===$('#selector')){const rect=$('#selector').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('#selector').close();}});
$('#card-search').oninput=()=>{$('#card-catalogue').scrollTop=0;renderCatalogue();};for(const id of ['#filter-rarity','#filter-elixir','#filter-type','#filter-sort'])$(id).onchange=()=>{$('#card-catalogue').scrollTop=0;renderCatalogue();};$('#reset-card-filters').onclick=()=>{state.filter='all';$('#card-search').value='';for(const id of ['#filter-rarity','#filter-elixir','#filter-type'])$(id).value='all';$('#filter-sort').value='name';renderCatalogue();};document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;renderCatalogue();});$('#refresh-catalogue').onclick=()=>refreshCatalogue(true);$('#predict').onclick=predict;$('#generate').onclick=generate;$('#improve-deck').onclick=improveDeck;$('#improvement-example').onclick=()=>{if(!state.rules||state.busy)return;adoptDeck('improve',state.rules.arrange(['Hog Rider','Musketeer','Cannon','Ice Golem','Skeletons','Ice Spirit','Fireball','The Log']));deckChanged('improve');};$('#complete-deck').onclick=completeDeck;$('#completion-example').onclick=()=>{if(!state.rules||state.busy)return;adoptDeck('complete',state.rules.arrange(['Hog Rider','Fireball','The Log']));deckChanged('complete');};

$('#example').onclick=()=>{if(!state.rules)return;adoptDeck('deck1',state.rules.arrange(['Hog Rider','Musketeer','Cannon','Ice Golem','Skeletons','Ice Spirit','Fireball','The Log']));adoptDeck('deck2',state.rules.arrange(['Giant','Mini P.E.K.K.A','Baby Dragon','Musketeer','Mega Minion','Zap','Fireball','Skeleton Army']));deckChanged('deck1');deckChanged('deck2');};
setTab(location.hash.slice(1));start();

async function completeDeck(){
  const pinned=[...state.decks.complete],layout={...layoutFor('complete')};state.busy=true;updateControls();$('#complete-deck').textContent='Comparaison avec la méta…';
  try{
    const result=await request('complete',{partial:pinned,layout});
    if(JSON.stringify(pinned)!==JSON.stringify(state.decks.complete)||JSON.stringify(layout)!==JSON.stringify(layoutFor('complete')))return;
    const validation=state.rules.validate(result.deck);
    const selected=new Set(pinned.filter(Boolean).map(key=>state.rules.entry(key).name)),config=result.layout;
    if(!validation.valid||!config||['evolution','hero','mixedActive'].some(key=>config[key]!==layout[key])||pinned.some(key=>key&&!result.deck.some(value=>state.rules.entry(value).name===state.rules.entry(key).name))||JSON.stringify(state.rules.autoDeck(result.deck,config))!==JSON.stringify(result.deck))throw new Error('La composition ne conserve pas toutes tes cartes ou ne respecte pas les activations.');
    state.layouts.complete={...config};state.decks.complete=result.deck;state.completion=result;renderDeck('complete');
    result.deck.forEach((key,index)=>{const name=state.rules.entry(key).name,added=!selected.has(name),adjusted=result.moves.some(move=>move.name===name)||result.formChanges.some(change=>change.name===name);if(added||adjusted){const slot=$('#complete-panel').querySelector(`[data-drag-card="${index}"]`);if(slot){slot.classList.add(added?'completion-added':'completion-adjusted');slot.insertAdjacentHTML('beforeend',`<span class="completion-label">${added?'Ajoutée par l’IA':result.moves.some(move=>move.name===name)?'Déplacée par l’IA':'Forme adaptée'}</span>`);}}});
    const changes=[...result.moves.map(move=>`${state.rules.entry(move.name).fr} : case ${move.from+1} (${ClashDeckRules.slots[move.from]}) → case ${move.to+1} (${ClashDeckRules.slots[move.to]})`),...result.formChanges.map(change=>`${state.rules.entry(change.name).fr} : ${specialLabel(state.rules.entry(change.from))||'Normale'} → ${specialLabel(state.rules.entry(change.to))||'Normale'}`),...(result.mixedChanged?[`Mixte réglé sur ${config.mixedMode==='hero'?'Héros':'Évolution'}.`]:[])];
    $('#completion-result').innerHTML=`<h3 class="result-title">Ton deck est complété</h3><p><span class="generated-score">${number(result.probability)} %</span> de victoire moyenne estimée face à la méta de référence.</p><p class="result-note">${count(pinned)} carte(s) conservée(s), ${result.added.length} carte(s) ajoutée(s). ${result.opponents} compositions pondérées, issues de ${result.sourceBattles.toLocaleString('fr-FR')} duels récents.</p><p class="generation-note">${result.added.map(key=>escapeHtml(state.rules.entry(key).fr)+(specialLabel(state.rules.entry(key))?` (${specialLabel(state.rules.entry(key))})`:'')).join(' · ')}</p>${changes.length?`<div class="completion-changes"><h4>Réorganisation par l’IA</h4><ul>${changes.map(change=>`<li>${escapeHtml(change)}</li>`).join('')}</ul></div>`:''}<p class="generation-note">${result.tested.toLocaleString('fr-FR')} compositions et répartitions comparées. ${escapeHtml(result.method)}</p>`;
    $('#completion-result').hidden=false;
  }catch(error){toast(error.message);}
  finally{state.busy=false;$('#complete-deck').textContent='Compléter mon deck';updateControls();}
}


function cardLabel(key){const item=state.rules.entry(key);return item.fr+(specialLabel(item)?` (${specialLabel(item)})`:'');}
async function improveDeck(){
  const deck=[...state.decks.improve],layout={...layoutFor('improve')};state.busy=true;state.improvement=null;$('#improvement-result').hidden=true;updateControls();$('#improve-deck').textContent='Comparaison des remplacements…';
  try{
    const result=await request('improve',{deck,layout});
    if(JSON.stringify(deck)!==JSON.stringify(state.decks.improve)||JSON.stringify(layout)!==JSON.stringify(layoutFor('improve')))return;
    if(result.mode?.id!=='classic-1v1'||JSON.stringify(result.original)!==JSON.stringify(deck))throw new Error('Analyse incompatible avec ce deck ou ce mode.');
    state.improvement=result;
    const best=result.best;
    $('#improvement-result').innerHTML=`<div class="result-box"><h3 class="result-title">${best?'Le meilleur changement pour ton deck':'Aucun remplacement ne fait mieux'}</h3><div class="improvement-scores"><div><span>Ton deck actuel</span><strong>${number(result.baseline)} %</strong></div>${best?`<div><span>Avec le meilleur remplacement</span><strong>${number(best.probability)} %</strong><small>${gainLabel(best.gain)} estimés</small></div>`:''}</div><p class="result-note">${best?`Remplacer ${escapeHtml(cardLabel(best.from))} par ${escapeHtml(cardLabel(best.to))}.`:'Le deck actuel obtient le meilleur score parmi tous les changements d’une seule carte comparés.'}</p><p class="generation-note">Moyenne pondérée face à ${result.opponents} compositions du 1V1 classique, issues de ${result.sourceBattles.toLocaleString('fr-FR')} combats récents. ${result.tested.toLocaleString('fr-FR')} remplacements comparés.</p></div><div class="swap-list">${result.cards.map(row=>{
      const suggestion=row.suggestion;
      return `<article class="swap-row ${suggestion&&best.index===row.index?'best-swap':''}"><div class="swap-card">${art(state.rules.entry(row.from))}</div><div class="swap-detail"><h3>${escapeHtml(cardLabel(row.from))}${suggestion&&best.index===row.index?'<span class="best-label">Meilleur gain</span>':''}</h3>${suggestion?`<p>Remplacer par <strong>${escapeHtml(cardLabel(suggestion.to))}</strong></p><p class="swap-gain">${number(result.baseline)} % → ${number(suggestion.probability)} % · ${gainLabel(suggestion.gain)}</p><p class="swap-cost">Élixir : ${meanCost(suggestion.deck).replace('Élixir moyen ','')}</p>`:'<p>À conserver : aucun remplacement légal n’améliore le score estimé.</p>'}</div>${suggestion?`<div class="swap-card replacement">${art(state.rules.entry(suggestion.to))}</div><button class="button primary" data-apply-swap="${row.index}" aria-label="Remplacer ${escapeHtml(cardLabel(row.from))} par ${escapeHtml(cardLabel(suggestion.to))}">Appliquer</button>`:'<span class="keep-label">Conserver</span>'}</article>`;
    }).join('')}</div><p class="generation-note">Les propositions respectent tes réglages d’activation. Les sept cartes conservées gardent leur forme. Une proposition évalue le deck entier, pas la force d’une carte isolée.</p>`;
    const container=$('#improvement-result');bindImages(container);container.hidden=false;
    container.querySelectorAll('[data-apply-swap]').forEach(button=>button.onclick=()=>{
      if(state.busy||state.improvement!==result||JSON.stringify(state.decks.improve)!==JSON.stringify(result.original)||JSON.stringify(layout)!==JSON.stringify(layoutFor('improve')))return;
      const suggestion=result.cards.find(row=>row.index===Number(button.dataset.applySwap))?.suggestion;
      if(!suggestion||!state.rules.validate(suggestion.deck).valid||JSON.stringify(state.rules.autoDeck(suggestion.deck,layout))!==JSON.stringify(suggestion.deck))return;
      state.decks.improve=[...suggestion.deck];deckChanged('improve');
      $('#improvement-hint').textContent=`${cardLabel(suggestion.from)} remplacé par ${cardLabel(suggestion.to)}. Relance l’analyse pour évaluer le prochain changement.`;
      toast('Remplacement appliqué. Relance l’analyse pour actualiser les propositions.');
    });
  }catch(error){toast(error.message);}
  finally{state.busy=false;$('#improve-deck').textContent='Analyser mon deck';updateControls();}
}
