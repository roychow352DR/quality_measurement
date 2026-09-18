import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {referenceSections,defectStatuses,referenceDocument} from '../reference.js';
import {methodologyDocument} from '../report.js';
import {server} from '../server.mjs';

test('Metrics Reference includes every PDF definition, trend item, and status exactly once',()=>{
  assert.deepEqual(referenceSections.map(section=>section.items.length),[9,5,20]);
  assert.deepEqual(referenceSections.map(section=>new Set(section.items.map(item=>item.group)).size),[2,1,5]);
  assert.equal(defectStatuses.length,3);
  const html=referenceDocument();
  const ids=[...html.matchAll(/data-reference-metric="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,34);assert.equal(new Set(ids).size,34);
  assert.equal((html.match(/data-reference-status/g)||[]).length,3);
  assert.equal((html.match(/<table\b/g)||[]).length,9);
  for(const section of referenceSections)for(const item of section.items){
    assert.ok(item.formula);assert.ok(item.timing);assert.ok(item.source);
  }
  assert.match(html,/Ready for deploy \/ Done/);
  assert.match(html,/QA Failed \/ UAT Failed/);
  assert.match(html,/QA In Progress \/ UAT In Progress/);
  assert.doesNotMatch(html,/Previous escaped P0\/P1 trend value/);
});

test('Reference retains source timing and clearly explains wording and formula ambiguities',()=>{
  const weekly=referenceSections[0].items,release=referenceSections[2].items;
  assert.ok(weekly.every(item=>item.timing==='Weekly'));
  assert.equal(release.filter(item=>item.timing==='Post-release (first 14 days)').length,6);
  assert.match(weekly.find(item=>item.id==='open').note,/Open P0\/P1 defects \(week-end\)/);
  assert.equal(release.find(item=>item.id==='aging').formula,'(Resolved date - detected date) ÷ total days open');
  assert.equal(release.find(item=>item.id==='reopened').formula,'Total tested defects ÷ total reopened defects');
  for(const id of ['aging','reopened'])assert.match(release.find(item=>item.id===id).note,/ambiguous.*not calculated automatically/);
  assert.equal(referenceSections[1].items.filter(item=>item.source==='Not specified in PDF').length,4);
  assert.equal(referenceSections[1].items.find(item=>item.id==='p1Aging').source,'Jira');
});

test('Reference omits scoring content and project access, and replaces PDF navigation',()=>{
  const html=referenceDocument();
  assert.match(html,/<title>Quality Measurement · Metrics Reference<\/title>/);
  assert.match(html,/Formula \/ Definition/);
  assert.match(html,/Measurement Timing/);
  assert.doesNotMatch(html,/Green Target|RAG Thresholds|Health Score Calculation|Total Points|current-band|threshold-green|\b(?:85|60) pts|<script\b|<iframe\b|localStorage|QA owner/);
  assert.doesNotMatch(html,/href="[^"]*\.pdf"/);
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/href="\/reference.html" aria-label="Metrics Reference"/);
  assert.match(index,/href="\/methodology.html" aria-label="Scoring Methodology"/);
  assert.doesNotMatch(index,/target="_blank"|opens in a new tab/);
  for(const name of ['Back Up Inputs','Import Inputs','New Project'])assert.ok(index.includes(`aria-label="${name}"`));
  assert.doesNotMatch(index,/href="metrics-source.pdf"/);
  assert.match(methodologyDocument(),/href="\/reference.html"/);
});

test('Reference routes serve HTML for GET and HEAD without redirecting',async()=>{
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const path of ['/reference','/reference.html']){
      const response=await fetch(origin+path);
      assert.equal(response.status,200);assert.equal(response.redirected,false);
      assert.match(response.headers.get('content-type'),/^text\/html/);
      assert.equal(await response.text(),referenceDocument());
      const head=await fetch(origin+path,{method:'HEAD'});
      assert.equal(head.status,200);assert.equal(await head.text(),'');
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
