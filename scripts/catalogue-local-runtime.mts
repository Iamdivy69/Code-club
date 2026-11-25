import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { Execute } from '../backend/src/modules/practice/judge.js';

/** Local original-fixture runner. No external execution service; native container has no network. */
export async function createLocalRuntime(directory: string) {
  await mkdir(directory, { recursive: true });
  const image = 'ghcr.io/engineer-man/piston:latest';
  const container = 'codeclub-catalogue-' + randomUUID();
  const docker = (args: string[], input?: string) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 30000, windowsHide: true });
  const imageDigest = docker(['image','inspect',image,'--format','{{.Id}}']).trim();
  docker(['run','-d','--rm','--name',container,'--network','none','--read-only','--tmpfs','/tmp:rw,exec,size=128m',
    '--memory','512m','--cpus','1','--pids-limit','128','--cap-drop','ALL','--entrypoint','sleep',image,'infinity']);
  const execute: Execute = async(source, language='javascript') => {
    let stdout='';
    try {
      if(language==='javascript'||language==='typescript') {
        const script=language==='typescript'?ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText:source;
        runInNewContext(script,{exports:{},console:{log:(value:unknown)=>{stdout+=String(value)+'\n';}}},{timeout:2000});
      } else if(language==='python') {
        const file=join(directory,'fixture.py');await writeFile(file,source);
        stdout=execFileSync('python',['-I','-S',file],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:10000,windowsHide:true});
      } else if(language==='java') {
        const file=join(directory,'Main.java');await writeFile(file,source);
        execFileSync('javac',['-d',directory,file],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000,windowsHide:true});
        stdout=execFileSync('java',['-cp',directory,'Main'],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:10000,windowsHide:true});
      } else if(language==='c') {
        stdout=docker(['exec','-i',container,'sh','-c','cat > /tmp/main.c && gcc -O2 /tmp/main.c -o /tmp/program && /tmp/program'],source);
      } else if(language==='cpp') {
        stdout=docker(['exec','-i',container,'sh','-c','cat > /tmp/main.cpp && g++ -std=c++17 -O2 /tmp/main.cpp -o /tmp/program && /tmp/program'],source);
      } else throw new Error('Unsupported local language');
      return {status:3,stdout,stderr:'',compileOutput:'',time:null,memory:null};
    } catch {
      return {status:11,stdout:'',stderr:'Local development fixture process failed.',compileOutput:'',time:null,memory:null};
    }
  };
  return {execute, imageDigest, async close(){docker(['stop','--time','1',container]);}};
}
