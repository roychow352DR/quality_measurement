import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleDraft,calculate} from '../metrics.js';
import {overallRagHTML,reportBody,reportDocument,methodologyDocument} from '../report.js';

test('Overall RAG table highlights unrounded boundary scores and handles missing scores',()=>{
  for(const [score,status] of [[0,'red'],[59.96,'red'],[60,'amber'],[84,'amber'],[84.96,'amber'],[85,'green'],[100,'green']]){
    const html=overallRagHTML({score,points:score,count:1});
    assert.match(html,new RegExp(`class="rag-band ${status} current-band" data-current="true"`));
    assert.equal((html.match(/data-current="true"/g)||[]).length,1);
    assert.ok(html.includes(`${score.toFixed(1)} <small>/ 100</small>`));
    for(const range of ['≥ 85 pts','≥ 60 and &lt; 85 pts','&lt; 60 pts'])assert.ok(html.includes(range));
  }
  const empty=overallRagHTML({score:null,points:0,count:0});
  assert.doesNotMatch(empty,/data-current=|NaN|Infinity/);
  assert.match(empty,/Overall RAG Score is N\/A/);
});

test('Overall RAG panel leads the report after project information and retains complete snapshot scores under filters',()=>{
  const draft=exampleDraft(),snapshot={draft,generatedAt:'2026-09-11T00:00:00Z'};
  const panel=overallRagHTML(calculate(draft).overall);
  for(const filters of [{},{label:'qa',component:'Process quality'},{label:'development',component:'Test execution / process monitoring'}]){
    const html=reportBody(snapshot,filters);
    assert.ok(html.includes(panel));
    assert.ok(html.indexOf('class="report-intro"')<html.indexOf('class="panel overall-rag"'));
    assert.ok(html.indexOf('class="panel overall-rag"')<html.indexOf('class="stats-grid"'));
    assert.doesNotMatch(html,/Overall Quality Health/);
    assert.ok(html.indexOf('class="panel overall-rag"')<html.indexOf('class="panel report-method"'));
    assert.match(html,/href="\/methodology.html" aria-label=/);
    assert.doesNotMatch(html,/<a\b[^>]*href="\/methodology.html"[^>]*target=|opens in a new tab/);
  }
  const offline=reportDocument(snapshot,'');
  assert.ok(offline.includes(panel));
  assert.match(offline,/class="methodology-copy"><h3>Scores from Your Measurements/);
  assert.doesNotMatch(offline,/href="\/methodology.html"|<script\b|<link\b/);
});

test('Standalone methodology is a complete reference independent of report data or filters',()=>{
  const html=methodologyDocument();
  assert.match(html,/<title>Quality Measurement · Scoring Methodology<\/title>/);
  assert.match(html,/<h1>Scoring Methodology<\/h1>/);
  assert.equal((html.match(/<tr data-metric=/g)||[]).length,29);
  assert.equal((html.match(/class="threshold-component"/g)||[]).length,6);
  assert.match(html,/Each perspective score = total points/);
  assert.match(html,/Shared outcome example/);
  assert.match(html,/All five trend charts and their data use all original weeks/);
  assert.doesNotMatch(html,/data-current=|<script\b|localStorage|Loyalty Migration|QA owner/);
});
