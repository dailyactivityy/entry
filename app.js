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

// ---- Roles ----
const BRANCH_ROLES = ['CO', 'SCO', 'BM'];       // work inside a single branch
const AREA_ROLE = 'AM';                          // heads all branches in an area
const ALL_BRANCH_ROLES = ['AUDIT', 'HO', 'ADMIN']; // see every branch/area
const ROLE_LABELS = { CO: 'C.O', SCO: 'S.C.O', BM: 'B.M', AM: 'A.M', AUDIT: 'Audit', HO: 'H.O', ADMIN: 'Admin' };
const LEGACY_ROLE_MAP = { BRANCH: 'BM', AREA: 'AM', ADMIN: 'ADMIN' };
function normRole(role) {
  const r = String(role || '').trim().toUpperCase();
  return LEGACY_ROLE_MAP[r] || r;
}

// ============================================================
// AUTO-CAPITALIZE ALL TEXT TYPED IN THE APP
// Any plain text input (name, address, group, aadhar, pan, ifsc, etc.)
// is automatically converted to CAPITAL letters as the user types.
// Number/date/password/tel inputs are left untouched.
// ============================================================
document.addEventListener('input', (e) => {
  const el = e.target;
  const isPlainTextInput = el.tagName === 'INPUT' && (el.type === 'text' || el.type === '' || el.type === undefined);
  const isTextarea = el.tagName === 'TEXTAREA';
  if (!isPlainTextInput && !isTextarea) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const upper = el.value.toUpperCase();
  if (upper === el.value) return;
  el.value = upper;
  if (start !== null && end !== null) el.setSelectionRange(start, end);
});

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
  if (!data.ok) throw new Error(data.error || 'Something went wrong');
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
// Used in daily-sheet tables: an actual zero/empty amount shows blank, not "₹0" / "0".
function moneyOrBlank(n) {
  n = Number(n) || 0;
  return n === 0 ? '' : money(n);
}
function numOrBlank(n) {
  n = Number(n) || 0;
  return n === 0 ? '' : String(n);
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

// ---- Hamburger menu (sidebar drawer) ----
function closeNav() {
  document.getElementById('tabNav').classList.remove('open');
  document.getElementById('navOverlay').classList.add('hidden');
}
function toggleNav() {
  document.getElementById('tabNav').classList.toggle('open');
  document.getElementById('navOverlay').classList.toggle('hidden');
}
document.getElementById('btnMenuToggle').addEventListener('click', toggleNav);
document.getElementById('navOverlay').addEventListener('click', closeNav);
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
    toast('Password changed successfully');
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

  const role = normRole(SESSION.role);
  const roleLabel = ROLE_LABELS[role] || SESSION.role;
  document.getElementById('userMeta').textContent =
    BRANCH_ROLES.includes(role) ? `${roleLabel} · Branch: ${SESSION.branch}` :
    role === AREA_ROLE ? `${roleLabel} · Area: ${SESSION.area}` :
    roleLabel;

  let tabs;
  if (BRANCH_ROLES.includes(role)) {
    tabs = [['collection', 'Collection'], ['dailysheet', 'Dailysheet'], ['disburse', 'Loan Disbursed'],
       ['summary', 'Summary'], ['creategroup', 'Create Group'], ['transaction', 'Transaction'], ['report', 'Report']];
  } else if (role === AREA_ROLE) {
    tabs = [['areaOverview', 'Overview'], ['amCollection', 'Collection'], ['amDailysheet', 'Dailysheet'],
       ['amDisburse', 'Loan Disbursed'], ['amTransaction', 'Transaction'], ['report', 'Report']];
  } else if (role === 'ADMIN') {
    tabs = [['adminOverview', 'Overview'], ['staff', 'Staff'], ['logs', 'Logs'], ['report', 'Report']];
  } else {
    // AUDIT / H.O - read-only across all branches
    tabs = [['adminOverview', 'Overview'], ['report', 'Report']];
  }

  const tabList = document.getElementById('tabList');
  tabList.innerHTML = '';
  tabs.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'tab-btn'; b.textContent = label;
    b.onclick = () => { activeTab = key; render(); closeNav(); };
    b.dataset.key = key;
    tabList.appendChild(b);
  });
  activeTab = tabs[0][0];
  render();
}

function render() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.key === activeTab));
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="muted">Loading...</p>';
  if (activeTab === 'collection') renderCollection();
  else if (activeTab === 'dailysheet') renderDailySheet();
  else if (activeTab === 'disburse') renderDisburse();
  else if (activeTab === 'summary') renderBranchSummary();
  else if (activeTab === 'creategroup') renderCreateGroup();
  else if (activeTab === 'transaction') renderTransaction();
  else if (activeTab === 'areaOverview') renderAreaOverview();
  else if (activeTab === 'amCollection') renderAMCollection();
  else if (activeTab === 'amDailysheet') renderAMDailySheet();
  else if (activeTab === 'amDisburse') renderAMDisburse();
  else if (activeTab === 'amTransaction') renderAMTransaction();
  else if (activeTab === 'adminOverview') renderAdminOverview();
  else if (activeTab === 'staff') renderStaff();
  else if (activeTab === 'logs') renderLogs();
  else if (activeTab === 'report') renderReport();
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
      <h3>Select Group</h3>
      <div class="field"><select id="groupSelect">
        <option value="">-- Select Group --</option>
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
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { customers } = await api('getCustomers', { group: selectedGroup });
    if (customers.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No customers in this group</div>';
      return;
    }
    wrap.innerHTML = customers.map(c => {
      const emiNum = Number(c.emi);
      const hasEmi = isFinite(emiNum) && String(c.emi).trim() !== '';
      const outstanding = Number(c.currentOutstanding) || 0;
      const prefill = hasEmi ? Math.max(0, Math.min(emiNum, outstanding)) : '';
      const locked = c.collectedToday;
      return `
      <div class="cust-row" data-id="${c.customerId}">
        <div class="cust-info">
          <div class="cust-name">${escapeHtml(c.name)}</div>
          <div class="cust-sub">${escapeHtml(c.husbandName || '')} · Loan ${money(c.loanAmt)} · EMI ${escapeHtml(String(c.emi))}</div>
          <div class="cust-outstanding">Outstanding: <b>${money(c.currentOutstanding)}</b></div>
        </div>
        <div class="cust-action">
          ${locked
            ? `<span class="badge-done">Submitted ✓ (${money(c.collectedAmt)})</span>`
            : `<input type="number" min="0" placeholder="Amt" class="putAmtInput" value="${prefill}" />
               <button class="btn-submit-row">Submit</button>`}
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('.cust-row').forEach(row => {
      const id = row.dataset.id;
      const btn = row.querySelector('.btn-submit-row');
      if (!btn) return; // already submitted today - locked, nothing to wire up
      const input = row.querySelector('.putAmtInput');
      btn.addEventListener('click', async () => {
        const amt = Number(input.value);
        if (input.value === '' || isNaN(amt) || amt < 0) { toast('Please enter a valid amount (0 or more)', true); return; }
        btn.disabled = true; btn.textContent = '...';
        try {
          const data = await api('submitCollection', { customerId: id, putAmt: amt });
          row.querySelector('.cust-outstanding').innerHTML = `Outstanding: <b>${money(data.newOutstanding)}</b>`;
          row.querySelector('.cust-action').innerHTML = `<span class="badge-done">Submitted ✓ (${money(amt)})</span>`;
          toast('Collection submitted');
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
// BRANCH: DAILYSHEET
// ============================================================
async function renderDailySheet() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getDailySheet');
    const cols = [
      ['groupName', 'Group Name', false],
      ['realizable', 'Realizable', true],
      ['realised', 'Realised', true],
      ['advance', 'Advance', true],
      ['overdue', 'Overdue', true],
      ['loanCloser', 'Loan Closer', true],
      ['netCollection', 'Net Collection', true],
      ['fulpaidNo', 'Fulpaid No', false],
      ['loanNo', 'Loan No', false],
      ['loanAmt', 'Loan Amt', true]
    ];
    const fmt = (key, val) => key === 'groupName' ? escapeHtml(val) : (key.toLowerCase().includes('no') ? numOrBlank(val) : moneyOrBlank(val));

    main.innerHTML = `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <h3 style="margin:0;">Today's Overview</h3>
      <div class="muted">${escapeHtml(s.dateLabel)}</div>
    </div>
    <div class="card">
      ${s.rows.length ? `<div class="table-wrap"><table>
        <thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>
          ${s.rows.map(r => `<tr>${cols.map(([key]) => `<td>${fmt(key, r[key])}</td>`).join('')}</tr>`).join('')}
          <tr style="font-weight:800; border-top:2px solid var(--navy);">
            <td>Total</td>
            <td>${moneyOrBlank(s.total.realizable)}</td>
            <td>${moneyOrBlank(s.total.realised)}</td>
            <td>${moneyOrBlank(s.total.advance)}</td>
            <td>${moneyOrBlank(s.total.overdue)}</td>
            <td>${moneyOrBlank(s.total.loanCloser)}</td>
            <td>${moneyOrBlank(s.total.netCollection)}</td>
            <td>${numOrBlank(s.total.fulpaidNo)}</td>
            <td>${numOrBlank(s.total.loanNo)}</td>
            <td>${moneyOrBlank(s.total.loanAmt)}</td>
          </tr>
        </tbody>
      </table></div>` : '<div class="empty-state">No group activity for today yet</div>'}
    </div>`;
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// BRANCH: LOAN DISBURSED
// ============================================================
async function renderDisburse() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Add New Loan Disbursement</h3>
    <form id="disburseForm">
      <div class="field-row">
        <div class="field"><label>Day</label>
          <select id="d_day">
            <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
            <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option>
          </select>
        </div>
        <div class="field"><label>Group Name</label>
          <select id="d_group" required>
            <option value="">-- Select Group --</option>
          </select>
        </div>
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
      <button class="btn-primary" type="submit">Disburse Loan</button>
      <p id="disburseError" class="error hidden"></p>
    </form>
  </div>
  <div class="card"><h3>Recent Disbursements</h3><div id="recentDisb"><p class="muted">Loading...</p></div></div>`;

  document.getElementById('d_day').addEventListener('change', loadGroupsForDay);
  loadGroupsForDay(); // load groups for the default selected day

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
    if (!payload.groupName) { errEl.textContent = 'Please select a group'; errEl.classList.remove('hidden'); return; }
    try {
      await api('addDisbursement', payload);
      toast('Loan disbursed successfully');
      e.target.reset();
      loadGroupsForDay();
      loadRecentDisb();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
  loadRecentDisb();
}

async function loadGroupsForDay() {
  const day = val('d_day');
  try {
    const { groups } = await api('getGroups', { day });
    const sel = document.getElementById('d_group');
    if (sel) sel.innerHTML = `<option value="">-- Select Group --</option>` + groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
  } catch (err) {
    // silently ignore - group list is a convenience, not required for the rest of the form
  }
}

function val(id) { return document.getElementById(id).value; }

async function loadRecentDisb() {
  const wrap = document.getElementById('recentDisb');
  try {
    const { recentDisbursements } = await api('getBranchSummary');
    if (!recentDisbursements.length) { wrap.innerHTML = '<div class="empty-state">No disbursements yet</div>'; return; }
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Group</th><th>Amt</th><th>Date</th></tr></thead><tbody>
      ${recentDisbursements.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.LoanAmt)}</td><td>${escapeHtml(String(r.DisbDate))}</td></tr>`).join('')}
    </tbody></table></div>`;
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// BRANCH: SUMMARY
// ============================================================
// Shared stat-card grid used by Branch Summary, Area Overview, Admin Overview and branch drill-down.
function statCardsHtml(s) {
  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Total Customers</div><div class="value">${s.customerCount}</div></div>
      <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(s.totalOutstanding)}</div></div>
      <div class="stat-card"><div class="label">Today's Collection</div><div class="value green">${money(s.todayCollectionTotal)}</div></div>
      <div class="stat-card"><div class="label">Today's Collection Count</div><div class="value">${s.todayCollectionCount}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Realizable Amt</div><div class="value">${money(s.realizableAmt)}</div></div>
      <div class="stat-card"><div class="label">Realizable No</div><div class="value">${s.realizableNo}</div></div>
      <div class="stat-card"><div class="label">Overdue No</div><div class="value">${s.overdueNo}</div></div>
      <div class="stat-card"><div class="label">Overdue Outstanding</div><div class="value">${money(s.overdueOutstanding)}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Death No</div><div class="value">${s.deathNo}</div></div>
      <div class="stat-card"><div class="label">Death Outstanding</div><div class="value">${money(s.deathOutstanding)}</div></div>
    </div>
    ${s.closeCash !== undefined ? `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Open Cash</div><div class="value">${money(s.openCash)}</div></div>
      <div class="stat-card"><div class="label">Close Cash</div><div class="value green">${money(s.closeCash)}</div></div>
      <div class="stat-card"><div class="label">Ledger Customers</div><div class="value">${s.ledgerCustomers}</div></div>
      <div class="stat-card"><div class="label">Ledger Outstanding</div><div class="value">${money(s.ledgerOutstanding)}</div></div>
    </div>` : ''}`;
}

async function renderBranchSummary() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getBranchSummary');
    main.innerHTML = statCardsHtml(s);
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// BRANCH: CREATE GROUP
// ============================================================
async function renderCreateGroup() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Create Group</h3>
    <form id="createGroupForm">
      <div class="field"><label>Select Day</label>
        <select id="cg_day">
          <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
          <option>Thursday</option><option>Friday</option>
        </select>
      </div>
      <div class="field"><label>Group / Place Name</label><input id="cg_name" required /></div>
      <div class="field"><label>Address</label><input id="cg_address" /></div>
      <button class="btn-primary" type="submit">Create Group</button>
      <p id="cgError" class="error hidden"></p>
    </form>
  </div>`;

  document.getElementById('createGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('cgError');
    errEl.classList.add('hidden');
    try {
      await api('createGroup', { day: val('cg_day'), groupName: val('cg_name'), address: val('cg_address') });
      toast('Group created successfully');
      e.target.reset();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ============================================================
// BRANCH: TRANSACTION
// ============================================================
async function renderTransaction() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Bank Transaction Entry</h3>
    <form id="transactionForm">
      <div class="field-row">
        <div class="field"><label>PNB Deposit</label><input type="number" min="0" id="tx_pnbdep" value="0" /></div>
        <div class="field"><label>HDFC Deposit</label><input type="number" min="0" id="tx_hdfcdep" value="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>PNB UPI</label><input type="number" min="0" id="tx_pnbupi" value="0" /></div>
        <div class="field"><label>HDFC UPI</label><input type="number" min="0" id="tx_hdfcupi" value="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Misc Income</label><input type="number" min="0" id="tx_miscinc" value="0" /></div>
        <div class="field"><label>Misc Expense</label><input type="number" min="0" id="tx_miscexp" value="0" /></div>
      </div>
      <button class="btn-primary" type="submit">Submit</button>
      <p id="txError" class="error hidden"></p>
    </form>
  </div>`;

  document.getElementById('transactionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('txError');
    errEl.classList.add('hidden');
    try {
      await api('submitTransaction', {
        pnbDeposit: val('tx_pnbdep'), hdfcDeposit: val('tx_hdfcdep'),
        pnbUpi: val('tx_pnbupi'), hdfcUpi: val('tx_hdfcupi'),
        miscInc: val('tx_miscinc'), miscExp: val('tx_miscexp')
      });
      toast('Transaction submitted');
      e.target.reset();
      document.getElementById('tx_pnbdep').value = 0;
      document.getElementById('tx_hdfcdep').value = 0;
      document.getElementById('tx_pnbupi').value = 0;
      document.getElementById('tx_hdfcupi').value = 0;
      document.getElementById('tx_miscinc').value = 0;
      document.getElementById('tx_miscexp').value = 0;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
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
      wireOpenCashCard();
      return;
    }
    main.innerHTML = `
    <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">${escapeHtml(s.area)} Area</h3></div>
    ${statCardsHtml(s)}
    <div class="card"><h3>Branches</h3>
      ${s.branches.map(b => `
        <div class="branch-list-item" data-b="${escapeHtml(b.branch)}">
          <div><div class="name">${escapeHtml(b.branch)}</div><div class="sub">${b.customerCount} customers · Today ${money(b.todayCollectionTotal)}</div></div>
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
  if (!b) return '<p class="muted">No data found</p>';
  const isAdmin = normRole(SESSION.role) === 'ADMIN';
  return `
  ${showBack ? `<button id="backBtn" class="back-link">&larr; Back to branch list</button>` : ''}
  <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">${escapeHtml(b.branch)}</h3></div>
  ${statCardsHtml(b)}
  ${isAdmin ? `
  <div class="card">
    <h3>Set Open Cash</h3>
    <p class="muted" style="margin-bottom:12px;">Sets the starting cash for this branch on a given date. After that, Open/Close Cash carries forward automatically day to day - only override this if the chain needs correcting.</p>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="oc_date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="field"><label>Open Cash</label><input type="number" id="oc_amt" value="0" /></div>
    </div>
    <button class="btn-primary" type="button" id="oc_save" data-branch="${escapeHtml(b.branch)}">Save Open Cash</button>
    <p id="ocError" class="error hidden"></p>
  </div>` : ''}
  <div class="card"><h3>Recent Collections</h3>
    ${b.recentCollections.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Group</th><th>Amt</th><th>Staff</th></tr></thead><tbody>
      ${b.recentCollections.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty-state">No collections yet</div>'}
  </div>
  <div class="card"><h3>Recent Disbursements</h3>
    ${b.recentDisbursements.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Group</th><th>Amt</th></tr></thead><tbody>
      ${b.recentDisbursements.map(r => `<tr><td>${escapeHtml(r.CustomerName)}</td><td>${escapeHtml(r.GroupName)}</td><td>${money(r.LoanAmt)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty-state">No disbursements yet</div>'}
  </div>`;
}

function wireOpenCashCard() {
  const btn = document.getElementById('oc_save');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const errEl = document.getElementById('ocError');
    errEl.classList.add('hidden');
    try {
      await api('saveOpenCash', { branch: btn.dataset.branch, date: val('oc_date'), openCash: val('oc_amt') });
      toast('Open Cash saved');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ============================================================
// Generic popup (used by A.M drill-down views)
// ============================================================
function showPopup(titleHtml, bodyHtml) {
  const existing = document.getElementById('genericPopup');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'genericPopup';
  div.className = 'modal';
  div.innerHTML = `<div class="modal-card" style="max-width:680px; max-height:85vh; overflow-y:auto;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:12px;">
      <h3 style="margin:0;">${titleHtml}</h3>
      <button id="genericPopupClose" class="btn-ghost">Close</button>
    </div>
    <div>${bodyHtml}</div>
  </div>`;
  document.body.appendChild(div);
  document.getElementById('genericPopupClose').addEventListener('click', () => div.remove());
  div.addEventListener('click', (e) => { if (e.target === div) div.remove(); });
}

// ============================================================
// A.M: COLLECTION - edit/delete already-submitted entries
// ============================================================
let amCollState = { branch: '', group: '', date: '' };

async function renderAMCollection() {
  const main = document.getElementById('mainContent');
  if (!amCollState.date) amCollState.date = new Date().toISOString().slice(0, 10);
  main.innerHTML = `
  <div class="card">
    <h3>Collection</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="am_c_date" value="${amCollState.date}" /></div>
      <div class="field"><label>Branch</label><select id="am_c_branch"><option value="">-- Select Branch --</option></select></div>
    </div>
    <div class="field"><label>Group</label><select id="am_c_group"><option value="">-- Select Group --</option></select></div>
  </div>
  <div id="amCustList"></div>`;

  try {
    const { branches } = await api('getAllowedBranches');
    document.getElementById('am_c_branch').innerHTML = `<option value="">-- Select Branch --</option>` +
      branches.map(b => `<option value="${escapeHtml(b)}" ${b === amCollState.branch ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');
  } catch (err) { toast(err.message, true); }

  document.getElementById('am_c_date').addEventListener('change', (e) => {
    amCollState.date = e.target.value;
    if (amCollState.branch && amCollState.group) loadAMCustomers();
  });
  document.getElementById('am_c_branch').addEventListener('change', async (e) => {
    amCollState.branch = e.target.value; amCollState.group = '';
    document.getElementById('amCustList').innerHTML = '';
    if (!amCollState.branch) return;
    try {
      const { groups } = await api('getGroupsForBranch', { branch: amCollState.branch });
      document.getElementById('am_c_group').innerHTML = `<option value="">-- Select Group --</option>` +
        groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    } catch (err) { toast(err.message, true); }
  });
  document.getElementById('am_c_group').addEventListener('change', (e) => { amCollState.group = e.target.value; loadAMCustomers(); });

  if (amCollState.branch && amCollState.group) loadAMCustomers();
}

async function loadAMCustomers() {
  const wrap = document.getElementById('amCustList');
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { customers } = await api('getGroupCustomersForDate', { branch: amCollState.branch, group: amCollState.group, date: amCollState.date });
    if (!customers.length) { wrap.innerHTML = '<div class="empty-state">No customers in this group</div>'; return; }
    wrap.innerHTML = `<div class="card">` + customers.map(c => `
      <div class="cust-row" data-row="${c.collectionRow || ''}" data-cust="${escapeHtml(c.name)}">
        <div class="cust-info">
          <div class="cust-name">${escapeHtml(c.name)}</div>
          <div class="cust-sub">${escapeHtml(c.husbandName || '')} · Loan ${money(c.loanAmt)} · EMI ${escapeHtml(String(c.emi))}</div>
          <div class="cust-outstanding">Outstanding: <b>${money(c.currentOutstanding)}</b></div>
        </div>
        <div class="cust-action">
          ${c.collectionRow
            ? `<input type="number" min="0" class="amEditInput" value="${c.collectedAmt}" style="width:100px; padding:9px 10px; border:1.5px solid var(--line); border-radius:8px;" />
               <button class="btn-submit-row amEditBtn">Save</button>
               <button class="btn-ghost amDeleteBtn" style="color:#D64545; border-color:var(--line);">Delete</button>`
            : `<span class="muted">Not collected</span>`}
        </div>
      </div>`).join('') + `</div>`;

    wrap.querySelectorAll('.cust-row').forEach(row => {
      const rowNum = row.dataset.row;
      if (!rowNum) return;
      row.querySelector('.amEditBtn').addEventListener('click', async () => {
        const input = row.querySelector('.amEditInput');
        const amt = Number(input.value);
        if (input.value === '' || isNaN(amt) || amt < 0) { toast('Please enter a valid amount', true); return; }
        try {
          await api('updateCollection', { row: Number(rowNum), newAmt: amt });
          toast('Collection updated');
          loadAMCustomers();
        } catch (err) { toast(err.message, true); }
      });
      row.querySelector('.amDeleteBtn').addEventListener('click', async () => {
        const ok = confirm(`Delete this collection for ${row.dataset.cust}? Outstanding will be restored.`);
        if (!ok) return;
        try {
          await api('deleteCollection', { row: Number(rowNum) });
          toast('Collection deleted, outstanding restored');
          loadAMCustomers();
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// A.M: DAILYSHEET - per-branch summary; click a branch for its full sheet
// ============================================================
let amDailyDate = '';

async function renderAMDailySheet() {
  const main = document.getElementById('mainContent');
  if (!amDailyDate) amDailyDate = new Date().toISOString().slice(0, 10);
  main.innerHTML = `
  <div class="card">
    <h3>Dailysheet</h3>
    <div class="field"><label>Date</label><input type="date" id="am_ds_date" value="${amDailyDate}" /></div>
  </div>
  <div id="amDailyResults"><p class="muted">Loading...</p></div>`;
  document.getElementById('am_ds_date').addEventListener('change', (e) => { amDailyDate = e.target.value; loadAMDailySummary(); });
  loadAMDailySummary();
}

async function loadAMDailySummary() {
  const wrap = document.getElementById('amDailyResults');
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const s = await api('getAreaDailySheetSummary', { date: amDailyDate });
    const cols = [
      ['branch', 'Branch'], ['openCash', 'Open Cash'], ['realizable', 'Realizable'], ['realised', 'Realised'],
      ['advance', 'Advance'], ['overdue', 'Overdue'], ['loanCloser', 'Loan Closer'], ['netCollection', 'Net Collection'],
      ['miscInc', 'Misc Inc'], ['totalIncome', 'Total Income'], ['fulpaidNo', 'Fulpaid No'], ['loanNo', 'Loan No'],
      ['loanAmt', 'Loan Amt'], ['transaction', 'Transaction'], ['miscExp', 'Misc Exp'], ['totalExpense', 'Total Expense'],
      ['closeCash', 'Close Cash']
    ];
    const countKeys = ['fulpaidNo', 'loanNo'];

    const branchRowHtml = (r) => cols.map(([key]) => {
      if (key === 'branch') return `<td><a href="#" class="am-branch-link" data-b="${escapeHtml(r.branch)}" style="color:var(--navy); font-weight:700;">${escapeHtml(r.branch)}</a></td>`;
      if (countKeys.includes(key)) return `<td>${numOrBlank(r[key])}</td>`;
      return `<td>${moneyOrBlank(r[key])}</td>`;
    }).join('');

    const totalRowHtml = cols.map(([key]) => {
      if (key === 'branch') return `<td>Total</td>`;
      if (countKeys.includes(key)) return `<td>${numOrBlank(s.total[key])}</td>`;
      return `<td>${moneyOrBlank(s.total[key])}</td>`;
    }).join('');

    wrap.innerHTML = `<div class="card">
      <p class="muted" style="margin-bottom:12px;">Open Cash carries forward automatically from the previous day's Close Cash. Misc Inc/Exp come from Transaction entries. Only Admin can set/correct an Open Cash starting point.</p>
      ${s.branches.length ? `<div class="table-wrap"><table>
        <thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>
          ${s.branches.map(r => `<tr>${branchRowHtml(r)}</tr>`).join('')}
          <tr style="font-weight:800; border-top:2px solid var(--navy);">${totalRowHtml}</tr>
        </tbody>
      </table></div>` : '<div class="empty-state">No branches found</div>'}
    </div>`;

    wrap.querySelectorAll('.am-branch-link').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); openAMBranchDailyPopup(a.dataset.b); });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function openAMBranchDailyPopup(branch) {
  showPopup(escapeHtml(branch), '<p class="muted">Loading...</p>');
  try {
    const s = await api('getAMBranchDailySheet', { branch, date: amDailyDate });
    const cols = [
      ['groupName', 'Group Name', false], ['realizable', 'Realizable', true], ['realised', 'Realised', true],
      ['advance', 'Advance', true], ['overdue', 'Overdue', true], ['loanCloser', 'Loan Closer', true],
      ['netCollection', 'Net Collection', true], ['fulpaidNo', 'Fulpaid No', false],
      ['loanNo', 'Loan No', false], ['loanAmt', 'Loan Amt', true]
    ];
    const fmt = (key, v) => key === 'groupName' ? escapeHtml(v) : (key.toLowerCase().includes('no') ? numOrBlank(v) : moneyOrBlank(v));
    const body = s.rows.length ? `<div class="table-wrap"><table>
        <thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
        <tbody>
          ${s.rows.map(r => `<tr>${cols.map(([key]) => `<td>${fmt(key, r[key])}</td>`).join('')}</tr>`).join('')}
          <tr style="font-weight:800; border-top:2px solid var(--navy);">
            <td>Total</td><td>${moneyOrBlank(s.total.realizable)}</td><td>${moneyOrBlank(s.total.realised)}</td>
            <td>${moneyOrBlank(s.total.advance)}</td><td>${moneyOrBlank(s.total.overdue)}</td><td>${moneyOrBlank(s.total.loanCloser)}</td>
            <td>${moneyOrBlank(s.total.netCollection)}</td><td>${numOrBlank(s.total.fulpaidNo)}</td><td>${numOrBlank(s.total.loanNo)}</td><td>${moneyOrBlank(s.total.loanAmt)}</td>
          </tr>
        </tbody>
      </table></div>` : '<div class="empty-state">No group activity for this date</div>';
    showPopup(escapeHtml(branch), body);
  } catch (err) {
    showPopup(escapeHtml(branch), `<p class="error">${err.message}</p>`);
  }
}

// ============================================================
// A.M: LOAN DISBURSED
// ============================================================
let amDisbState = { branch: '', date: '' };

async function renderAMDisburse() {
  const main = document.getElementById('mainContent');
  if (!amDisbState.date) amDisbState.date = new Date().toISOString().slice(0, 10);
  main.innerHTML = `
  <div class="card">
    <h3>Loan Disbursed</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="am_d_date" value="${amDisbState.date}" /></div>
      <div class="field"><label>Branch</label><select id="am_d_branch"><option value="">-- Select Branch --</option></select></div>
    </div>
    <button class="btn-primary" type="button" id="am_d_load">Load</button>
  </div>
  <div id="amDisbResults"></div>`;

  try {
    const { branches } = await api('getAllowedBranches');
    document.getElementById('am_d_branch').innerHTML = `<option value="">-- Select Branch --</option>` +
      branches.map(b => `<option value="${escapeHtml(b)}" ${b === amDisbState.branch ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');
  } catch (err) { toast(err.message, true); }

  document.getElementById('am_d_date').addEventListener('change', (e) => amDisbState.date = e.target.value);
  document.getElementById('am_d_branch').addEventListener('change', (e) => amDisbState.branch = e.target.value);
  document.getElementById('am_d_load').addEventListener('click', loadAMDisbursements);
}

async function loadAMDisbursements() {
  const wrap = document.getElementById('amDisbResults');
  if (!amDisbState.branch) { toast('Please select a branch', true); return; }
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { disbursements } = await api('getAMDisbursements', { branch: amDisbState.branch, date: amDisbState.date });
    wrap.innerHTML = `<div class="card">
      ${disbursements.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Group</th><th>Loan Amt</th><th>EMI</th><th></th></tr></thead><tbody>
        ${disbursements.map(d => `<tr><td>${escapeHtml(d.customerName)}</td><td>${escapeHtml(d.groupName)}</td><td>${money(d.loanAmt)}</td><td>${escapeHtml(String(d.emi))}</td>
          <td><button class="btn-ghost amViewDetailsBtn" data-id="${escapeHtml(d.customerId)}" style="color:var(--navy); border-color:var(--line);">View Details</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state">No loans disbursed on this date</div>'}
    </div>`;
    wrap.querySelectorAll('.amViewDetailsBtn').forEach(b => b.addEventListener('click', () => openCustomerDetailsPopup(b.dataset.id)));
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function openCustomerDetailsPopup(customerId) {
  showPopup('Loan Form', '<p class="muted">Loading...</p>');
  try {
    const { customer: c } = await api('getCustomerDetails', { customerId });
    const body = `
    <form id="custEditForm">
      <div class="field-row">
        <div class="field"><label>Customer Name</label><input id="ce_name" value="${escapeHtml(c.CustomerName || '')}" /></div>
        <div class="field"><label>Husband Name</label><input id="ce_husband" value="${escapeHtml(c.HusbandName || '')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Phone No</label><input id="ce_phone" value="${escapeHtml(String(c.PhNo || ''))}" /></div>
        <div class="field"><label>Group Name</label><input id="ce_group" value="${escapeHtml(c.GroupName || '')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Loan Amt</label><input type="number" id="ce_loanamt" value="${Number(c.LoanAmt) || 0}" /></div>
        <div class="field"><label>EMI</label><input id="ce_emi" value="${escapeHtml(String(c.EMI || ''))}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Disb Date</label><input id="ce_disbdate" value="${escapeHtml(String(c.DisbDate || ''))}" /></div>
        <div class="field"><label>Current Outstanding</label><input type="number" id="ce_outstanding" value="${Number(c.CurrentOutstanding) || 0}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Aadhar No</label><input id="ce_aadhar" value="${escapeHtml(c.AadharNo || '')}" /></div>
        <div class="field"><label>Pan No</label><input id="ce_pan" value="${escapeHtml(c.PanNo || '')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>A/C No</label><input id="ce_ac" value="${escapeHtml(c.ACNo || '')}" /></div>
        <div class="field"><label>IFSC Code</label><input id="ce_ifsc" value="${escapeHtml(c.IFSCCode || '')}" /></div>
      </div>
      <button class="btn-primary" type="submit">Save Changes</button>
      <p id="ceError" class="error hidden"></p>
    </form>`;
    showPopup('Loan Form - ' + escapeHtml(c.CustomerName || ''), body);
    document.getElementById('custEditForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('ceError');
      errEl.classList.add('hidden');
      try {
        await api('updateCustomerDetails', {
          customerId, CustomerName: val('ce_name'), HusbandName: val('ce_husband'), PhNo: val('ce_phone'),
          GroupName: val('ce_group'), LoanAmt: val('ce_loanamt'), EMI: val('ce_emi'), DisbDate: val('ce_disbdate'),
          CurrentOutstanding: val('ce_outstanding'), AadharNo: val('ce_aadhar'), PanNo: val('ce_pan'),
          ACNo: val('ce_ac'), IFSCCode: val('ce_ifsc')
        });
        toast('Customer details updated');
        const popup = document.getElementById('genericPopup');
        if (popup) popup.remove();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });
  } catch (err) {
    showPopup('Loan Form', `<p class="error">${err.message}</p>`);
  }
}

// ============================================================
// A.M: TRANSACTION
// ============================================================
let amTxState = { branch: '', date: '' };

async function renderAMTransaction() {
  const main = document.getElementById('mainContent');
  if (!amTxState.date) amTxState.date = new Date().toISOString().slice(0, 10);
  main.innerHTML = `
  <div class="card">
    <h3>Transaction</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="am_t_date" value="${amTxState.date}" /></div>
      <div class="field"><label>Branch</label><select id="am_t_branch"><option value="">-- Select Branch --</option></select></div>
    </div>
    <button class="btn-primary" type="button" id="am_t_load">Load</button>
  </div>
  <div id="amTxResults"></div>`;

  try {
    const { branches } = await api('getAllowedBranches');
    document.getElementById('am_t_branch').innerHTML = `<option value="">-- Select Branch --</option>` +
      branches.map(b => `<option value="${escapeHtml(b)}" ${b === amTxState.branch ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');
  } catch (err) { toast(err.message, true); }

  document.getElementById('am_t_date').addEventListener('change', (e) => amTxState.date = e.target.value);
  document.getElementById('am_t_branch').addEventListener('change', (e) => amTxState.branch = e.target.value);
  document.getElementById('am_t_load').addEventListener('click', loadAMTransactions);
}

async function loadAMTransactions() {
  const wrap = document.getElementById('amTxResults');
  if (!amTxState.branch) { toast('Please select a branch', true); return; }
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { transactions } = await api('getAMTransactions', { branch: amTxState.branch, date: amTxState.date });
    wrap.innerHTML = `<div class="card">
      ${transactions.length ? transactions.map(t => `
      <div class="cust-row" data-row="${t.row}">
        <div class="cust-info">
          <div class="cust-name">${escapeHtml(t.staffName)}</div>
          <div class="cust-sub">${fmtDate(t.timestamp)}</div>
        </div>
        <div class="cust-action" style="flex-wrap:wrap; gap:8px;">
          <input type="number" class="tx_pnbdep" value="${Number(t.pnbDeposit) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="PNB Deposit" />
          <input type="number" class="tx_hdfcdep" value="${Number(t.hdfcDeposit) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="HDFC Deposit" />
          <input type="number" class="tx_pnbupi" value="${Number(t.pnbUpi) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="PNB UPI" />
          <input type="number" class="tx_hdfcupi" value="${Number(t.hdfcUpi) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="HDFC UPI" />
          <input type="number" class="tx_miscinc" value="${Number(t.miscInc) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="Misc Income" />
          <input type="number" class="tx_miscexp" value="${Number(t.miscExp) || 0}" style="width:90px; padding:8px; border:1.5px solid var(--line); border-radius:7px;" title="Misc Expense" />
          <button class="btn-submit-row txSaveBtn">Save</button>
          <button class="btn-ghost txDeleteBtn" style="color:#D64545; border-color:var(--line);">Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-state">No transactions on this date</div>'}
    </div>`;
    wrap.querySelectorAll('.cust-row').forEach(row => {
      const rowNum = Number(row.dataset.row);
      row.querySelector('.txSaveBtn').addEventListener('click', async () => {
        try {
          await api('updateTransaction', {
            row: rowNum,
            pnbDeposit: row.querySelector('.tx_pnbdep').value, hdfcDeposit: row.querySelector('.tx_hdfcdep').value,
            pnbUpi: row.querySelector('.tx_pnbupi').value, hdfcUpi: row.querySelector('.tx_hdfcupi').value,
            miscInc: row.querySelector('.tx_miscinc').value, miscExp: row.querySelector('.tx_miscexp').value
          });
          toast('Transaction updated');
        } catch (err) { toast(err.message, true); }
      });
      row.querySelector('.txDeleteBtn').addEventListener('click', async () => {
        const ok = confirm('Delete this transaction entry?');
        if (!ok) return;
        try {
          await api('deleteTransaction', { row: rowNum });
          toast('Transaction deleted');
          loadAMTransactions();
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
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
      wireOpenCashCard();
      return;
    }
    if (adminDrilldownArea) {
      const area = s.areas.find(a => a.area === adminDrilldownArea);
      main.innerHTML = `
      <button id="backBtn2" class="back-link">&larr; Back to all areas</button>
      <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">${escapeHtml(area.area)} Area</h3></div>
      ${statCardsHtml(area)}
      <div class="card"><h3>Branches</h3>
        ${area.branches.map(b => `
          <div class="branch-list-item" data-b="${escapeHtml(b.branch)}">
            <div><div class="name">${escapeHtml(b.branch)}</div><div class="sub">${b.customerCount} customers · Today ${money(b.todayCollectionTotal)}</div></div>
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
    <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">All Branches — Grand Total</h3></div>
    ${statCardsHtml({
      customerCount: s.grandCustomerCount, totalOutstanding: s.grandTotalOutstanding,
      todayCollectionTotal: s.grandTodayCollection, todayCollectionCount: s.grandTodayCollectionCount,
      realizableAmt: s.grandRealizableAmt, realizableNo: s.grandRealizableNo,
      overdueNo: s.grandOverdueNo, overdueOutstanding: s.grandOverdueOutstanding,
      deathNo: s.grandDeathNo, deathOutstanding: s.grandDeathOutstanding
    })}
    <div class="card"><h3>Areas</h3>
      ${s.areas.map(a => `
        <div class="branch-list-item" data-a="${escapeHtml(a.area)}">
          <div><div class="name">${escapeHtml(a.area)}</div><div class="sub">${a.branches.length} branches · Today ${money(a.todayCollectionTotal)}</div></div>
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
    <h3>Add New Staff</h3>
    <form id="staffForm">
      <div class="field"><label>Name</label><input id="s_name" required /></div>
      <div class="field"><label>Phone (Login ID)</label><input id="s_phone" required /></div>
      <div class="field"><label>Role</label>
        <select id="s_role">
          <option value="CO">C.O</option>
          <option value="SCO">S.C.O</option>
          <option value="BM">B.M</option>
          <option value="AM">A.M (Area Head)</option>
          <option value="AUDIT">Audit (All Branches)</option>
          <option value="HO">H.O (All Branches)</option>
          <option value="ADMIN">Admin (All in All)</option>
        </select>
      </div>
      <div class="field" id="s_branchField"><label>Branch</label><input id="s_branch" /></div>
      <div class="field" id="s_areaField"><label>Area</label><input id="s_area" /></div>
      <button class="btn-primary" type="submit">Add Staff</button>
      <p class="muted">Default password: <b>Sampoorn</b> (staff must change it on first login)</p>
      <p id="staffError" class="error hidden"></p>
    </form>
  </div>
  <div class="card"><h3>All Staff</h3><div id="staffListWrap"><p class="muted">Loading...</p></div></div>`;

  function updateStaffFieldVisibility() {
    const role = val('s_role');
    document.getElementById('s_branchField').style.display = BRANCH_ROLES.includes(role) ? 'block' : 'none';
    document.getElementById('s_areaField').style.display = role === AREA_ROLE ? 'block' : 'none';
  }
  document.getElementById('s_role').addEventListener('change', updateStaffFieldVisibility);
  updateStaffFieldVisibility();

  document.getElementById('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('staffError');
    errEl.classList.add('hidden');
    try {
      await api('addStaff', {
        name: val('s_name'), phone: val('s_phone'), role: val('s_role'),
        branch: val('s_branch'), area: val('s_area')
      });
      toast('Staff added successfully');
      e.target.reset();
      updateStaffFieldVisibility();
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
    wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Branch/Area</th><th></th></tr></thead><tbody>
      ${staff.map(s => `<tr>
        <td>${escapeHtml(s.name)}</td><td>${escapeHtml(String(s.phone))}</td><td>${escapeHtml(ROLE_LABELS[normRole(s.role)] || s.role)}</td>
        <td>${escapeHtml(s.branch || s.area || '-')}</td>
        <td><button class="btn-ghost resetBtn" data-p="${escapeHtml(String(s.phone))}" style="color:#0E2A3D;border-color:#E4E9ED;">Reset PW</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
    wrap.querySelectorAll('.resetBtn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await api('resetStaffPassword', { phone: b.dataset.p });
          toast('Password reset to Sampoorn');
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

// ============================================================
// REPORT (all roles - scoped automatically to what they're allowed to see)
// ============================================================
async function renderReport() {
  const main = document.getElementById('mainContent');
  const role = normRole(SESSION.role);
  const isBranchOnly = BRANCH_ROLES.includes(role);

  main.innerHTML = `
  <div class="card">
    <h3>Report</h3>
    <div class="field-row">
      <div class="field"><label>From Date</label><input type="date" id="r_from" /></div>
      <div class="field"><label>To Date</label><input type="date" id="r_to" /></div>
    </div>
    ${isBranchOnly ? '' : `<div class="field"><label>Branch</label>
      <select id="r_branch"><option value="ALL">All Branches</option></select>
    </div>`}
    <button class="btn-primary" type="button" id="r_go">Generate Report</button>
    <p id="r_error" class="error hidden"></p>
  </div>
  <div id="r_results"></div>`;

  if (!isBranchOnly) {
    try {
      const { branches } = await api('getAllowedBranches');
      const sel = document.getElementById('r_branch');
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        sel.appendChild(opt);
      });
    } catch (err) { /* branch dropdown is optional; ignore failure here */ }
  }

  document.getElementById('r_go').addEventListener('click', async () => {
    const errEl = document.getElementById('r_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('r_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const payload = { dateFrom: val('r_from'), dateTo: val('r_to') };
      if (!isBranchOnly) payload.branch = val('r_branch');
      const r = await api('getReport', payload);
      results.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Total Collection</div><div class="value green">${money(r.totalCollection)}</div></div>
        <div class="stat-card"><div class="label">Collection Count</div><div class="value">${r.collectionCount}</div></div>
        <div class="stat-card"><div class="label">Total Disbursement</div><div class="value">${money(r.totalDisbursement)}</div></div>
        <div class="stat-card"><div class="label">Disbursement Count</div><div class="value">${r.disbursementCount}</div></div>
      </div>
      <div class="card"><h3>Collections</h3>
        ${r.collections.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th><th>Staff</th></tr></thead><tbody>
          ${r.collections.map(c => `<tr><td>${fmtDate(c.Timestamp)}</td><td>${escapeHtml(c.Branch)}</td><td>${escapeHtml(c.CustomerName)}</td><td>${money(c.PutAmt)}</td><td>${escapeHtml(c.StaffName)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No collections in this range</div>'}
      </div>
      <div class="card"><h3>Disbursements</h3>
        ${r.disbursements.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th></tr></thead><tbody>
          ${r.disbursements.map(d => `<tr><td>${fmtDate(d.Timestamp)}</td><td>${escapeHtml(d.Branch)}</td><td>${escapeHtml(d.CustomerName)}</td><td>${money(d.LoanAmt)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No disbursements in this range</div>'}
      </div>`;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
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
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th><th>Staff</th><th></th></tr></thead><tbody>
        ${collections.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td><td><button class="btn-ghost deleteCollBtn" data-row="${r._row}" data-amt="${money(r.PutAmt)}" data-cust="${escapeHtml(r.CustomerName)}" style="color:#B3261E;border-color:#E4E9ED;">Delete</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="card"><h3>Recent Disbursements (last 200)</h3>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th></tr></thead><tbody>
        ${disbursements.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.LoanAmt)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
    main.querySelectorAll('.deleteCollBtn').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = confirm(`Delete this collection of ${b.dataset.amt} for ${b.dataset.cust}?\nThis will add the amount back to their outstanding balance.`);
        if (!ok) return;
        try {
          await api('deleteCollection', { row: Number(b.dataset.row) });
          toast('Collection deleted, outstanding restored');
          renderLogs();
        } catch (err) { toast(err.message, true); }
      });
    });
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
