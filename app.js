const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycby3evz5ec4qSyJtByXHMkyte0C_YnGAPkWiifT-sjb9Q7TVBfc3SjsBorbAocsb3krC/exec'
};

let SESSION = JSON.parse(localStorage.getItem('sf_session') || 'null');
let activeTab = null;

const BRANCH_ROLES = ['CO', 'SCO', 'BM'];       
const AREA_ROLE = 'AM';                          
const ALL_BRANCH_ROLES = ['AUDIT', 'HO', 'ADMIN']; 
const ROLE_LABELS = { CO: 'C.O', SCO: 'S.C.O', BM: 'B.M', AM: 'A.M', AUDIT: 'Audit', HO: 'H.O', ADMIN: 'Admin' };
const LEGACY_ROLE_MAP = { BRANCH: 'BM', AREA: 'AM', ADMIN: 'ADMIN' };
function normRole(role) {
  const r = String(role || '').trim().toUpperCase();
  return LEGACY_ROLE_MAP[r] || r;
}

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

async function api(action, payload = {}) {
  const body = { action, token: SESSION ? SESSION.token : null, ...payload };
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || 'Something went wrong');
    Object.assign(err, data); 
    throw err;
  }
  return data;
}

const CACHE = {
  allowedBranches: null,
  ownBranchData: null,
  ownGroupPairs: null,
  groupsByBranch: {}
};

function clearSessionCache() {
  CACHE.allowedBranches = null;
  CACHE.ownBranchData = null;
  CACHE.ownGroupPairs = null;
  CACHE.groupsByBranch = {};
}

async function getAllowedBranchesCached() {
  if (!CACHE.allowedBranches) {
    const { branches } = await api('getAllowedBranches');
    CACHE.allowedBranches = branches;
  }
  return CACHE.allowedBranches;
}

async function getOwnBranchDataCached(forceRefresh) {
  if (!CACHE.ownBranchData || forceRefresh) {
    const { customers } = await api('getBranchCollectionData');
    CACHE.ownBranchData = customers;
  }
  return CACHE.ownBranchData;
}

async function getOwnGroupPairsCached(forceRefresh) {
  if (!CACHE.ownGroupPairs || forceRefresh) {
    const { pairs } = await api('getBranchGroupsAllDays');
    CACHE.ownGroupPairs = pairs;
  }
  return CACHE.ownGroupPairs;
}

async function getGroupsForBranchCached(branch, forceRefresh) {
  if (!CACHE.groupsByBranch[branch] || forceRefresh) {
    const { groups } = await api('getGroupsForBranch', { branch });
    CACHE.groupsByBranch[branch] = groups;
  }
  return CACHE.groupsByBranch[branch];
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

function downloadCSV(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')].concat(rows.map(r => r.map(esc).join(',')));
  const csv = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printReportWindow(title, bodyHtml) {
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Arial, sans-serif; padding:24px; color:#1C2B22;}
    h2{margin:0 0 14px;}
    table{width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;}
    th,td{border:1px solid #999; padding:6px 8px; text-align:left;}
    th{background:#1F4A3D; color:#fff;}
    .totals{font-size:13px; margin-top:6px;}
    .totals b{margin-right:18px;}
  </style></head><body><h2>${title}</h2>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

function downloadBtnsHtml(idPrefix) {
  return `<div style="display:flex; gap:8px; margin-bottom:12px;">
    <button class="btn-ghost" type="button" id="${idPrefix}_xls">Download Excel</button>
    <button class="btn-ghost" type="button" id="${idPrefix}_pdf">Download PDF</button>
  </div>`;
}

function moneyOrBlank(n) {
  n = Number(n) || 0;
  return n === 0 ? '' : money(n);
}
function numOrBlank(n) {
  n = Number(n) || 0;
  return n === 0 ? '' : String(n);
}

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

function openPwModal(forced = false) {
  document.getElementById('pwModal').classList.remove('hidden');
  document.getElementById('pwCancel').style.display = forced ? 'none' : 'inline-block';
  document.getElementById('oldPwField').style.display = forced ? 'none' : 'block';
}
document.getElementById('btnChangePw').addEventListener('click', () => openPwModal(false));

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
    tabs = [['summary', 'Summary'], ['collection', 'Collection'], ['dailysheet', 'Dailysheet'], ['disburse', 'Loan Disbursed'],
       ['attendance', 'Attendance'], ['expense', 'Expense'], ['creategroup', 'Create Group'], ['transaction', 'Transaction'],
       ['report', 'Report']];
  } else if (role === AREA_ROLE) {
    tabs = [['areaOverview', 'Overview'], ['amCollection', 'Collection'], ['amDailysheet', 'Dailysheet'],
       ['amDisburse', 'Loan Disbursed'], ['amTransaction', 'Transaction'], ['report', 'Report']];
  } else if (role === 'ADMIN') {
    tabs = [['adminOverview', 'Overview'], ['staff', 'Staff'], ['attendanceRegister', 'Attendance'], ['logs', 'Logs'], ['report', 'Report']];
  } else if (role === 'HO') {
    tabs = [['hoOverview', 'Overview'], ['hoReport', 'Report']];
  } else {
    
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
  else if (activeTab === 'attendance') renderAttendance();
  else if (activeTab === 'expense') renderExpense();
  else if (activeTab === 'creategroup') renderCreateGroup();
  else if (activeTab === 'transaction') renderTransaction();
  else if (activeTab === 'areaOverview') renderAreaOverview();
  else if (activeTab === 'amCollection') renderAMCollection();
  else if (activeTab === 'amDailysheet') renderAMDailySheet();
  else if (activeTab === 'amDisburse') renderAMDisburse();
  else if (activeTab === 'amTransaction') renderAMTransaction();
  else if (activeTab === 'adminOverview') renderAdminOverview();
  else if (activeTab === 'hoOverview') renderHOOverview();
  else if (activeTab === 'hoReport') renderReport();
  else if (activeTab === 'staff') renderStaff();
  else if (activeTab === 'attendanceRegister') renderAttendanceRegister();
  else if (activeTab === 'logs') renderLogs();
  else if (activeTab === 'report') renderReport();
}

const WEEK_ORDER_ = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let collState = { all: null, day: null, group: null };

async function renderCollection() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="muted">Loading...</p>';
  try {
    collState.all = await getOwnBranchDataCached();

    const daysPresent = [...new Set(collState.all.map(c => c.day).filter(Boolean))]
      .sort((a, b) => WEEK_ORDER_.indexOf(a) - WEEK_ORDER_.indexOf(b));
    const todayName = WEEK_ORDER_[new Date().getDay()];
    if (!collState.day || daysPresent.indexOf(collState.day) === -1) {
      collState.day = daysPresent.indexOf(todayName) !== -1 ? todayName : (daysPresent[0] || '');
    }

    main.innerHTML = `<div class="card">
      <h3>Select Day</h3>
      <div class="field"><select id="daySelect">
        ${daysPresent.map(d => `<option value="${escapeHtml(d)}" ${d === collState.day ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
      </select></div>
      <h3 style="margin-top:14px;">Select Group</h3>
      <div class="field"><select id="groupSelect"></select></div>
    </div>
    <div id="custList"></div>`;

    document.getElementById('daySelect').addEventListener('change', (e) => {
      collState.day = e.target.value;
      collState.group = null;
      renderGroupOptions_();
    });
    renderGroupOptions_();
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderGroupOptions_() {
  const groups = [...new Set(collState.all.filter(c => c.day === collState.day).map(c => c.groupName))]
    .filter(Boolean).sort();
  if (!collState.group || groups.indexOf(collState.group) === -1) collState.group = groups[0] || '';

  const sel = document.getElementById('groupSelect');
  sel.innerHTML = `<option value="">-- Select Group --</option>` +
    groups.map(g => `<option value="${escapeHtml(g)}" ${g === collState.group ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('');
  sel.onchange = (e) => { collState.group = e.target.value; renderCustomersForGroup_(); };

  if (collState.group) renderCustomersForGroup_();
  else document.getElementById('custList').innerHTML = '';
}

function renderCustomersForGroup_() {
  const wrap = document.getElementById('custList');
  const customers = collState.all.filter(c => c.day === collState.day && c.groupName === collState.group);
  if (customers.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No customers in this group</div>';
    return;
  }

  const submittedCount = customers.filter(c => c.collectedToday).length;
  const collectedTotal = customers.reduce((s, c) => s + (c.collectedToday ? (Number(c.collectedAmt) || 0) : 0), 0);

  const summaryHtml = `
  <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:12px 16px;">
    <div><b>${submittedCount}</b> / ${customers.length} submitted</div>
    <div>Collected today: <b class="badge-done" style="padding:4px 10px;">${money(collectedTotal)}</b></div>
  </div>`;

  const rowsHtml = customers.map((c, idx) => {
    const emiNum = Number(c.emi);
    const hasEmi = isFinite(emiNum) && String(c.emi).trim() !== '';
    const outstanding = Number(c.currentOutstanding) || 0;
    const prefill = hasEmi ? Math.max(0, Math.min(emiNum, outstanding)) : '';
    const locked = c.collectedToday;
    return `
    <div class="cust-row" data-id="${c.customerId}" data-idx="${idx}">
      <div class="cust-info">
        <div class="cust-name">${escapeHtml(c.name)}</div>
        <div class="cust-sub">${escapeHtml(c.husbandName || '')}${c.phNo ? ' · ' + escapeHtml(String(c.phNo)) : ''} · Loan ${money(c.loanAmt)} · EMI ${escapeHtml(String(c.emi))}</div>
        <div class="cust-outstanding">Outstanding: <b>${money(c.currentOutstanding)}</b></div>
      </div>
      <div class="cust-action">
        ${locked
          ? `<span class="badge-done">Submitted ✓ (${money(c.collectedAmt)})</span>`
          : `<input type="number" min="0" inputmode="decimal" placeholder="Amt" class="putAmtInput" value="${prefill}" />
             <button class="btn-submit-row">Submit</button>`}
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = summaryHtml + rowsHtml;

  function submitRow(row) {
    const id = row.dataset.id;
    const btn = row.querySelector('.btn-submit-row');
    if (!btn || btn.disabled) return;
    const input = row.querySelector('.putAmtInput');
    const amt = Number(input.value);
    if (input.value === '' || isNaN(amt) || amt < 0) { toast('Please enter a valid amount (0 or more)', true); input.focus(); return; }
    btn.disabled = true; btn.textContent = '...';
    api('submitCollection', { customerId: id, putAmt: amt }).then(data => {
      row.querySelector('.cust-outstanding').innerHTML = `Outstanding: <b>${money(data.newOutstanding)}</b>`;
      row.querySelector('.cust-action').innerHTML = `<span class="badge-done">Submitted ✓ (${money(amt)})</span>`;
      const rec = collState.all.find(c => c.customerId === id);
      if (rec) { rec.collectedToday = true; rec.collectedAmt = amt; rec.currentOutstanding = data.newOutstanding; }
      toast('Collection submitted');
      renderCustomersForGroup_();
    }).catch(err => {
      toast(err.message, true);
      btn.disabled = false; btn.textContent = 'Submit';
    });
  }

  wrap.querySelectorAll('.cust-row').forEach(row => {
    const btn = row.querySelector('.btn-submit-row');
    if (!btn) return;
    const input = row.querySelector('.putAmtInput');
    btn.addEventListener('click', () => submitRow(row));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitRow(row); }
    });
  });

  const firstOpenInput = wrap.querySelector('.cust-row .putAmtInput');
  if (firstOpenInput) firstOpenInput.focus();
}

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

async function renderDisburse() {
  const main = document.getElementById('mainContent');
  const todayLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  main.innerHTML = `
  <div class="card full-width">
    <h3>Add New Loan Disbursement</h3>
    <form id="disburseForm">
      <div class="field-row-wide">
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
        <div class="field"><label>Disb Date</label><input value="${todayLabel}" disabled /></div>
      </div>
      <div class="field-row-wide">
        <div class="field"><label>Customer Name</label><input id="d_name" required /></div>
        <div class="field"><label>Husband Name</label><input id="d_husband" /></div>
        <div class="field"><label>Phone No</label><input id="d_phone" /></div>
      </div>
      <div class="field-row-wide">
        <div class="field"><label>Loan Amt</label>
          <select id="d_loanamt" required><option value="">-- Select Loan Amount --</option></select>
        </div>
        <div class="field"><label>Outstanding (auto)</label><input id="d_outstanding_display" disabled /></div>
        <div class="field"><label>EMI - weeks 1 to 49 (auto)</label><input id="d_emi_display" disabled /></div>
      </div>
      <div class="field"><label class="muted" style="display:block; margin-bottom:12px;" id="d_lastemi_note"></label></div>
      <div class="field-row-wide">
        <div class="field"><label>Aadhar No</label><input id="d_aadhar" /></div>
        <div class="field"><label>Pan No</label><input id="d_pan" /></div>
        <div class="field"><label>A/C No</label><input id="d_ac" /></div>
        <div class="field"><label>IFSC Code</label><input id="d_ifsc" /></div>
      </div>
      <button class="btn-primary" type="submit">Disburse Loan</button>
      <p id="disburseError" class="error hidden"></p>
    </form>
  </div>`;

  document.getElementById('d_day').addEventListener('change', loadGroupsForDay);
  loadGroupsForDay(); 

  
  
  
  try {
    const { table } = await api('getLoanTable');
    const sel = document.getElementById('d_loanamt');
    Object.keys(table).sort((a, b) => Number(a) - Number(b)).forEach(amt => {
      const opt = document.createElement('option');
      opt.value = amt; opt.textContent = money(Number(amt));
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      const slab = table[sel.value];
      document.getElementById('d_outstanding_display').value = slab ? money(slab.outstanding) : '';
      document.getElementById('d_emi_display').value = slab ? money(slab.emi) : '';
      document.getElementById('d_lastemi_note').textContent = slab ? `50th (final) installment will be ${money(slab.lastEmi)}` : '';
    });
  } catch (err) {
    toast('Could not load loan amount options', true);
  }

  document.getElementById('disburseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('disburseError');
    errEl.classList.add('hidden');
    const payload = {
      day: val('d_day'), groupName: val('d_group'), customerName: val('d_name'),
      husbandName: val('d_husband'), phNo: val('d_phone'),
      loanAmt: val('d_loanamt'), aadharNo: val('d_aadhar'),
      panNo: val('d_pan'), acNo: val('d_ac'), ifscCode: val('d_ifsc')
    };
    if (!payload.groupName) { errEl.textContent = 'Please select a group'; errEl.classList.remove('hidden'); return; }
    if (!payload.loanAmt) { errEl.textContent = 'Please select a loan amount'; errEl.classList.remove('hidden'); return; }
    try {
      await api('addDisbursement', payload);
      toast('Loan disbursed successfully');
      e.target.reset();
      document.getElementById('d_outstanding_display').value = '';
      document.getElementById('d_emi_display').value = '';
      document.getElementById('d_lastemi_note').textContent = '';
      CACHE.ownBranchData = null;
      await getOwnGroupPairsCached(true);
      loadGroupsForDay();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

async function loadGroupsForDay() {
  const day = val('d_day');
  const sel = document.getElementById('d_group');
  try {
    const pairs = await getOwnGroupPairsCached();
    const groups = [...new Set(pairs.filter(p => p.day === day).map(p => p.groupName))].sort();
    if (sel) sel.innerHTML = `<option value="">-- Select Group --</option>` + groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
  } catch (err) {
  }
}

function val(id) { return document.getElementById(id).value; }

function ovItem(label, value, accent) {
  return `<div class="ov-item"><div class="label">${label}</div><div class="value${accent ? ' accent' : ''}">${value}</div></div>`;
}

function ovSection(color, tab, sub, itemsHtml) {
  return `
  <div class="ov-section" style="--ov-accent:${color};">
    <div class="ov-section-head"><span class="ov-section-tab">${tab}</span><span class="ov-section-sub">${sub}</span></div>
    <div class="ov-grid">${itemsHtml}</div>
  </div>`;
}

function statCardsHtml(s) {
  const portfolio = ovSection('#0E2A3D', 'Portfolio', 'as of now', [
    ovItem('Total Customers', s.customerCount),
    ovItem('Total Outstanding', money(s.totalOutstanding))
  ].join(''));

  const collection = ovSection('#0E9F6E', 'Collection', "today's activity", [
    ovItem('Net Collection', money(s.netCollection), true),
    ovItem('Realizable No', s.realizableNo),
    ovItem('Realizable Amt', money(s.realizableAmt)),
    ovItem('Realised No', s.realisedNo, true),
    ovItem('Realised Amt', money(s.realisedAmt), true),
    ovItem('Advance Amt', money(s.advanceAmt)),
    ovItem('Loan Closer Amt', money(s.loanCloserAmt)),
    ovItem('Overdue Collect Amt', money(s.overdueCollectAmt))
  ].join(''));

  const overdue = ovSection('#D64545', 'Overdue', 'needs follow-up', [
    ovItem('Overdue No', s.overdueNo, true),
    ovItem('Overdue Amt', money(s.overdueAmt), true),
    ovItem('Overdue Outstanding', money(s.overdueOutstanding), true)
  ].join(''));

  const death = ovSection('#6B7885', 'Death Cases', 'excluded from active', [
    ovItem('Death No', s.deathNo),
    ovItem('Death Outstanding', money(s.deathOutstanding))
  ].join(''));

  let cashHtml = '';
  if (s.closeCash !== undefined) {
    cashHtml = s.cashStarted === false
      ? `<div class="card"><p class="muted" style="margin:0;">Cash tracking hasn't started for this branch yet - ask Admin to set today's Open Cash.</p></div>`
      : ovSection('#123A54', 'Cash', 'in hand', [
          ovItem('Open Cash', money(s.openCash)),
          ovItem('Close Cash', money(s.closeCash), true)
        ].join(''));
  }

  return portfolio + collection + overdue + death + cashHtml;
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

function getGeoLocation_() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location not supported on this device')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => reject(new Error('Could not get your location. Please allow location access.')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

async function renderAttendance() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>My Attendance</h3>
    <p class="muted" id="myAttStatus">Loading...</p>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
      <button class="btn-primary" type="button" id="btnCheckIn" style="max-width:160px; margin-top:0;">Check In</button>
      <button class="btn-primary" type="button" id="btnCheckOut" style="max-width:160px; margin-top:0;">Check Out</button>
      <button class="btn-ghost" type="button" id="btnSetLocation">Set Branch Location</button>
    </div>
  </div>`;

  async function refreshMyStatus() {
    const dateStr = new Date().toISOString().slice(0, 10);
    try {
      const { staff } = await api('getAttendance', { date: dateStr });
      const mine = (staff || []).find(s => s.phone === SESSION.phone);
      let txt = 'Not checked in yet today';
      if (mine && mine.checkInTime) {
        txt = `Checked in ${mine.checkInTime}` + (mine.checkOutTime ? `, checked out ${mine.checkOutTime}` : '') + ` — ${mine.status}`;
      }
      document.getElementById('myAttStatus').textContent = txt;
    } catch (e) {}
  }
  refreshMyStatus();

  async function refreshLocationButton() {
    const btn = document.getElementById('btnSetLocation');
    try {
      const { set } = await api('getBranchLocation');
      if (set) { btn.disabled = true; btn.textContent = 'Branch Location Already Set'; }
    } catch (e) {}
  }
  refreshLocationButton();

  document.getElementById('btnSetLocation').addEventListener('click', async () => {
    const btn = document.getElementById('btnSetLocation');
    btn.disabled = true; btn.textContent = 'Getting location...';
    try {
      const { latitude, longitude } = await getGeoLocation_();
      window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
      await api('setBranchLocation', { latitude, longitude });
      toast('Branch location saved');
      btn.textContent = 'Branch Location Already Set';
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false; btn.textContent = 'Set Branch Location';
    }
  });

  document.getElementById('btnCheckIn').addEventListener('click', async () => {
    const btn = document.getElementById('btnCheckIn');
    btn.disabled = true; btn.textContent = 'Checking...';
    try {
      const { latitude, longitude } = await getGeoLocation_();
      const res = await api('checkIn', { latitude, longitude });
      toast(`Checked in at ${res.checkInTime}${res.onTime ? '' : ' (late)'}`);
      refreshMyStatus();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Check In';
    }
  });

  document.getElementById('btnCheckOut').addEventListener('click', async () => {
    const btn = document.getElementById('btnCheckOut');
    btn.disabled = true; btn.textContent = 'Checking...';
    try {
      const { latitude, longitude } = await getGeoLocation_();
      const res = await api('checkOut', { latitude, longitude });
      toast(`Checked out at ${res.checkOutTime}`);
      refreshMyStatus();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Check Out';
    }
  });
}

async function renderExpense() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Add Expense</h3>
    <form id="expenseForm">
      <div class="field"><label>Category</label>
        <select id="exp_category">
          <option>Staff Expense</option>
          <option>Office Rent</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field"><label>Amount</label><input type="number" id="exp_amount" min="0" step="0.01" required /></div>
      <div class="field"><label>Note (optional)</label><input id="exp_note" /></div>
      <button class="btn-primary" type="submit">Add Expense</button>
      <p id="expError" class="error hidden"></p>
    </form>
  </div>
  <div id="exp_list"><p class="muted">Loading...</p></div>`;

  async function loadExpenses() {
    const listEl = document.getElementById('exp_list');
    try {
      const { expenses } = await api('getExpenses');
      listEl.innerHTML = `<div class="card"><h3>Recent Expenses</h3>
        ${expenses.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Category</th><th>Amount</th><th>By</th><th>Note</th></tr></thead><tbody>
          ${expenses.map(e => `<tr><td>${fmtDate(e.Timestamp)}</td><td>${escapeHtml(e.Category)}</td><td>${money(e.Amount)}</td><td>${escapeHtml(e.StaffName)}</td><td>${escapeHtml(e.Note || '')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No expenses logged yet</div>'}
      </div>`;
    } catch (err) {
      listEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }

  document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('expError');
    errEl.classList.add('hidden');
    try {
      await api('addExpense', { category: val('exp_category'), amount: val('exp_amount'), note: val('exp_note') });
      toast('Expense added');
      e.target.reset();
      loadExpenses();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  loadExpenses();
}

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
      await getOwnGroupPairsCached(true);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

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

async function renderAreaOverview() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getAreaSummary');
    main.innerHTML = `
    <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">${escapeHtml(s.area)} Area</h3></div>
    ${statCardsHtml(s)}`;
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
  </div>` : ''}`;
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
    const branches = await getAllowedBranchesCached();
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
      const groups = await getGroupsForBranchCached(amCollState.branch);
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
    wrap.innerHTML = `<div class="card">` + customers.map(c => {
      const emiNum = Number(c.emi);
      const hasEmi = isFinite(emiNum) && String(c.emi).trim() !== '';
      const outstanding = Number(c.currentOutstanding) || 0;
      const prefill = hasEmi ? Math.max(0, Math.min(emiNum, outstanding)) : '';
      return `
      <div class="cust-row" data-id="${escapeHtml(c.customerId || '')}" data-row="${c.collectionRow || ''}" data-cust="${escapeHtml(c.name)}">
        <div class="cust-info">
          <div class="cust-name">${escapeHtml(c.name)}</div>
          <div class="cust-sub">${escapeHtml(c.husbandName || '')}${c.phNo ? ' · ' + escapeHtml(String(c.phNo)) : ''} · Loan ${money(c.loanAmt)} · EMI ${escapeHtml(String(c.emi))}</div>
          <div class="cust-outstanding">Outstanding: <b>${money(c.currentOutstanding)}</b></div>
        </div>
        <div class="cust-action">
          ${c.collectionRow
            ? `<span class="badge-done">Submitted ✓ (${money(c.collectedAmt)})</span>`
            : `<input type="number" min="0" placeholder="Amt" class="putAmtInput" value="${prefill}" />
               <button class="btn-submit-row">Submit</button>`}
        </div>
      </div>`;
    }).join('') + `</div>`;

    wrap.querySelectorAll('.cust-row').forEach(row => {
      const btn = row.querySelector('.btn-submit-row');
      if (!btn) return;
      const id = row.dataset.id;
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
    const branches = await getAllowedBranchesCached();
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
        CACHE.ownBranchData = null;
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
    const branches = await getAllowedBranchesCached();
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

async function renderAdminOverview() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getAdminSummary');
    main.innerHTML = `
    <div class="card" style="margin-bottom:0;"><h3 style="margin:0;">All Branches — Grand Total</h3></div>
    ${statCardsHtml({
      customerCount: s.grandCustomerCount, totalOutstanding: s.grandTotalOutstanding,
      netCollection: s.grandNetCollection,
      realizableNo: s.grandRealizableNo, realizableAmt: s.grandRealizableAmt,
      realisedNo: s.grandRealisedNo, realisedAmt: s.grandRealisedAmt,
      advanceAmt: s.grandAdvanceAmt, loanCloserAmt: s.grandLoanCloserAmt,
      overdueCollectAmt: s.grandOverdueCollectAmt,
      overdueNo: s.grandOverdueNo, overdueAmt: s.grandOverdueAmt, overdueOutstanding: s.grandOverdueOutstanding,
      deathNo: s.grandDeathNo, deathOutstanding: s.grandDeathOutstanding,
      openCash: s.grandOpenCash, closeCash: s.grandCloseCash, cashStarted: true
    })}`;
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function renderAttendanceRegister() {
  const main = document.getElementById('mainContent');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  main.innerHTML = `
  <div class="card">
    <h3>Branch Locations</h3>
    <div id="branchLocList"><p class="muted">Loading...</p></div>
  </div>
  <div class="card">
    <h3>Attendance Register</h3>
    <div class="field-row">
      <div class="field"><label>From</label><input type="date" id="ar_from" value="${monthStart}" /></div>
      <div class="field"><label>To</label><input type="date" id="ar_to" value="${today}" /></div>
    </div>
    <button class="btn-primary" type="button" id="ar_go" style="max-width:160px;">Load</button>
    <p id="ar_error" class="error hidden"></p>
  </div>
  <div id="ar_results"></div>`;

  async function loadLocations() {
    const locEl = document.getElementById('branchLocList');
    locEl.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const { locations } = await api('getBranchLocations');
      if (!locations.length) {
        locEl.innerHTML = '<div class="empty-state">No branch locations set yet</div>';
        return;
      }
      locEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Branch</th><th>Location</th><th>Set By</th><th></th></tr></thead><tbody>
        ${locations.map(l => `<tr>
          <td>${escapeHtml(l.branch)}</td>
          <td><a href="https://www.google.com/maps?q=${l.latitude},${l.longitude}" target="_blank">${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}</a></td>
          <td>${escapeHtml(l.setBy || '')}</td>
          <td><button class="btn-ghost resetLocBtn" data-branch="${escapeHtml(l.branch)}" style="color:#B3261E;">Reset</button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
      document.querySelectorAll('.resetLocBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = confirm(`Reset location for ${btn.dataset.branch}? Staff will be able to set it again.`);
          if (!ok) return;
          btn.disabled = true;
          try {
            await api('resetBranchLocation', { branch: btn.dataset.branch });
            toast('Location reset');
            loadLocations();
          } catch (err) {
            toast(err.message, true);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      locEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }
  loadLocations();

  document.getElementById('ar_go').addEventListener('click', async () => {
    const errEl = document.getElementById('ar_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('ar_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const fromDate = document.getElementById('ar_from').value;
      const toDate = document.getElementById('ar_to').value;
      const { dates, rows } = await api('getAttendanceRegister', { fromDate, toDate });
      if (!rows.length) { results.innerHTML = '<div class="empty-state">No staff found</div>'; return; }
      const statusLetter = { Full: 'F', Half: 'H', Absent: 'A', Present: 'F' };
      results.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr>
        <th>Staff</th><th>Branch</th>
        ${dates.map(d => `<th>${d.slice(8, 10)}</th>`).join('')}
        <th>Full</th><th>Half</th><th>Absent</th>
      </tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.branch)}</td>
          ${dates.map(d => `<td>${statusLetter[r.byDate[d]] || 'A'}</td>`).join('')}
          <td><b>${r.fullCount}</b></td><td>${r.halfCount}</td><td>${r.absentCount}</td>
        </tr>`).join('')}
      </tbody></table></div></div>`;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
}

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
      <p id="staffError" class="error hidden"></p>
    </form>
  </div>
  <div class="card">
    <h3>Search Staff</h3>
    <div class="field"><label>Phone or Name</label><input id="s_search" placeholder="Type to search..." /></div>
    <div id="staffListWrap"></div>
  </div>`;

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
      toast('Staff added - default password is "Sampoorn"');
      e.target.reset();
      updateStaffFieldVisibility();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  let staffSearchTimer = null;
  document.getElementById('s_search').addEventListener('input', (e) => {
    clearTimeout(staffSearchTimer);
    const q = e.target.value.trim();
    if (!q) { document.getElementById('staffListWrap').innerHTML = ''; return; }
    staffSearchTimer = setTimeout(() => searchStaffAndRender(q), 300);
  });
}

async function searchStaffAndRender(query) {
  const wrap = document.getElementById('staffListWrap');
  wrap.innerHTML = '<p class="muted">Searching...</p>';
  try {
    const { staff } = await api('searchStaff', { query });
    if (!staff.length) { wrap.innerHTML = '<div class="empty-state">No staff found</div>'; return; }
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
          toast('Password reset to "Sampoorn"');
          searchStaffAndRender(query);
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function renderHOOverview() {
  const main = document.getElementById('mainContent');
  try {
    const s = await api('getHOOverview');
    main.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Total Customer</div><div class="value">${s.totalCustomers}</div></div>
      <div class="stat-card"><div class="label">Total Outstanding</div><div class="value">${money(s.totalOutstanding)}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Death No</div><div class="value">${s.deathNo}</div></div>
      <div class="stat-card"><div class="label">Death Outstanding</div><div class="value">${money(s.deathOutstanding)}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Open Cash</div><div class="value">${money(s.openCash)}</div></div>
      <div class="stat-card"><div class="label">Close Cash</div><div class="value green">${money(s.closeCash)}</div></div>
    </div>
    <p class="muted">Across ${s.branchCount} branch${s.branchCount === 1 ? '' : 'es'}.</p>`;
  } catch (err) {
    main.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderReport() {
  const main = document.getElementById('mainContent');
  const isBranch = BRANCH_ROLES.includes(normRole(SESSION.role));
  main.innerHTML = `
  <div class="card">
    <h3>Report</h3>
    <div class="report-menu">
      ${isBranch ? '' : `<button class="btn-ghost report-menu-btn" id="rm_loandisb">Loan Disb</button>
      <button class="btn-ghost report-menu-btn" id="rm_collection">Collection</button>
      <button class="btn-ghost report-menu-btn" id="rm_outstanding">Outstanding</button>`}
      <button class="btn-ghost report-menu-btn" id="rm_night">Night Report</button>
    </div>
  </div>`;
  if (!isBranch) {
    document.getElementById('rm_loandisb').addEventListener('click', renderLoanDisbReport);
    document.getElementById('rm_collection').addEventListener('click', renderCollectionReport);
    document.getElementById('rm_outstanding').addEventListener('click', renderOutstandingReport);
  }
  document.getElementById('rm_night').addEventListener('click', renderSimpleNightReport);
}

function reportBackBtn() {
  return `<button class="btn-ghost" type="button" id="rep_back" style="margin-bottom:14px;">&larr; Back to Report</button>`;
}
function wireReportBack() {
  document.getElementById('rep_back').addEventListener('click', renderReport);
}

async function renderLoanDisbReport() {
  const main = document.getElementById('mainContent');
  const role = normRole(SESSION.role);
  const isBranchOnly = BRANCH_ROLES.includes(role);

  main.innerHTML = `
  <div class="card">
    ${reportBackBtn()}
    <h3>Loan Disb Report</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="ld_date" /></div>
      ${isBranchOnly ? '' : `<div class="field"><label>Branch</label><select id="ld_branch"><option value="ALL">All Branches</option></select></div>`}
    </div>
    <button class="btn-primary" type="button" id="ld_go">Load</button>
    <p id="ld_error" class="error hidden"></p>
  </div>
  <div id="ld_results"></div>`;
  wireReportBack();
  document.getElementById('ld_date').value = new Date().toISOString().slice(0, 10);

  if (!isBranchOnly) {
    try {
      const branches = await getAllowedBranchesCached();
      const sel = document.getElementById('ld_branch');
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        sel.appendChild(opt);
      });
    } catch (err) { }
  }

  document.getElementById('ld_go').addEventListener('click', async () => {
    const errEl = document.getElementById('ld_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('ld_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const payload = { date: val('ld_date') };
      if (!isBranchOnly) payload.branch = val('ld_branch');
      const { rows, totalLoanNo, totalLoanAmt } = await api('getLoanDisbReport', payload);
      const LD_HEADERS = ['Sl', 'Disb Date', 'Branch', 'Group', 'Customer Name', 'Ph No', 'Co Applicant Name',
        'Loan Amt', 'Emi Amt', 'Outstanding', 'Aadhar Card No', 'Pan Card No', 'A/C No', 'IFSC Code'];
      const ldRow = (r, i) => [i + 1, r.disbDate, r.branch, r.group, r.customerName, r.phNo, r.coApplicantName,
        r.loanAmt, r.emiAmt, r.outstanding, r.aadharNo, r.panNo, r.acNo, r.ifscCode];
      results.innerHTML = `
      <div class="card"><h3>Disbursements</h3>
        ${rows.length ? downloadBtnsHtml('ld') : ''}
        ${rows.length ? `<div class="table-wrap"><table><thead><tr>
          <th>Sl</th><th>Disb Date</th><th>Branch</th><th>Group</th><th>Customer Name</th><th>Ph No</th>
          <th>Co Applicant Name</th><th>Loan Amt</th><th>Emi Amt</th><th>Outstanding</th>
          <th>Aadhar Card No</th><th>Pan Card No</th><th>A/C No</th><th>IFSC Code</th>
        </tr></thead><tbody>
          ${rows.map((r, i) => `<tr>
            <td>${i + 1}</td><td>${escapeHtml(String(r.disbDate))}</td><td>${escapeHtml(r.branch)}</td>
            <td>${escapeHtml(r.group)}</td><td>${escapeHtml(r.customerName)}</td><td>${escapeHtml(String(r.phNo))}</td>
            <td>${escapeHtml(r.coApplicantName)}</td><td>${money(r.loanAmt)}</td><td>${escapeHtml(String(r.emiAmt))}</td>
            <td>${money(r.outstanding)}</td><td>${escapeHtml(String(r.aadharNo))}</td><td>${escapeHtml(String(r.panNo))}</td>
            <td>${escapeHtml(String(r.acNo))}</td><td>${escapeHtml(String(r.ifscCode))}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No disbursements on this date</div>'}
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Total Loan No</div><div class="value">${totalLoanNo}</div></div>
        <div class="stat-card"><div class="label">Total Loan Amt</div><div class="value green">${money(totalLoanAmt)}</div></div>
      </div>`;

      if (rows.length) {
        document.getElementById('ld_xls').addEventListener('click', () => {
          const csvRows = rows.map(ldRow);
          csvRows.push([]);
          csvRows.push(['', '', '', '', '', '', '', '', '', '', '', '', 'Total Loan No', totalLoanNo]);
          csvRows.push(['', '', '', '', '', '', '', '', '', '', '', '', 'Total Loan Amt', totalLoanAmt]);
          downloadCSV(`Loan_Disb_${val('ld_date')}.csv`, LD_HEADERS, csvRows);
        });
        document.getElementById('ld_pdf').addEventListener('click', () => {
          const tableHtml = `<table><thead><tr>${LD_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
            ${rows.map((r, i) => `<tr>${ldRow(r, i).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody></table>
          <div class="totals"><b>Total Loan No: ${totalLoanNo}</b><b>Total Loan Amt: ${money(totalLoanAmt)}</b></div>`;
          printReportWindow(`Loan Disb Report - ${val('ld_date')}`, tableHtml);
        });
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
}

async function renderCollectionReport() {
  const main = document.getElementById('mainContent');
  const role = normRole(SESSION.role);
  const isBranchOnly = BRANCH_ROLES.includes(role);

  main.innerHTML = `
  <div class="card">
    ${reportBackBtn()}
    <h3>Collection Report</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="cr_date" /></div>
      ${isBranchOnly ? '' : `<div class="field"><label>Branch</label><select id="cr_branch"><option value="ALL">All Branches</option></select></div>`}
    </div>
    <button class="btn-primary" type="button" id="cr_go">Load</button>
    <p id="cr_error" class="error hidden"></p>
  </div>
  <div id="cr_results"></div>`;
  wireReportBack();
  document.getElementById('cr_date').value = new Date().toISOString().slice(0, 10);

  if (!isBranchOnly) {
    try {
      const branches = await getAllowedBranchesCached();
      const sel = document.getElementById('cr_branch');
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        sel.appendChild(opt);
      });
    } catch (err) { }
  }

  document.getElementById('cr_go').addEventListener('click', async () => {
    const errEl = document.getElementById('cr_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('cr_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const payload = { date: val('cr_date') };
      if (!isBranchOnly) payload.branch = val('cr_branch');
      const { mode, rows, total, branch } = await api('getCollectionReport', payload);
      const colLabel = mode === 'group' ? 'Group' : 'Branch';
      const rowLabel = (r) => mode === 'group' ? r.group : r.branch;
      const CR_HEADERS = mode === 'group' ? ['Sl', 'Branch', 'Group', 'Realizable Amt', 'Net Collection'] : ['Sl', 'Branch', 'Realizable Amt', 'Net Collection'];
      const crRow = (r, i) => mode === 'group' ? [i + 1, branch, r.group, r.realizableAmt, r.netCollection] : [i + 1, r.branch, r.realizableAmt, r.netCollection];
      results.innerHTML = `
      <div class="card"><h3>${mode === 'group' ? 'Collection - ' + escapeHtml(branch) : 'Collection - All Branches'}</h3>
        ${rows.length ? downloadBtnsHtml('cr') : ''}
        ${rows.length ? `<div class="table-wrap"><table><thead><tr>
          <th>Sl</th>${mode === 'group' ? '<th>Branch</th>' : ''}<th>${colLabel}</th><th>Realizable Amt</th><th>Net Collection</th>
        </tr></thead><tbody>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td>${mode === 'group' ? `<td>${escapeHtml(branch)}</td>` : ''}<td>${escapeHtml(rowLabel(r))}</td><td>${money(r.realizableAmt)}</td><td>${money(r.netCollection)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No data for this date</div>'}
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Total Realizable Amt</div><div class="value">${money(total.realizableAmt)}</div></div>
        <div class="stat-card"><div class="label">Total Net Collection</div><div class="value green">${money(total.netCollection)}</div></div>
      </div>`;

      if (rows.length) {
        document.getElementById('cr_xls').addEventListener('click', () => {
          const csvRows = rows.map(crRow);
          csvRows.push([]);
          const blankCols = new Array(CR_HEADERS.length - 2).fill('');
          csvRows.push([...blankCols, 'Total Realizable Amt', total.realizableAmt]);
          csvRows.push([...blankCols, 'Total Net Collection', total.netCollection]);
          downloadCSV(`Collection_${val('cr_date')}.csv`, CR_HEADERS, csvRows);
        });
        document.getElementById('cr_pdf').addEventListener('click', () => {
          const tableHtml = `<table><thead><tr>${CR_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
            ${rows.map((r, i) => `<tr>${crRow(r, i).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody></table>
          <div class="totals"><b>Total Realizable Amt: ${money(total.realizableAmt)}</b><b>Total Net Collection: ${money(total.netCollection)}</b></div>`;
          printReportWindow(`Collection Report - ${val('cr_date')}`, tableHtml);
        });
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
}

async function renderOutstandingReport() {
  const main = document.getElementById('mainContent');
  const role = normRole(SESSION.role);
  const isBranchOnly = BRANCH_ROLES.includes(role);

  main.innerHTML = `
  <div class="card">
    ${reportBackBtn()}
    <h3>Outstanding Report</h3>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" id="or_date" /></div>
      ${isBranchOnly ? '' : `<div class="field"><label>Branch</label><select id="or_branch"><option value="ALL">All Branches</option></select></div>`}
    </div>
    <button class="btn-primary" type="button" id="or_go">Load</button>
    <p id="or_error" class="error hidden"></p>
  </div>
  <div id="or_results"></div>`;
  wireReportBack();
  document.getElementById('or_date').value = new Date().toISOString().slice(0, 10);

  if (!isBranchOnly) {
    try {
      const branches = await getAllowedBranchesCached();
      const sel = document.getElementById('or_branch');
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        sel.appendChild(opt);
      });
    } catch (err) { }
  }

  document.getElementById('or_go').addEventListener('click', async () => {
    const errEl = document.getElementById('or_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('or_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const payload = { date: val('or_date') };
      if (!isBranchOnly) payload.branch = val('or_branch');
      const { rows, total } = await api('getOutstandingReport', payload);
      const OR_HEADERS = ['Sl', 'Day', 'Branch', 'Group', 'Customer ID', 'Customer Name', 'Ph No', 'Husband Name',
        'Disb Date', 'Disb Amt', 'Emi Amt', 'Opening Outstanding', 'Collection', 'Closing Outstanding'];
      const orRow = (r, i) => [i + 1, r.day, r.branch, r.group, r.customerId, r.customerName, r.phNo, r.husbandName,
        r.disbDate, r.disbAmt, r.emiAmt, r.openingOutstanding, r.collection, r.closingOutstanding];
      results.innerHTML = `
      <div class="card"><h3>Outstanding</h3>
        ${rows.length ? downloadBtnsHtml('or') : ''}
        ${rows.length ? `<div class="table-wrap"><table><thead><tr>
          <th>Sl</th><th>Day</th><th>Branch</th><th>Group</th><th>Customer ID</th><th>Customer Name</th><th>Ph No</th>
          <th>Husband Name</th><th>Disb Date</th><th>Disb Amt</th><th>Emi Amt</th>
          <th>Opening Outstanding</th><th>Collection</th><th>Closing Outstanding</th>
        </tr></thead><tbody>
          ${rows.map((r, i) => `<tr>
            <td>${i + 1}</td><td>${escapeHtml(r.day)}</td><td>${escapeHtml(r.branch)}</td><td>${escapeHtml(r.group)}</td>
            <td>${escapeHtml(String(r.customerId))}</td><td>${escapeHtml(r.customerName)}</td><td>${escapeHtml(String(r.phNo))}</td>
            <td>${escapeHtml(r.husbandName)}</td><td>${escapeHtml(String(r.disbDate))}</td><td>${money(r.disbAmt)}</td>
            <td>${escapeHtml(String(r.emiAmt))}</td><td>${money(r.openingOutstanding)}</td>
            <td>${money(r.collection)}</td><td>${money(r.closingOutstanding)}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<div class="empty-state">No customers found</div>'}
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Opening Outstanding</div><div class="value">${money(total.openingOutstanding)}</div></div>
        <div class="stat-card"><div class="label">Collection</div><div class="value green">${money(total.collection)}</div></div>
        <div class="stat-card"><div class="label">Closing Outstanding</div><div class="value">${money(total.closingOutstanding)}</div></div>
      </div>`;

      if (rows.length) {
        document.getElementById('or_xls').addEventListener('click', () => {
          const csvRows = rows.map(orRow);
          csvRows.push([]);
          const blankCols = new Array(OR_HEADERS.length - 2).fill('');
          csvRows.push([...blankCols, 'Opening Outstanding', total.openingOutstanding]);
          csvRows.push([...blankCols, 'Collection', total.collection]);
          csvRows.push([...blankCols, 'Closing Outstanding', total.closingOutstanding]);
          downloadCSV(`Outstanding_${val('or_date')}.csv`, OR_HEADERS, csvRows);
        });
        document.getElementById('or_pdf').addEventListener('click', () => {
          const tableHtml = `<table><thead><tr>${OR_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
            ${rows.map((r, i) => `<tr>${orRow(r, i).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody></table>
          <div class="totals"><b>Opening Outstanding: ${money(total.openingOutstanding)}</b><b>Collection: ${money(total.collection)}</b><b>Closing Outstanding: ${money(total.closingOutstanding)}</b></div>`;
          printReportWindow(`Outstanding Report - ${val('or_date')}`, tableHtml);
        });
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
}

const SIMPLE_NIGHT_FIELDS = [
  ['Realizable', 'realizableAmt', 'money'],
  ['Collection', 'netCollection', 'money'],
  ['PNB Deposit', 'pnbDeposit', 'money'],
  ['PNB UPI', 'pnbUpi', 'money'],
  ['HDFC UPI', 'hdfcUpi', 'money'],
  ['HDFC Deposit', 'hdfcDeposit', 'money'],
  ['Cash Open', 'openCash', 'money'],
  ['Cash Close', 'closeCash', 'money'],
  ['Fulpaid No', 'fulpaidNo', 'num'],
  ['Disb No', 'disbNo', 'num'],
  ['Disb Amt', 'disbAmt', 'money'],
  ['Closing Outstanding', 'closingOutstanding', 'money'],
  ['Closing Customer', 'closingCustomer', 'num']
];

const DETAILED_NIGHT_FIELDS = [
  ['Opening Customer', 'openingCustomer', 'num'],
  ['Opening Outstanding', 'openingOutstanding', 'money'],
  ['Open Cash', 'openCash', 'money'],
  ['Realizable No', 'realizableNo', 'num'],
  ['Realizable Amt', 'realizableAmt', 'money'],
  ['Realised No', 'realisedNo', 'num'],
  ['Realised Amt', 'realisedAmt', 'money'],
  ['Advance Amt', 'advanceAmt', 'money'],
  ['Loan Closer Amt', 'loanCloserAmt', 'money'],
  ['Overdue Collect Amt', 'overdueCollectAmt', 'money'],
  ['Net Collection', 'netCollection', 'money'],
  ['Misc Inc', 'miscInc', 'money'],
  ['Total Income', 'totalIncome', 'money'],
  ['Fulpaid No', 'fulpaidNo', 'num'],
  ['Disb No', 'disbNo', 'num'],
  ['Disb Amt', 'disbAmt', 'money'],
  ['Closing Customer', 'closingCustomer', 'num'],
  ['Closing Outstanding', 'closingOutstanding', 'money'],
  ['PNB UPI', 'pnbUpi', 'money'],
  ['PNB Deposit', 'pnbDeposit', 'money'],
  ['HDFC UPI', 'hdfcUpi', 'money'],
  ['HDFC Deposit', 'hdfcDeposit', 'money'],
  ['Misc Exp', 'miscExp', 'money'],
  ['Total Expense', 'totalExpense', 'money'],
  ['Close Cash', 'closeCash', 'money'],
  ['OTR', 'otr', 'pct'],
  ['Overdue No', 'overdueNo', 'num'],
  ['Overdue Amt', 'overdueAmt', 'money'],
  ['Overdue Outstanding', 'overdueOutstanding', 'money']
];

function nrFmt(val, type) {
  if (type === 'money') return money(val);
  if (type === 'pct') return (Number(val) || 0).toFixed(2) + '%';
  return String(val);
}

function detailedNightTableHtml(columns) {
  const rowsHtml = DETAILED_NIGHT_FIELDS.map(([label, key, type]) => `
    <tr><td style="font-weight:500;">${escapeHtml(label)}</td>
      ${columns.map(col => `<td>${nrFmt(col.data[key], type)}</td>`).join('')}
    </tr>`).join('');
  return `
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th></th>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  </div>`;
}

async function renderSimpleNightReport() {
  const main = document.getElementById('mainContent');
  const role = normRole(SESSION.role);
  const isHO = role === 'HO';

  main.innerHTML = `
  <div class="card">
    ${reportBackBtn()}
    <h3>Night Report</h3>
    <div class="field"><label>Date</label><input type="date" id="snr_date" /></div>
    <button class="btn-primary" type="button" id="snr_go">Load</button>
    <p id="snr_error" class="error hidden"></p>
  </div>
  <div id="snr_results"></div>`;
  wireReportBack();
  document.getElementById('snr_date').value = new Date().toISOString().slice(0, 10);

  document.getElementById('snr_go').addEventListener('click', async () => {
    const errEl = document.getElementById('snr_error');
    errEl.classList.add('hidden');
    const results = document.getElementById('snr_results');
    results.innerHTML = '<p class="muted">Loading...</p>';
    try {
      if (isHO) {
        const { dateStr, summary } = await api('getSimpleNightReport', { date: val('snr_date') });
        results.innerHTML = `
        <div class="card"><h3>Date: ${escapeHtml(dateStr)}</h3>
          ${downloadBtnsHtml('snr')}
          <div class="table-wrap"><table><tbody>
            ${SIMPLE_NIGHT_FIELDS.map(([label, key, type]) => `<tr><td style="font-weight:500;">${escapeHtml(label)}</td><td>${type === 'money' ? money(summary[key]) : summary[key]}</td></tr>`).join('')}
          </tbody></table></div>
        </div>`;
        document.getElementById('snr_xls').addEventListener('click', () => {
          const csvRows = SIMPLE_NIGHT_FIELDS.map(([label, key]) => [label, summary[key]]);
          downloadCSV(`Night_Report_${dateStr}.csv`, ['Field', 'Value'], csvRows);
        });
        document.getElementById('snr_pdf').addEventListener('click', () => {
          const tableHtml = `<table><tbody>${SIMPLE_NIGHT_FIELDS.map(([label, key, type]) => `<tr><td><b>${escapeHtml(label)}</b></td><td>${type === 'money' ? money(summary[key]) : summary[key]}</td></tr>`).join('')}</tbody></table>`;
          printReportWindow(`Night Report - ${dateStr}`, tableHtml);
        });
      } else {
        const { dateStr, rows, total } = await api('getDetailedNightReport', { date: val('snr_date') });
        const columns = rows.map(r => ({ label: r.branch, data: r })).concat(rows.length > 1 ? [{ label: 'Total', data: total }] : []);
        results.innerHTML = `<h3 style="margin:0 0 10px 2px;">Date: ${escapeHtml(dateStr)}</h3>` + downloadBtnsHtml('snr') + detailedNightTableHtml(columns);
        document.getElementById('snr_xls').addEventListener('click', () => {
          const headers = ['Field'].concat(columns.map(c => c.label));
          const csvRows = DETAILED_NIGHT_FIELDS.map(([label, key, type]) => [label, ...columns.map(c => type === 'pct' ? (Number(c.data[key]) || 0).toFixed(2) + '%' : c.data[key])]);
          downloadCSV(`Night_Report_${dateStr}.csv`, headers, csvRows);
        });
        document.getElementById('snr_pdf').addEventListener('click', () => {
          const tableHtml = detailedNightTableHtml(columns);
          printReportWindow(`Night Report - ${dateStr}`, tableHtml);
        });
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      results.innerHTML = '';
    }
  });
}

let logsState = { branch: '', group: '' };
let disbLogState = { branch: '' };

async function renderLogs() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
  <div class="card">
    <h3>Recent Collections</h3>
    <div class="field-row">
      <div class="field"><label>Branch</label><select id="lg_branch"><option value="">-- Select Branch --</option></select></div>
      <div class="field"><label>Group</label><select id="lg_group"><option value="">-- All Groups --</option></select></div>
    </div>
    <button class="btn-primary" type="button" id="lg_load" style="max-width:160px;">Load</button>
  </div>
  <div id="lg_results"></div>
  <div class="card">
    <h3>Recent Disbursements</h3>
    <div class="field"><label>Branch</label><select id="dl_branch"><option value="">-- Select Branch --</option></select></div>
    <button class="btn-primary" type="button" id="dl_load" style="max-width:160px;">Load</button>
  </div>
  <div id="dl_results"></div>`;

  try {
    const branches = await getAllowedBranchesCached();
    const branchOptionsHtml = (selectedBranch) => `<option value="">-- Select Branch --</option>` +
      branches.map(b => `<option value="${escapeHtml(b)}" ${b === selectedBranch ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('');
    document.getElementById('lg_branch').innerHTML = branchOptionsHtml(logsState.branch);
    document.getElementById('dl_branch').innerHTML = branchOptionsHtml(disbLogState.branch);
  } catch (err) { toast(err.message, true); }

  document.getElementById('lg_branch').addEventListener('change', async (e) => {
    logsState.branch = e.target.value;
    logsState.group = '';
    const groupSel = document.getElementById('lg_group');
    groupSel.innerHTML = `<option value="">-- All Groups --</option>`;
    if (!logsState.branch) return;
    try {
      const groups = await getGroupsForBranchCached(logsState.branch);
      groupSel.innerHTML = `<option value="">-- All Groups --</option>` +
        groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    } catch (err) { toast(err.message, true); }
  });
  document.getElementById('lg_group').addEventListener('change', (e) => { logsState.group = e.target.value; });
  document.getElementById('lg_load').addEventListener('click', loadLogsResults);

  document.getElementById('dl_branch').addEventListener('change', (e) => { disbLogState.branch = e.target.value; });
  document.getElementById('dl_load').addEventListener('click', loadDisbursementLogs);
}

async function loadLogsResults() {
  const wrap = document.getElementById('lg_results');
  if (!logsState.branch) { toast('Please select a branch', true); return; }
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { collections } = await api('getLogs', { branch: logsState.branch, group: logsState.group });
    wrap.innerHTML = `
    <div class="card">
      ${collections.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th><th>Staff</th><th></th></tr></thead><tbody>
        ${collections.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.PutAmt)}</td><td>${escapeHtml(r.StaffName)}</td><td><button class="btn-ghost deleteCollBtn" data-row="${r._row}" data-amt="${money(r.PutAmt)}" data-cust="${escapeHtml(r.CustomerName)}" style="color:#B3261E;border-color:#E4E9ED;">Delete</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state">No collections found</div>'}
    </div>`;
    wrap.querySelectorAll('.deleteCollBtn').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = confirm(`Delete this collection of ${b.dataset.amt} for ${b.dataset.cust}?\nThis will add the amount back to their outstanding balance.`);
        if (!ok) return;
        try {
          await api('deleteCollection', { row: Number(b.dataset.row) });
          toast('Collection deleted, outstanding restored');
          loadLogsResults();
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

async function loadDisbursementLogs() {
  const wrap = document.getElementById('dl_results');
  if (!disbLogState.branch) { toast('Please select a branch', true); return; }
  wrap.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const { disbursements } = await api('getDisbursementLogs', { branch: disbLogState.branch });
    wrap.innerHTML = `
    <div class="card">
      ${disbursements.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Branch</th><th>Customer</th><th>Amt</th><th></th></tr></thead><tbody>
        ${disbursements.map(r => `<tr><td>${fmtDate(r.Timestamp)}</td><td>${escapeHtml(r.Branch)}</td><td>${escapeHtml(r.CustomerName)}</td><td>${money(r.LoanAmt)}</td><td><button class="btn-ghost deleteCustBtn" data-id="${escapeHtml(r.CustomerID)}" data-cust="${escapeHtml(r.CustomerName)}" style="color:#B3261E;border-color:#E4E9ED;">Delete</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state">No disbursements found</div>'}
    </div>`;
    wrap.querySelectorAll('.deleteCustBtn').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = confirm(`Permanently delete ${b.dataset.cust} and ALL their data (customer record, every collection, this disbursement)? This cannot be undone.`);
        if (!ok) return;
        try {
          await api('deleteCustomerCompletely', { customerId: b.dataset.id });
          toast('Customer and all their data deleted');
          CACHE.ownBranchData = null;
          loadDisbursementLogs();
        } catch (err) { toast(err.message, true); }
      });
    });
  } catch (err) {
    wrap.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function fmtDate(d) {
  try { return new Date(d).toLocaleString('en-IN'); } catch { return String(d); }
}

if (SESSION) boot();
