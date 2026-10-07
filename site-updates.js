(function(root){
 'use strict';
 const revision=manifest=>JSON.stringify({source:manifest.source_commit,files:manifest.files});
 const storage='clash-update-draft-v1';let baseline=null,running=false,lastCheck=0;
 root.restoreClashUpdateDraft=()=>{
  try{
   const draft=JSON.parse(sessionStorage.getItem(storage));sessionStorage.removeItem(storage);
   if(!draft||Date.now()-draft.at>60*60*1000||!multi.index.modes.some(mode=>mode.id===draft.mode))return;
   const decks=modeKeys.map((key,index)=>state.rules.autoDeck(draft.decks[index],draft.layouts[index])||Array(8).fill(null));
   for(const [id,value] of draft.saved||[])if(multi.index.modes.some(mode=>mode.id===id))multi.saved.set(id,value);
   multi.saved.set(draft.mode,{decks,layouts:draft.layouts,action:draft.action,enemies:draft.enemies,pool:draft.pool});
   multi.mode=null;modeChoose(draft.mode);$('#generation-goal').value=draft.goal;toast('Site et modèles actualisés. Tes cartes sont conservées.');
  }catch{}
 };
 root.checkClashSiteUpdate=async(force=false)=>{
  if(running||!multi.ready||!state.rules||state.busy||$('#selector').open||document.hidden||!force&&Date.now()-lastCheck<15*60*1000)return;
  running=true;
  try{
   const response=await fetch(`publication.json?check=${Math.floor(Date.now()/60000)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)return;const manifest=await response.json();if(!manifest.files?.['index.html']||!manifest.model_versions)return;
   const next=revision(manifest);lastCheck=Date.now();if(baseline===null){baseline=next;return;}if(next===baseline)return;
   if(state.busy||$('#selector').open)return;
   sessionStorage.setItem(storage,JSON.stringify({at:Date.now(),mode:multi.mode.id,action:multi.action,decks:modeKeys.map(key=>state.decks[key]),layouts:modeKeys.map(layoutFor),enemies:multi.specificEnemies,pool:$('#draft-pool').value,goal:$('#generation-goal').value,saved:[...multi.saved]}));
   location.reload();
  }catch{}finally{running=false;}
 };
 setInterval(()=>root.checkClashSiteUpdate(),60*1000);
 document.addEventListener('visibilitychange',()=>root.checkClashSiteUpdate());
 setTimeout(()=>root.checkClashSiteUpdate(true),5000);
})(window);
