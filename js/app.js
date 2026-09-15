// ---------------------------------------------------------------
// STATE
// ---------------------------------------------------------------
let CURRENT_USER = null;
let BRANCHES = [];
let CURRENT_VIEW = null;
let SELECTED_CUSTOMER = null; // for existing-customer loan flow

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const todayISO = () => new Date().toISOString().slice(0, 10);

function toast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  const savedUser = Api.getUser();
  if (savedUser && Api.token()) {
    CURRENT_USER = savedUser;
    enterApp();
  }
  $("#login-form").addEventListener("submit", handleLogin);
  $("#logout-btn").addEventListener("click", handleLogout);
});

async function handleLogin(e) {
  e.preventDefault();
  const username = $("#login-username").value.trim();
  const password = $("#login-password").value;
  const errBox = $("#login-error");
  errBox.style.display = "none";
  const btn = $("#login-submit");
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    const res = await Api.call("login", { username, password });
    if (!res.ok) {
      errBox.textContent = res.error || "Login failed.";
      errBox.style.display = "block";
      return;
    }
    Api.setToken(res.token);
    Api.setUser(res.user);
    CURRENT_USER = res.user;
    enterApp();
  } catch (err) {
    errBox.textContent = "Could not reach the server. Check your internet connection.";
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
}

function handleLogout() {
  Api.call("logout").catch(() => {});
  Api.setToken(null);
  Api.setUser(null);
  window.location.reload();
}

// ---------------------------------------------------------------
// APP SHELL
// ---------------------------------------------------------------
async function enterApp() {
  $("#login-screen").style.display = "none";
  $("#app-shell").classList.add("active");
  $("#user-name").textContent = CURRENT_USER.name;
  $("#user-role").textContent = CURRENT_USER.role + (CURRENT_USER.branch && CURRENT_USER.branch !== "ALL" ? " · " + CURRENT_USER.branch : "");

  buildNav();

  const branchRes = await Api.call("getBranches");
  if (branchRes.ok) BRANCHES = branchRes.branches;

  const firstView = CURRENT_USER.role === "Admin" ? "overview" : "collection";
  navigateTo(firstView);
}

function buildNav() {
  const nav = $("#nav-items");
  nav.innerHTML = "";
  const staffItems = [
    { id: "collection", label: "Collection Entry" },
    { id: "disburse", label: "Loan Disbursement" },
    { id: "my-entries", label: "My Recent Entries" }
  ];
  const adminItems = [
    { id: "overview", label: "Overview" },
    { id: "all-collections", label: "All Collections" },
    { id: "all-loans", label: "All Loans" },
    { id: "staff", label: "Staff Management" },
    { id: "audit", label: "Audit Log" }
  ];
  const items = CURRENT_USER.role === "Admin" ? adminItems : staffItems;
  items.forEach(item => {
    const a = document.createElement("div");
    a.className = "nav-item";
    a.dataset.view = item.id;
    a.textContent = item.label;
    a.addEventListener("click", () => navigateTo(item.id));
    nav.appendChild(a);
  });
}

function navigateTo(viewId) {
  CURRENT_VIEW = viewId;
  $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === viewId));
  const renderers = {
    "collection": renderCollectionView,
    "disburse": renderDisburseView,
    "my-entries": renderMyEntriesView,
    "overview": renderOverviewView,
    "all-collections": renderAllCollectionsView,
    "all-loans": renderAllLoansView,
    "staff": renderStaffView,
    "audit": renderAuditView
  };
  (renderers[viewId] || renderCollectionView)();
}

function branchOptions(selected) {
  const own = CURRENT_USER.role === "Staff" ? CURRENT_USER.branch : null;
  const list = own && own !== "ALL" ? [own] : BRANCHES;
  return list.map(b => `<option value="${b}" ${b === selected ? "selected" : ""}>${b}</option>`).join("");
}

// ---------------------------------------------------------------
// STAFF: COLLECTION ENTRY
// ---------------------------------------------------------------
function renderCollectionView() {
  $("#main").innerHTML = `
    <div class="topbar">
      <div><h2>Collection Entry</h2><div class="desc">Record today's EMI collection from a customer. Entries cannot be edited or deleted once saved — check the amount before saving.</div></div>
    </div>
    <div class="card" style="max-width:640px;">
      <form class="form-grid" id="collection-form">
        <div class="field full">
          <label>Search customer (name or group)</label>
          <input type="text" id="cust-search" placeholder="Start typing a customer or group name…" autocomplete="off">
          <div class="search-results" id="cust-results" style="display:none;"></div>
        </div>
        <div class="field full" id="selected-customer-box" style="display:none;"></div>
        <div class="field">
          <label>Collection date</label>
          <input type="date" id="coll-date" value="${todayISO()}" required>
        </div>
        <div class="field">
          <label>Amount collected (₹)</label>
          <input type="number" id="coll-amount" min="1" step="1" required>
        </div>
        <div class="field">
          <label>Mode</label>
          <select id="coll-mode">
            <option value="Cash">Cash</option>
            <option value="Online">Online</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-teal" id="coll-submit" disabled>Save collection</button>
          <button type="button" class="btn btn-outline" id="coll-reset">Clear</button>
        </div>
      </form>
    </div>
  `;
  wireCustomerSearch("cust-search", "cust-results", "selected-customer-box", "coll-submit");
  $("#coll-reset").addEventListener("click", () => renderCollectionView());
  $("#collection-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!SELECTED_CUSTOMER) return;
    const btn = $("#coll-submit");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = await Api.call("addCollection", {
        loanId: SELECTED_CUSTOMER.loanId,
        customerName: SELECTED_CUSTOMER.customerName,
        groupName: SELECTED_CUSTOMER.groupName,
        branch: SELECTED_CUSTOMER.branch,
        collectionDate: $("#coll-date").value,
        amountCollected: $("#coll-amount").value,
        mode: $("#coll-mode").value
      });
      if (res.ok) {
        toast("Collection saved: " + inr($("#coll-amount").value) + " from " + SELECTED_CUSTOMER.customerName);
        renderCollectionView();
      } else {
        toast(res.error || "Could not save.", "error");
        btn.disabled = false; btn.textContent = "Save collection";
      }
    } catch (err) {
      toast("Network error — please try again.", "error");
      btn.disabled = false; btn.textContent = "Save collection";
    }
  });
}

function wireCustomerSearch(inputId, resultsId, selectedBoxId, submitBtnId) {
  SELECTED_CUSTOMER = null;
  const input = $("#" + inputId);
  const results = $("#" + resultsId);
  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = "none"; return; }
    debounceTimer = setTimeout(async () => {
      const res = await Api.call("searchCustomers", { query: q });
      if (!res.ok || !res.results.length) {
        results.innerHTML = `<div class="search-result-item">No matching customers found.</div>`;
        results.style.display = "block";
        return;
      }
      results.innerHTML = res.results.map((r, i) => `
        <div class="search-result-item" data-idx="${i}">
          <strong>${r.customerName}</strong> — ${r.groupName}
          <div class="meta">${r.branch} · Loan ${r.loanId} · Outstanding ${inr(r.closingOS)}</div>
        </div>`).join("");
      results.style.display = "block";
      $$(".search-result-item", results).forEach(el => {
        el.addEventListener("click", () => {
          const r = res.results[Number(el.dataset.idx)];
          if (!r) return;
          SELECTED_CUSTOMER = r;
          input.value = r.customerName;
          results.style.display = "none";
          const box = $("#" + selectedBoxId);
          box.style.display = "block";
          box.innerHTML = `
            <div class="card" style="background:var(--teal-soft);border-color:var(--teal);padding:12px 14px;">
              <strong>${r.customerName}</strong> · ${r.groupName}<br>
              <span style="color:var(--ink-soft);font-size:12.5px;">${r.branch} · Husband: ${r.husbandName || "—"} · Ph: ${r.phone || "—"} · Outstanding: ${inr(r.closingOS)}</span>
            </div>`;
          $("#" + submitBtnId).disabled = false;
        });
      });
    }, 280);
  });
}

// ---------------------------------------------------------------
// STAFF: LOAN DISBURSEMENT (New or Existing customer)
// ---------------------------------------------------------------
function renderDisburseView() {
  $("#main").innerHTML = `
    <div class="topbar">
      <div><h2>Loan Disbursement</h2><div class="desc">Record a new disbursement — for a brand-new customer or an existing one taking a fresh loan.</div></div>
    </div>
    <div class="card" style="max-width:680px;">
      <div class="filters">
        <button class="btn btn-sm ${"btn-teal"}" id="tab-new" type="button">New customer</button>
        <button class="btn btn-sm btn-outline" id="tab-existing" type="button">Existing customer</button>
      </div>
      <div id="disburse-form-wrap"></div>
    </div>
  `;
  let mode = "New";
  const tabNew = $("#tab-new"), tabExisting = $("#tab-existing");
  tabNew.addEventListener("click", () => { mode = "New"; tabNew.className = "btn btn-sm btn-teal"; tabExisting.className = "btn btn-sm btn-outline"; renderDisburseForm(mode); });
  tabExisting.addEventListener("click", () => { mode = "Existing"; tabExisting.className = "btn btn-sm btn-teal"; tabNew.className = "btn btn-sm btn-outline"; renderDisburseForm(mode); });
  renderDisburseForm(mode);
}

function renderDisburseForm(mode) {
  const wrap = $("#disburse-form-wrap");
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  if (mode === "New") {
    wrap.innerHTML = `
      <form class="form-grid" id="disburse-form">
        <div class="field"><label>Customer name</label><input type="text" id="d-name" required></div>
        <div class="field"><label>Husband's name</label><input type="text" id="d-husband"></div>
        <div class="field"><label>Phone</label><input type="tel" id="d-phone"></div>
        <div class="field"><label>Group name</label><input type="text" id="d-group" required></div>
        <div class="field"><label>Branch</label><select id="d-branch" required>${branchOptions()}</select></div>
        <div class="field"><label>Collection day</label>
          <select id="d-day">
            ${["Monday","Tuesday","Wednesday","Thursday","Friday"].map(d => `<option ${d===dayName?"selected":""}>${d}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Disbursement date</label><input type="date" id="d-date" value="${todayISO()}" required></div>
        <div class="field"><label>Loan amount (₹)</label><input type="number" id="d-amount" min="1" required></div>
        <div class="field"><label>Tenure (weeks/months)</label><input type="number" id="d-tenure" min="1" required></div>
        <div class="field"><label>EMI frequency</label>
          <select id="d-emi"><option value="W">Weekly</option><option value="M">Monthly</option></select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-teal">Save disbursement</button>
        </div>
      </form>`;
    $("#disburse-form").addEventListener("submit", e => submitDisbursement(e, "New"));
  } else {
    wrap.innerHTML = `
      <div class="field full">
        <label>Search existing customer</label>
        <input type="text" id="cust-search" placeholder="Start typing a customer or group name…" autocomplete="off">
        <div class="search-results" id="cust-results" style="display:none;"></div>
      </div>
      <div class="field full" id="selected-customer-box" style="display:none;"></div>
      <form class="form-grid" id="disburse-form" style="margin-top:14px;">
        <div class="field"><label>Branch</label><select id="d-branch" required>${branchOptions()}</select></div>
        <div class="field"><label>Disbursement date</label><input type="date" id="d-date" value="${todayISO()}" required></div>
        <div class="field"><label>New loan amount (₹)</label><input type="number" id="d-amount" min="1" required></div>
        <div class="field"><label>Tenure (weeks/months)</label><input type="number" id="d-tenure" min="1" required></div>
        <div class="field"><label>EMI frequency</label>
          <select id="d-emi"><option value="W">Weekly</option><option value="M">Monthly</option></select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-teal" id="disburse-submit" disabled>Save disbursement</button>
        </div>
      </form>`;
    wireCustomerSearch("cust-search", "cust-results", "selected-customer-box", "disburse-submit");
    $("#disburse-form").addEventListener("submit", e => submitDisbursement(e, "Existing"));
  }
}

async function submitDisbursement(e, loanType) {
  e.preventDefault();
  const payload = {
    branch: $("#d-branch").value,
    disbDate: $("#d-date").value,
    loanAmount: $("#d-amount").value,
    tenure: $("#d-tenure").value,
    emiFreq: $("#d-emi").value,
    loanType: loanType
  };
  if (loanType === "New") {
    payload.customerName = $("#d-name").value;
    payload.husbandName = $("#d-husband").value;
    payload.phone = $("#d-phone").value;
    payload.groupName = $("#d-group").value;
    payload.day = $("#d-day").value;
  } else {
    if (!SELECTED_CUSTOMER) return;
    payload.customerName = SELECTED_CUSTOMER.customerName;
    payload.husbandName = SELECTED_CUSTOMER.husbandName;
    payload.phone = SELECTED_CUSTOMER.phone;
    payload.groupName = SELECTED_CUSTOMER.groupName;
  }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const res = await Api.call("addLoan", payload);
    if (res.ok) {
      toast("Disbursement saved for " + payload.customerName);
      renderDisburseView();
    } else {
      toast(res.error || "Could not save.", "error");
      btn.disabled = false; btn.textContent = "Save disbursement";
    }
  } catch {
    toast("Network error — please try again.", "error");
    btn.disabled = false; btn.textContent = "Save disbursement";
  }
}

// ---------------------------------------------------------------
// STAFF: MY RECENT ENTRIES (read-only)
// ---------------------------------------------------------------
async function renderMyEntriesView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>My Recent Entries</h2><div class="desc">Read-only. Contact your admin if something needs correcting.</div></div></div>
    <div class="section">
      <div class="section-head"><h3>Collections</h3></div>
      <div class="table-wrap"><div id="my-collections" class="empty-state">Loading…</div></div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Disbursements</h3></div>
      <div class="table-wrap"><div id="my-loans" class="empty-state">Loading…</div></div>
    </div>
  `;
  const [collRes, loanRes] = await Promise.all([Api.call("getMyCollections"), Api.call("getMyLoans")]);
  $("#my-collections").outerHTML = collRes.ok && collRes.collections.length
    ? renderTable(collRes.collections, [
        ["CollectionDate", "Date"], ["CustomerName", "Customer"], ["GroupName", "Group"],
        ["Branch", "Branch"], ["AmountCollected", "Amount", inr], ["Mode", "Mode"]
      ])
    : `<div class="empty-state">No collections recorded yet.</div>`;
  $("#my-loans").outerHTML = loanRes.ok && loanRes.loans.length
    ? renderTable(loanRes.loans, [
        ["DisbDate", "Date"], ["CustomerName", "Customer"], ["Branch", "Branch"],
        ["LoanType", "Type", loanTypePill], ["LoanAmount", "Amount", inr], ["Tenure", "Tenure"]
      ])
    : `<div class="empty-state">No disbursements recorded yet.</div>`;
}

function loanTypePill(v) {
  const cls = v === "New" ? "pill-new" : v === "Existing" ? "pill-existing" : "pill-imported";
  return `<span class="pill ${cls}">${v}</span>`;
}
function statusPill(v) {
  return `<span class="pill ${v === "Active" ? "pill-active" : "pill-closed"}">${v}</span>`;
}

function renderTable(rows, cols, actionsFn) {
  return `<table><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join("")}${actionsFn ? "<th></th>" : ""}</tr></thead>
    <tbody>${rows.map(r => `<tr>${cols.map(c => {
      let v = r[c[0]];
      if (c[0].match(/Date/) && v) v = new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      if (c[2]) v = c[2](v);
      return `<td>${v ?? ""}</td>`;
    }).join("")}${actionsFn ? `<td>${actionsFn(r)}</td>` : ""}</tr>`).join("")}</tbody></table>`;
}

// ---------------------------------------------------------------
// ADMIN: OVERVIEW
// ---------------------------------------------------------------
async function renderOverviewView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>Overview</h2><div class="desc">Portfolio snapshot across all branches.</div></div></div>
    <div id="overview-body" class="empty-state">Loading…</div>
  `;
  const res = await Api.call("getDashboardSummary");
  if (!res.ok) { $("#overview-body").textContent = res.error || "Could not load summary."; return; }
  const s = res.summary;
  $("#overview-body").outerHTML = `
    <div class="grid grid-4" style="margin-bottom:26px;">
      <div class="card stat-card"><div class="label">Active loans</div><div class="value">${s.totalActiveLoans.toLocaleString("en-IN")}</div></div>
      <div class="card stat-card"><div class="label">Total outstanding</div><div class="value">${inr(s.totalOutstanding)}</div></div>
      <div class="card stat-card"><div class="label">Today's collection</div><div class="value">${inr(s.todayCollection)}</div><div class="sub">${s.todayCollectionCount} entries today</div></div>
      <div class="card stat-card"><div class="label">Total collections logged</div><div class="value">${s.totalCollectionsRecorded.toLocaleString("en-IN")}</div></div>
    </div>
    <div class="section">
      <div class="section-head"><h3>Outstanding by branch</h3></div>
      <div class="table-wrap">
        <table><thead><tr><th>Branch</th><th>Active loans</th><th>Outstanding</th></tr></thead>
          <tbody>${s.byBranch.map(b => `<tr><td>${b.branch}</td><td>${b.activeLoans}</td><td>${inr(b.outstanding)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------
// ADMIN: ALL COLLECTIONS (edit/delete)
// ---------------------------------------------------------------
async function renderAllCollectionsView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>All Collections</h2><div class="desc">Every collection entry across branches. Admins can correct or remove entries here.</div></div></div>
    <div class="filters">
      <select id="f-branch"><option value="">All branches</option>${branchOptions()}</select>
      <input type="date" id="f-from"> <span style="color:var(--ink-faint);">to</span> <input type="date" id="f-to">
      <button class="btn btn-sm btn-outline" id="f-apply">Filter</button>
    </div>
    <div class="table-wrap"><div id="coll-table" class="empty-state">Loading…</div></div>
  `;
  const load = async () => {
    const res = await Api.call("getAllCollections", {
      branch: $("#f-branch").value, dateFrom: $("#f-from").value, dateTo: $("#f-to").value
    });
    if (!res.ok) { $("#coll-table").textContent = res.error; return; }
    if (!res.collections.length) { $("#coll-table").outerHTML = `<div class="empty-state">No collections found.</div>`; return; }
    $("#coll-table").outerHTML = `<div id="coll-table">` + renderTable(res.collections, [
      ["CollectionDate", "Date"], ["CustomerName", "Customer"], ["GroupName", "Group"],
      ["Branch", "Branch"], ["AmountCollected", "Amount", inr], ["Mode", "Mode"], ["EnteredBy", "By"]
    ], r => `<button class="action-link" data-edit="${r.CollectionID}">Edit</button><button class="action-link danger" data-del="${r.CollectionID}">Delete</button>`) + `</div>`;

    $$("[data-edit]").forEach(btn => btn.addEventListener("click", () => editCollectionPrompt(btn.dataset.edit, load)));
    $$("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteCollectionConfirm(btn.dataset.del, load)));
  };
  $("#f-apply").addEventListener("click", load);
  load();
}

async function editCollectionPrompt(id, reload) {
  const amount = prompt("New amount collected (₹):");
  if (amount === null) return;
  const res = await Api.call("updateCollection", { collectionId: id, amountCollected: amount });
  if (res.ok) { toast("Collection updated."); reload(); } else { toast(res.error, "error"); }
}
async function deleteCollectionConfirm(id, reload) {
  if (!confirm("Delete this collection entry? This cannot be undone.")) return;
  const res = await Api.call("deleteCollection", { collectionId: id });
  if (res.ok) { toast("Collection deleted."); reload(); } else { toast(res.error, "error"); }
}

// ---------------------------------------------------------------
// ADMIN: ALL LOANS (edit/delete)
// ---------------------------------------------------------------
async function renderAllLoansView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>All Loans</h2><div class="desc">Every loan on record — imported history plus new disbursements.</div></div></div>
    <div class="filters">
      <select id="f-branch"><option value="">All branches</option>${branchOptions()}</select>
      <select id="f-type"><option value="">All types</option><option>New</option><option>Existing</option><option>Imported</option></select>
      <button class="btn btn-sm btn-outline" id="f-apply">Filter</button>
    </div>
    <div class="table-wrap"><div id="loan-table" class="empty-state">Loading…</div></div>
  `;
  const load = async () => {
    const res = await Api.call("getAllLoans", { branch: $("#f-branch").value, loanType: $("#f-type").value });
    if (!res.ok) { $("#loan-table").textContent = res.error; return; }
    if (!res.loans.length) { $("#loan-table").outerHTML = `<div class="empty-state">No loans found.</div>`; return; }
    $("#loan-table").outerHTML = `<div id="loan-table">` + renderTable(res.loans, [
      ["LoanID", "ID"], ["DisbDate", "Date"], ["CustomerName", "Customer"], ["Branch", "Branch"],
      ["LoanType", "Type", loanTypePill], ["LoanAmount", "Amount", inr], ["ClosingOS", "Outstanding", inr], ["Status", "Status", statusPill]
    ], r => `<button class="action-link" data-edit="${r.LoanID}">Edit</button><button class="action-link danger" data-del="${r.LoanID}">Delete</button>`) + `</div>`;

    $$("[data-edit]").forEach(btn => btn.addEventListener("click", () => editLoanPrompt(btn.dataset.edit, load)));
    $$("[data-del]").forEach(btn => btn.addEventListener("click", () => deleteLoanConfirm(btn.dataset.del, load)));
  };
  $("#f-apply").addEventListener("click", load);
  load();
}

async function editLoanPrompt(id, reload) {
  const os = prompt("New outstanding (Closing O/S) amount (₹):");
  if (os === null) return;
  const res = await Api.call("updateLoan", { loanId: id, closingOS: os });
  if (res.ok) { toast("Loan updated."); reload(); } else { toast(res.error, "error"); }
}
async function deleteLoanConfirm(id, reload) {
  if (!confirm("Delete this loan record? This cannot be undone.")) return;
  const res = await Api.call("deleteLoan", { loanId: id });
  if (res.ok) { toast("Loan deleted."); reload(); } else { toast(res.error, "error"); }
}

// ---------------------------------------------------------------
// ADMIN: STAFF MANAGEMENT
// ---------------------------------------------------------------
async function renderStaffView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>Staff Management</h2><div class="desc">Create logins for field staff. Staff can only add entries — never edit or delete.</div></div></div>
    <div class="grid grid-2" style="align-items:start;">
      <div class="table-wrap"><div id="staff-table" class="empty-state">Loading…</div></div>
      <div class="card">
        <h3 style="margin-bottom:14px;">Add staff</h3>
        <form class="form-grid" id="add-staff-form">
          <div class="field full"><label>Full name</label><input type="text" id="s-name" required></div>
          <div class="field"><label>Username</label><input type="text" id="s-username" required></div>
          <div class="field"><label>Temporary password</label><input type="text" id="s-password" required></div>
          <div class="field"><label>Role</label><select id="s-role"><option>Staff</option><option>Admin</option></select></div>
          <div class="field"><label>Branch</label><select id="s-branch"><option value="ALL">All branches</option>${BRANCHES.map(b => `<option>${b}</option>`).join("")}</select></div>
          <div class="form-actions"><button type="submit" class="btn btn-teal">Create login</button></div>
        </form>
      </div>
    </div>
  `;
  const load = async () => {
    const res = await Api.call("getStaff");
    if (!res.ok) { $("#staff-table").textContent = res.error; return; }
    $("#staff-table").outerHTML = `<div id="staff-table">` + renderTable(res.staff, [
      ["Name", "Name"], ["Username", "Username"], ["Role", "Role", v => `<span class="pill ${v === "Admin" ? "pill-admin" : "pill-staff"}">${v}</span>`],
      ["Branch", "Branch"], ["Active", "Active", v => String(v).toUpperCase() === "TRUE" ? "Yes" : "No"]
    ], r => r.StaffID === CURRENT_USER.staffId ? "" : `<button class="action-link" data-toggle="${r.StaffID}" data-active="${r.Active}">${String(r.Active).toUpperCase() === "TRUE" ? "Deactivate" : "Activate"}</button>`) + `</div>`;
    $$("[data-toggle]").forEach(btn => btn.addEventListener("click", async () => {
      const willActivate = String(btn.dataset.active).toUpperCase() !== "TRUE";
      const res2 = await Api.call("updateStaff", { staffId: btn.dataset.toggle, active: willActivate });
      if (res2.ok) { toast("Staff account updated."); load(); } else { toast(res2.error, "error"); }
    }));
  };
  load();

  $("#add-staff-form").addEventListener("submit", async e => {
    e.preventDefault();
    const res = await Api.call("addStaff", {
      name: $("#s-name").value, username: $("#s-username").value, password: $("#s-password").value,
      role: $("#s-role").value, branch: $("#s-branch").value
    });
    if (res.ok) { toast("Staff login created."); renderStaffView(); } else { toast(res.error, "error"); }
  });
}

// ---------------------------------------------------------------
// ADMIN: AUDIT LOG
// ---------------------------------------------------------------
async function renderAuditView() {
  $("#main").innerHTML = `
    <div class="topbar"><div><h2>Audit Log</h2><div class="desc">Every login, and every edit or delete made by an admin, in order.</div></div></div>
    <div class="table-wrap"><div id="audit-table" class="empty-state">Loading…</div></div>
  `;
  const res = await Api.call("getAuditLog");
  if (!res.ok) { $("#audit-table").textContent = res.error; return; }
  $("#audit-table").outerHTML = `<div id="audit-table">` + renderTable(res.log, [
    ["Timestamp", "When"], ["User", "User"], ["Role", "Role"], ["Action", "Action"], ["Details", "Details"]
  ]) + `</div>`;
}
