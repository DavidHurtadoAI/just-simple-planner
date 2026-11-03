// QA only: distinguish the host's native embed-resize warning from plugin errors.
// Do not prevent error events, clear the error buffer or alter observer timing.
export function startPreviewDiagnostics(evaluate) {
  evaluate(String.raw`
    if(window.__jspPreviewDiagnostics)throw Error('Preview diagnostics already active');
    const q=window.__jspPreviewDiagnostics={NativeRO:window.ResizeObserver,warnings:[],unexpected:[],last:null};
    window.ResizeObserver=class extends q.NativeRO{constructor(callback){const stack=new Error().stack??'';super((entries,observer)=>{
      q.last=stack.includes('.watchResize (app://obsidian.md/app.js:')&&entries.every(e=>e.target.classList.contains('markdown-embed'))?{stack,at:performance.now()}:null;
      callback(entries,observer);
    })}};
    q.onError=event=>{const record={message:event.message,source:q.last?.stack??''};
      if(event.message==='ResizeObserver loop completed with undelivered notifications.'&&q.last&&performance.now()-q.last.at<1000)q.warnings.push(record);else q.unexpected.push(record);
    };window.addEventListener('error',q.onError);return true;
  `);
}

export function stopPreviewDiagnostics(evaluate) {
  evaluate(String.raw`const q=window.__jspPreviewDiagnostics;if(q){window.ResizeObserver=q.NativeRO;window.removeEventListener('error',q.onError);window.__jspPreviewDiagnosticsResult={warnings:q.warnings,unexpected:q.unexpected};delete window.__jspPreviewDiagnostics}return true;`);
}

export function verifyNativeErrors(run, evaluate, allowNativePreviewWarning = false) {
  const errors = run('dev:errors');
  if (errors.includes('No errors captured.')) return [];
  if (!allowNativePreviewWarning) throw Error(errors);
  const out = evaluate('const d=window.__jspPreviewDiagnostics??window.__jspPreviewDiagnosticsResult;return JSON.stringify(d?{warnings:d.warnings,unexpected:d.unexpected}:null);');
  const result = JSON.parse(out.includes('=>') ? out.slice(out.indexOf('=>') + 2).trim() : out);
  const lines = errors.split(/\r?\n/).filter(Boolean).map(line => line.replace(/^\d{2}:\d{2}:\d{2}\s+/, ''));
  if (!result || result.unexpected.length || result.warnings.length !== lines.length || lines.some(line => line !== 'ResizeObserver loop completed with undelivered notifications.') || result.warnings.some(w => !w.source.includes('.watchResize (app://obsidian.md/app.js:'))) throw Error(errors);
  return result.warnings;
}
