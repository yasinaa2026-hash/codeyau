(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PYODIDE_VERSION = '314.0.3';
  const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  const STORAGE = {
    files: 'codeyau-files',
    current: 'codeyau-current',
    projects: 'codeyau-projects',
    theme: 'codeyau-theme',
    users: 'codeyau-users',
    session: 'codeyau-session',
    model: 'codeyau-gemini-model'
  };
  const templates = {
    python: 'a = 384 + 347\nprint(a)',
    javascript: 'const a = 384 + 347;\nconsole.log(a);',
    cpp: '#include <iostream>\nint main() { std::cout << 384 + 347 << std::endl; return 0; }',
    java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println(384 + 347);\n  }\n}',
    html: '<!doctype html>\n<html><body><h1>Hello, codeyau!</h1></body></html>'
  };
  const modes = { python: 'python', javascript: 'javascript', cpp: 'text/x-c++src', java: 'text/x-java', html: 'htmlmixed' };
  const extensions = { python: 'py', javascript: 'js', cpp: 'cpp', java: 'java', html: 'html' };

  let files = [{ name: 'main.py', language: 'python', content: templates.python }];
  let current = 0;
  let editor = null;
  let pyodide = null;
  let pyodidePromise = null;
  let authMode = 'signin';
  let session = null;

  function safeGet(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; }
  }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function toast(message, error = false) {
    const el = $('toast');
    if (!el) return;
    $('toastText').textContent = message;
    el.classList.remove('translate-y-20', 'opacity-0');
    el.classList.toggle('text-red-300', error);
    clearTimeout(window.__toast);
    window.__toast = setTimeout(() => el.classList.add('translate-y-20', 'opacity-0'), 2400);
  }
  function detectLanguage(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    if (['js','mjs'].includes(ext)) return 'javascript';
    if (['cpp','cc','cxx','c'].includes(ext)) return 'cpp';
    if (ext === 'java') return 'java';
    if (['html','htm'].includes(ext)) return 'html';
    return 'python';
  }
  function saveWorkspace() {
    if (editor && files[current]) files[current].content = editor.getValue();
    safeSet(STORAGE.files, JSON.stringify(files));
    safeSet(STORAGE.current, String(current));
  }
  function loadWorkspace() {
    try {
      const raw = JSON.parse(safeGet(STORAGE.files, 'null'));
      if (Array.isArray(raw) && raw.length) files = raw.filter(Boolean).map((f) => ({
        name: String(f.name || 'main.py'),
        language: modes[f.language] ? f.language : detectLanguage(f.name || ''),
        content: String(f.content || '')
      }));
      const idx = Number(safeGet(STORAGE.current, '0'));
      if (Number.isInteger(idx) && idx >= 0 && idx < files.length) current = idx;
    } catch {}
  }
  function renderFiles() {
    const list = $('fileList');
    const tabs = $('tabs');
    if (!list || !tabs) return;
    list.replaceChildren(); tabs.replaceChildren();
    files.forEach((file, i) => {
      const row = document.createElement('div');
      row.className = `flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer ${i === current ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800'}`;
      const label = document.createElement('span'); label.textContent = file.name; label.className = 'truncate flex-1';
      const del = document.createElement('button'); del.className = 'text-slate-500 hover:text-red-400'; del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      del.classList.toggle('invisible', files.length === 1);
      del.onclick = (e) => { e.stopPropagation(); deleteFile(i); };
      row.append(label, del); row.onclick = () => switchFile(i); list.appendChild(row);
      const tab = document.createElement('button');
      tab.className = `px-4 h-full text-xs border-t-2 whitespace-nowrap ${i === current ? 'bg-slate-950 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-transparent'}`;
      tab.textContent = file.name; tab.onclick = () => switchFile(i); tabs.appendChild(tab);
    });
    updateStatus();
  }
  function updateStatus() {
    if (!editor || !files[current]) return;
    const cursor = editor.getCursor();
    const text = editor.getValue();
    $('statusFile').textContent = files[current].name;
    $('statusLanguage').textContent = ({ python:'Python 3', javascript:'JavaScript', cpp:'C++', java:'Java', html:'HTML / CSS / JS' })[files[current].language];
    $('statusPosition').textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    $('statusStats').textContent = `${text.split('\n').length} lines · ${text.trim() ? text.trim().split(/\s+/).length : 0} words`;
  }
  function switchFile(index) {
    if (index === current) return;
    saveWorkspace(); current = index;
    $('language').value = files[current].language;
    editor.setOption('mode', modes[files[current].language]);
    editor.setValue(files[current].content); editor.clearHistory();
    renderFiles(); saveWorkspace();
  }
  function addFile() {
    const name = (prompt('File name:', `file${files.length + 1}.py`) || '').trim();
    if (!name) return;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return toast('Invalid file name.', true);
    if (files.some((f) => f.name.toLowerCase() === name.toLowerCase())) return toast('File already exists.', true);
    const language = detectLanguage(name);
    files.push({ name, language, content: templates[language] || '' }); current = files.length - 1;
    $('language').value = language; editor.setOption('mode', modes[language]); editor.setValue(files[current].content);
    renderFiles(); saveWorkspace();
  }
  function deleteFile(i) {
    if (files.length === 1) return toast('Keep at least one file.', true);
    if (!confirm(`Delete ${files[i].name}?`)) return;
    files.splice(i, 1); current = Math.min(current, files.length - 1);
    $('language').value = files[current].language; editor.setOption('mode', modes[files[current].language]); editor.setValue(files[current].content);
    renderFiles(); saveWorkspace();
  }
  function log(text, type = 'info') {
    const line = document.createElement('pre');
    line.className = `m-0 whitespace-pre-wrap ${type === 'error' ? 'text-red-400' : type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`;
    line.textContent = String(text); $('console').appendChild(line); $('console').scrollTop = $('console').scrollHeight;
  }
  function clearConsole() { $('console').innerHTML = '<div class="text-slate-500 italic">Console cleared.</div>'; }
  async function getPyodide() {
    if (pyodide) return pyodide;
    if (pyodidePromise) return pyodidePromise;
    if (typeof window.loadPyodide !== 'function') throw new Error(`Python ${PYODIDE_VERSION} runtime was not loaded.`);
    pyodidePromise = window.loadPyodide({ indexURL: PYODIDE_INDEX }).then((runtime) => { pyodide = runtime; log(`✓ Python ${PYODIDE_VERSION} runtime loaded.`, 'success'); return runtime; }).catch((e) => { pyodidePromise = null; throw new Error(`Python runtime error: ${e.message || e}`); });
    return pyodidePromise;
  }
  async function runPython(code) {
    const py = await getPyodide(); let stdout = '', stderr = '';
    py.setStdout({ batched: (s) => { stdout += s; } }); py.setStderr({ batched: (s) => { stderr += s; } }); py.setStdin({ stdin: () => String($('stdin').value || '') });
    try { await py.runPythonAsync(code); } catch (e) { if (stdout) log(stdout); if (stderr) log(stderr, 'error'); throw e; }
    if (stdout) log(stdout); if (stderr) log(stderr, 'error'); log('✓ Python execution completed.', 'success');
  }
  function runJavaScript(code) {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe'); frame.hidden = true; document.body.appendChild(frame); const token = crypto.randomUUID();
      const done = () => { window.removeEventListener('message', onMessage); frame.remove(); resolve(); };
      const onMessage = (event) => { if (event.source !== frame.contentWindow || event.data?.token !== token) return; if (event.data.type === 'log') log(event.data.value); if (event.data.type === 'error') log(event.data.value, 'error'); if (event.data.type === 'done') done(); };
      window.addEventListener('message', onMessage);
      const safeCode = String(code).replace(/<\\/script/gi, '<\\/script>');
      frame.srcdoc = `<!doctype html><html><body><script>(()=>{const t=${JSON.stringify(token)};const send=(type,value)=>parent.postMessage({token:t,type,value},'*');console.log=(...a)=>send('log',a.join(' '));console.error=(...a)=>send('error',a.join(' '));try{${safeCode}}catch(e){send('error',e.stack||e.message||String(e))}finally{send('done','')}})();<\\/script></body></html>`;
    });
  }
  function b64Decode(s) { try { return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch { return atob(s); } }
  async function runCompiled(language, code) {
    const body = { language_id: language === 'cpp' ? 54 : 62, source_code: btoa(unescape(encodeURIComponent(code))), stdin: btoa(unescape(encodeURIComponent($('stdin').value || ''))) };
    const response = await fetch('https://ce.judge0.com/submissions?base64_encoded=true&wait=true', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    if (!response.ok) throw new Error(`Compiler service returned HTTP ${response.status}.`);
    const result = await response.json(); if (result.stdout) log(b64Decode(result.stdout)); if (result.stderr) log(b64Decode(result.stderr), 'error'); if (result.compile_output) log(b64Decode(result.compile_output), 'error'); if (result.message) log(result.message, 'error'); if (result.status && result.status.id === 3) log('✓ Program completed.', 'success'); else if (result.status) log(`Status: ${result.status.description || 'Execution failed'}`, 'error');
  }
  function runHtml(code) { $('console').classList.add('hidden'); $('preview').classList.remove('hidden'); $('previewTab').classList.remove('hidden'); $('consoleTab').classList.add('hidden'); $('previewFrame').srcdoc = code; }
  async function runCode() {
    saveWorkspace(); clearConsole(); $('preview').classList.add('hidden'); $('console').classList.remove('hidden'); $('runBtn').disabled = true; const file = files[current]; log(`▶ Running ${file.name}...`);
    try { if (file.language === 'python') await runPython(file.content); else if (file.language === 'javascript') await runJavaScript(file.content); else if (file.language === 'html') runHtml(file.content); else await runCompiled(file.language, file.content); }
    catch (e) { log(e?.stack || e?.message || String(e), 'error'); } finally { $('runBtn').disabled = false; saveWorkspace(); }
  }
  function exportCurrent() { saveWorkspace(); const f = files[current]; download(f.name, f.content, 'text/plain'); toast('File exported.'); }
  function exportWorkspace() { saveWorkspace(); download('codeyau-project.json', JSON.stringify({version:1,files}, null, 2), 'application/json'); toast('Project exported.'); }
  function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], {type})); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); }
  function importWorkspace(file) { const reader = new FileReader(); reader.onload = () => { try { const p = JSON.parse(reader.result); if (!Array.isArray(p.files) || !p.files.length) throw new Error('Invalid project file.'); files = p.files.map((f) => ({name:String(f.name||'file.txt'),language:modes[f.language]?f.language:detectLanguage(f.name||''),content:String(f.content||'')})); current=0; $('language').value=files[0].language; editor.setOption('mode',modes[files[0].language]); editor.setValue(files[0].content); renderFiles(); saveWorkspace(); toast('Project imported.'); } catch(e) { toast(e.message, true); } }; reader.readAsText(file); }
  function share() { saveWorkspace(); const data=btoa(unescape(encodeURIComponent(JSON.stringify(files[current])))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); const url=`${location.origin}${location.pathname}#share=${data}`; history.replaceState(null,'',`#share=${data}`); if(navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(()=>toast('Share link copied.')).catch(()=>prompt('Copy link:',url)); else prompt('Copy link:',url); }
  function loadShare() { if(!location.hash.startsWith('#share=')) return; try { const raw=location.hash.slice(7).replace(/-/g,'+').replace(/_/g,'/'); const padded=raw+'='.repeat((4-raw.length%4)%4); const f=JSON.parse(decodeURIComponent(escape(atob(padded)))); if(!f.content) return; files=[{name:f.name||'shared.txt',language:modes[f.language]?f.language:detectLanguage(f.name||''),content:f.content}]; current=0; $('language').value=files[0].language; editor.setOption('mode',modes[files[0].language]); editor.setValue(files[0].content); renderFiles(); toast('Shared code loaded.'); } catch { toast('Invalid share link.',true); } }
  function theme() { const light=safeGet(STORAGE.theme,'dark')==='light'; $('app').classList.toggle('bg-slate-50',light); $('app').classList.toggle('bg-slate-950',!light); $('themeIcon').className=light?'fa-solid fa-moon':'fa-solid fa-sun'; if(editor) editor.setOption('theme',light?'eclipse':'dracula'); }
  function toggleTheme() { safeSet(STORAGE.theme,safeGet(STORAGE.theme,'dark')==='light'?'dark':'light'); theme(); }
  function getUsers() { try { return JSON.parse(safeGet(STORAGE.users,'{}')); } catch { return {}; } }
  async function hashPassword(password, salt) { const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:120000,hash:'SHA-256'},key,256); return Array.from(new Uint8Array(bits)).map((b)=>b.toString(16).padStart(2,'0')).join(''); }
  function updateAccount(){ $('accountText').textContent=session?(session.name||'Account'):'Sign in'; }
  function openAccount(){ if(session){ if(confirm(`Signed in as ${session.email}. Sign out?`)){session=null;localStorage.removeItem(STORAGE.session);updateAccount();toast('Signed out.');} return; } $('accountModal').classList.remove('hidden'); $('accountModal').classList.add('flex'); setAuthMode('signin'); }
  function closeAccount(){ $('accountModal').classList.add('hidden'); $('accountModal').classList.remove('flex'); }
  function setAuthMode(mode){ authMode=mode; const signup=mode==='signup'; $('authTitle').textContent=signup?'Create account':'Sign in'; $('authName').classList.toggle('hidden',!signup); $('authSubmit').textContent=signup?'Create account':'Sign in'; $('authSwitch').textContent=signup?'Already have an account? Sign in':'Create account'; $('authError').classList.add('hidden'); }
  async function submitAuth(){ try { $('authSubmit').disabled=true; const name=$('authName').value.trim(),email=$('authEmail').value.trim().toLowerCase(),password=$('authPassword').value,users=getUsers(); if(authMode==='signup'){if(!name||!email||password.length<8)throw new Error('Enter a name, valid email and password of at least 8 characters.'); if(users[email])throw new Error('Account already exists.'); const salt=crypto.randomUUID(); users[email]={name,email,salt,hash:await hashPassword(password,salt)}; safeSet(STORAGE.users,JSON.stringify(users)); session={name,email}; } else { const u=users[email]; if(!u)throw new Error('Account not found.'); if((await hashPassword(password,u.salt))!==u.hash)throw new Error('Incorrect password.'); session={name:u.name,email}; } safeSet(STORAGE.session,JSON.stringify(session)); closeAccount(); updateAccount(); toast('Account ready.'); } catch(e){ $('authError').textContent=e.message; $('authError').classList.remove('hidden'); } finally { $('authSubmit').disabled=false; } }
  function openSettings(){ $('geminiKey').value=''; $('geminiKey').disabled=true; $('geminiKey').placeholder='Managed by Cloudflare Secret'; $('geminiModel').value=safeGet(STORAGE.model,'gemini-3.6-flash'); $('settingsModal').classList.remove('hidden'); $('settingsModal').classList.add('flex'); }
  function closeSettings(){ $('settingsModal').classList.add('hidden'); $('settingsModal').classList.remove('flex'); }
  function saveSettings(){ safeSet(STORAGE.model,$('geminiModel').value.trim()||'gemini-3.6-flash'); closeSettings(); toast('Settings saved.'); }
  function addAiMessage(text, role){ const box=document.createElement('div'); box.className=`rounded-xl p-3 text-sm ${role==='user'?'bg-indigo-600/20 text-indigo-100':'bg-slate-800 text-slate-200'}`; box.innerHTML=`<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">${role==='user'?'You':'codeyau AI'}</div><div class="whitespace-pre-wrap"></div>`; box.lastElementChild.textContent=text; $('aiMessages').appendChild(box); $('aiMessages').scrollTop=$('aiMessages').scrollHeight; }
  async function askAI(prompt){ saveWorkspace(); addAiMessage(prompt,'user'); $('aiSend').disabled=true; $('aiSend').textContent='Thinking...'; try { const model=safeGet(STORAGE.model,'gemini-3.6-flash'); const response=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,language:files[current].language,fileName:files[current].name,code:files[current].content,prompt})}); const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data?.error||`AI request failed (${response.status})`); addAiMessage(data?.text||data?.response||'No response from AI.','assistant'); } catch(e){ addAiMessage(`AI error: ${e.message}. If you are still on GitHub Pages, the Cloudflare /api/ai backend must be the active deployment.`,'assistant'); } finally { $('aiSend').disabled=false; $('aiSend').textContent='Ask AI'; } }
  function openAI(){ if(!$('aiMessages').children.length)addAiMessage(`Ready. I can help with your ${files[current].language} code.`,'assistant'); $('aiDrawer').classList.remove('hidden'); }
  function closeAI(){ $('aiDrawer').classList.add('hidden'); }

  function bind() {
    $('menuBtn').onclick=()=>$('sidebar').classList.toggle('sidebar-collapsed');
    $('newFileBtn').onclick=addFile; $('resetBtn').onclick=()=>{if(confirm('Reset the workspace?')){localStorage.removeItem(STORAGE.files);localStorage.removeItem(STORAGE.current);location.reload();}};
    $('importBtn').onclick=()=>$('importInput').click(); $('importInput').onchange=(e)=>{if(e.target.files[0])importWorkspace(e.target.files[0]);e.target.value=''};
    $('exportProjectBtn').onclick=exportWorkspace; $('saveBtn').onclick=()=>{saveWorkspace();toast('Project saved locally.');}; $('exportBtn').onclick=exportCurrent; $('shareBtn').onclick=share; $('runBtn').onclick=runCode; $('clearBtn').onclick=clearConsole;
    $('consoleTab').onclick=()=>{$('console').classList.remove('hidden');$('preview').classList.add('hidden');}; $('previewTab').onclick=()=>{$('preview').classList.remove('hidden');$('console').classList.add('hidden');};
    $('language').onchange=()=>{saveWorkspace();const language=$('language').value,f=files[current],base=f.name.includes('.')?f.name.slice(0,f.name.lastIndexOf('.')):f.name;f.language=language;f.name=`${base}.${extensions[language]}`;if(confirm('Load the starter template for this language?'))f.content=templates[language];editor.setOption('mode',modes[language]);editor.setValue(f.content);renderFiles();saveWorkspace();};
    $('themeBtn').onclick=toggleTheme; $('settingsBtn').onclick=openSettings; $('settingsClose').onclick=closeSettings; $('settingsCancel').onclick=closeSettings; $('settingsSave').onclick=saveSettings;
    $('accountBtn').onclick=openAccount; $('authClose').onclick=closeAccount; $('authSwitch').onclick=()=>setAuthMode(authMode==='signin'?'signup':'signin'); $('authSubmit').onclick=submitAuth;
    $('aiBtn').onclick=openAI; $('aiClose').onclick=closeAI; $('aiCloseBackdrop').onclick=closeAI; $('aiSend').onclick=()=>{const p=$('aiInput').value.trim();if(p){$('aiInput').value='';askAI(p);}};
    document.querySelectorAll('.aiQuick').forEach((button)=>button.onclick=()=>askAI(button.dataset.prompt));
    document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveWorkspace();toast('Project saved locally.');}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runCode();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='j'){e.preventDefault();openAI();}});
    window.addEventListener('beforeunload',saveWorkspace);
  }

  loadWorkspace();
  try { session=JSON.parse(safeGet(STORAGE.session,'null')); } catch { session=null; }
  window.addEventListener('DOMContentLoaded',()=>{
    editor=CodeMirror.fromTextArea($('editor'),{mode:modes[files[current].language],theme:safeGet(STORAGE.theme,'dark')==='light'?'eclipse':'dracula',lineNumbers:true,autoCloseBrackets:true,matchBrackets:true,styleActiveLine:true,indentUnit:4,tabSize:4,viewportMargin:30});
    editor.setValue(files[current].content); editor.on('change',()=>{files[current].content=editor.getValue();updateStatus();clearTimeout(window.__saveTimer);window.__saveTimer=setTimeout(saveWorkspace,400);}); editor.on('cursorActivity',updateStatus);
    $('language').value=files[current].language; renderFiles(); theme(); updateAccount(); bind(); loadShare();
  });
})();
