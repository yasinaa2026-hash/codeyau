(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const templates = {
    python: 'a = 384 + 347\nprint(a)',
    javascript: 'const a = 384 + 347;\nconsole.log(a);',
    cpp: '#include <iostream>\nint main() { std::cout << 384 + 347 << std::endl; return 0; }',
    java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println(384 + 347);\n  }\n}',
    html: '<!doctype html><html><body><h1>Hello, codeyau!</h1></body></html>'
  };
  const modes = { python: 'python', javascript: 'javascript', cpp: 'text/x-c++src', java: 'text/x-java', html: 'htmlmixed' };
  const extensions = { python: 'py', javascript: 'js', cpp: 'cpp', java: 'java', html: 'html' };

  let files = [{ name: 'main.py', language: 'python', content: templates.python }];
  let current = 0;
  let editor = null;
  let pyodide = null;
  let pyodidePromise = null;
  let authMode = 'signin';
  let user = null;

  const storage = {
    files: 'codeyau-files', current: 'codeyau-current', theme: 'codeyau-theme',
    users: 'codeyau-users', session: 'codeyau-session', key: 'codeyau-gemini-key', model: 'codeyau-gemini-model'
  };

  function toast(message, error = false) {
    const el = $('toast');
    $('toastText').textContent = message;
    el.classList.remove('translate-y-20', 'opacity-0');
    el.classList.toggle('text-red-300', error);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.add('translate-y-20', 'opacity-0'), 2400);
  }

  function saveWorkspace() {
    if (editor && files[current]) files[current].content = editor.getValue();
    try {
      localStorage.setItem(storage.files, JSON.stringify(files));
      localStorage.setItem(storage.current, String(current));
    } catch (e) {
      toast('Could not save locally.', true);
    }
  }

  function loadWorkspace() {
    try {
      const saved = JSON.parse(localStorage.getItem(storage.files) || 'null');
      if (Array.isArray(saved) && saved.length) {
        files = saved.filter(f => f && f.name && typeof f.content === 'string').map(f => ({
          name: String(f.name),
          language: modes[f.language] ? f.language : detectLanguage(f.name),
          content: f.content
        }));
      }
      const index = Number(localStorage.getItem(storage.current));
      if (Number.isInteger(index) && index >= 0 && index < files.length) current = index;
    } catch (_) {}
  }

  function detectLanguage(name) {
    const ext = String(name).split('.').pop().toLowerCase();
    if (ext === 'js' || ext === 'mjs') return 'javascript';
    if (['cpp', 'cc', 'cxx', 'c'].includes(ext)) return 'cpp';
    if (ext === 'java') return 'java';
    if (ext === 'html' || ext === 'htm') return 'html';
    return 'python';
  }

  function renderFiles() {
    const list = $('fileList');
    const tabs = $('tabs');
    list.replaceChildren();
    tabs.replaceChildren();
    files.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = `flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer ${index === current ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20' : 'text-slate-400 hover:bg-slate-800'}`;
      const name = document.createElement('span');
      name.className = 'truncate flex-1';
      name.textContent = file.name;
      row.appendChild(name);
      const del = document.createElement('button');
      del.className = 'text-slate-500 hover:text-red-400 text-xs';
      del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      del.title = 'Delete file';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteFile(index); });
      if (files.length === 1) del.classList.add('invisible');
      row.appendChild(del);
      row.addEventListener('click', () => switchFile(index));
      list.appendChild(row);

      const tab = document.createElement('button');
      tab.className = `px-4 h-full text-xs border-t-2 whitespace-nowrap ${index === current ? 'bg-slate-950 text-white border-indigo-500' : 'bg-slate-900 text-slate-400 border-transparent'}`;
      tab.textContent = file.name;
      tab.addEventListener('click', () => switchFile(index));
      tabs.appendChild(tab);
    });
    updateStatus();
  }

  function updateStatus() {
    if (!editor) return;
    const f = files[current];
    const cursor = editor.getCursor();
    const text = editor.getValue();
    $('statusFile').textContent = f.name;
    $('statusLanguage').textContent = ({ python: 'Python 3', javascript: 'JavaScript', cpp: 'C++', java: 'Java', html: 'HTML / CSS / JS' })[f.language];
    $('statusPosition').textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
    $('statusStats').textContent = `${text.split('\n').length} lines · ${text.trim() ? text.trim().split(/\s+/).length : 0} words`;
  }

  function switchFile(index) {
    if (index === current) return;
    saveWorkspace();
    current = index;
    $('language').value = files[current].language;
    editor.setOption('mode', modes[files[current].language]);
    editor.setValue(files[current].content);
    editor.clearHistory();
    renderFiles();
    updatePreviewState();
    saveWorkspace();
  }

  function addFile() {
    const name = (prompt('File name:', `file${files.length + 1}.py`) || '').trim();
    if (!name) return;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return toast('Invalid file name.', true);
    if (files.some(f => f.name.toLowerCase() === name.toLowerCase())) return toast('File already exists.', true);
    const language = detectLanguage(name);
    files.push({ name, language, content: templates[language] || '' });
    current = files.length - 1;
    $('language').value = language;
    editor.setOption('mode', modes[language]);
    editor.setValue(files[current].content);
    renderFiles();
    saveWorkspace();
  }

  function deleteFile(index) {
    if (files.length === 1) return toast('Keep at least one file.', true);
    if (!confirm(`Delete ${files[index].name}?`)) return;
    files.splice(index, 1);
    current = Math.min(current, files.length - 1);
    $('language').value = files[current].language;
    editor.setOption('mode', modes[files[current].language]);
    editor.setValue(files[current].content);
    renderFiles();
    saveWorkspace();
  }

  function log(text, type = 'info') {
    const line = document.createElement('pre');
    line.className = `m-0 whitespace-pre-wrap ${type === 'error' ? 'text-red-400' : type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`;
    line.textContent = String(text);
    $('console').appendChild(line);
    $('console').scrollTop = $('console').scrollHeight;
  }

  function clearConsole() { $('console').innerHTML = '<div class="text-slate-500 italic">Console cleared.</div>'; }

  async function getPyodide() {
    if (pyodide) return pyodide;
    if (pyodidePromise) return pyodidePromise;
    if (typeof window.loadPyodide !== 'function') throw new Error('Python runtime failed to load.');
    pyodidePromise = window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' })
      .then(runtime => { pyodide = runtime; return runtime; })
      .catch(error => { pyodidePromise = null; throw error; });
    return pyodidePromise;
  }

  async function runPython(code) {
    const py = await getPyodide();
    py.setStdout({ batched: text => log(text) });
    py.setStderr({ batched: text => log(text, 'error') });
    py.setStdin({ stdin: () => String($('stdin').value || '') });
    await py.runPythonAsync(code);
    log('✓ Python execution completed.', 'success');
  }

  function runJavaScript(code) {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.hidden = true;
      document.body.appendChild(frame);
      const token = `${Date.now()}-${Math.random()}`;
      const close = () => { window.removeEventListener('message', onMessage); frame.remove(); resolve(); };
      const onMessage = (event) => {
        if (event.source !== frame.contentWindow || event.data?.token !== token) return;
        if (event.data.type === 'log') log(event.data.value);
        if (event.data.type === 'error') log(event.data.value, 'error');
        if (event.data.type === 'done') close();
      };
      window.addEventListener('message', onMessage);
      const scriptClose = '<' + '/script>';
      frame.srcdoc = `<!doctype html><html><body><script>
        (() => {
          const token = ${JSON.stringify(token)};
          const send = (type, value) => parent.postMessage({token, type, value}, '*');
          const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); } catch (_) { return String(value); } };
          console.log = (...args) => send('log', args.map(format).join(' '));
          console.warn = (...args) => send('log', '[warn] ' + args.map(format).join(' '));
          console.error = (...args) => send('error', args.map(format).join(' '));
          window.onerror = message => send('error', String(message));
          try { ${code} } catch (error) { send('error', error.stack || error.message || String(error)); }
          finally { send('done', ''); }
        })();
        ${scriptClose}`;
    });
  }

  function decode64(value) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0))); }
    catch (_) { return atob(value); }
  }

  async function runCompiled(language, code) {
    const languageId = language === 'cpp' ? 54 : 62;
    const body = {
      language_id: languageId,
      source_code: btoa(unescape(encodeURIComponent(code))),
      stdin: btoa(unescape(encodeURIComponent($('stdin').value || '')))
    };
    const response = await fetch('https://ce.judge0.com/submissions?base64_encoded=true&wait=true', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Compiler service returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.stdout) log(decode64(result.stdout));
    if (result.stderr) log(decode64(result.stderr), 'error');
    if (result.compile_output) log(decode64(result.compile_output), 'error');
    if (result.message) log(result.message, 'error');
    if (result.status && result.status.id !== 3) log(`Status: ${result.status.description || 'Execution failed'}`, 'error');
    if (result.status && result.status.id === 3) log('✓ Program completed.', 'success');
  }

  function runHtml(code) {
    $('console').classList.add('hidden');
    $('preview').classList.remove('hidden');
    $('previewTab').classList.remove('hidden');
    $('consoleTab').classList.add('hidden');
    $('previewFrame').srcdoc = code;
  }

  function updatePreviewState() {
    if (files[current].language !== 'html') {
      $('preview').classList.add('hidden');
      $('console').classList.remove('hidden');
      $('previewTab').classList.add('hidden');
      $('consoleTab').classList.remove('hidden');
    }
  }

  async function runCode() {
    saveWorkspace();
    clearConsole();
    $('preview').classList.add('hidden');
    $('console').classList.remove('hidden');
    $('runBtn').disabled = true;
    const file = files[current];
    log(`▶ Running ${file.name}...`);
    try {
      if (file.language === 'python') await runPython(file.content);
      else if (file.language === 'javascript') await runJavaScript(file.content);
      else if (file.language === 'html') runHtml(file.content);
      else await runCompiled(file.language, file.content);
    } catch (error) {
      log(error?.stack || error?.message || String(error), 'error');
    } finally {
      $('runBtn').disabled = false;
      saveWorkspace();
    }
  }

  function blobDownload(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCurrent() { saveWorkspace(); blobDownload(files[current].name, files[current].content, 'text/plain'); toast('File exported.'); }
  function exportProject() { saveWorkspace(); blobDownload('codeyau-project.json', JSON.stringify({version: 1, files}, null, 2), 'application/json'); toast('Project exported.'); }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result);
        if (!Array.isArray(project.files) || !project.files.length) throw new Error('Invalid project file.');
        files = project.files.map(item => ({name: String(item.name || 'file.txt'), language: modes[item.language] ? item.language : detectLanguage(item.name || ''), content: String(item.content || '')}));
        current = 0;
        $('language').value = files[0].language;
        editor.setOption('mode', modes[files[0].language]);
        editor.setValue(files[0].content);
        renderFiles(); saveWorkspace(); toast('Project imported.');
      } catch (error) { toast(error.message, true); }
    };
    reader.readAsText(file);
  }

  function share() {
    saveWorkspace();
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(files[current])))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `${location.origin}${location.pathname}#share=${data}`;
    history.replaceState(null, '', `#share=${data}`);
    const copied = navigator.clipboard && navigator.clipboard.writeText(url);
    if (copied) copied.then(() => toast('Share link copied.')).catch(() => prompt('Copy link:', url)); else prompt('Copy link:', url);
  }

  function loadShare() {
    if (!location.hash.startsWith('#share=')) return;
    try {
      const raw = location.hash.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
      const file = JSON.parse(decodeURIComponent(escape(atob(padded))));
      if (!file.content) return;
      files = [{name: file.name || 'shared.txt', language: modes[file.language] ? file.language : detectLanguage(file.name || ''), content: file.content}];
      current = 0;
      $('language').value = files[0].language;
      editor.setOption('mode', modes[files[0].language]);
      editor.setValue(files[0].content);
      renderFiles();
      toast('Shared code loaded.');
    } catch (_) { toast('Invalid share link.', true); }
  }

  async function hashPassword(password, salt) {
    const data = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', data.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: data.encode(salt), iterations: 100000, hash: 'SHA-256'}, key, 256);
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function users() { try { return JSON.parse(localStorage.getItem(storage.users) || '{}'); } catch (_) { return {}; } }
  async function register() {
    const name = $('authName').value.trim(); const email = $('authEmail').value.trim().toLowerCase(); const password = $('authPassword').value;
    if (!name || !email || password.length < 8) throw new Error('Enter a name, email and a password of at least 8 characters.');
    const all = users(); if (all[email]) throw new Error('An account with this email already exists.');
    all[email] = {name, salt: email, hash: await hashPassword(password, email)};
    localStorage.setItem(storage.users, JSON.stringify(all));
    user = {name, email}; localStorage.setItem(storage.session, JSON.stringify(user)); closeAuth(); updateAccount(); toast('Account created.');
  }
  async function signIn() {
    const email = $('authEmail').value.trim().toLowerCase(); const password = $('authPassword').value; const all = users(); const found = all[email];
    if (!found) throw new Error('Account not found.');
    if ((await hashPassword(password, email)) !== found.hash) throw new Error('Incorrect password.');
    user = {name: found.name, email}; localStorage.setItem(storage.session, JSON.stringify(user)); closeAuth(); updateAccount(); toast('Signed in.');
  }
  function updateAccount() { $('accountText').textContent = user ? user.name : 'Sign in'; }
  function openAuth() { if (user) { if (confirm(`Sign out ${user.email}?`)) {user = null; localStorage.removeItem(storage.session); updateAccount(); toast('Signed out.');} return; } $('accountModal').classList.remove('hidden'); $('accountModal').classList.add('flex'); setAuthMode('signin'); }
  function closeAuth() {$('accountModal').classList.add('hidden'); $('accountModal').classList.remove('flex');}
  function setAuthMode(mode) { authMode = mode; const signup = mode === 'signup'; $('authTitle').textContent = signup ? 'Create account' : 'Sign in'; $('authName').classList.toggle('hidden', !signup); $('authSubmit').textContent = signup ? 'Create account' : 'Sign in'; $('authSwitch').textContent = signup ? 'Already have an account? Sign in' : 'Create a new account'; $('authError').classList.add('hidden'); }
  async function submitAuth() { try { $('authSubmit').disabled = true; if (authMode === 'signup') await register(); else await signIn(); } catch (error) { $('authError').textContent = error.message; $('authError').classList.remove('hidden'); } finally {$('authSubmit').disabled = false;} }

  function openSettings() { $('geminiKey').value = localStorage.getItem(storage.key) || ''; $('geminiModel').value = localStorage.getItem(storage.model) || 'gemini-2.0-flash'; $('settingsModal').classList.remove('hidden'); $('settingsModal').classList.add('flex'); }
  function closeSettings() {$('settingsModal').classList.add('hidden'); $('settingsModal').classList.remove('flex');}
  function saveSettings() { const key = $('geminiKey').value.trim(); const model = $('geminiModel').value.trim() || 'gemini-2.0-flash'; if (key) localStorage.setItem(storage.key, key); else localStorage.removeItem(storage.key); localStorage.setItem(storage.model, model); closeSettings(); toast('Settings saved.'); }

  function escapeHtml(text) { return String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function addAiMessage(text, role) { const box = document.createElement('div'); box.className = `rounded-xl p-3 text-sm ${role === 'user' ? 'bg-indigo-600/20' : 'bg-slate-800'}`; box.innerHTML = `<div class="text-[10px] uppercase text-slate-500 mb-1">${role === 'user' ? 'You' : 'codeyau AI'}</div><div class="whitespace-pre-wrap">${escapeHtml(text)}</div>`; $('aiMessages').appendChild(box); $('aiMessages').scrollTop = $('aiMessages').scrollHeight; }
  function openAI() { if (!$('aiMessages').children.length) addAiMessage('Ask me to explain, debug, improve or test the current file.', 'assistant'); $('aiDrawer').classList.remove('hidden'); }
  function closeAI() { $('aiDrawer').classList.add('hidden'); }
  async function askAI(prompt) {
    const key = localStorage.getItem(storage.key);
    if (!key) { openSettings(); addAiMessage('Add a Gemini API key in Settings to enable the AI assistant.', 'assistant'); return; }
    saveWorkspace(); addAiMessage(prompt, 'user'); $('aiSend').disabled = true; $('aiSend').textContent = 'Thinking...';
    try {
      const model = localStorage.getItem(storage.model) || 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const promptText = `You are codeyau AI. Be concise and practical. Language: ${files[current].language}. File: ${files[current].name}. Code:\n${files[current].content}\n\nUser request: ${prompt}`;
      const response = await fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({contents:[{parts:[{text:promptText}]}]})});
      const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message || `AI request failed (${response.status})`);
      const answer = data?.candidates?.[0]?.content?.parts?.map(p=>p.text || '').join('') || 'No response.'; addAiMessage(answer, 'assistant');
    } catch (error) { addAiMessage(`AI error: ${error.message}`, 'assistant'); }
    finally { $('aiSend').disabled = false; $('aiSend').textContent = 'Ask AI'; }
  }

  $('menuBtn').onclick = () => $('sidebar').classList.toggle('sidebar-collapsed');
  $('newFileBtn').onclick = addFile;
  $('saveBtn').onclick = () => {saveWorkspace(); toast('Project saved locally.');};
  $('exportBtn').onclick = exportCurrent;
  $('exportProjectBtn').onclick = exportProject;
  $('shareBtn').onclick = share;
  $('resetBtn').onclick = () => {if (confirm('Reset the workspace?')) {localStorage.removeItem(storage.files); localStorage.removeItem(storage.current); location.reload();}};
  $('importBtn').onclick = () => $('importInput').click();
  $('importInput').onchange = event => {if (event.target.files[0]) importProject(event.target.files[0]); event.target.value='';};
  $('runBtn').onclick = runCode;
  $('clearBtn').onclick = clearConsole;
  $('consoleTab').onclick = () => {$('console').classList.remove('hidden'); $('preview').classList.add('hidden');};
  $('previewTab').onclick = () => {$('preview').classList.remove('hidden'); $('console').classList.add('hidden');};
  $('language').onchange = () => {
    const language = $('language').value; saveWorkspace(); const file = files[current]; const base = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
    file.language = language; file.name = `${base}.${extensions[language]}`;
    if (confirm('Load the starter template for this language?')) file.content = templates[language];
    editor.setOption('mode', modes[language]); editor.setValue(file.content); renderFiles(); saveWorkspace();
  };
  $('themeBtn').onclick = () => {const next = localStorage.getItem(storage.theme) === 'light' ? 'dark' : 'light'; localStorage.setItem(storage.theme, next); applyTheme();};
  $('settingsBtn').onclick = openSettings; $('settingsClose').onclick = closeSettings; $('settingsCancel').onclick = closeSettings; $('settingsSave').onclick = saveSettings;
  $('accountBtn').onclick = openAuth; $('authClose').onclick = closeAuth; $('authSwitch').onclick = () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); $('authSubmit').onclick = submitAuth;
  $('aiBtn').onclick = openAI; $('aiClose').onclick = closeAI; $('aiCloseBackdrop').onclick = closeAI;
  $('aiSend').onclick = () => {const value = $('aiInput').value.trim(); if (value) {$('aiInput').value=''; askAI(value);}};
  $('aiInput').addEventListener('keydown', e => {if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {$('aiSend').click();}});
  document.querySelectorAll('.aiQuick').forEach(button => button.onclick = () => askAI(button.dataset.prompt));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {e.preventDefault(); saveWorkspace(); toast('Project saved locally.');}
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {e.preventDefault(); runCode();}
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {e.preventDefault(); openAI();}
  });
  window.addEventListener('beforeunload', saveWorkspace);

  loadWorkspace();
  try { user = JSON.parse(localStorage.getItem(storage.session) || 'null'); } catch (_) { user = null; }
  updateAccount();
  const theme = localStorage.getItem(storage.theme) || 'dark';
  document.documentElement.classList.toggle('light', theme === 'light');

  window.addEventListener('DOMContentLoaded', () => {
    editor = CodeMirror.fromTextArea($('editor'), {mode:modes[files[current].language], theme:theme === 'light' ? 'eclipse' : 'dracula', lineNumbers:true, autoCloseBrackets:true, matchBrackets:true, styleActiveLine:true, indentUnit:4, tabSize:4, indentWithTabs:false, viewportMargin:30});
    editor.setValue(files[current].content);
    editor.on('change', () => {files[current].content = editor.getValue(); updateStatus(); clearTimeout(window.__saveTimer); window.__saveTimer = setTimeout(saveWorkspace, 450);});
    editor.on('cursorActivity', updateStatus);
    $('language').value = files[current].language;
    renderFiles();
    updateStatus();
    loadShare();
  });
})();
