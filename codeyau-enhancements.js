(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'codeyau-theme';
  const getTheme = () => { try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; } };

  function applyLightMode() {
    const light = getTheme() === 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    document.body.classList.toggle('light-mode', light);
    const app = $('app');
    if (app) {
      app.classList.toggle('bg-slate-50', light);
      app.classList.toggle('text-slate-900', light);
      app.classList.toggle('bg-slate-950', !light);
      app.classList.toggle('text-slate-100', !light);
    }
    const icon = $('themeIcon');
    if (icon) icon.className = light ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  }

  function toast(message, error = false) {
    const box = $('toast');
    const text = $('toastText');
    if (!box || !text) return;
    text.textContent = message;
    box.classList.remove('translate-y-20', 'opacity-0');
    box.classList.toggle('text-red-300', !!error);
    box.classList.toggle('border-red-500/40', !!error);
    clearTimeout(window.__codeyauEnhancedToast);
    window.__codeyauEnhancedToast = setTimeout(() => box.classList.add('translate-y-20', 'opacity-0'), 2500);
  }

  function addCommandBar() {
    if ($('commandBar')) return;
    const bar = document.createElement('div');
    bar.id = 'commandBar';
    bar.className = 'hidden fixed inset-0 z-[70] items-start justify-center pt-[14vh] px-4';
    bar.innerHTML = '<div class="command-panel w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden"><div class="p-3 border-b"><input id="commandInput" class="w-full bg-transparent outline-none text-sm" placeholder="Search files or commands…" autocomplete="off"></div><div id="commandResults" class="max-h-72 overflow-auto p-2"></div><div class="px-3 py-2 border-t text-[11px] opacity-60">Enter to run · Esc to close · Ctrl+P to open</div></div>';
    document.body.appendChild(bar);
    const input = $('commandInput');
    const results = $('commandResults');
    const close = () => { bar.classList.add('hidden'); bar.classList.remove('flex'); };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const items = [];
      document.querySelectorAll('#fileList > div').forEach((row, i) => {
        const name = row.querySelector('span')?.textContent || `File ${i + 1}`;
        if (!q || name.toLowerCase().includes(q)) items.push({ label: `Open ${name}`, run: () => row.click() });
      });
      items.push({ label: 'New file', run: () => $('newFileBtn')?.click() });
      items.push({ label: 'Save workspace', run: () => $('saveBtn')?.click() });
      items.push({ label: 'Run code', run: () => $('runBtn')?.click() });
      items.push({ label: 'Toggle theme', run: () => $('themeBtn')?.click() });
      results.replaceChildren(...items.slice(0, 12).map((item, i) => {
        const b = document.createElement('button');
        b.className = 'command-item w-full text-left px-3 py-2.5 rounded-lg text-sm';
        b.textContent = item.label;
        b.onclick = () => { item.run(); close(); };
        if (i === 0) b.dataset.selected = 'true';
        return b;
      }));
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') results.querySelector('[data-selected="true"]')?.click();
    });
    bar.addEventListener('click', (e) => { if (e.target === bar) close(); });
    window.__openCommandBar = () => { bar.classList.remove('hidden'); bar.classList.add('flex'); input.value = ''; render(); setTimeout(() => input.focus(), 0); };
  }

  function addEditorFeatures() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); window.__openCommandBar?.(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('saveBtn')?.click(); toast('Workspace saved.'); return; }
      if (e.key === 'F2') {
        const active = document.querySelector('#fileList > div.bg-indigo-600\\/20');
        const name = active?.querySelector('span');
        if (!name) return;
        const old = name.textContent;
        const next = prompt('Rename file:', old)?.trim();
        if (!next || next === old || !/^[A-Za-z0-9._-]+$/.test(next)) return;
        const rows = [...document.querySelectorAll('#fileList > div')];
        const index = rows.indexOf(active);
        const files = window.__codeyauFiles;
        if (Array.isArray(files) && files[index]) { files[index].name = next; name.textContent = next; $('tabs')?.children[index] && ($('tabs').children[index].textContent = next); $('statusFile').textContent = next; localStorage.setItem('codeyau-files', JSON.stringify(files)); toast('File renamed.'); }
      }
    });
  }

  function exposeState() {
    const sync = () => {
      try { window.__codeyauFiles = JSON.parse(localStorage.getItem('codeyau-files') || '[]'); } catch { window.__codeyauFiles = []; }
    };
    sync();
    window.addEventListener('storage', sync);
  }

  function addResponsivePolish() {
    const style = document.createElement('style');
    style.textContent = `
      :root{color-scheme:dark}
      :root[data-theme="light"]{color-scheme:light}
      .command-panel{background:#0f172a;border-color:#334155;color:#e2e8f0}
      .command-panel input{color:#f8fafc}
      .command-item:hover,.command-item[data-selected="true"]{background:rgba(99,102,241,.18);color:#fff}
      .light-mode .bg-slate-950{background-color:#f8fafc!important}.light-mode .bg-slate-900{background-color:#fff!important}.light-mode .bg-slate-800{background-color:#f1f5f9!important}.light-mode .border-slate-800,.light-mode .border-slate-700{border-color:#e2e8f0!important}.light-mode .text-slate-100,.light-mode .text-white{color:#0f172a!important}.light-mode .text-slate-200{color:#1e293b!important}.light-mode .text-slate-300{color:#334155!important}.light-mode .text-slate-400,.light-mode .text-slate-500{color:#64748b!important}
      @media(max-width:900px){#sidebar{position:absolute;left:0;top:64px;bottom:0;z-index:35;box-shadow:18px 0 40px rgba(0,0,0,.25)}#sidebar.sidebar-collapsed{transform:translateX(-100%);width:16rem!important}header select{max-width:105px}.CodeMirror{font-size:13px}}
      @media(max-width:640px){header{gap:4px!important}header .font-bold.text-xl{display:none}#accountBtn span{display:none}.aiQuick{min-height:34px}.command-panel{margin:0 8px}}
      button,a,select,input,textarea{transition:background-color .15s,border-color .15s,color .15s,transform .15s,opacity .15s}button:active{transform:translateY(1px)}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
    `;
    document.head.appendChild(style);
  }

  function init() {
    addResponsivePolish();
    exposeState();
    addCommandBar();
    addEditorFeatures();
    applyLightMode();
    window.addEventListener('storage', (e) => { if (e.key === KEY) applyLightMode(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
