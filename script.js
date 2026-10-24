
import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  doc, setDoc, getDoc, collection, addDoc, getDocs, updateDoc,
  deleteDoc, query, orderBy, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const show = (id, html) => {
  const e = $(id);
  if (e) {
    e.innerHTML = html;
    e.classList.remove('hidden');
  }
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function driveId(url) {
  const value = (url || '').trim();
  const match = value.match(/\/file\/d\/([\w-]+)/) || value.match(/[?&]id=([\w-]+)/);
  return match ? match[1] : null;
}
function driveEmbed(url) {
  const id = driveId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}
function directVideo(url) {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url || '');
}

async function getProfile(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}
async function current() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      unsubscribe();
      if (!user) {
        resolve(null);
        return;
      }
      resolve({ u: user, p: await getProfile(user.uid) });
    });
  });
}
async function requireLearner() {
  const session = await current();
  if (!session) {
    location.href = 'login.html';
    return null;
  }
  if (session.p?.role === 'admin') {
    location.href = 'admin.html';
    return null;
  }
  return session;
}
function setMessage(id, message, type = 'error') {
  show(id, `<div class="message ${type}">${esc(message)}</div>`);
}

/* SIGN UP */
if ($('signupForm')) {
  $('signupForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const name = $('name').value.trim();
      const email = $('email').value.trim().toLowerCase();
      const password = $('password').value;
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', credential.user.uid), {
        name, email, role: 'learner', status: 'pending', createdAt: serverTimestamp()
      });
      $('signupForm').reset();
      show('signupMessage', '<div class="message success">Account created. <b>You will be joined soon.</b> Your account is waiting for admin approval.</div>');
    } catch (error) {
      setMessage('signupMessage', error.message || 'Could not create account.');
    }
  });
}

/* LOGIN */
if ($('loginForm')) {
  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        $('loginEmail').value.trim().toLowerCase(),
        $('loginPassword').value
      );
      const profile = await getProfile(credential.user.uid);
      location.href = profile?.role === 'admin' ? 'admin.html' : 'dashboard.html';
    } catch {
      setMessage('loginMessage', 'Incorrect email/password, or the account has not been set up.');
    }
  });
}

if ($('logoutBtn')) {
  $('logoutBtn').onclick = () => signOut(auth).then(() => location.href = 'index.html');
}
if ($('adminLogout')) {
  $('adminLogout').onclick = () => signOut(auth).then(() => location.href = 'index.html');
}

/* HOME */
if (location.pathname.endsWith('index.html') || location.pathname.endsWith('/')) {
  onAuthStateChanged(auth, async user => {
    if (!user) return;
    const profile = await getProfile(user.uid);
    if ($('loginLink')) {
      $('loginLink').textContent = profile?.role === 'admin' ? 'Admin' : 'Account';
    }
  });
}

/* DASHBOARD + FIREBASE PROGRESS */
if ($('folderTabs') && $('library')) {
  (async () => {
    const session = await requireLearner();
    if (!session) return;

    if (session.p?.status !== 'approved') {
      if ($('accessNotice')) {
        $('accessNotice').innerHTML = `<div class="notice">Your account is <b>${esc(session.p?.status || 'pending')}</b>. You will be joined soon after admin approval.</div>`;
      }
      return;
    }

    if ($('accessNotice')) {
      $('accessNotice').innerHTML = '<div class="notice success">Access approved. Welcome to Learn to Earn.</div>';
    }

    const foldersSnapshot = await getDocs(query(collection(db, 'folders'), orderBy('name')));
    const folders = foldersSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    const contentSnapshot = await getDocs(query(collection(db, 'content'), orderBy('createdAt', 'desc')));
    const allItems = contentSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
    const progressCollection = collection(db, 'users', session.u.uid, 'lessonProgress');
    const progressSnapshot = await getDocs(progressCollection);
    const completedIds = new Set(
      progressSnapshot.docs.filter(snapshot => snapshot.data().completed === true).map(snapshot => snapshot.id)
    );

    let active = folders[0]?.id || '';
    let searchTerm = '';

    const searchInput = $('subjectSearch') || $('searchSubjects');
    if (searchInput) {
      searchInput.addEventListener('input', async event => {
        searchTerm = event.target.value.trim().toLowerCase();
        await render();
      });
    }

    function folderProgress(folderId) {
      const videos = allItems.filter(item => item.folderId === folderId && item.type === 'video');
      if (!videos.length) return 0;
      const completed = videos.filter(item => completedIds.has(item.id)).length;
      return Math.round(completed / videos.length * 100);
    }

    function progressMarkup(folderId) {
      const percent = folderProgress(folderId);
      return `<div class="subject-progress" aria-label="${percent}% complete">
        <div class="progress-line"><span style="width:${percent}%"></span></div>
        <div class="progress-caption"><span>Progress</span><strong>${percent}%</strong></div>
      </div>`;
    }

    async function markCompleted(itemId, isCompleted) {
      const progressRef = doc(db, 'users', session.u.uid, 'lessonProgress', itemId);
      await setDoc(progressRef, {
        contentId: itemId,
        completed: isCompleted,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (isCompleted) completedIds.add(itemId);
      else completedIds.delete(itemId);
      await render();
    }

    async function render() {
      if ($('folderTabs')) {
        const shownFolders = folders.filter(folder => folder.name.toLowerCase().includes(searchTerm));
        $('folderTabs').innerHTML = shownFolders.map(folder => `
          <button type="button" class="folder-tab ${folder.id === active ? 'active' : ''}" data-folder="${esc(folder.id)}">
            <span class="subject-tab-name">${esc(folder.name)}</span>
            <span class="subject-tab-percent">${folderProgress(folder.id)}%</span>
          </button>`).join('');

        $('folderTabs').querySelectorAll('[data-folder]').forEach(button => {
          button.onclick = async () => {
            active = button.dataset.folder;
            await render();
          };
        });
      }

      const visibleFolders = folders.filter(folder => folder.name.toLowerCase().includes(searchTerm));
      if (!active || !folders.some(folder => folder.id === active)) {
        active = visibleFolders[0]?.id || '';
      }

      const selectedFolder = folders.find(folder => folder.id === active);
      const folderItems = allItems.filter(item => item.folderId === active);
      const visibleItems = folderItems.filter(item => item.title?.toLowerCase().includes(searchTerm));

      const overallVideos = allItems.filter(item => item.type === 'video');
      const overallPercent = overallVideos.length
        ? Math.round(overallVideos.filter(item => completedIds.has(item.id)).length / overallVideos.length * 100)
        : 0;
      if ($('overallProgress')) $('overallProgress').textContent = `${overallPercent}%`;
      if ($('overallProgressBar')) $('overallProgressBar').style.width = `${overallPercent}%`;
      if ($('subjectCount')) $('subjectCount').textContent = String(folders.length);
      if ($('resourceCount')) $('resourceCount').textContent = String(allItems.length);
      if ($('activeSubjectTitle')) $('activeSubjectTitle').textContent = selectedFolder?.name || 'Explore your subjects';

      if (!active) {
        $('library').innerHTML = '<div class="notice">No subjects yet. Please check back later.</div>';
        return;
      }

      $('library').innerHTML = visibleItems.length ? visibleItems.map(item => {
        const isVideo = item.type === 'video';
        const completed = completedIds.has(item.id);
        return `<article class="feature content-card">
          <div class="icon">${isVideo ? '▶' : '▤'}</div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.description || (isVideo ? 'Video lesson' : 'Study material'))}</p>
          ${isVideo ? `
            ${progressMarkup(active)}
            <div class="lesson-actions">
              <a class="button primary" href="watch.html?id=${encodeURIComponent(item.id)}">Watch lesson →</a>
              <button type="button" class="button ${completed ? 'secondary' : 'primary'}" data-complete="${esc(item.id)}" data-done="${completed}">
                ${completed ? '✓ Completed' : 'Mark complete'}
              </button>
            </div>` : `
            <a class="button secondary" target="_blank" rel="noopener noreferrer" href="${esc(item.url)}">Open material ↗</a>`}
        </article>`;
      }).join('') : '<div class="notice">No content in this subject yet.</div>';

      $('library').querySelectorAll('[data-complete]').forEach(button => {
        button.onclick = async () => {
          const id = button.dataset.complete;
          const done = button.dataset.done === 'true';
          button.disabled = true;
          try {
            await markCompleted(id, !done);
          } catch (error) {
            alert('Could not save progress. Please check your connection and Firebase rules.');
            button.disabled = false;
          }
        };
      });
    }

    await render();
  })().catch(error => {
    console.error('Dashboard error:', error);
    if ($('library')) $('library').innerHTML = '<div class="notice">The library could not load. Please refresh and check your Firebase connection.</div>';
  });
}

/* WATCH PAGE */
if ($('player') && $('watchTitle')) {
  (async () => {
    const session = await requireLearner();
    if (!session) return;
    if (session.p?.status !== 'approved') {
      location.href = 'dashboard.html';
      return;
    }

    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      $('watchTitle').textContent = 'Lesson not found';
      return;
    }

    const snapshot = await getDoc(doc(db, 'content', id));
    if (!snapshot.exists() || snapshot.data().type !== 'video') {
      $('watchTitle').textContent = 'Lesson not found';
      return;
    }

    const item = snapshot.data();
    $('watchTitle').textContent = item.title;
    if ($('watchFolder')) $('watchFolder').textContent = item.description || '';
    const embedUrl = driveEmbed(item.url);

    if (embedUrl) {
      $('videoShell').innerHTML = `<iframe class="drive-player" src="${embedUrl}" title="${esc(item.title)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
      if ($('videoHelp')) {
        $('videoHelp').classList.remove('hidden');
        $('videoHelp').textContent = 'When you finish this lesson, return to the library and select “Mark complete” to update your subject progress.';
      }
    } else if (directVideo(item.url)) {
      $('player').src = item.url;
      $('player').controlsList = 'nodownload noplaybackrate';
      $('player').disablePictureInPicture = true;
      $('player').oncontextmenu = () => false;
      if ($('videoHelp')) {
        $('videoHelp').classList.remove('hidden');
        $('videoHelp').textContent = 'When you finish this lesson, return to the library and select “Mark complete” to update your subject progress.';
      }
    } else if ($('videoHelp')) {
      $('videoHelp').classList.remove('hidden');
      $('videoHelp').textContent = 'Use a Google Drive file link or a direct MP4/WebM URL.';
    }
 })().catch(error => {
  console.error('Dashboard error:', error);
  if ($('library')) $('library').innerHTML = '<div class="notice">The library could not load. Please refresh and check your Firebase connection.</div>';
});
}

/* ADMIN */
if ($('adminLoginForm') || $('adminPanel')) {
  (async () => {
    const session = await current();
    if (session?.p?.role === 'admin') {
      $('adminLoginBox')?.classList.add('hidden');
      $('adminPanel')?.classList.remove('hidden');
      if ($('adminPanel')) await loadAdmin();
    }

    if ($('adminLoginForm')) {
      $('adminLoginForm').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          const email = $('adminId').value.trim().toLowerCase();
          const password = $('adminPassword').value;
          const credential = await signInWithEmailAndPassword(auth, email, password);
          const profile = await getProfile(credential.user.uid);
          if (profile?.role !== 'admin') {
            await signOut(auth);
            throw new Error('This account is not an admin.');
          }
          $('adminLoginBox').classList.add('hidden');
          $('adminPanel').classList.remove('hidden');
          await loadAdmin();
        } catch {
          show('adminMessage', '<div class="message error">Admin login failed. Use the admin email/password created in Firebase Authentication.</div>');
        }
      });
    }

    async function loadAdmin() {
      const folderSnapshot = await getDocs(query(collection(db, 'folders'), orderBy('name')));
      const folders = folderSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
      if ($('videoFolder')) {
        $('videoFolder').innerHTML = folders.map(folder => `<option value="${esc(folder.id)}">${esc(folder.name)}</option>`).join('');
      }
      if ($('docFolder') && $('videoFolder')) $('docFolder').innerHTML = $('videoFolder').innerHTML;

      if ($('foldersList')) {
        $('foldersList').innerHTML = folders.length
          ? folders.map(folder => `<div class="item"><span>${esc(folder.name)}</span><button type="button" class="button secondary" data-folder-del="${esc(folder.id)}">Delete</button></div>`).join('')
          : '<p class="muted">No folders.</p>';
      }
      document.querySelectorAll('[data-folder-del]').forEach(button => {
        button.onclick = async () => {
          const id = button.dataset.folderDel;
          const contentSnapshot = await getDocs(query(collection(db, 'content'), where('folderId', '==', id)));
          if (!contentSnapshot.empty) {
            alert('Delete the content in this folder first.');
            return;
          }
          if (confirm('Delete this folder?')) {
            await deleteDoc(doc(db, 'folders', id));
            await loadAdmin();
          }
        };
      });

      const contentSnapshot = await getDocs(query(collection(db, 'content'), orderBy('createdAt', 'desc')));
      if ($('adminContent')) {
        $('adminContent').innerHTML = contentSnapshot.docs.length
          ? contentSnapshot.docs.map(snapshot => {
            const item = snapshot.data();
            return `<div class="item"><b>${esc(item.title)}</b> <span class="badge">${esc(item.type)}</span><br><span class="muted">${esc(item.url)}</span><br><button type="button" class="button secondary" data-content-del="${esc(snapshot.id)}">Delete</button></div>`;
          }).join('')
          : '<p class="muted">No content.</p>';
      }
      document.querySelectorAll('[data-content-del]').forEach(button => {
        button.onclick = async () => {
          if (confirm('Delete this content?')) {
            await deleteDoc(doc(db, 'content', button.dataset.contentDel));
            await loadAdmin();
          }
        };
      });

      const userSnapshot = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
      const users = userSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })).filter(user => user.role !== 'admin');
      if ($('usersList')) {
        $('usersList').innerHTML = users.length
          ? users.map(user => `<div class="item"><b>${esc(user.name || '')}</b> — ${esc(user.email)} <span class="badge">${esc(user.status || 'pending')}</span> <button type="button" class="button secondary" data-user="${esc(user.id)}" data-status="${esc(user.status || 'pending')}">${user.status === 'approved' ? 'Reject' : 'Approve'}</button></div>`).join('')
          : '<p class="muted">No learners yet.</p>';
      }
      document.querySelectorAll('[data-user]').forEach(button => {
        button.onclick = async () => {
          await updateDoc(doc(db, 'users', button.dataset.user), {
            status: button.dataset.status === 'approved' ? 'rejected' : 'approved'
          });
          await loadAdmin();
        };
      });
    }

    if ($('folderForm')) {
      $('folderForm').addEventListener('submit', async event => {
        event.preventDefault();
        await addDoc(collection(db, 'folders'), {
          name: $('folderName').value.trim(),
          createdAt: serverTimestamp()
        });
        event.target.reset();
        await loadAdmin();
      });
    }
    if ($('videoForm')) {
      $('videoForm').addEventListener('submit', async event => {
        event.preventDefault();
        await addDoc(collection(db, 'content'), {
          type: 'video',
          title: $('videoTitle').value.trim(),
          folderId: $('videoFolder').value,
          url: $('videoUrl').value.trim(),
          description: '',
          createdAt: serverTimestamp()
        });
        event.target.reset();
        await loadAdmin();
      });
    }
    if ($('docForm')) {
      $('docForm').addEventListener('submit', async event => {
        event.preventDefault();
        await addDoc(collection(db, 'content'), {
          type: 'document',
          title: $('docTitle').value.trim(),
          folderId: $('docFolder').value,
          url: $('docUrl').value.trim(),
          description: '',
          createdAt: serverTimestamp()
        });
        event.target.reset();
        await loadAdmin();
      });
    }
  })().catch(error => {
    console.error('Admin page error:', error);
    if ($('adminMessage')) show('adminMessage', '<div class="message error">Could not load the admin panel. Check your Firebase connection and permissions.</div>');
  });
}
