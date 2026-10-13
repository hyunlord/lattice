import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const repos = read(new URL('../repositories.json', import.meta.url)).repositories;
const frozenQuestions = read(new URL('../questions.json', import.meta.url)).repositories;
const ledger = read(`${root}/ledger.json`).trials;
const manifest = read(`${root}/manifest.json`);
const rows = [];
const eventsPath = `${root}/transport-events.jsonl`;
const events = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const totals = { direct: { completed: 0, graded: 0, score: 0, measuredLower: 0, measuredUpper: 0, measuredCount: 0, selfReportedOnlySeconds: 0 }, map: { completed: 0, graded: 0, score: 0, measuredLower: 0, measuredUpper: 0, measuredCount: 0, selfReportedOnlySeconds: 0 } };
for (const [index, repo] of repos.entries()) {
  const gradePath = `${root}/grades/${repo.id}.json`;
  const grades = fs.existsSync(gradePath) ? read(gradePath) : null;
  for (const arm of ['direct', 'map']) {
    const trial = ledger[`${arm}-${repo.id}`];
    const answerPath = `${root}/${arm}-${repo.id}.json`;
    const answer = fs.existsSync(answerPath) ? read(answerPath) : null;
    const exportPath = `${root}/exports/${repo.id}.json`;
    const exportRecord = fs.existsSync(exportPath) ? read(exportPath) : null;
    const splitGradePath = `${root}/grades/${arm}-${repo.id}.json`;
    const grade = fs.existsSync(splitGradePath) ? read(splitGradePath) : grades?.arms?.[arm];
    if (grade) {
      const expectedIds = frozenQuestions.find(set => set.id === repo.id).questions.map(q => q.id).sort();
      if (grade.commit !== repo.commit || JSON.stringify(grade.questions.map(q => q.id).sort()) !== JSON.stringify(expectedIds)) throw new Error(`Grade pin/question mismatch ${arm}-${repo.id}`);
      if (grade.questions.length !== 10 || grade.questions.some(q => ![0, 1, 2].includes(q.score)) || grade.questions.reduce((sum, q) => sum + q.score, 0) !== grade.total) throw new Error(`Invalid grade ${arm}-${repo.id}`);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(`${root}/${arm}-${repo.id}.json`)).digest('hex');
      if (digest !== grade.answerSha256) throw new Error(`Answer changed after grading ${arm}-${repo.id}`);
      totals[arm].graded++;
      totals[arm].score += grade.total;
    }
    if (trial && trial.status !== 'running') totals[arm].completed++;
    if (trial?.elapsedSecondsLower != null && trial?.elapsedSecondsUpper != null) {
      totals[arm].measuredCount++;
      totals[arm].measuredLower += trial.elapsedSecondsLower;
      totals[arm].measuredUpper += trial.elapsedSecondsUpper;
    } else totals[arm].selfReportedOnlySeconds += trial?.selfReportedElapsedSeconds ?? 0;
    rows.push({ repository: repo.id, commit: repo.commit, arm, armOrder: (index % 2 === 0 ? ['direct', 'map'] : ['map', 'direct']).indexOf(arm) + 1, status: trial?.status ?? 'not-started', score: grade?.total ?? null, maximumScore: 20, secondsLower: trial?.elapsedSecondsLower ?? null, secondsUpper: trial?.elapsedSecondsUpper ?? null, selfReportedOnlySeconds: trial?.selfReportedElapsedSeconds ?? null, timingMethod: trial?.elapsedSecondsLower != null ? 'coordinator-monotonic-delivery-bracket-to-persistence' : trial?.selfReportedElapsedSeconds != null ? 'self-report-only-coordinator-missing' : 'pending', answerSha256: trial?.answerSha256 ?? null, mapExportAvailability: arm === 'map' ? exportRecord?.status ?? 'pending' : 'not-applicable', mcpQueryCount: arm === 'map' ? events.filter(e => e.repository === repo.id && e.type === 'trial-query').length : null, toolErrors: JSON.stringify(answer?.toolErrors ?? []), accessLimitations: JSON.stringify(answer?.limitations ?? []), gradeLimitations: JSON.stringify(grade?.limitations ?? []), referenceIssues: JSON.stringify(grade?.referenceIssues ?? []), grader: grade?.gradedBy ?? null, authoritativeTokens: null });
  }
}
const header = Object.keys(rows[0]);
const escape = value => value == null ? '' : `"${String(value).replaceAll('"', '""')}"`;
fs.writeFileSync(`${root}/results.csv`, [header.join(','), ...rows.map(row => header.map(k => escape(row[k])).join(','))].join('\n') + '\n');
const gradesComplete = totals.direct.graded === 18 && totals.map.graded === 18;
const measurementsComplete = totals.direct.measuredCount === 18 && totals.map.measuredCount === 18;
const summary = { candidate: manifest.candidate, totals, maximumPerArm: 360, accuracyGate: gradesComplete ? totals.map.score >= totals.direct.score ? 'pass' : 'fail' : 'pending', primaryTimeGate: !measurementsComplete ? 'unavailable-incomplete-coordinator-timing' : totals.map.measuredUpper <= totals.direct.measuredLower * 0.5 ? 'pass-across-delivery-bounds' : totals.map.measuredLower > totals.direct.measuredUpper * 0.5 ? 'fail-across-delivery-bounds' : 'indeterminate-within-delivery-bounds', timingLimitations: ['Retained direct-Click trial lacks coordinator monotonic timing;300s is self-reported only.', 'Delivery is bracketed; elapsed intervals include dispatch uncertainty.', 'One trial per cell; agent proxy, not human study.'], authoritativeTokens: null, competitor: manifest.competitor };
const paired = repos.map(repo => ({ repository: repo.id, direct: ledger[`direct-${repo.id}`], map: ledger[`map-${repo.id}`] })).filter(p => p.direct?.elapsedSecondsLower != null && p.map?.elapsedSecondsLower != null);
const sums = paired.reduce((s, p) => ({ directLower: s.directLower + p.direct.elapsedSecondsLower, directUpper: s.directUpper + p.direct.elapsedSecondsUpper, mapLower: s.mapLower + p.map.elapsedSecondsLower, mapUpper: s.mapUpper + p.map.elapsedSecondsUpper }), { directLower: 0, directUpper: 0, mapLower: 0, mapUpper: 0 });
summary.coordinatorPairedSubset = { count: paired.length, repositories: paired.map(p => p.repository), ...sums, ratioLower: sums.directUpper ? sums.mapLower / sums.directUpper : null, ratioUpper: sums.directLower ? sums.mapUpper / sums.directLower : null, limitation: 'Supplemental subset; does not replace preregistered18-repository aggregate.' };
if (totals.direct.completed === 18 && totals.map.completed === 18 && totals.map.measuredCount === 18 && totals.direct.measuredCount === 17) {
  const directLower = totals.direct.measuredLower + totals.direct.selfReportedOnlySeconds;
  const directUpper = totals.direct.measuredUpper + totals.direct.selfReportedOnlySeconds;
  summary.supplementalSelfReportSubstitution = { directLower, directUpper, mapLower: totals.map.measuredLower, mapUpper: totals.map.measuredUpper, ratioLower: totals.map.measuredLower / directUpper, ratioUpper: totals.map.measuredUpper / directLower, limitation: 'Includes unverified direct-Click self-reported300s; not primary coordinator measurement.' };
}
fs.writeFileSync(`${root}/results.json`, JSON.stringify(rows, null, 2) + '\n');
fs.writeFileSync(`${root}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
