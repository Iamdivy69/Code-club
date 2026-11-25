import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === 'javascript' || label === 'typescript' ? new TypeScriptWorker() : new EditorWorker();
  },
};

loader.config({ monaco });
