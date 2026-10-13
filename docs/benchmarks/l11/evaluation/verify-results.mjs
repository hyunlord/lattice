import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const contract = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const hash = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const manifest = read(`${root}/manifest.json`);
const ledger = read(`${root}/ledger.json`).trials;
const issues = [];
const artifacts = [];
for (const [name, expected] of Object.entries(manifest.hashes)) if (hash(`${contract}/${name}`) !== expected) issues.push(`Frozen contract changed: ${name}`);
const repositories = read(`${contract}/repositories.json`).repositories;
for (const [index, repo] of repositories.entries()) {
  const order = index % 2 === 0 ? ['direct', 'map'] : ['map', 'direct'];
  const first = ledger[`${order[0]}-${repo.id}`];
  const second = ledger[`${order[1]}-${repo.id}`];
  if (first?.finalPersistObserved && second?.startBeforeDelivery && BigInt(first.finalPersistObserved.monotonicNs) > BigInt(second.startBeforeDelivery.monotonicNs)) issues.push(`Arm order overlap: ${repo.id}`);
  for (const arm of ['direct', 'map']) {
    const key = `${arm}-${repo.id}`;
    const trial = ledger[key];
    if (!trial || trial.status === 'running') issues.push(`Unfinished trial: ${key}`);
    for (const relative of [`${key}.json`, `grades/${key}.json`]) {
      const path = `${root}/${relative}`;
      if (!fs.existsSync(path)) { issues.push(`Missing artifact: ${relative}`); continue; }
      artifacts.push({path:relative,bytes:fs.statSync(path).size,sha256:hash(path)});
    }
    const answer = `${root}/${key}.json`;
    const grade = `${root}/grades/${key}.json`;
    if (fs.existsSync(answer) && trial?.answerSha256 && hash(answer) !== trial.answerSha256) issues.push(`Persistence hash mismatch: ${key}`);
    if (fs.existsSync(grade)) {
      const result = read(grade);
      if (result.answerSha256 !== hash(answer)) issues.push(`Grader answer hash mismatch: ${key}`);
      if (result.commit !== repo.commit || ![repo.id, repo.repository].includes(result.repository) || result.arm !== arm) issues.push(`Grader identity mismatch: ${key}`);
      if (result.questions.length !== 10 || result.questions.some(q => ![0,1,2].includes(q.score)) || result.questions.reduce((sum,q) => sum+q.score,0) !== result.total) issues.push(`Invalid scores: ${key}`);
    }
  }
}
const result = {checkedAt:new Date().toISOString(),complete:issues.length===0,trialCount:Object.keys(ledger).length,answerAndGradeArtifactCount:artifacts.length,issues,artifacts};
fs.writeFileSync(`${root}/verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({complete:result.complete,trialCount:result.trialCount,artifactCount:artifacts.length,issues},null,2));
if(issues.length) process.exitCode=1;
