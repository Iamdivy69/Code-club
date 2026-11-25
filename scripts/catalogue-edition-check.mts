import { writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabase } from '../backend/src/database.js';
import { editionChapters } from '../backend/src/modules/study/editions.js';
import { evaluate } from '../backend/src/modules/practice/evaluation.js';
import type { PracticeLanguage } from '../backend/src/modules/practice/contracts.js';
import { createLocalRuntime } from './catalogue-local-runtime.mts';
import { editionFixtures } from './catalogue-edition-fixtures.mts';

const url=new URL(process.env.DATABASE_URL??'postgresql://practice:local_practice@127.0.0.1:15432/practice_catalogue?schema=public');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/practice_catalogue')throw new Error('Use disposable practice_catalogue only.');
const root=resolve(import.meta.dirname,'..');
const db=createDatabase(url.href);
const runtime=await createLocalRuntime(join(root,'.local/catalogue/edition-runtime'));
const sha=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
try{
 const slugs=editionChapters.flatMap(c=>c.missions.map(m=>m.slug));
 const problems=await db.problem.findMany({where:{slug:{in:slugs}},select:{id:true,slug:true,isPublished:true,starterCode:true,practiceContract:{include:{cases:{orderBy:[{hidden:'asc'},{position:'asc'}]}}}}});
 if(problems.length!==8)throw new Error('Expected eight original Edition exercises.');
 const reports=[];
 for(const problem of problems){
  const contract=problem.practiceContract;
  if(!problem.isPublished||!contract?.enabled||contract.contestOnly)throw new Error('Edition requires published graded ordinary exercises.');
  const languages=[];
    for(const [language,programs] of Object.entries(editionFixtures[problem.slug])){
   const adapt=(program:string)=>language==='python'&&!(contract.nativeSignature as {pythonClass?:string}|null)?.pythonClass
     ?program.replace(/^class Solution:\n/,'').split('\n').map(line=>line.startsWith('    ')?line.slice(4):line).join('\n').replace(/\(self,/g,'(').replace(/self\./g,'')
     :program;
   const [accepted,wrong]=programs.map(adapt);
   if(!(problem.starterCode as Record<string,string>)[language])continue;
   let acceptedCases=0,rejectedCases=0,invalidCases=0;
   for(const test of contract.cases){
    const good=await evaluate(runtime.execute,contract,test,accepted,language as PracticeLanguage);
    const bad=await evaluate(runtime.execute,contract,test,wrong,language as PracticeLanguage);
    if(good.verdict==='ACCEPTED')acceptedCases++;else invalidCases++;
    if(bad.verdict==='WRONG_ANSWER')rejectedCases++;else if(bad.verdict!=='ACCEPTED')invalidCases++;
   }
   languages.push({language,passed:acceptedCases===contract.cases.length&&rejectedCases>0&&invalidCases===0,acceptedCases,rejectedCases,totalCases:contract.cases.length,invalidCases,acceptedDigest:sha(accepted),wrongDigest:sha(wrong)});
  }
  reports.push({slug:problem.slug,problemId:problem.id,contentVersion:contract.contentVersion,contentDigest:sha({contract,starterCode:problem.starterCode}),passed:languages.length===Object.keys(problem.starterCode as Record<string,string>).length&&languages.every(r=>r.passed),languages});
 }
 const passed=reports.every(r=>r.passed);
 const report={evidenceKind:'local-development-only',releaseGrade:false,source:'eight original existing Practice exercises; no upstream Edition mission content reused',
  passed,checkedPairs:reports.reduce((sum,r)=>sum+r.languages.length,0),nativeImageDigest:runtime.imageDigest,nativeIsolation:{network:'none',rootFilesystem:'read-only',workspace:'ephemeral tmpfs'},
  limitation:'Production drivers and evaluator on local runtimes. Six Judge0 runtime IDs still need deployment commissioning.',reports};
 await writeFile(join(root,'integration/catalogue/edition-language-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed,checkedPairs:report.checkedPairs,releaseGrade:false,report:'integration/catalogue/edition-language-report.json'},null,2));
 if(!passed)process.exitCode=2;
}finally{await runtime.close();await db.$disconnect();}
