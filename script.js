import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, setDoc, getDoc, collection, addDoc, getDocs, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const show = (id, html) => { const e=$(id); if(e){e.innerHTML=html; e.classList.remove('hidden');} };
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function driveId(u){ const s=(u||'').trim(); const m=s.match(/\/file\/d\/([\w-]+)/)||s.match(/[?&]id=([\w-]+)/); return m?m[1]:null; }
function driveEmbed(u){ const id=driveId(u); return id ? `https://drive.google.com/file/d/${id}/preview` : null; }
function directVideo(u){ return /\.(mp4|webm|ogg)(\?.*)?$/i.test(u||''); }

async function getProfile(uid){ const s=await getDoc(doc(db,'users',uid)); return s.exists()?s.data():null; }
async function current(){ return new Promise(resolve=>onAuthStateChanged(auth, async u=>{ if(!u){resolve(null);return;} resolve({u,p:await getProfile(u.uid)}); })); }
async function requireLearner(){ const c=await current(); if(!c){location.href='login.html'; return null;} if(c.p?.role==='admin'){location.href='admin.html'; return null;} return c; }

// SIGN UP
if($('signupForm')) $('signupForm').addEventListener('submit', async e=>{
 e.preventDefault();
 try{
   const name=$('name').value.trim(), email=$('email').value.trim().toLowerCase(), password=$('password').value;
   const c=await createUserWithEmailAndPassword(auth,email,password);
   await setDoc(doc(db,'users',c.user.uid),{name,email,role:'learner',status:'pending',createdAt:serverTimestamp()});
   $('signupForm').reset(); show('signupMessage','<div class="message success">Account created. <b>You will be joined soon.</b> Your account is waiting for admin approval.</div>');
 }catch(e){ show('signupMessage',`<div class="message error">${esc(e.message)}</div>`); }
});

// LOGIN
if($('loginForm')) $('loginForm').addEventListener('submit', async e=>{
 e.preventDefault();
 try{
   const c=await signInWithEmailAndPassword(auth,$('loginEmail').value.trim().toLowerCase(),$('loginPassword').value);
   const p=await getProfile(c.user.uid);
   if(p?.role==='admin') location.href='admin.html'; else location.href='dashboard.html';
 }catch(e){ show('loginMessage','<div class="message error">Incorrect email/password, or the account has not been set up.</div>'); }
});

if($('logoutBtn')) $('logoutBtn').onclick=()=>signOut(auth).then(()=>location.href='index.html');
if($('adminLogout')) $('adminLogout').onclick=()=>signOut(auth).then(()=>location.reload());

// HOME
if(location.pathname.endsWith('index.html') || location.pathname.endsWith('/')){
 onAuthStateChanged(auth, async u=>{ if(!u)return; const p=await getProfile(u.uid); if($('loginLink')) $('loginLink').textContent=p?.role==='admin'?'Admin':'Account'; });
}

// DASHBOARD
if($('folderTabs') && $('library')) (async()=>{
 const c=await requireLearner(); if(!c)return;
 if(c.p?.status!=='approved'){ $('accessNotice').innerHTML='<div class="notice">Your account is <b>'+esc(c.p?.status||'pending')+'</b>. You will be joined soon after admin approval.</div>'; return; }
 $('accessNotice').innerHTML='<div class="notice success">Access approved. Welcome to Learn to Earth.</div>';
 const fs=await getDocs(query(collection(db,'folders'),orderBy('name'))); const folders=fs.docs.map(d=>({id:d.id,...d.data()}));
 let active=folders[0]?.id;
 async function render(){
   $('folderTabs').innerHTML=folders.map(f=>`<button class="${f.id===active?'active':''}" data-folder="${f.id}">${esc(f.name)}</button>`).join('');
   $('folderTabs').querySelectorAll('button').forEach(b=>b.onclick=async()=>{active=b.dataset.folder; await render();});
   if(!active){$('library').innerHTML='<div class="notice">No folders yet.</div>';return;}
   const ls=await getDocs(query(collection(db,'content'),orderBy('createdAt','desc')));
   const items=ls.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.folderId===active);
   $('library').innerHTML=items.length?items.map(x=>x.type==='video'?`<article class="feature"><div class="icon">▶</div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p><a class="button primary" href="watch.html?id=${x.id}">Watch video</a></article>`:`<article class="feature"><div class="icon">▣</div><h3>${esc(x.title)}</h3><p>${esc(x.description||'')}</p><a class="button secondary" target="_blank" rel="noopener" href="${esc(x.url)}">Open material</a></article>`).join(''):'<div class="notice">No content in this folder yet.</div>';
 }
 await render();
})();

// WATCH
if($('player') && $('watchTitle')) (async()=>{
 const c=await requireLearner(); if(!c)return;
 if(c.p?.status!=='approved'){location.href='dashboard.html';return;}
 const id=new URLSearchParams(location.search).get('id'); if(!id){$('watchTitle').textContent='Lesson not found';return;}
 const s=await getDoc(doc(db,'content',id)); if(!s.exists()||s.data().type!=='video'){ $('watchTitle').textContent='Lesson not found';return; }
 const x=s.data(); $('watchTitle').textContent=x.title; $('watchFolder').textContent=x.description||'';
 const em=driveEmbed(x.url);
 if(em){
   $('videoShell').innerHTML=`<iframe class="drive-player" src="${em}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
   $('videoHelp').classList.remove('hidden'); $('videoHelp').textContent='This video is embedded from Google Drive. Download/copy controls are not shown by Learn to Earth, but Google Drive/browser restrictions cannot guarantee that a determined viewer cannot copy a video.';
 } else if(directVideo(x.url)){
   $('player').src=x.url; $('player').controlsList='nodownload noplaybackrate'; $('player').disablePictureInPicture=true; $('player').oncontextmenu=()=>false;
 } else { $('videoHelp').classList.remove('hidden'); $('videoHelp').textContent='Use a Google Drive file link or a direct MP4/WebM URL.'; }
})();

// ADMIN
if($('adminLoginForm') || $('adminPanel')) (async()=>{
 const c=await current();
 if(c?.p?.role==='admin'){ $('adminLoginBox')?.classList.add('hidden'); $('adminPanel')?.classList.remove('hidden'); if($('adminPanel')) await loadAdmin(); }
 if($('adminLoginForm')) $('adminLoginForm').addEventListener('submit', async e=>{
   e.preventDefault();
   try{
     const email=$('adminId').value.trim().toLowerCase();
     const pass=$('adminPassword').value;
     const x=await signInWithEmailAndPassword(auth,email,pass); const p=await getProfile(x.user.uid);
     if(p?.role!=='admin'){await signOut(auth); throw new Error('This account is not an admin.');}
     $('adminLoginBox').classList.add('hidden'); $('adminPanel').classList.remove('hidden'); await loadAdmin();
   }catch(e){show('adminMessage','<div class="message error">Admin login failed. Use the admin email/password created in Firebase Authentication.</div>');}
 });
 async function loadAdmin(){
   const fs=await getDocs(query(collection(db,'folders'),orderBy('name'))); const folders=fs.docs.map(d=>({id:d.id,...d.data()}));
   $('videoFolder').innerHTML=folders.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join(''); $('docFolder').innerHTML=$('videoFolder').innerHTML;
   $('foldersList').innerHTML=folders.length?folders.map(f=>`<div class="item"><span>${esc(f.name)}</span><button class="button secondary" data-folder-del="${f.id}">Delete</button></div>`).join(''):'<p class="muted">No folders.</p>';
   document.querySelectorAll('[data-folder-del]').forEach(b=>b.onclick=async()=>{const id=b.dataset.folderDel; const cs=await getDocs(query(collection(db,'content'),where('folderId','==',id))); if(!cs.empty){alert('Delete the content in this folder first.');return;} if(confirm('Delete this folder?')){await deleteDoc(doc(db,'folders',id));await loadAdmin();}});
   const cs=await getDocs(query(collection(db,'content'),orderBy('createdAt','desc'))); $('adminContent').innerHTML=cs.docs.length?cs.docs.map(d=>{const x=d.data();return `<div class="item"><b>${esc(x.title)}</b> <span class="badge">${esc(x.type)}</span><br><span class="muted">${esc(x.url)}</span><br><button class="button secondary" data-content-del="${d.id}">Delete</button></div>`}).join(''):'<p class="muted">No content.</p>';
   document.querySelectorAll('[data-content-del]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this content?')){await deleteDoc(doc(db,'content',b.dataset.contentDel));await loadAdmin();}});
   const us=await getDocs(query(collection(db,'users'),orderBy('createdAt','desc'))); const users=us.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.role!=='admin');
   $('usersList').innerHTML=users.length?users.map(x=>`<div class="item"><b>${esc(x.name||'')}</b> — ${esc(x.email)} <span class="badge">${esc(x.status||'pending')}</span> <button class="button secondary" data-user="${x.id}" data-status="${x.status}">${x.status==='approved'?'Reject':'Approve'}</button></div>`).join(''):'<p class="muted">No learners yet.</p>';
   document.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{await updateDoc(doc(db,'users',b.dataset.user),{status:b.dataset.status==='approved'?'rejected':'approved'});await loadAdmin();});
 }
 if($('folderForm')) $('folderForm').addEventListener('submit',async e=>{e.preventDefault();await addDoc(collection(db,'folders'),{name:$('folderName').value.trim(),createdAt:serverTimestamp()});e.target.reset();await loadAdmin();});
 if($('videoForm')) $('videoForm').addEventListener('submit',async e=>{e.preventDefault();await addDoc(collection(db,'content'),{type:'video',title:$('videoTitle').value.trim(),folderId:$('videoFolder').value,url:$('videoUrl').value.trim(),description:'',createdAt:serverTimestamp()});e.target.reset();await loadAdmin();});
 if($('docForm')) $('docForm').addEventListener('submit',async e=>{e.preventDefault();await addDoc(collection(db,'content'),{type:'document',title:$('docTitle').value.trim(),folderId:$('docFolder').value,url:$('docUrl').value.trim(),description:'',createdAt:serverTimestamp()});e.target.reset();await loadAdmin();});
})();
