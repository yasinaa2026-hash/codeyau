(() => {
'use strict';

const $ = (id) => document.getElementById(id);
const PYODIDE_VERSION = '314.0.3';
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const STORAGE = { files:'codeyau-files', current:'codeyau-current', projects:'codeyau-projects', theme:'codeyau-theme', users:'codeyau-users', session:'codeyau-session', model:'codeyau-gemini-model' };
const modes = { python:'python', javascript:'javascript', cpp:'text/x-c++src', java:'text/x-java', html:'htmlmixed' };
const extensions = { python:'py', javascript:'js', cpp:'cpp', java:'java', html:'html' };
const templates = {
  python:'a = 384 + 347\nprint(a)',
  javascript:'const a = 384 + 347;\nconsole.log(a);',
  cpp:'#include <iostream>\nint main() { std::cout << 384 + 347 << std::endl; return 0; }',
  java:'public class Main {\n  public static void main(String[] args) {\n    System.out.println(384 + 347);\n  }\n}',
  html:'<!doctype html>\n<html><body><h1>Hello, codeyau!</h1></body></html>'
};

let files = [{name:'main.py',language:'python',content:templates.python}];
let current = 0, editor = null, pyodide = null, pyodidePromise = null, session = null, authMode = 'signin';

function storageGet(key, fallback=null){try{const v=localStorage.getItem(key);return v===null?fallback:v;}catch{return fallback;}}
function storageSet(key,value){try{localStorage.setItem(key,value);}catch{}}
function toast(message,error=false){const box=$('toast');if(!box)return;$('toastText').textContent=message;box.classList.remove('translate-y-20','opacity-0');box.classList.toggle('text-red-300',error);clearTimeout(window.__toast);window.__toast=setTimeout(()=>box.classList.add('translate-y-20','opacity-0'),2400);}
function detectLanguage(name){const ext=String(name).split('.').pop().toLowerCase();if(['js','mjs'].includes(ext))return'javascript';if(['cpp','cc','cxx','c'].includes(ext))return'cpp';if(ext==='java')return'java';if(['html','htm'].includes(ext))return'html';return'python';}
function saveWorkspace(){if(editor&&files[current])files[current].content=editor.getValue();storageSet(STORAGE.files,JSON.stringify(files));storageSet(STORAGE.current,String(current));}
function loadWorkspace(){try{const saved=JSON.parse(storageGet(STORAGE.files,'null'));if(Array.isArray(saved)&&saved.length)files=saved.map(f=>({name:String(f.name||'main.py'),language:modes[f.language]?f.language:detectLanguage(f.name||''),content:String(f.content||'')}));const index=Number(storageGet(STORAGE.current,'0'));if(Number.isInteger(index)&&index>=0&&index<files.length)current=index;}catch{}}
function updateStatus(){if(!editor||!files[current])return;const c=editor.getCursor(),text=editor.getValue();$('statusFile').textContent=files[current].name;$('statusLanguage').textContent=({python:'Python 3',javascript:'JavaScript',cpp:'C++',java:'Java',html:'HTML / CSS / JS'})[files[current].language];$('statusPosition').textContent=`Ln ${c.line+1}, Col ${c.ch+1}`;$('statusStats').textContent=`${text.split('\n').length} lines · ${text.trim()?text.trim().split(/\s+/).length:0} words`;}
function renderFiles(){const list=$('fileList'),tabs=$('tabs');if(!list||!tabs)return;list.replaceChildren();tabs.replaceChildren();files.forEach((file,index)=>{const row=document.createElement('div');row.className=`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer ${index===current?'bg-indigo-600/20 text-indigo-300':'text-slate-400 hover:bg-slate-800'}`;const name=document.createElement('span');name.textContent=file.name;name.className='truncate flex-1';const del=document.createElement('button');del.innerHTML='<i class="fa-solid fa-xmark"></i>';del.className='text-slate-500 hover:text-red-400';if(files.length===1)del.classList.add('invisible');del.onclick=(e)=>{e.stopPropagation();deleteFile(index)};row.append(name,del);row.onclick=()=>switchFile(index);list.appendChild(row);const tab=document.createElement('button');tab.textContent=file.name;tab.className=`px-4 h-full text-xs border-t-2 whitespace-nowrap ${index===current?'bg-slate-950 text-white border-indigo-500':'bg-slate-900 text-slate-400 border-transparent'}`;tab.onclick=()=>switchFile(index);tabs.appendChild(tab);});updateStatus();}
function switchFile(index){if(index===current||!files[index])return;saveWorkspace();current=index;$('language').value=files[current].language;editor.setOption('mode',modes[files[current].language]);editor.setValue(files[current].content);editor.clearHistory();renderFiles();saveWorkspace();}
function addFile(){const name=(prompt('File name:',`file${files.length+1}.py`)||'').trim();if(!name)return;if(!/^[A-Za-z0-9._-]+$/.test(name))return toast('Invalid file name.',true);if(files.some(f=>f.name.toLowerCase()===name.toLowerCase()))return toast('File already exists.',true);const language=detectLanguage(name);files.push({name,language,content:templates[language]||''});current=files.length-1;$('language').value=language;editor.setOption('mode',modes[language]);editor.setValue(files[current].content);renderFiles();saveWorkspace();}
function deleteFile(index){if(files.length===1)return toast('Keep at least one file.',true);if(!confirm(`Delete ${files[index].name}?`))return;files.splice(index,1);current=Math.min(current,files.length-1);$('language').value=files[current].language;editor.setOption('mode',modes[files[current].language]);editor.setValue(files[current].content);renderFiles();saveWorkspace();}
function log(text,type='info'){const line=document.createElement('pre');line.className=`m-0 whitespace-pre-wrap ${type==='error'?'text-red-400':type==='success'?'text-emerald-400':'text-slate-300'}`;line.textContent=String(text);$('console').appendChild(line);$('console').scrollTop=$('console').scrollHeight;}
function clearConsole(){$('console').innerHTML='<div class="text-slate-500 italic">Console cleared.</div>';}
async function getPyodide(){if(pyodide)return pyodide;if(pyodidePromise)return pyodidePromise;if(typeof window.loadPyodide!=='function')throw new Error(`Python ${PYODIDE_VERSION} runtime did not load.`);pyodidePromise=window.loadPyodide({indexURL:PYODIDE_INDEX}).then(runtime=>{pyodide=runtime;log(`✓ Python ${PYODIDE_VERSION} runtime loaded.`,'success');return runtime;}).catch(error=>{pyodidePromise=null;throw new Error(`Python runtime error: ${error?.message||String(error)}`)});return pyodidePromise;}
async function runPython(code){const runtime=await getPyodide();let stdout='',stderr='';runtime.setStdout({batched:t=>{stdout+=t}});runtime.setStderr({batched:t=>{stderr+=t}});runtime.setStdin({stdin:()=>String($('stdin').value||'')});try{await runtime.runPythonAsync(code,{filename:files[current].name});}catch(error){if(stdout)log(stdout);if(stderr)log(stderr,'error');throw error;}if(stdout)log(stdout);if(stderr)log(stderr,'error');log('✓ Python execution completed.','success');}
function runJavaScript(code){return new Promise(resolve=>{const frame=document.createElement('iframe');frame.hidden=true;document.body.appendChild(frame);const token=`${Date.now()}-${Math.random()}`;const cleanup=()=>{window.removeEventListener('message',onMessage);frame.remove();resolve();};const onMessage=event=>{if(event.source!==frame.contentWindow||event.data?.token!==token)return;if(event.data.type==='log')log(event.data.value);if(event.data.type==='error')log(event.data.value,'error');if(event.data.type==='done')cleanup();};window.addEventListener('message',onMessage);const safeCode=String(code).replace(/<\/script/gi,'<\\/script');frame.srcdoc=`<!doctype html><html><body><script>(()=>{const token=${JSON.stringify(token)};const send=(type,value)=>parent.postMessage({token,type,value},'*');console.log=(...a)=>send('log',a.join(' '));console.error=(...a)=>send('error',a.join(' '));try{${safeCode}}catch(e){send('error',e.stack||e.message||String(e))}finally{send('done','')}})();<\/script></body></html>`;});}
function decode64(value){try{return decodeURIComponent(escape(atob(value)))}catch{return atob(value)}}
async function runCompiled(language,code){const body={language_id:language==='cpp'?54:62,source_code:btoa(unescape(encodeURIComponent(code))),stdin:btoa(unescape(encodeURIComponent($('stdin').value||'')))};const response=await fetch('https://ce.judge0.com/submissions?base64_encoded=true&wait=true',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`Compiler service returned HTTP ${response.status}.`);const result=await response.json();if(result.stdout)log(decode64(result.stdout));if(result.stderr)log(decode64(result.stderr),'error');if(result.compile_output)log(decode64(result.compile_output),'error');if(result.message)log(result.message,'error');if(result.status?.id===3)log('✓ Program completed.','success');else if(result.status)log(`Status: ${result.status.description||'Execution failed'}`,'error');}
function showPreview(code){$('console').classList.add('hidden');$('preview').classList.remove('hidden');$('previewTab').classList.remove('hidden');$('consoleTab').classList.add('hidden');$('previewFrame').srcdoc=code;}
async function runCode(){saveWorkspace();clearConsole();$('preview').classList.add('hidden');$('console').classList.remove('hidden');$('runBtn').disabled=true;const file=files[current];log(`▶ Running ${file.name}...`);try{if(file.language==='python')await runPython(file.content);else if(file.language==='javascript')await runJavaScript(file.content);else if(file.language==='html')showPreview(file.content);else await runCompiled(file.language,file.content);}catch(error){log(error?.stack||error?.message||String(error),'error')}finally{$('runBtn').disabled=false;saveWorkspace();}}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),700);}
function exportCurrent(){saveWorkspace();download(files[current].name,files[current].content,'text/plain');toast('File exported.')}
function exportWorkspace(){saveWorkspace();download('codeyau-project.json',JSON.stringify({version:1,files},null,2),'application/json');toast('Project exported.')}
function importWorkspace(file){const reader=new FileReader();reader.onload=()=>{try{const project=JSON.parse(reader.result);if(!Array.isArray(project.files)||!project.files.length)throw new Error('Invalid project file.');files=project.files.map(f=>({name:String(f.name||'file.txt'),language:modes[f.language]?f.language:detectLanguage(f.name||''),content:String(f.content||'')}));current=0;$('language').value=files[0].language;editor.setOption('mode',modes[files[0].language]);editor.setValue(files[0].content);renderFiles();saveWorkspace();toast('Project imported.')}catch(error){toast(error.message,true)}};reader.readAsText(file);}
function share(){saveWorkspace();const data=btoa(unescape(encodeURIComponent(JSON.stringify(files[current])))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=`${location.origin}${location.pathname}#share=${data}`;history.replaceState(null,'',`#share=${data}`);if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>toast('Share link copied.')).catch(()=>prompt('Copy link:',url));else prompt('Copy link:',url);}
function applyTheme(){const light=storageGet(STORAGE.theme,'dark')==='light';$('app').classList.toggle('bg-slate-50',light);$('app').classList.toggle('bg-slate-950',!light);$('themeIcon').className=light?'fa-solid fa-moon':'fa-solid fa-sun';if(editor)editor.setOption('theme',light?'eclipse':'dracula');}
function toggleTheme(){storageSet(STORAGE.theme,storageGet(STORAGE.theme,'dark')==='light'?'dark':'light');applyTheme();}
function openAI(){if(!$('aiMessages').children.length){const msg=document.createElement('div');msg.className='rounded-xl p-3 bg-slate-800 text-sm';msg.textContent='Ready. Ask me about your code.';$('aiMessages').appendChild(msg);}$('aiDrawer').classList.remove('hidden');}
function closeAI(){$('aiDrawer').classList.add('hidden');}
function addAIMessage(text,role){const box=document.createElement('div');box.className=`rounded-xl p-3 text-sm ${role==='user'?'bg-indigo-600/20':'bg-slate-800'}`;box.textContent=text;$('aiMessages').appendChild(box);$('aiMessages').scrollTop=$('aiMessages').scrollHeight;}
async function askAI(prompt){addAIMessage(prompt,'user');$('aiSend').disabled=true;try{const response=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:storageGet(STORAGE.model,'gemini-3.6-flash'),contents:[{role:'user',parts:[{text:`You are the coding assistant for codeyau. Language: ${files[current].language}. File: ${files[current].name}. Code:\n---\n${files[current].content}\n---\nRequest: ${prompt}` }]}],generationConfig:{temperature:0.2,maxOutputTokens:1800}})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||data?.error||`AI service HTTP ${response.status}`);const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'No response from AI.';addAIMessage(text,'assistant');}catch(error){addAIMessage(`AI error: ${error.message}`,'assistant')}finally{$('aiSend').disabled=false;}}
function openSettings(){$('geminiKey').value='';$('geminiKey').placeholder='Managed securely by Cloudflare';$('geminiKey').disabled=true;$('geminiModel').value=storageGet(STORAGE.model,'gemini-3.6-flash');$('settingsModal').classList.remove('hidden');$('settingsModal').classList.add('flex');}
function closeSettings(){$('settingsModal').classList.add('hidden');$('settingsModal').classList.remove('flex');}
function saveSettings(){storageSet(STORAGE.model,$('geminiModel').value.trim()||'gemini-3.6-flash');closeSettings();toast('Settings saved.')}
function updateAccount(){$('accountText').textContent=session?(session.name||'Account'):'Sign in';}
function closeAccount(){$('accountModal').classList.add('hidden');$('accountModal').classList.remove('flex');}
function getUsers(){try{return JSON.parse(storageGet(STORAGE.users,'{}'))}catch{return{}}}
function setAuthMode(mode){authMode=mode;const signup=mode==='signup';$('authTitle').textContent=signup?'Create account':'Sign in';$('authName').classList.toggle('hidden',!signup);$('authSubmit').textContent=signup?'Create account':'Sign in';$('authSwitch').textContent=signup?'Already have an account? Sign in':'Create account';$('authError').classList.add('hidden');}
async function hashPassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:120000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');}
function openAccount(){if(session){if(confirm(`Signed in as ${session.email}. Sign out?`)){session=null;localStorage.removeItem(STORAGE.session);updateAccount();toast('Signed out.')}return;}$('accountModal').classList.remove('hidden');$('accountModal').classList.add('flex');setAuthMode('signin');}
async function submitAuth(){try{const name=$('authName').value.trim(),email=$('authEmail').value.trim().toLowerCase(),password=$('authPassword').value,users=getUsers();if(!email||password.length<8)throw new Error('Enter an email and a password of at least 8 characters.');if(authMode==='signup'){if(!name)throw new Error('Enter your name.');if(users[email])throw new Error('Account already exists.');const salt=crypto.randomUUID();users[email]={name,email,salt,hash:await hashPassword(password,salt)};storageSet(STORAGE.users,JSON.stringify(users));session={name,email};}else{const user=users[email];if(!user)throw new Error('Account not found.');if(await hashPassword(password,user.salt)!==user.hash)throw new Error('Incorrect password.');session={name:user.name,email};}storageSet(STORAGE.session,JSON.stringify(session));closeAccount();updateAccount();toast('Signed in.');}catch(error){$('authError').textContent=error.message;$('authError').classList.remove('hidden');}}
function loadShare(){if(!location.hash.startsWith('#share='))return;try{const raw=location.hash.slice(7).replace(/-/g,'+').replace(/_/g,'/');const padded=raw+'='.repeat((4-raw.length%4)%4);const file=JSON.parse(decodeURIComponent(escape(atob(padded))));if(!file.content)return;files=[{name:file.name||'shared.txt',language:modes[file.language]?file.language:detectLanguage(file.name||''),content:file.content}];current=0;$('language').value=files[0].language;editor.setOption('mode',modes[files[0].language]);editor.setValue(files[0].content);renderFiles();}catch{toast('Invalid share link.',true);}}

function init(){
  loadWorkspace();try{session=JSON.parse(storageGet(STORAGE.session,'null'));}catch{session=null;}updateAccount();
  if(!window.CodeMirror){toast('Code editor library failed to load.',true);return;}
  editor=CodeMirror.fromTextArea($('editor'),{mode:modes[files[current].language],theme:storageGet(STORAGE.theme,'dark')==='light'?'eclipse':'dracula',lineNumbers:true,autoCloseBrackets:true,matchBrackets:true,styleActiveLine:true,indentUnit:4,tabSize:4,viewportMargin:30});
  editor.setValue(files[current].content);
  editor.on('change',()=>{files[current].content=editor.getValue();updateStatus();clearTimeout(window.__codeyauSave);window.__codeyauSave=setTimeout(saveWorkspace,350);});
  editor.on('cursorActivity',updateStatus);
  $('language').value=files[current].language;renderFiles();applyTheme();loadShare();

  $('menuBtn').onclick=()=>$('sidebar').classList.toggle('sidebar-collapsed');
  $('newFileBtn').onclick=addFile;
  $('resetBtn').onclick=()=>{if(confirm('Reset workspace?')){localStorage.removeItem(STORAGE.files);localStorage.removeItem(STORAGE.current);location.reload();}};
  $('importBtn').onclick=()=>$('importInput').click();
  $('importInput').onchange=(event)=>{if(event.target.files[0])importWorkspace(event.target.files[0]);event.target.value='';};
  $('saveBtn').onclick=()=>{saveWorkspace();toast('Project saved locally.');};
  $('exportBtn').onclick=exportCurrent;
  $('shareBtn').onclick=share;
  $('runBtn').onclick=runCode;
  $('clearBtn').onclick=clearConsole;
  $('consoleTab').onclick=()=>{$('console').classList.remove('hidden');$('preview').classList.add('hidden');};
  $('previewTab').onclick=()=>{$('preview').classList.remove('hidden');$('console').classList.add('hidden');};
  $('themeBtn').onclick=toggleTheme;
  $('settingsBtn').onclick=openSettings;
  $('settingsClose').onclick=closeSettings;
  $('settingsCancel').onclick=closeSettings;
  $('settingsSave').onclick=saveSettings;
  $('accountBtn').onclick=openAccount;
  $('authClose').onclick=closeAccount;
  $('authSwitch').onclick=()=>setAuthMode(authMode==='signin'?'signup':'signin');
  $('authSubmit').onclick=submitAuth;
  $('aiBtn').onclick=openAI;
  $('aiClose').onclick=closeAI;
  $('aiCloseBackdrop').onclick=closeAI;
  $('aiSend').onclick=()=>{const prompt=$('aiInput').value.trim();if(prompt){$('aiInput').value='';askAI(prompt);}};
  $('aiInput').addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();$('aiSend').click();}});
  document.querySelectorAll('.aiQuick').forEach(button=>{button.onclick=()=>askAI(button.dataset.prompt);});
  $('language').onchange=()=>{saveWorkspace();const language=$('language').value,file=files[current],base=file.name.includes('.')?file.name.slice(0,file.name.lastIndexOf('.')):file.name;file.language=language;file.name=`${base}.${extensions[language]}`;if(confirm('Load the starter template for this language?'))file.content=templates[language]||'';editor.setOption('mode',modes[language]);editor.setValue(file.content);renderFiles();saveWorkspace();};
  document.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveWorkspace();toast('Project saved locally.');}if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runCode();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='j'){event.preventDefault();openAI();}});
  window.addEventListener('beforeunload',saveWorkspace);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
