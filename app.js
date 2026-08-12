// ============================================================
// CONFIG - paste your deployed Google Apps Script Web App URL here
// ============================================================
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycby3evz5ec4qSyJtByXHMkyte0C_YnGAPkWiifT-sjb9Q7TVBfc3SjsBorbAocsb3krC/exec'
};

// ============================================================
// STATE
// ============================================================
let SESSION = JSON.parse(localStorage.getItem('sf_session') || 'null');
let activeTab = null;
let areaDrilldownBranch = null; // for admin/area: which branch is expanded

// ============================================================
// API HELPER
// ============================================================
async function api(action, payload = {}) {
  const body = { action, token: SESSION ? SESSION.token : null, ...payload };
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Kuch galat ho gaya');
  return data;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function money(n) {
  n = Number(n) || 0;
  return '₹' + n.toLocaleString('en-IN');
}

// ============================================================
// LOGIN
// ============================================================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Logging in...';
  try {
    const data = await api('login', { phone, password });
    SESSION = data;
    localStorage.setItem('sf_session', JSON.stringify(SESSION));
    boot();
    if (SESSION.mustChangePassword) openPwModal(true);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = 'Login';
  }
});

document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('sf_session');
  SESSION = null;
  location.reload();
});

// ---- change password modal ----
function openPwModal(forced = false) {
  document.getElementById('pwModal').classList.remove('hidden');
  document.getElementById('pwCancel').style.display = forced ? 'none' : 'inline-block';
  document.getElementById('oldPwField').style.display = forced ? 'none' : 'block';
}
document.getElementById('btnChangePw').addEventListener('click', () => openPwModal(false));
document.getElementById('pwCancel').addEventListener('click', () => document.getElementById('pwModal').classList.add('hidden'));
document.getElementById('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const oldPw = document.getElementById('oldPw').value;
  const newPw = document.getElementById('newPw').value;
  const errEl = document.getElementById('pwError');
  errEl.classList.add('hidden');
  try {
    await api('changePassword', { oldPassword: oldPw, newPassword: newPw, skipOldCheck: !!SESSION.mustChangePassword });
    SESSION.mustChangePassword = false;
    localStorage.setItem('sf_session', JSON.stringify(SESSION));
    document.getElementById('pwModal').classList.add('hidden');
    document.getElementById('pwForm').reset();
    toast('Password change ho gaya');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// ============================================================
// BOOT / ROUTING
// ============================================================
function boot() {
  if (!SESSION) return;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userName').textContent = SESSION.name;
  document.getElementById('userMeta').textContent =
    SESSION.role === 'branch' ? `Branch: ${SESSION.branch}` :
    SESSION.role === 'area' ? `Area: ${SESSION.area}` : 'Admin';

  const tabs = SESSION.role === 'branch'
    ? [['collection', 'Collection'], ['disburse', 'Loan Disbursed'], ['summary', 'Summary']]
    : SESSION.role === 'area'
    ? [['areaOverview', 'Overview']]
    : [['adminOverview', 'Overview'], ['staff', 'Staff'], ['logs', 'Logs']];

  const nav = document.getElementById('tabNav');
  nav.innerHTML = '';
  tabs.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'tab-btn'; b.textContent = label;
    b.onclick = () => { activeTab = key; render(); };
    b.dataset.key = key;
    nav.appendChild(b);
  });
  activeTab = tabs[0][0];
  render();
}

function render() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.key === activeTab));
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="muted">Load ho raha hai...</p>';
  if (activeTab === 'collection') renderCollection();
  else if (activeTab === 'disburse') renderDisburse();
  else if (activeTab === 'summary') renderBranchSummary();
  else if (activeTab === 'areaOverview') renderAreaOverview();
  else if (activeTab === 'adminOverview') renderAdminOverview();
  else if (activeTab === 'staff') renderStaff();
  else if (activeTab === 'logs') renderLogs();
}

// ============================================================
// BRANCH: COLLECTION
// ============================================================
let selectedGroup = null;

async function renderCollection() {
  const main = document.getElementById('mainContent');
  try {
    const { groups } = await api('getGroups');
    let html = `<div class="card">
      <h3>Group Select Karein</h3>
      <div class="field"><select id="groupSelect">
        <option value="">-- Group चुनें --</option>
        ${groups.map(g => `<option value="${escapeHtml(g)}" ${g === selectedGroup ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
      </select></div>
    </div>
    <div id="custList"></div>`;
    main.innerHTML = html;
    document.getElementById('groupSelect').addEventListener('change', (e) => {
      selectedGroup = e.target.value;
      loadCustomersForGroup();
    });
    if (selectedGroup) loadCustomersForGroup();
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadCustomersForGroup() {
  const wrap = document.getElementById('custList');
  if (!selectedGroup) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<p class="muted">Load ho raha hai...</p>';
  try {
    const { customers } = await api('getCustomers', { group: selectedGroup });
    if (customers.length === 0) {
      wrap.innerHTML = '<div class="empty-state">Is group me koi customer nahi hai</div>';
      return;
    }
    wrap.innerHTML = customers.map(c => `
      <div class="cust-row" data-id="${c.customerId}">
        <div class="cust-info">
          <div class="cust-name">${escapeHtml(c.name)}</div>
          <div class="cust-sub">${escapeHtml(c.husbandName || '')} · Loan ${money(c.loanAmt)} · EMI ${escapeHtml(String(c.emi))}</div>
          <div class="cust-outstanding">Outstanding: <b>${money(c.currentOutstanding)}</b></div>
        </div>
        <div class="cust-action">
          <input type="number" min="1" placeholder="Amt" class="putAmtInput" />
          <button class="btn-submit-row">Submit</button>
        </div>
      </div>`).join('');

    wrap.querySelectorAll('.cust-row').forEach(row => {
      const id = row.dataset.id;
      const btn = row.querySelector('.btn-submit-row');
      const input = row.querySelector('.putAmtInput');
      btn.addEventListener('click', async () => {
        const amt = Number(input.value);
        if (!amt || amt <= 0) { toast('Sahi amount dalein', true); return; }
        btn.disabled = true; btn.textContent = '...';
        try {
          const data = await api('submitCollection', { customerId: id, putAmt: amt });
          row.querySelector('.cust-outstanding').innerHTML = `Outstanding: <b>${money(data.newOutstanding)}</b>`;
          row.querySelector('.cust-action').innerHTML = `<span class="badge-done">Submit ho gaya ✓</span>`;
          toast('Collection submit ho gaya');
        } catch (err) {
          toast(err.message, true);
          btn.disabled = false; btn.textContent = 'Submit';
        }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// BRANCH: LOAN DISBURSED
// ============================================================
async function renderDisburse() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Naya Loan Disburse Karein</h3>
    <form id="disburseForm">
      <div class="field-row">
        <div class="field"><label>Day</label>
          <select id="d_day">
            <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
            <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option>
          </select>
        </div>
        <div class="field"><label>Group Name</label><input id="d_group" required /></div>
      </div>
      <div class="field"><label>Customer Name</label><input id="d_name" required /></div>
      <div class="field-row">
        <div class="field"><label>Husband Name</label><input id="d_husband" /></div>
        <div class="field"><label>Phone No</label><input id="d_phone" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Disb Date</label><input type="date" id="d_date" required /></div>
        <div class="field"><label>Loan Amt</label><input type="number" id="d_loanamt" required /></div>
      </div>
      <div class="field"><label>EMI</label><input id="d_emi" /></div>
      <div class="field-row">
        <div class="field"><label>Aadhar No</label><input id="d_aadhar" /></div>
        <div class="field"><label>Pan No</label><input id="d_pan" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>A/C No</label><input id="d_ac" /></div>
        <div class="field"><label>IFSC Code</label><input id="d_ifsc" /></div>
      </div>
      <button class="btn-primary" type="submit">Loan Disburse Karein</button>
      <p id="disburseError" class="error hidden"></p>
    </form>
  </div>
  <div class="card"><h3>Recent Disbursements</h3><div id="recentDisb"><p class="muted">Load ho raha hai...</p></div></div>`;

  document.getElementById('disburseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('disburseError');
    errEl.classList.add('hidden');
    const payload = {
      day: val('d_day'), groupName: val('d_group'), customerName: val('d_name'),
      husbandName: val('d_husband'), phNo: val('d_phone'), disbDate: val('d_date'),
      loanAmt: val('d_loanamt'), emi: val('d_emi'), aadharNo: val('d_aadhar'),
      panNo: val('d_pan'), acNo: val('d_ac'), ifscCode: val('d_ifsc')
    };
    try {
      await api('addDisbursement', payload);
      toast('Loan disburse ho gaya');
      e.target.reset();
      loadRecentDisb();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
  loadRecentDisb();
}

function val(id) { return document.getElementById(id).value; }

async function loadRecentDisb() {
  const wrap = document.getElementById('recentDisb');
  try {
    const { recentDisbursements } = await api('getBranchSummary');
    if (!recentDisbursements.length) { wrap.innerHTML = '<div class="empty-state">Abhi tak koi disbursement nahi</div>'; return; }
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Naam</th><th>Group</th><th>Amt</th><th>Date</th></tr></thead><tbody>
      ${recentDisbursements.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.LoanAmt)}</td><td>${escapeHtml(String(r.DisbDate))}</td></tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// BRANCH: SUMMARY
// ============================================================
async function renderBranchSummary() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getBranchSummary');
    main.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Total Customers</div><div class="value">${s.customerCount}</div></div>
      <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(s.totalOutstanding)}</div></div>
      <div class="stat-card"><div class="label">Aaj Collection</div><div class="value green">${money(s.todayCollectionTotal)}</div></div>
      <div class="stat-card"><div class="label">Aaj Collection Count</div><div class="value">${s.todayCollectionCount}</div></div>
    </div>
    <div class="card"><h3>Recent Collections</h3>
      ${s.recentCollections.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Group</th><th>Amt</th><th>Staff</th></tr></thead><tbody>
        ${s.recentCollections.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state">Abhi tak koi collection nahi</div>'}
    </div>`;
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// AREA OVERVIEW
// ============================================================
async function renderAreaOverview() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getAreaSummary');
    if (areaDrilldownBranch) {
      const b = s.branches.find(x => x.branch === areaDrilldownBranch);
      main.innerHTML = branchDetailHtml(b, true);
      document.getElementById('backBtn').onclick = () => { areaDrilldownBranch = null; renderAreaOverview(); };
      return;
    }
    main.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Area</div><div class="value">${escapeHtml(s.area)}</div></div>
      <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(s.totalOutstanding)}</div></div>
      <div class="stat-card"><div class="label">Aaj Collection</div><div class="value green">${money(s.todayCollectionTotal)}</div></div>
    </div>
    <div class="card"><h3>Branches</h3>
      ${s.branches.map(b => `
        <div class="branch-list-item" data-b="${escapeHtml(b.branch)}">
          <div><div class="name">${escapeHtml(b.branch)}</div><div class="sub">${b.customerCount} customers · Aaj ${money(b.todayCollectionTotal)}</div></div>
          <div class="amt">${money(b.totalOutstanding)}</div>
        </div>`).join('')}
    </div>`;
    main.querySelectorAll('.branch-list-item').forEach(el => {
      el.addEventListener('click', () => { areaDrilldownBranch = el.dataset.b; renderAreaOverview(); });
    });
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function branchDetailHtml(b, showBack) {
  if (!b) return '<p class="muted">Data nahi mila</p>';
  return `
  ${showBack ? `<button id="backBtn" class="back-link">&larr; Branch list par wapas jaayein</button>` : ''}
  <div class="stat-grid">
    <div class="stat-card"><div class="label">Branch</div><div class="value">${escapeHtml(b.branch)}</div></div>
    <div class="stat-card"><div class="label">Customers</div><div class="value">${b.customerCount}</div></div>
    <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(b.totalOutstanding)}</div></div>
    <div class="stat-card"><div class="label">Aaj Collection</div><div class="value green">${money(b.todayCollectionTotal)}</div></div>
  </div>
  <div class="card"><h3>Recent Collections</h3>
    ${b.recentCollections.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Group</th><th>Amt</th><th>Staff</th></tr></thead><tbody>
      ${b.recentCollections.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty-state">Abhi tak koi collection nahi</div>'}
  </div>
  <div class="card"><h3>Recent Disbursements</h3>
    ${b.recentDisbursements.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Group</th><th>Amt</th></tr></thead><tbody>
      ${b.recentDisbursements.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.LoanAmt)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty-state">Abhi tak koi disbursement nahi</div>'}
  </div>`;
}

// ============================================================
// ADMIN OVERVIEW
// ============================================================
let adminDrilldownArea = null;

async function renderAdminOverview() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getAdminSummary');
    if (areaDrilldownBranch) {
      const area = s.areas.find(a => a.area === adminDrilldownArea);
      const b = area.branches.find(x => x.branch === areaDrilldownBranch);
      main.innerHTML = branchDetailHtml(b, true);
      document.getElementById('backBtn').onclick = () => { areaDrilldownBranch = null; renderAdminOverview(); };
      return;
    }
    if (adminDrilldownArea) {
      const area = s.areas.find(a => a.area === adminDrilldownArea);
      main.innerHTML = `
      <button id="backBtn2" class="back-link">&larr; Sabhi Areas par wapas jaayein</button>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Area</div><div class="value">${escapeHtml(area.area)}</div></div>
        <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(area.totalOutstanding)}</div></div>
        <div class="stat-card"><div class="label">Aaj Collection</div><div class="value green">${money(area.todayCollectionTotal)}</div></div>
      </div>
      <div class="card"><h3>Branches</h3>
        ${area.branches.map(b => `
          <div class="branch-list-item" data-b="${escapeHtml(b.branch)}">
            <div><div class="name">${escapeHtml(b.branch)}</div><div class="sub">${b.customerCount} customers · Aaj ${money(b.todayCollectionTotal)}</div></div>
            <div class="amt">${money(b.totalOutstanding)}</div>
          </div>`).join('')}
      </div>`;
      document.getElementById('backBtn2').onclick = () => { adminDrilldownArea = null; renderAdminOverview(); };
      main.querySelectorAll('.branch-list-item').forEach(el => {
        el.addEventListener('click', () => { areaDrilldownBranch = el.dataset.b; renderAdminOverview(); });
      });
      return;
    }
    main.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Grand Total Outstanding</div><div class="value">${money(s.grandTotalOutstanding)}</div></div>
      <div class="stat-card"><div class="label">Aaj Total Collection</div><div class="value green">${money(s.grandTodayCollection)}</div></div>
    </div>
    <div class="card"><h3>Areas</h3>
      ${s.areas.map(a => `
        <div class="branch-list-item" data-a="${escapeHtml(a.area)}">
          <div><div class="name">${escapeHtml(a.area)}</div><div class="sub">${a.branches.length} branches · Aaj ${money(a.todayCollectionTotal)}</div></div>
          <div class="amt">${money(a.totalOutstanding)}</div>
        </div>`).join('')}
    </div>`;
    main.querySelectorAll('.branch-list-item').forEach(el => {
      el.addEventListener('click', () => { adminDrilldownArea = el.dataset.a; renderAdminOverview(); });
    });
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// ADMIN: STAFF MANAGEMENT
// ============================================================
async function renderStaff() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Naya Staff Add Karein</h3>
    <form id="staffForm">
      <div class="field"><label>Naam</label><input id="s_name" required /></div>
      <div class="field"><label>Phone (Login ID)</label><input id="s_phone" required /></div>
      <div class="field"><label>Role</label>
        <select id="s_role">
          <option value="branch">Branch Staff</option>
          <option value="area">Area Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="field" id="s_branchField"><label>Branch</label><input id="s_branch" /></div>
      <div class="field" id="s_areaField"><label>Area</label><input id="s_area" /></div>
      <button class="btn-primary" type="submit">Staff Add Karein</button>
      <p class="muted">Default password: <b>Sampoorn</b> (staff ko pehli login par change karna hoga)</p>
      <p id="staffError" class="error hidden"></p>
    </form>
  </div>
  <div class="card"><h3>Sabhi Staff</h3><div id="staffListWrap"><p class="muted">Load ho raha hai...</p></div></div>`;

  document.getElementById('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('staffError');
    errEl.classList.add('hidden');
    try {
      await api('addStaff', {
        name: val('s_name'), phone: val('s_phone'), role: val('s_role'),
        branch: val('s_branch'), area: val('s_area')
      });
      toast('Staff add ho gaya');
      e.target.reset();
      loadStaffList();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
  loadStaffList();
}

async function loadStaffList() {
  const wrap = document.getElementById('staffListWrap');
  try {
    const { staff } = await api('getStaffList');
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Naam</th><th>Phone</th><th>Role</th><th>Branch/Area</th><th></th></tr></thead><tbody>
      ${staff.map(s => `<tr>
        <td>${escapeHtml(s.name)}</td><td>${escapeHtml(String(s.phone))}</td><td>${escapeHtml(s.role)}</td>
        <td>${escapeHtml(s.branch || s.area || '-')}</td>
        <td><button class="btn-ghost resetBtn" data-p="${escapeHtml(String(s.phone))}" style="color:#0E2A3D;border-color:#E4E9ED;">Reset PW</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
    wrap.querySelectorAll('.resetBtn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await api('resetStaffPassword', { phone: b.dataset.p });
          toast('Password reset ho gaya -> Sampoorn');
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// ADMIN: LOGS
// ============================================================
async function renderLogs() {
  const main = document.getElementById('mainContent');
  try {
    const { collections, disbursements } = await api('getLogs');
    main.innerHTML = `
    <div class="card"><h3>Recent Collections (last 200)</h3>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th><th>Staff</th></tr></thead><tbody>
        ${collections.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="card"><h3>Recent Disbursements (last 200)</h3>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th></tr></thead><tbody>
        ${disbursements.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.LoanAmt)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// UTIL
// ============================================================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function fmtDate(d) {
  try { return new Date(d).toLocaleString('en-IN'); } catch { return String(d); }
}

// ============================================================
// INIT
// ============================================================
if (SESSION) boot();
