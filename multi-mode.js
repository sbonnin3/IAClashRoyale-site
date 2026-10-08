'use strict';
const multi={index:null,mode:null,ready:false,worker:null,pending:new Map(),nextId:0,saved:new Map(),result:null,resultSnapshot:null,action:'predict',specificEnemies:false,counterVisible:false,advice:null};
const modeKeys=['modeOwn','modeAlly','modeEnemy1','modeEnemy2'];
const modePanels={modeOwn:{title:'Mon deck de départ',element:'#mode-own-panel'},modeAlly:{title:'Deck de mon allié',element:'#mode-ally-panel'},modeEnemy1:{title:'Adversaire 1',element:'#mode-enemy1-panel'},modeEnemy2:{title:'Adversaire 2',element:'#mode-enemy2-panel'}};
const modeSnapshot=()=>JSON.stringify({id:multi.mode?.id,action:multi.action,decks:modeKeys.map(key=>state.decks[key]),layouts:modeKeys.map(key=>layoutFor(key)),enemies:$('#mode-use-enemies').checked,pool:$('#draft-pool').value,goal:$('#generation-goal').value,warGoal:$('#war-goal').value,keepWarCards:$('#war-keep-cards').checked});
function modeCards(){
 if(multi.mode?.strategy!=='draft')return null;
 const values=$('#draft-pool').value.split(/[\n,;]+/).map(value=>normalize(value.trim())).filter(Boolean),result=[];
 for(const name of values){const card=state.cards.find(card=>normalize(card.name)===name||normalize(card.fr)===name);if(!card)throw new Error(`Carte inconnue dans le tirage : ${name}`);if(!result.includes(card.name))result.push(card.name);}
 return result;
}
function modeEnemies(){if(!$('#mode-use-enemies').checked)return null;return [state.decks.modeEnemy1,...(multi.mode.teamSize===2?[state.decks.modeEnemy2]:[])];}
function resultControls(){
 const container=$('#mode-result');if(container.hidden||!multi.result)return;
 let note=$('#mode-result-status');if(!note){note=document.createElement('p');note.id='mode-result-status';note.className='result-note';note.setAttribute('role','status');container.append(note);}
 const changed=multi.resultSnapshot!==modeSnapshot(),applied=!!multi.advice?.applied;
 note.textContent=applied?'Changement appliqué. Les conseils et pourcentages de cette recherche restent affichés. Relance l’analyse pour évaluer ton nouveau deck.':changed?'Deck ou réglages modifiés : ces conseils et pourcentages correspondent à la dernière recherche. Relance la recherche pour les actualiser.':'Ces résultats restent affichés pendant tes modifications. Relance la recherche pour les actualiser.';
 const accept=$('#accept-advice');if(accept){accept.disabled=state.busy||changed||applied;accept.textContent=applied?'Changement appliqué':'Accepter ce changement';}
 for(const id of ['reject-advice','exclude-resource']){const button=$(`#${id}`);if(button)button.disabled=state.busy||changed&&$('#mode-improve').disabled;}
}
function researchActions(){const team=multi.mode?.teamSize===2;return {predict:team?'Comparer deux équipes':'Comparer deux decks',complete:team?'Compléter le deck allié':'Compléter mon deck',improve:team?'Améliorer le deck allié':'Améliorer mon deck',counter:team?'Trouver une contre-équipe':'Trouver un contre-deck',...(team?{generate:'Créer un deck allié'}:multi.mode?.id==='classic-1v1'?{war:'Créer 4 decks de guerre'}:{})};}
function researchLayout(){
 if(!multi.mode)return;
 const team=multi.mode.teamSize===2,type=multi.action,forced=['predict','counter'].includes(type),supported=multi.mode.rules==='standard';
 $('#mode-use-enemies').checked=type!=='war'&&(forced||multi.specificEnemies);
 $('#enemy-option').hidden=forced||!supported||type==='war';
 $('#enemy-option-label').textContent=team?'Optimiser contre une équipe précise':'Optimiser contre un deck précis';
 $('#mode-objective').hidden=forced||!supported;
 $('#mode-objective').textContent=type==='war'?'Les quatre decks sont évalués face à la même méta du 1c1 classique, avec 32 cartes différentes.':multi.specificEnemies?(team?'La recherche utilise les deux decks adverses renseignés.':'La recherche utilise le deck adverse renseigné.'):(team?'La recherche utilise les équipes récentes de la méta du 2c2.':'La recherche utilise les decks récents de la méta de ce mode.');
 $('#mode-allies').hidden=type==='counter'&&!multi.counterVisible||type==='war'&&!$('#war-keep-cards').checked;
 $('#mode-ally-panel').hidden=!team||(type==='generate'&&!count(state.decks.modeAlly));
 $('#mode-allies .team-grid').classList.toggle('single-deck',!team||$('#mode-ally-panel').hidden);
 $('#mode-enemies').hidden=!$('#mode-use-enemies').checked||!supported;
 $('#mode-enemy2-panel').hidden=!team;
 $('#mode-enemies .team-grid').classList.toggle('single-deck',!team);
 $('#multi-ally-heading').textContent=type==='counter'?(team?'Contre-équipe proposée':'Contre-deck proposé'):(team?'Notre équipe':'Mon deck');
 $('#multi-enemy-heading').textContent=team?'Équipe adverse':'Deck adverse';
 $('#multi-composers').classList.toggle('counter-search',type==='counter');
 $('#multi-composers').hidden=!supported;
 $('#draft-settings').hidden=multi.mode.strategy!=='draft';
 $('#multi-example').hidden=!supported||type==='war'&&!$('#war-keep-cards').checked;
 $('#classic-model-details').hidden=multi.mode.id!=='classic-1v1';
 $('#generation-options').hidden=!supported||!(type==='generate'||type==='complete'&&count(state.decks[team?'modeAlly':'modeOwn'])===0);
 $('#war-options').hidden=type!=='war';
 const descriptions={predict:team?'Ajoute les quatre decks pour estimer le résultat de la confrontation.':'Ajoute ton deck et celui de l’adversaire pour estimer le résultat.',complete:team?'Garde ton deck de départ complet. L’IA crée le deck allié ou complète jusqu’à sept cartes conservées.':'Pars d’un deck vide ou conserve jusqu’à sept cartes : l’IA complète la composition.',improve:team?'Ajoute ton deck et celui de ton allié : l’IA propose le changement le plus intéressant trouvé pour le deck allié.':'Ajoute tes huit cartes : l’IA propose le changement le plus intéressant trouvé.',counter:team?'Renseigne les deux decks adverses : l’IA propose deux decks pour les affronter.':'Renseigne le deck adverse : l’IA propose un contre-deck.',generate:'Ajoute tes huit cartes : l’IA cherche un deck complémentaire pour ton allié.'};
 $('#multi-intro').textContent=type==='war'?'L’IA recherche quatre decks de huit cartes sans doublon. Tu peux conserver des cartes dans le premier deck.':descriptions[type];
 $('#multi-example').textContent=type==='complete'?'Essayer avec 3 cartes':team?'Essayer une équipe':type==='predict'?'Essayer un duel':'Essayer un deck';
}
function researchChoose(type,writeHash=true){
 if(!multi.mode)return;
 const actions=researchActions();if(!actions[type])type='complete';
 if(multi.action!==type){multi.result=null;multi.advice=null;$('#mode-result').hidden=true;multi.counterVisible=false;}
 multi.action=type;$('#research-select').value=type;
 researchLayout();modeControls();
 if(writeHash){const routes={predict:'analyse',counter:'contre',complete:'completer',improve:'ameliorer',generate:'allie',war:'guerre'};history.replaceState(null,'',`#${routes[type]}`);}
}
function modeControls(){
 if(!multi.mode||!state.rules)return;
 researchLayout();
 $('#model-status').textContent=multi.ready?'Modèle prêt':multi.index.models[multi.mode.id]?.status==='ready'?'Chargement…':'Modèle indisponible';
 $('#mode-status').hidden=multi.ready;
 const isTeam=multi.mode.teamSize===2,own=state.decks.modeOwn,ally=isTeam?state.decks.modeAlly:own;
 let allowed;try{allowed=modeCards();}catch{}
 const complete=deck=>state.rules.validate(deck).valid&&!state.rules.coverage(deck).unknown.length;
 const enemies=modeEnemies(),enemyReady=!enemies||enemies.every(complete),base=multi.ready&&!state.busy&&enemyReady;
 const candidates=multi.mode.strategy!=='draft'||allowed?.length>=8;
 const n=count(ally),ownReady=multi.action==='counter'||!isTeam||complete(own);
 $('#mode-generate').disabled=!base||!isTeam||!ownReady||!candidates;
 $('#mode-complete').disabled=!base||!ownReady||n>7||!candidates;
 $('#mode-improve').disabled=!base||!ownReady||!complete(ally)||!candidates;
 $('#mode-predict').disabled=!base||!ownReady||!complete(ally)||!enemies;
 $('#mode-counter').disabled=!base||!enemies||!candidates;
 $('#mode-war').disabled=!multi.ready||state.busy||multi.mode.id!=='classic-1v1'||$('#war-keep-cards').checked&&(!state.rules.validate(own,false).valid||state.rules.coverage(own).unknown.length>0);
 $('#mode-select').disabled=state.busy;
 $('#research-select').disabled=state.busy;
 $('#mode-use-enemies').disabled=state.busy;
 $('#generation-goal').disabled=state.busy;
 $('#war-goal').disabled=state.busy;$('#war-keep-cards').disabled=state.busy;
 $('#refresh-modes').disabled=state.busy;
 $('#multi-example').disabled=state.busy||!state.rules;
 const button=$(`#mode-${multi.action}`);$('#run-research').disabled=button.disabled;
 $('#run-research').textContent=state.busy?'Recherche en cours…':multi.action==='complete'&&n===0?(isTeam?'Générer un deck allié':'Générer mon deck'):researchActions()[multi.action];
 const partial=state.rules.validate(ally,false),unknown=state.rules.coverage(ally).unknown.length;
 $('#mode-action-hint').textContent=state.busy?'Recherche en cours…':!multi.ready?'Un modèle validé est nécessaire pour ce mode.':multi.action==='war'?$('#mode-war').disabled?'Les cartes à conserver sont incompatibles avec le modèle.':`${$('#war-keep-cards').checked?count(own):0} carte(s) conservée(s) · 4 decks et 32 cartes différentes.`:!enemyReady?'Ajoute huit cartes dans chaque deck adverse.':!ownReady?'Ajoute huit cartes dans ton deck de départ.':!candidates&&multi.action!=='predict'?'Indique au moins huit cartes disponibles dans ce tirage.':multi.action==='complete'?(n===0?'Deck vide : l’IA crée une composition complète.':n===8?'Retire une carte pour rechercher une nouvelle composition.':!partial.valid?partial.reason:unknown?'Une carte choisie est absente de ce modèle.':`${n} carte(s) conservée(s) · ${8-n} place(s) à compléter.`):['predict','improve'].includes(multi.action)&&!complete(ally)?'Ajoute huit cartes dans chaque deck de ton équipe.':'Prêt à lancer la recherche.';
 resultControls();
}
function modeSend(type,payload){return new Promise((resolve,reject)=>{const id=++multi.nextId;multi.pending.set(id,{resolve,reject});multi.worker.postMessage({id,type,catalogue:state.catalogue,...payload});});}
function modeLoad(){
 multi.ready=false;multi.worker?.terminate();multi.pending.forEach(call=>call.reject(new Error('Mode changé.')));multi.pending.clear();
 const identity=multi.mode.id,info=multi.index.models[identity];if(info?.status!=='ready'){modeControls();return;}
 multi.worker=new Worker(`mode-worker.js?version=${encodeURIComponent(info.modelVersion)}&check=${Math.floor(Date.now()/60000)}`);multi.worker.onmessage=event=>{
  const message=event.data;if(message.type==='progress'){$('#mode-action-hint').textContent=`Recherche : ${message.step} / ${message.total||8}`;return;}
  const call=multi.pending.get(message.id);if(!call)return;multi.pending.delete(message.id);
  if(message.type==='error')call.reject(new Error(message.message));else call.resolve(message.result||message);
 };
 multi.worker.onerror=()=>{multi.ready=false;multi.pending.forEach(call=>call.reject(new Error('Calcul interrompu. Recharge la page.')));multi.pending.clear();modeControls();};
 modeSend('load',{mode:multi.mode,modelPath:info.modelPath,metaPath:info.metaPath,modelVersion:info.modelVersion}).then(message=>{
  if(multi.mode.id!==identity)return;
  if(message.modelVersion!==info.modelVersion)throw new Error('Le modèle a changé : actualise les modes.');
  multi.ready=true;modeControls();
 }).catch(error=>{if(multi.mode.id===identity){$('#mode-status').textContent=error.message;modeControls();}});
}
function modeChoose(identity){
 if(!multi.index||!state.rules)return;
 if(multi.mode){multi.saved.set(multi.mode.id,{decks:modeKeys.map(key=>[...state.decks[key]]),layouts:modeKeys.map(key=>({...layoutFor(key)})),pool:$('#draft-pool').value,enemies:multi.specificEnemies,action:multi.action});}
 const mode=multi.index.modes.find(mode=>mode.id===identity);if(!mode)return;
 const sameMode=multi.mode?.id===identity,counterVisible=multi.counterVisible;
 multi.mode=mode;$('#mode-select').value=identity;if(!sameMode){multi.result=null;multi.advice=null;$('#mode-result').hidden=true;}
 try{localStorage.setItem('clash-mode-v1',identity);}catch{}
 const saved=multi.saved.get(identity);modeKeys.forEach((key,index)=>{state.decks[key]=saved?.decks[index]||Array(8).fill(null);state.layouts[key]=saved?.layouts[index]||state.rules.layoutOptions();});
 $('#draft-pool').value=saved?.pool||'';multi.specificEnemies=saved?.enemies||false;multi.counterVisible=sameMode&&counterVisible;
 const classic=identity==='classic-1v1',isTeam=mode.teamSize===2,info=multi.index.models[identity],supported=mode.rules==='standard';
 modePanels.modeOwn.title=isTeam?'Mon deck de départ':'Mon deck';modePanels.modeEnemy1.title=isTeam?'Adversaire 1':'Deck adverse';
 $('#mode-description').textContent=mode.label;
 $('#multi-title').textContent=isTeam?'Composer les équipes':'Composer les decks';
 $('#mode-own-panel').hidden=false;$('#mode-ally-panel').hidden=!isTeam;$('#mode-enemy2-panel').hidden=!isTeam;
 $('#mode-generate').hidden=!isTeam;$('#multi-ally-heading').textContent=isTeam?'Notre équipe':'Mon deck';
 $('#multi-enemy-heading').textContent=isTeam?'Équipe adverse':'Deck adverse';
 $('#mode-complete').textContent=isTeam?'Compléter le deck allié':'Compléter mon deck';
 $('#mode-improve').textContent=isTeam?'Améliorer le deck allié':'Améliorer mon deck';
 $('#mode-predict').textContent=isTeam?'Comparer les équipes':'Analyser le duel';
 $('#multi-example').textContent=isTeam?'Essayer une équipe':'Essayer un duel';
 $('#mode-counter').textContent=isTeam?'Créer une contre-équipe':'Créer un contre-deck';
 $('#mode-objective').textContent=isTeam?'Sans adversaire précis, la recherche maximise la moyenne pondérée face aux équipes récemment observées en 2c2.':'Sans adversaire précis, les complétions et remplacements maximisent la moyenne pondérée face à la méta de ce mode.';
 $('#draft-settings').hidden=mode.strategy!=='draft';$('#multi-composers').hidden=!supported;$('#multi-example').hidden=!supported;
 $('.slot-explanation').hidden=!supported;
 $('#multi-explanation').textContent=isTeam?'Les cartes et formes actives sont évaluées ensemble. Le deck de départ est conservé lors de la création de l’allié ; la complétion conserve aussi les cartes déjà choisies dans le deck allié. Le contre-équipe remplace les deux decks alliés. Les remplacements proposés sont comparés séparément. La recherche retient le meilleur score trouvé, sans garantir un maximum absolu ni la victoire.':'La complétion garde toutes les cartes choisies et peut adapter leur placement. Les remplacements sont comparés séparément ; applique un changement, puis relance l’analyse. La recherche retient le meilleur score trouvé sans garantir la victoire.';
 modeKeys.forEach(renderDeck);$('#mode-enemies').hidden=!$('#mode-use-enemies').checked;
 $('#mode-status').textContent=info?.status==='ready'?`Modèle validé pour ${mode.label} · ${info.sourceBattles.toLocaleString('fr-FR')} combats admissibles.`:info?.status==='validation_pending'?`${info.candidateBattles.toLocaleString('fr-FR')} combats admissibles dans le dernier candidat. ${info.reason}`:supported?`${mode.recentBattles.toLocaleString('fr-FR')} combats récents collectés. Il faut au moins ${info?.minimumBattles||2000} combats admissibles et une validation avant de proposer des pourcentages.`:'Ce mode est conservé dans la collecte. Ses règles de composition, decks imposés ou informations supplémentaires doivent être vérifiés avant de proposer une optimisation.';
 $('#mode-quality').innerHTML=info?.status==='ready'?`<h3>Fiabilité pour ${escapeHtml(mode.label)}</h3><p><strong>${number(info.metrics.accuracy*100)} %</strong> de bonnes prédictions sur le test chronologique. AUC : ${number(info.metrics.auc)} · Brier : ${number(info.metrics.brier)}.</p><p>Ces résultats ne garantissent pas les gains d’un remplacement. La coordination et le niveau de jeu individuel ne sont pas modélisés.</p><a href="${escapeHtml(info.reportPath)}" target="_blank" rel="noopener">Rapport de ce modèle</a>`:'<h3>Un modèle propre à chaque mode</h3><p>Le modèle classique reste réservé au 1V1 classique. Aucun pourcentage n’est calculé avec un modèle d’un autre mode.</p>';
 const actions=researchActions();$('#research-select').innerHTML=Object.entries(actions).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
 researchChoose(saved?.action||multi.action);$('#multi').hidden=false;modeLoad();
 modeControls();
}
function showAdvice(){
 const session=multi.advice;if(!session)return;
 const choice=session.result.suggestions[session.cursor];
 if(!choice){$('#mode-result').innerHTML=`<h3>Aucun autre changement améliorant le score</h3><p><strong class="generated-score">${number(session.result.baseline)} %</strong> de victoire estimée pour le deck analysé ${session.enemies?'contre les adversaires renseignés':'en moyenne face à la méta de ce mode'}.</p><p>La recherche ne trouve plus de proposition meilleure que ton deck avec ces exclusions. Une nouvelle analyse repart sans les refus de cette session.</p><p class="result-note">Le score reste une estimation, sans garantie de victoire.</p>`;$('#mode-result').hidden=false;resultControls();return;}
 const changes=choice.changes,items=[];
 changes.removed.forEach((from,index)=>items.push(`Remplacer <strong>${escapeHtml(cardLabel(from))}</strong> par <strong>${escapeHtml(cardLabel(changes.added[index]))}</strong>.`));
 changes.moves.forEach(move=>items.push(`Déplacer <strong>${escapeHtml(state.rules.entry(move.name).fr)}</strong> de l’emplacement ${move.from+1} vers l’emplacement ${move.to+1} (<strong>${escapeHtml(ClashDeckRules.slots[move.to])}</strong>).`));
 changes.forms.forEach(form=>items.push(`Passer de <strong>${escapeHtml(cardLabel(form.from))}</strong> à <strong>${escapeHtml(cardLabel(form.to))}</strong>.`));
 const resources=choice.deck.flatMap(key=>{const card=state.rules.entry(key),options=[{value:`cards:${card.name}`,label:`La carte ${card.fr}`}];if(card.mode==='evolution')options.push({value:`evolutions:${card.name}`,label:`L’évolution de ${card.fr}`});if(card.mode==='hero')options.push({value:`heroes:${card.name}`,label:`Le pouvoir héros de ${card.fr}`});return options;});
 $('#mode-result').innerHTML=`<h3>${session.cursor===0?'Amélioration proposée':'Autre amélioration proposée'}</h3><p class="advice-score">${number(session.result.baseline)} % → <strong>${number(choice.probability)} %</strong> · <span>+${number(choice.gain)} points</span></p><ul class="advice-changes">${items.map(item=>`<li>${item}</li>`).join('')}</ul><p class="result-note">Gain estimé pour l’ensemble du changement, ${session.enemies?'contre les adversaires renseignés':'face à la méta de ce mode'}. Les gains ne s’additionnent pas.</p><div class="advice-actions"><button id="accept-advice" class="button primary">Accepter ce changement</button><button id="reject-advice" class="button">Proposer autre chose</button></div><details class="advice-availability"><summary>Je n’ai pas une carte ou une forme</summary><label for="missing-resource">Élément indisponible<select id="missing-resource">${resources.map(item=>`<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}</select></label><button id="exclude-resource" class="button">Rechercher sans cet élément</button><p class="result-note">Exclusion pour cette analyse. Après un changement accepté, la prochaine analyse repart du nouveau deck.</p></details><p class="result-note">${session.result.tested.toLocaleString('fr-FR')} compositions évaluées. Meilleure proposition trouvée ; aucun gain réel garanti.</p>`;
 $('#accept-advice').onclick=()=>{if(state.busy||session.applied||session.snapshot!==modeSnapshot())return;if(!state.rules.validate(choice.deck).valid||JSON.stringify(state.rules.autoDeck(choice.deck,choice.layout))!==JSON.stringify(choice.deck)){toast('Proposition incompatible avec les emplacements. Relance l’analyse.');return;}const target=multi.mode.teamSize===2?'modeAlly':'modeOwn';state.layouts[target]={...choice.layout};state.decks[target]=[...choice.deck];session.applied=true;deckChanged(target);};
 $('#reject-advice').onclick=()=>{if(state.busy)return;if(session.applied||session.snapshot!==modeSnapshot()){modeRun('improve');return;}session.excluded.push(choice.signature);session.cursor++;showAdvice();};
 $('#exclude-resource').onclick=()=>{if(state.busy)return;const value=$('#missing-resource').value,index=value.indexOf(':'),kind=value.slice(0,index),name=value.slice(index+1),fresh=session.applied||session.snapshot!==modeSnapshot(),constraints=fresh?{cards:[],evolutions:[],heroes:[]}:session.constraints;if(!constraints[kind].includes(name))constraints[kind].push(name);modeRun('improve',{constraints,excluded:fresh?[]:session.excluded});};
 $('#mode-result').hidden=false;resultControls();
}
function bindWarResult(result){
   $('#mode-result').querySelectorAll('[data-use-war]').forEach(button=>button.onclick=()=>{if(state.busy)return;const index=Number(button.dataset.useWar);state.layouts.modeOwn={...result.layouts[index]};state.decks.modeOwn=[...result.decks[index]];deckChanged('modeOwn');researchChoose('improve');toast('Deck sélectionné. Tu peux l’analyser ou le modifier.');});
   $('#copy-war-decks').onclick=async()=>{const text=result.decks.map((deck,index)=>`Deck ${index+1} : ${deck.map(cardLabel).join(', ')}`).join('\n');try{await navigator.clipboard.writeText(text);toast('Les quatre decks ont été copiés.');}catch{toast('Copie indisponible : sélectionne le texte ci-dessous.');const textarea=document.createElement('textarea');textarea.value=text;textarea.rows=6;textarea.className='war-copy-text';$('#mode-result').append(textarea);textarea.focus();textarea.select();}};
}
window.restoreClashResult=frozen=>{
 if(!frozen?.result||frozen.action!==multi.action||frozen.mode!==multi.mode.id)return;
 multi.result=frozen.result;multi.resultSnapshot=frozen.snapshot;multi.advice=frozen.advice;multi.counterVisible=!!frozen.counterVisible;
 const container=$('#mode-result');container.innerHTML=frozen.html;container.hidden=false;
 if(multi.advice)showAdvice();else if(multi.action==='war')bindWarResult(multi.result);
 bindImages(container);modeControls();
};
async function modeRun(type,adviceOptions=null){
 if(state.busy||!multi.ready||$(`#mode-${type}`).disabled)return;
 let allowed;try{allowed=type==='predict'?null:modeCards();}catch(error){toast(error.message);return;}
 const identity=multi.mode.id,snapshot=modeSnapshot(),isTeam=multi.mode.teamSize===2,layout={...layoutFor(isTeam?'modeAlly':'modeOwn')};
 const own=[...state.decks.modeOwn],ally=[...state.decks.modeAlly],enemies=modeEnemies()?.map(deck=>[...deck]);
 state.busy=true;multi.result=null;multi.advice=null;$('#mode-result').hidden=true;modeControls();
 try{
  const result=await modeSend(type,{own,ally:isTeam?ally:null,enemies,allowed,layout,layouts:[{...layoutFor('modeOwn')},{...layoutFor('modeAlly')}],goal:type==='war'?$('#war-goal').value:$('#generation-options').hidden?'meta':$('#generation-goal').value,keepWarCards:$('#war-keep-cards').checked,constraints:adviceOptions?.constraints||{},excluded:adviceOptions?.excluded||[]});
  if(identity!==multi.mode.id||snapshot!==modeSnapshot())return;
  const target=isTeam?'modeAlly':'modeOwn';
  if(type==='counter'&&isTeam){result.decks.forEach((deck,index)=>{const key=index===0?'modeOwn':'modeAlly';if(!state.rules.validate(deck).valid||JSON.stringify(state.rules.autoDeck(deck,result.layouts[index]))!==JSON.stringify(deck))throw new Error('Équipe proposée incompatible.');state.decks[key]=deck;state.layouts[key]=result.layouts[index];deckChanged(key);});}
  else if(['generate','complete','counter'].includes(type)){
   const config=result.layout||layout;if(!state.rules.validate(result.deck).valid||JSON.stringify(state.rules.autoDeck(result.deck,config))!==JSON.stringify(result.deck))throw new Error('Composition proposée incompatible.');
   if(type==='complete'&&(isTeam?ally:own).filter(Boolean).some(value=>!result.deck.some(key=>state.rules.entry(key).name===state.rules.entry(value).name)))throw new Error('Une carte conservée manque au résultat.');
   state.layouts[target]=config;state.decks[target]=result.deck;deckChanged(target);
  }
  if(type==='counter')multi.counterVisible=true;
  multi.result=result;const currentSnapshot=modeSnapshot();multi.resultSnapshot=currentSnapshot;
  if(type==='war'){
   const families=result.decks.flat().map(key=>state.rules.entry(key)?.name);
   if(result.decks.length!==4||result.decks.some((deck,index)=>!state.rules.validate(deck).valid||JSON.stringify(state.rules.autoDeck(deck,result.layouts[index]))!==JSON.stringify(deck))||families.some(name=>!name)||new Set(families).size!==32)throw new Error('Répartition des decks de guerre incompatible.');
   $('#mode-result').innerHTML=`<h3>Mes 4 decks de guerre</h3><p><strong>32 cartes différentes</strong> · aucun doublon entre les decks, même avec une évolution ou un héros.</p><div class="generation-metrics"><p>Moyenne des quatre scores : <strong>${number(result.meanProbability)} %</strong></p><p>Score du moins bon deck : <strong>${number(result.minimumProbability)} %</strong></p></div><p class="result-note">Chaque score estime un combat classique face à la méta. La moyenne ne représente pas la probabilité de gagner les quatre combats ou un duel de guerre.</p><div class="war-decks">${result.decks.map((deck,index)=>`<article class="deck-panel"><div class="deck-head"><h4>Deck ${index+1}</h4><strong>${number(result.probabilities[index])} %</strong></div><p class="deck-details">${meanCost(deck)}</p><div class="deck-grid">${slotsHtml(deck)}</div><button class="button subtle" data-use-war="${index}">Utiliser le deck ${index+1}</button></article>`).join('')}</div><button id="copy-war-decks" class="button">Copier les 4 decks</button><p class="result-note">${escapeHtml(result.method)} ${result.tested.toLocaleString('fr-FR')} compositions évaluées.</p>`;
   bindWarResult(result);
  }else if(type==='improve'){
   multi.advice={result,cursor:0,snapshot:currentSnapshot,enemies:!!enemies,applied:false,constraints:adviceOptions?.constraints||{cards:[],evolutions:[],heroes:[]},excluded:adviceOptions?.excluded||[]};showAdvice();
  }else $('#mode-result').innerHTML=`<h3>${type==='predict'?'Estimation de la confrontation':'Composition proposée'}</h3><p><span class="generated-score">${number(result.probability??result.p1)} %</span> de victoire estimée ${enemies?'contre les adversaires choisis':'en moyenne face à la méta de ce mode'}.</p>${result.tested?`<p>${result.tested.toLocaleString('fr-FR')} compositions et répartitions comparées.</p>`:''}<p class="result-note">${escapeHtml(result.method||(isTeam?'Les quatre decks sont évalués ensemble. Le score reste une estimation, sans garantie de victoire.':'Les deux decks sont évalués ensemble. Le score reste une estimation, sans garantie de victoire.'))}</p>`;
  if(result.counterProbability!==undefined)$('#mode-result').insertAdjacentHTML('beforeend',`<div class="generation-metrics"><p>Score moyen : <strong>${number(result.metaProbability)} %</strong></p><p>Victoire face au meilleur contre trouvé : <strong>${number(result.counterProbability)} %</strong></p><p>Défaite face à ce contre : <strong>${number(result.counterLoss)} %</strong></p></div><details><summary>Voir le contre trouvé</summary><div class="counter-preview">${(isTeam?result.counterDeck:[result.counterDeck]).map(deck=>`<div class="deck-grid">${slotsHtml(deck)}</div>`).join('')}</div></details>`);
  $('#mode-result').hidden=false;bindImages($('#mode-result'));researchLayout();
 }catch(error){if(identity===multi.mode.id)toast(error.message);}finally{state.busy=false;updateControls();modeControls();}
}
async function modeRefresh(){
 const response=await fetch(`modes-index.json?check=${Math.floor(Date.now()/60000)}`,{cache:'no-store'});if(!response.ok)throw new Error('Catalogue des modes indisponible.');
 const next=await response.json();if(next.schemaVersion!==1||!next.modes?.length||!next.models)throw new Error('Catalogue des modes incompatible.');multi.index=next;
 const order=['classic-1v1','triple-elixir-1v1','api-72000533','standard-2v2'];next.modes=next.modes.filter(mode=>order.includes(mode.id));
 const sorted=[...next.modes].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 $('#mode-select').innerHTML=sorted.map(mode=>`<option value="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}${next.models[mode.id]?.status==='ready'?'':next.models[mode.id]?.status==='validation_pending'?' · validation en attente':' · collecte'}</option>`).join('');
 $('#mode-inventory').innerHTML=`<table><thead><tr><th>Mode</th><th>Combats récents</th><th>État</th></tr></thead><tbody>${sorted.map(mode=>`<tr><td>${escapeHtml(mode.label)}</td><td>${mode.recentBattles.toLocaleString('fr-FR')}</td><td>${next.models[mode.id]?.status==='ready'?'Modèle validé':next.models[mode.id]?.status==='validation_pending'?'Dernier candidat non validé':mode.rules==='standard'?'Collecte à enrichir':'Règles à vérifier'}</td></tr>`).join('')}</tbody></table><p class="result-note">Mis à jour le ${new Date(next.updatedAt).toLocaleString('fr-FR')}. Les volumes collectés incluent les combats exclus ensuite pour niveaux, formes ou résultat incompatibles.</p>`;
 $('#mode-select').value=multi.mode?.id||'classic-1v1';
}
async function modeStart(){
 try{
  await modeRefresh();while(!state.rules)await new Promise(resolve=>setTimeout(resolve,100));
  modeKeys.forEach(key=>{state.decks[key]=Array(8).fill(null);panels[key]=modePanels[key];renderDeck(key);});
  $('#mode-select').onchange=()=>modeChoose($('#mode-select').value);
 $('#research-select').onchange=()=>researchChoose($('#research-select').value);
 $('#run-research').onclick=()=>modeRun(multi.action);
 $('#mode-use-enemies').onchange=()=>{multi.specificEnemies=$('#mode-use-enemies').checked;modeControls();};
  $('#draft-pool').oninput=modeControls;
 $('#generation-goal').onchange=modeControls;
 for(const id of ['war-goal','war-keep-cards'])$(`#${id}`).onchange=modeControls;
  for(const [id,type] of [['generate','generate'],['complete','complete'],['improve','improve'],['predict','predict'],['counter','counter']])$(`#mode-${id}`).onclick=()=>modeRun(type);
 $('#multi-example').onclick=()=>{if(state.busy)return;const examples=[['Cannon','Musketeer','Knight','Hog Rider','Fireball','Arrows','Skeletons','Ice Spirit'],['Tesla','Archer Queen','Mini P.E.K.K.A','Giant','Zap','The Log','Bats','Baby Dragon'],['Goblin Giant','Sparky','Mini P.E.K.K.A','Dark Prince','Rage','Arrows','Bats','Goblin Cage'],['Royal Giant','Fisherman','Hunter','Phoenix','Lightning','The Log','Skeletons','Electro Spirit']];modeKeys.forEach((key,index)=>{let deck=state.rules.autoDeck(examples[index],layoutFor(key));if(multi.action==='complete'&&key===(multi.mode.teamSize===2?'modeAlly':'modeOwn'))deck=deck.map((value,slot)=>slot<3?value:null);adoptDeck(key,deck);deckChanged(key);});};
 window.addEventListener('clash:changed',event=>{if(modeKeys.includes(event.detail.key))modeControls();});
  window.addEventListener('clash:controls',modeControls);
 window.clashChooseResearch=route=>{if(route==='stats'){$('#model-details').open=true;return;}const type={analyse:'predict',contre:'counter',completer:'complete',ameliorer:'improve',allie:'generate',guerre:'war'}[route];if(type)researchChoose(type);};
 $('.brand').onclick=event=>{event.preventDefault();modeChoose('classic-1v1');researchChoose('predict');};
  $('#refresh-modes').onclick=()=>modeRefresh().then(()=>modeChoose(multi.mode.id)).catch(error=>toast(error.message));
 const route=location.hash.slice(1);let identity='classic-1v1';try{identity=localStorage.getItem('clash-mode-v1')||identity;}catch{}if(route==='guerre'||!multi.index.modes.some(mode=>mode.id===identity))identity='classic-1v1';modeChoose(identity);window.clashChooseResearch(route);window.restoreClashUpdateDraft?.();
  setInterval(()=>{if(!state.busy)modeRefresh().then(()=>modeChoose(multi.mode.id)).catch(()=>{});},30*60*1000);
 }catch(error){$('#mode-description').textContent=error.message;}
}
modeStart();
