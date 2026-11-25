import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readManifest, scanCatalogue } from '../backend/src/modules/practice/catalogue-source.js';
import { loadCatalogueSolutions, verifyCatalogue } from '../backend/src/modules/practice/catalogue-verification.js';
import { createLocalRuntime } from './catalogue-local-runtime.mts';

// Development evidence using only original fixtures created by catalogue-prepare.mts.
const root=resolve(import.meta.dirname,'..');
const storage=join(root,'.local/catalogue/candidate');
const review=await readManifest(join(storage,'reviewed.json'));
const scan=await scanCatalogue(join(storage,'problems'),review);
const fixtures=await loadCatalogueSolutions(join(storage,'solutions.json'));
const selected=new Set(Object.entries(fixtures.manifest.entries).filter(([,record])=>Object.keys(record.languages).length>0).map(([slug])=>slug));
const developmentReview={...review,entries:Object.fromEntries(Object.entries(review.entries).filter(([slug])=>selected.has(slug)))};
for(const [slug,candidate] of scan.candidates){
  if(!selected.has(slug)){scan.candidates.delete(slug);continue;}
  candidate.spec.starters=Object.fromEntries(Object.entries(candidate.spec.starters).filter(([language])=>fixtures.manifest.entries[slug].languages[language as keyof typeof fixtures.manifest.entries[string]['languages']]));
}
fixtures.manifest.entries=Object.fromEntries(Object.entries(fixtures.manifest.entries).filter(([slug])=>selected.has(slug)));
const runtime=await createLocalRuntime(join(storage,'development-runtime'));
try{
  const result=await verifyCatalogue(scan,developmentReview,fixtures.manifest,fixtures.readSolution,runtime.execute);
  const report={evidenceKind:'local-development-only',releaseGrade:false,candidate:review.version,
    languages:['javascript','typescript','python','java','cpp','c'],skippedLanguages:[],nativeImageDigest:runtime.imageDigest,
    nativeIsolation:{network:'none',rootFilesystem:'read-only',workspace:'ephemeral tmpfs'},
    limitation:'Local original fixture programs only; controlled Judge0 release matrix and missing fixture implementations remain required.',...result};
  await writeFile(join(root,'integration/catalogue/development-fixture-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,checkedPairs:result.reports.reduce((sum,row)=>sum+('languages'in row?row.languages.length:0),0),releaseGrade:false,report:'integration/catalogue/development-fixture-report.json'},null,2));
  if(!result.passed)process.exitCode=2;
}finally{await runtime.close();}
