'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const catalogue=require(path.join(root,'catalogue.js')).validate(read('catalogue.json'));
const manifest=read('publication.json'),registry=read('modes-index.json');
for(const card of catalogue.cards)for(const file of [card.image,...Object.values(card.images)])assert.equal(fs.readFileSync(path.join(root,file)).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
for(const [id,info] of Object.entries(registry.models)){
 if(info.status!=='ready')continue;
 const model=read(info.modelPath),meta=read(info.metaPath),report=read(info.reportPath);
 assert.equal(model.mode.id,id);assert.equal(meta.modelVersion,model.modelVersion);assert.equal(report.model_version,model.modelVersion);assert.equal(model.modelVersion,manifest.model_versions[id]);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,info.modelPath))).digest('hex'),report.model_sha256);
}
const files=new Set([...Object.keys(manifest.files),'catalogue.json',...catalogue.cards.flatMap(card=>[card.image,...Object.values(card.images)])]);
const site=path.join(root,'_site');fs.mkdirSync(site,{recursive:true});
for(const file of files){assert.ok(!file.includes('..')&&!path.isAbsolute(file));const content=fs.readFileSync(path.join(root,file));manifest.files[file]=crypto.createHash('sha256').update(content).digest('hex');const target=path.join(site,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
manifest.catalogue_checked_at=catalogue.checkedAt;
fs.writeFileSync(path.join(root,'publication.json'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(path.join(root,'publication.json'),path.join(site,'publication.json'));
for(const file of ['.nojekyll','THIRD_PARTY.md'])fs.copyFileSync(path.join(root,file),path.join(site,file));
console.log(JSON.stringify({staticFiles:files.size,cards:catalogue.cards.length,models:Object.keys(manifest.model_versions).length}));
