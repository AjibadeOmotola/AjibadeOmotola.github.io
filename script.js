// ── CONFIG ────────────────────────────────────────────────────
// Read-only: projects are fetched from your Supabase table. No admin or upload code lives on the public site.
const SB = 'https://dznbsrlgxrymmjhugtrs.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bmJzcmxneHJ5bW1qaHVndHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NTgzODYsImV4cCI6MjA5MDUzNDM4Nn0.OBykh6KPUfp2hEBU93ESZ8HXh-RLlZN7ock2PnDOEh0';
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const safe = u => /^https?:\/\//i.test(u||'') ? u : '';

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

  // Normalize: some stored URLs are already percent-encoded (e.g. %20, %26 from GitHub raw links).
  // Decode first so we have the literal URL, then encode exactly ONCE below.
  // Without this, double-encoding breaks any file with spaces/&/commas in its name.
  let normalized = fileUrl;
  try { normalized = decodeURIComponent(fileUrl); } catch(e) { /* already a plain URL, use as-is */ }

  const lower = normalized.toLowerCase();
  const encoded = encodeURIComponent(normalized);

  // Office Online viewer — Excel, CSV, Word, PowerPoint
  if (/\.(xlsx|xls|csv|docx|pptx)(\?|$)/.test(lower)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encoded}`;
  }

  // Jupyter notebooks
  if (/\.ipynb(\?|$)/.test(lower)) {
    const stripped = normalized.replace(/^https?:\/\//, '');
    return `https://nbviewer.org/urls/${stripped}`;
  }

  // Plain text files — open directly
  if (/\.(sql|py|txt|md)(\?|$)/.test(lower)) {
    return normalized;
  }

  // .pbix, .pdf, .zip → no viewer available, download only
  return null;
}


// ── PROJECTS ──────────────────────────────────────────────────
let allProjects = [], currentFilter = 'All', showAll = false;
// IDs shown first (in this order). Change them to feature different projects.
const FEAT = [60,61,77,83,90,101,107,110];
const GH = 'AjibadeOmotola/';
const mk = (id,title,description,tools,repo,file) => ({id,title,description,tools,
  github_link:'https://github.com/'+GH+repo+'/blob/main/'+file,
  file_url:'https://raw.githubusercontent.com/'+GH+repo+'/main/'+file});
// Used only if the database can't be reached.
const FALLBACK = [
  mk(60,'Coca-Cola Sales Analysis & Dashboard','Analysed Coca-Cola sales data to identify the top profitable region. Built a Pivot Table analysis and interactive Excel dashboard for KPI tracking.','Excel, Pivot Tables, Dashboard','EXCEL_PROJECTS','Coca_Cola%20Sales%20Dataset%20-%20Pivot%20Table.xlsx'),
  mk(61,'HP Nigeria Sales Dashboard','Built a full Excel data visualization dashboard using HP Nigeria sales data to track sales performance, trends, and KPIs across regions.','Excel, Data Visualization, Dashboard','EXCEL_PROJECTS','Excel%20Dashboard%20Checkpoint%20Data%20Visualization%20-%20HP%20Nigeria%20Sales%20Data.xlsx'),
  mk(77,'US Sales Dashboard','Built an interactive Power BI dashboard analysing US sales performance across regions, products, and time periods.','Power BI, DAX','POWER-BI_PROJECTS','us%20dashboard.pbix'),
  mk(83,'Pizza Sales Analytics Dashboard','Built a Power BI dashboard analysing pizza sales data to identify top-selling items, peak hours, and revenue trends.','Power BI, DAX','POWER-BI_PROJECTS','PIZZA%20SALES%20ANALYTIC.pbix'),
  mk(90,'Window Functions & Subquery Practices','Practiced advanced SQL window functions and subqueries to perform ranking, running totals, and comparative analysis.','SQL','SQL_PROJECTS','Windows%20Function%20%26%20subquery%20Practices.sql'),
  mk(101,'Google Play Store Market Analysis','Analysed Google Play Store app data using Python to uncover market trends, ratings patterns, and category performance.','Python, Pandas','PYTHON_PROJECTS','Google_PlayStore_Analysis_Omotola_Ajibade.ipynb'),
  mk(107,'Customer Segmentation (K-Means)','Applied K-Means clustering in Python to segment customers into distinct groups based on behaviour and demographics.','Python, Machine Learning','PYTHON_PROJECTS','Customer_Segmentation_EDA_Omotola_Ajibade_%281%29.ipynb'),
  mk(110,'Super Store Sales Dashboard','Designed a Tableau dashboard analysing Super Store sales data across regions, categories, and time periods.','Tableau','TABLEAU_PROJECTS','Super%20Store%20Sales%20Data.twbx')
];

// Build the GitHub link from the file's own address so wrong links in the database can't break it.
function ghUrl(p) {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/main\/(.+)$/.exec(p.file_url || '');
  return m ? 'https://github.com/'+m[1]+'/'+m[2]+'/blob/main/'+m[3] : p.github_link;
}

async function renderP() {
  const g = document.getElementById('pgrid');
  g.innerHTML = '<div class="pload">⏳ Loading projects…</div>';
  try {
    const r = await fetch(SB+'/rest/v1/projects?select=id,title,description,tools,github_link,file_url&order=id.asc', { headers:{ apikey:KEY, Authorization:'Bearer '+KEY } });
    if (!r.ok) throw new Error('HTTP '+r.status);
    const d = (await r.json()).filter(p => p.id !== 66);
    allProjects = d.length ? d : FALLBACK;
  } catch(e) { console.error(e); allProjects = FALLBACK; }
  const pc = document.getElementById('pcount');
  if (pc && allProjects.length > FEAT.length) pc.textContent = allProjects.length;
  renderFilterCounts();
  displayProjects(currentFilter);
}

function matchesFilter(p, filter) {
  if (filter === 'All') return true;
  const tools = (p.tools || '').toLowerCase();
  return tools.includes(filter.toLowerCase());
}

function renderFilterCounts() {
  const bar = document.getElementById('filterBar');
  if (!bar) return;
  const cats = ['All', 'Excel', 'SQL', 'Power BI', 'Python', 'Tableau'];
  bar.innerHTML = cats.map(c => {
    const count = c === 'All' ? allProjects.length : allProjects.filter(p => matchesFilter(p, c)).length;
    const active = c === currentFilter ? 'fbtn-active' : '';
    const tm = c === 'All' ? null : getToolMeta(c);
    const style = (active && tm) ? `style="background:${tm.color};border-color:${tm.color}"` : '';
    return `<button class="fbtn ${active}" ${style} onclick="filterProjects('${esc(c)}')">${esc(c)} <span class="fcount">${count}</span></button>`;
  }).join('');
}
function filterProjects(filter) { currentFilter = filter; renderFilterCounts(); displayProjects(filter); }
function showAllProjects() { showAll = true; displayProjects(currentFilter); }

function getToolMeta(tools) {
  const t = (tools || '').toLowerCase();
  if (t.includes('excel')) return { color: 'var(--tool-excel)', icon: '📗', label: 'Excel' };
  if (t.includes('power bi')) return { color: 'var(--tool-powerbi)', icon: '📊', label: 'Power BI' };
  if (t.includes('sql')) return { color: 'var(--tool-sql)', icon: '🗄️', label: 'SQL' };
  if (t.includes('python')) return { color: 'var(--tool-python)', icon: '🐍', label: 'Python' };
  if (t.includes('tableau')) return { color: 'var(--tool-tableau)', icon: '📈', label: 'Tableau' };
  return { color: 'var(--tool-other)', icon: '💼', label: (tools || 'Project').split(',')[0].trim() };
}

function displayProjects(filter) {
  const g = document.getElementById('pgrid'), more = document.getElementById('moreWrap');
  let ps = allProjects.filter(p => matchesFilter(p, filter));
  let feat = filter === 'All' && !showAll;
  if (feat) {
    const fp = FEAT.map(id => ps.find(p => p.id === id)).filter(Boolean);
    if (fp.length) ps = fp; else feat = false;
  }
  more.innerHTML = (feat && ps.length < allProjects.length)
    ? `<button class="fbtn showall" onclick="showAllProjects()">Show all ${allProjects.length} projects</button><p class="pcnote">Featured projects are shown first.</p>` : '';
  if (!ps.length) { g.innerHTML = '<div class="empty"><span>📂</span>No projects in this category yet.</div>'; return; }
  g.innerHTML = ps.map((p, i) => {
    const gh = safe(ghUrl(p)), fu = safe(p.file_url), viewUrl = getViewUrl(fu), tm = getToolMeta(p.tools);
    return `
      <div class="pc fu" style="transition-delay:${Math.min(i,8)*.04}s">
        <div class="ptop" style="background:${tm.color}">
          <div class="ptag">${tm.icon} ${esc(tm.label)}</div>
          <div class="pname">${esc(p.title)}</div>
        </div>
        <div class="pbdy">
          <p class="pdsc">${esc(p.description)}</p>
          <div class="ptls">${(p.tools||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<span class="tbdg">${esc(x)}</span>`).join('')}</div>
          <div class="plnks">
            ${gh ? `<a href="${esc(gh)}" target="_blank" rel="noopener" class="plnk">View on GitHub →</a>` : ''}
            ${viewUrl ? `<a href="${esc(viewUrl)}" target="_blank" rel="noopener" class="pol">👁 Open File</a>` : ''}
            ${!viewUrl && fu ? `<a href="${esc(fu)}" target="_blank" rel="noopener" download class="pdl">⬇ Download</a>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
  g.querySelectorAll('.fu').forEach(el => { obs.observe(el); setTimeout(() => el.classList.add('vis'), 80); });
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


// ── INTERSECTION OBSERVER ─────────────────────────────────────
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); } });
}, { threshold:.1 });
document.querySelectorAll('.fu').forEach(el => obs.observe(el));
setTimeout(() => document.querySelectorAll('#hero .fu').forEach(el => el.classList.add('vis')), 100);


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
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('subbtn');
  const originalText = btn.textContent;
  btn.textContent = 'Sending…'; btn.disabled = true;

  fetch(form.action, {
    method: 'POST',
    body: new FormData(form),
    headers: { 'Accept': 'application/json' }
  })
  .then(res => {
    if (res.ok) {
      btn.textContent = '✓ Sent!'; btn.style.background = '#d4edda'; btn.style.color = '#155724';
      form.reset();
    } else {
      btn.textContent = '⚠ Failed — try again'; btn.style.background = '#f8d7da'; btn.style.color = '#721c24';
    }
  })
  .catch(() => {
    btn.textContent = '⚠ Failed — try again'; btn.style.background = '#f8d7da'; btn.style.color = '#721c24';
  })
  .finally(() => {
    setTimeout(() => {
      btn.textContent = originalText; btn.style.background = ''; btn.style.color = ''; btn.disabled = false;
    }, 3000);
  });
}


// ── INIT ──────────────────────────────────────────────────────
renderP();
