import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const context=vm.createContext({Date,Intl,URLSearchParams}),cache=new Map();
async function load(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,{context,identifier:file});cache.set(file,m);await m.link(spec=>load('lib/'+spec.replace('./','')+'.ts'));return m;}
const m=await load('lib/search-input.ts');await m.evaluate();const {readSearch,validDate}=m.namespace;
let checks=0;function test(name,work){work();checks++;console.log('PASS '+name);}
const parse=query=>readSearch(new URLSearchParams(query));
test('invalid calendar dates are rejected',()=>{assert.equal(validDate('2027-02-30'),false);assert.equal(validDate('not-a-date'),false);assert.equal(validDate('2028-02-29'),true);});
test('malformed dates produce safe renderable defaults',()=>{const {dates}=parse('start=invalid&end=garbage');assert.equal(validDate(dates.start),true);assert.equal(validDate(dates.end),true);assert.ok(dates.end>dates.start);});
test('past and reversed dates are normalized',()=>{const {dates}=parse('start=2000-01-02&end=2000-01-01');assert.ok(dates.start>'2000-01-02');assert.ok(dates.end>dates.start);});
test('stays longer than 30 nights are normalized',()=>{const {dates}=parse('start=2099-01-01&end=2099-03-01');assert.equal(dates.start,'2099-01-01');assert.equal(dates.end,'2099-01-02');});
test('valid dates and city survive a shared link',()=>{const r=parse('start=2099-01-01&end=2099-01-04&city=Mumbai&adults=3&children=2');assert.equal(r.dates.end,'2099-01-04');assert.equal(r.search.city,'Mumbai');assert.equal(r.search.adults,3);assert.equal(r.search.children,2);});
test('invalid guest counts never reach date and capacity controls',()=>{for(const value of ['NaN','Infinity','-1','0','9','1.5','']){const r=parse('adults='+value+'&children=9');assert.ok(Number.isInteger(r.search.adults));assert.ok(r.search.adults>=1);assert.ok(r.search.adults+r.search.children<=8);}});
test('children respect remaining room capacity',()=>{assert.equal(parse('adults=8&children=1').search.children,0);assert.equal(parse('adults=1&children=7').search.children,7);});
console.log(checks+' search regression checks passed.');
