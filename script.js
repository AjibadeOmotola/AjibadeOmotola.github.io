// ── SUPABASE ──────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(
  'https://dznbsrlgxrymmjhugtrs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bmJzcmxneHJ5bW1qaHVndHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NTgzODYsImV4cCI6MjA5MDUzNDM4Nn0.OBykh6KPUfp2hEBU93ESZ8HXh-RLlZN7ock2PnDOEh0'
);
const BUCKET = 'project-files';
let isAdmin = false, logoClicks = 0, logoTimer = null, chosenFile = null;

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── OPEN FILE VIEWER ──────────────────────────────────────────
// Generates the correct viewer URL based on file type.
// - Excel / CSV / Word / PowerPoint → Microsoft Office Online viewer
// - Jupyter notebooks (.ipynb)      → nbviewer.org
// - SQL / Python / plain text       → open file directly in new tab
// - Power BI (.pbix) / zip / pdf    → download only (no browser viewer)
function getViewUrl(fileUrl) {
  if (!fileUrl) return null;

  // Convert GitHub blob URLs to raw URLs so Office Online / nbviewer can access the file directly
  // From: https://github.com/Tola-11/REPO/blob/main/file.xlsx
  // To:   https://raw.githubusercontent.com/Tola-11/REPO/main/file.xlsx
  if (fileUrl.includes('github.com') && fileUrl.includes('/blob/')) {
    fileUrl = fileUrl
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }

  const lower = fileUrl.toLowerCase();
  const encoded = encodeURIComponent(fileUrl);

  // Office Online viewer — Excel, CSV, Word, PowerPoint
  if (/\.(xlsx|xls|csv|docx|pptx)(\?|$)/.test(lower)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encoded}`;
  }

  // Jupyter notebooks
  if (/\.ipynb(\?|$)/.test(lower)) {
    const stripped = fileUrl.replace(/^https?:\/\//, '');
    return `https://nbviewer.org/urls/${stripped}`;
  }

  // Plain text files — open directly
  if (/\.(sql|py|txt|md)(\?|$)/.test(lower)) {
    return fileUrl;
  }

  // .pbix, .pdf, .zip → no viewer available, download only
  return null;
}

// ── AUTH ──────────────────────────────────────────────────────
async function checkSession() {
  const { data:{ session } } = await sb.auth.getSession();
  if (session) setAdminMode(true);
}
async function doLogin() {
  const email = document.getElementById('aemail').value.trim();
  const pw = document.getElementById('apw').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginerr');
  err.style.display = 'none';
  btn.textContent = 'Logging in…'; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    err.textContent = '⚠ ' + error.message; err.style.display = 'block';
    btn.textContent = 'Login'; btn.disabled = false;
  } else {
    setAdminMode(true); closeMod('alm');
    document.getElementById('apw').value = '';
    toast('✓ Logged in! You can now add and delete projects.');
  }
}
async function doLogout() { await sb.auth.signOut(); setAdminMode(false); toast('Logged out.'); }
function setAdminMode(on) {
  isAdmin = on;
  document.body.classList.toggle('admin-mode', on);
  document.getElementById('adminBadge').classList.toggle('on', on);
  document.getElementById('logoutBtn').classList.toggle('on', on);
}
function logoClick() {
  logoClicks++;
  clearTimeout(logoTimer);
  if (logoClicks >= 5) {
    logoClicks = 0;
    if (isAdmin) { toast('Already logged in as admin!'); return; }
    openMod('alm');
    setTimeout(() => document.getElementById('apw').focus(), 200);
    return;
  }
  logoTimer = setTimeout(() => logoClicks = 0, 2000);
}

// ── FILE PICKER ───────────────────────────────────────────────
function fileChosen(input) {
  const file = input.files[0];
  if (!file) { chosenFile = null; return; }
  if (file.size > 50 * 1024 * 1024) {
    toast('⚠ File too large — max 50 MB');
    input.value = ''; chosenFile = null; return;
  }
  chosenFile = file;
  const mb = (file.size / 1024 / 1024).toFixed(2);
  const nameEl = document.getElementById('fupname');
  nameEl.textContent = '📎 ' + file.name + ' (' + mb + ' MB)';
  nameEl.style.display = 'block';
  document.getElementById('fupstatus').textContent = 'File ready — will upload when you click Add Project.';
}

// Drag highlight
const fz = document.getElementById('fupzone');
fz.addEventListener('dragover', e => { e.preventDefault(); fz.classList.add('drag'); });
fz.addEventListener('dragleave', () => fz.classList.remove('drag'));
fz.addEventListener('drop', () => fz.classList.remove('drag'));

// ── UPLOAD TO STORAGE ─────────────────────────────────────────
async function uploadFile(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = Date.now() + '_' + safeName;
  const prog = document.getElementById('fupprog');
  const bar  = document.getElementById('fupprogbar');
  prog.style.display = 'block'; bar.style.width = '15%';

  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream'
  });

  if (error) { prog.style.display = 'none'; throw new Error('Upload failed: ' + error.message); }

  bar.style.width = '100%';
  setTimeout(() => { prog.style.display = 'none'; bar.style.width = '0%'; }, 700);

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

// ── RENDER PROJECTS ───────────────────────────────────────────
async function renderP() {
  const g = document.getElementById('pgrid');
  g.innerHTML = '<div class="pload">⏳ Loading projects…</div>';
  try {
    const { data: ps, error } = await sb.from('projects').select('*').order('id', { ascending:true });
    if (error) throw error;
    if (!ps || !ps.length) {
      g.innerHTML = '<div class="empty"><span>📂</span>No projects yet.<br/>Login as admin and click <strong>＋ Add Project</strong> to add your work.</div>';
      return;
    }
    g.innerHTML = ps.map((p, i) => {
      const viewUrl = getViewUrl(p.file_url);
      return `
        <div class="pc fu" style="transition-delay:${i*.04}s">
          <button class="pdel" onclick="delP(${p.id})" title="Delete project">×</button>
          <div class="ptop" style="background:${esc(p.color||'#1a3a5c')}">
            <div class="pnum">${String(i+1).padStart(2,'0')}</div>
            <div class="pname">${esc(p.title)}</div>
          </div>
          <div class="pbdy">
            <p class="pdsc">${esc(p.description)}</p>
            <div class="ptls">${(p.tools||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<span class="tbdg">${esc(x)}</span>`).join('')}</div>
            <div class="plnks">
              ${p.github_link ? `<a href="${esc(p.github_link)}" target="_blank" class="plnk">View on GitHub →</a>` : ''}
              ${viewUrl       ? `<a href="${esc(viewUrl)}" target="_blank" class="pol">👁 Open File</a>` : ''}
              ${!viewUrl && p.file_url ? `<a href="${esc(p.file_url)}" target="_blank" download class="pdl">⬇ Download</a>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
    g.querySelectorAll('.fu').forEach(el => { obs.observe(el); setTimeout(() => el.classList.add('vis'), 80); });
  } catch(e) {
    g.innerHTML = `<div class="empty"><span>⚠️</span>Could not load projects.<br/><small style="font-size:11px;opacity:.5">${e.message}</small></div>`;
    console.error(e);
  }
}

// ── ADD PROJECT ───────────────────────────────────────────────
async function addProject() {
  const title       = document.getElementById('pt').value.trim();
  const description = document.getElementById('pd').value.trim();
  if (!title)       { toast('⚠ Please enter a project title'); return; }
  if (!description) { toast('⚠ Please enter a description');   return; }

  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  let file_url = '';

  if (chosenFile) {
    btn.textContent = 'Uploading file…';
    document.getElementById('fupstatus').textContent = '⏳ Uploading to Supabase Storage…';
    try {
      file_url = await uploadFile(chosenFile);
      document.getElementById('fupstatus').textContent = '✓ Uploaded successfully!';
    } catch(err) {
      toast('⚠ ' + err.message);
      btn.textContent = 'Add Project'; btn.disabled = false;
      return;
    }
  }

  btn.textContent = 'Saving…';
  const { error } = await sb.from('projects').insert({
    title, description,
    tools:       document.getElementById('ptools').value.trim(),
    github_link: document.getElementById('pglink').value.trim(),
    file_url,
    color:       document.getElementById('pcolor').value
  });

  btn.textContent = 'Add Project'; btn.disabled = false;

  if (error) { toast('Error: ' + error.message); console.error(error); return; }

  // Reset form
  closeMod('pm');
  ['pt','pd','ptools','pglink'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pcolor').value = '#1a3a5c';
  document.getElementById('pfile').value = '';
  document.getElementById('fupname').style.display = 'none';
  document.getElementById('fupname').textContent = '';
  document.getElementById('fupstatus').textContent = 'Supported: .xlsx, .pbix, .pdf, .csv, .zip · Max 50 MB · Stored in Supabase Storage';
  chosenFile = null;

  await renderP();
  toast('✓ Project added! File is live for all visitors.');
}

// ── DELETE PROJECT ────────────────────────────────────────────
async function delP(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    const { data: proj } = await sb.from('projects').select('file_url').eq('id', id).single();
    if (proj && proj.file_url) {
      const url = new URL(proj.file_url);
      const marker = '/object/public/' + BUCKET + '/';
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const storagePath = decodeURIComponent(url.pathname.slice(idx + marker.length));
        await sb.storage.from(BUCKET).remove([storagePath]);
      }
    }
  } catch(e) { console.warn('Storage delete skipped:', e.message); }

  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message); return; }
  await renderP();
  toast('✓ Project deleted.');
}

// ── UI HELPERS ────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const d = document.documentElement;
  document.getElementById('prog').style.width = (d.scrollTop / (d.scrollHeight - d.clientHeight) * 100) + '%';
});

function toggleDark() {
  document.body.classList.toggle('dark');
  const dk = document.body.classList.contains('dark');
  document.querySelectorAll('#dt,#mdt').forEach(b => b.textContent = dk ? '☀️' : '🌙');
  localStorage.setItem('dm', dk);
}
if (localStorage.getItem('dm') === 'true') {
  document.body.classList.add('dark');
  document.querySelectorAll('#dt,#mdt').forEach(b => b.textContent = '☀️');
}

const navEl = document.getElementById('nav');
window.addEventListener('scroll', () => {
  navEl.classList.toggle('sc', window.scrollY > 80);
  let cur = '';
  document.querySelectorAll('section[id],div[id]').forEach(s => { if (window.scrollY >= s.offsetTop - 130) cur = s.id; });
  document.querySelectorAll('.nlinks a[data-s]').forEach(a => a.classList.toggle('act', a.dataset.s === cur));
});

function toggleMenu() {
  const m = document.getElementById('mmenu'), b = document.getElementById('hbg');
  m.classList.toggle('op'); b.classList.toggle('op');
  document.body.style.overflow = m.classList.contains('op') ? 'hidden' : '';
}
function closeMenu() {
  document.getElementById('mmenu').classList.remove('op');
  document.getElementById('hbg').classList.remove('op');
  document.body.style.overflow = '';
}
function chkMDT() { document.getElementById('mdt').style.display = window.innerWidth <= 900 ? 'block' : 'none'; }
window.addEventListener('resize', chkMDT); chkMDT();

// ── INTERSECTION OBSERVER (scroll animations) ─────────────────
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); if (e.target.id === 'profwrap') animBars(); } });
}, { threshold:.1 });
document.querySelectorAll('.fu').forEach(el => obs.observe(el));
setTimeout(() => document.querySelectorAll('#hero .fu').forEach(el => el.classList.add('vis')), 100);

// ── PROFICIENCY BARS ──────────────────────────────────────────
const profs = [
  {n:'Microsoft Excel',p:95},{n:'SQL / MySQL',p:88},
  {n:'Power BI',p:85},{n:'DAX',p:80},
  {n:'Data Cleaning',p:92},{n:'Tableau',p:75},
  {n:'Google Sheets',p:90},{n:'Python (Pandas)',p:70}
];
document.getElementById('profgrid').innerHTML = profs.map((p,i) =>
  `<div><div class="phd"><span class="pn">${p.n}</span><span class="pp">${p.p}%</span></div>
  <div class="pb"><div class="pf" id="pf${i}" data-p="${p.p}"></div></div></div>`
).join('');
let bDone = false;
function animBars() {
  if (bDone) return; bDone = true;
  profs.forEach((_,i) => setTimeout(() => { const el = document.getElementById('pf'+i); if (el) el.style.width = el.dataset.p+'%'; }, i*80));
}

// ── PHOTO CHANGE ──────────────────────────────────────────────
function changePhoto(input) {
  if (!isAdmin) return;
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { document.getElementById('profileImg').src = e.target.result; toast('✓ Photo previewed. Save as profile.jpg to make permanent.'); };
  reader.readAsDataURL(file);
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── CONTACT ───────────────────────────────────────────────────
function copyEmail() {
  navigator.clipboard.writeText('omotolaniayinke863@gmail.com').then(() => toast('✓ Email copied!')).catch(() => toast('Email: omotolaniayinke863@gmail.com'));
}
function handleSub(e) {
  if (e.target.action.includes('YOUR_FORM_ID')) {
    e.preventDefault();
    const btn = document.getElementById('subbtn');
    btn.textContent = '✓ Sent!'; btn.style.background = '#d4edda'; btn.style.color = '#155724';
    setTimeout(() => { btn.textContent = 'Send Message →'; btn.style.background = ''; btn.style.color = ''; e.target.reset(); }, 3000);
  }
}

// ── MODALS ────────────────────────────────────────────────────
function openMod(id) { document.getElementById(id).classList.add('op'); document.body.style.overflow = 'hidden'; }
function closeMod(id) { document.getElementById(id).classList.remove('op'); document.body.style.overflow = ''; }
function bgClose(e, id) { if (e.target === document.getElementById(id)) closeMod(id); }

// ── INIT ──────────────────────────────────────────────────────
checkSession().then(() => renderP());
