'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/papo-event-admin.js'),'utf8');
function helpers(){const context={Intl,Date,structuredClone,document:{addEventListener(){}},window:{addEventListener(){}}};vm.runInNewContext(source.replace('window.PapoEventAdmin={open,close};','window.PapoEventAdmin={open,close,toInstant,localDateTime,set};'),context);return context.window.PapoEventAdmin;}
test('administrator wall-clock dates use Brasília rather than device timezone',()=>{const h=helpers();assert.equal(h.toInstant('2026-10-10T00:00','America/Sao_Paulo'),'2026-10-10T03:00:00.000Z');assert.equal(h.localDateTime('2026-11-10T03:00:00Z','America/Sao_Paulo'),'2026-11-10T00:00');});
test('administrator dates account for DST and reject a nonexistent wall-clock hour',()=>{const h=helpers();assert.equal(h.toInstant('2026-07-15T12:00','America/New_York'),'2026-07-15T16:00:00.000Z');assert.equal(h.toInstant('2026-01-15T12:00','America/New_York'),'2026-01-15T17:00:00.000Z');assert.throws(()=>h.toInstant('2026-03-08T02:30','America/New_York'),/não existe/);assert.throws(()=>h.toInstant('','America/Sao_Paulo'),/Preencha/);});
test('administrator controls preserve flower IDs and letter days while changing text',()=>{const h=helpers(),config={flowers:[{id:'flower-rose',text:'antes'}],letters:[{day:1,text:'antes'}],names:{you:'',partner:''}};h.set(config,'flowers.0.text','depois');h.set(config,'letters.0.text','depois');h.set(config,'names.you','Nome privado');assert.equal(config.flowers[0].id,'flower-rose');assert.equal(config.letters[0].day,1);assert.equal(config.names.you,'Nome privado');assert.equal(config.publishNames,undefined);});
test('administrator saves via authenticated same-origin API and carries revision',()=>{assert.match(source,/credentials:'same-origin'/);assert.match(source,/method:'PUT'/);assert.match(source,/JSON.stringify\(\{config:next,revision\}\)/);assert.match(source,/error.status===409/);assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML/);});
