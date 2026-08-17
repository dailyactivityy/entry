
const SHEETS = {
  CUSTOMERS: 'Customers',
  STAFF: 'Staff',
  AREAS: 'Areas',
  COLLECTIONS: 'Collections',
  DISBURSEMENTS: 'Disbursements',
  GROUPS: 'Groups',
  TRANSACTIONS: 'Transactions',
  CLOSED_CUSTOMERS: 'ClosedCustomers',
  COLLECTIONS_ARCHIVE: 'CollectionsArchive',
  TRANSACTIONS_ARCHIVE: 'TransactionsArchive',
  EXPENSES_ARCHIVE: 'ExpensesArchive',
  ATTENDANCE: 'Attendance',
  EXPENSES: 'Expenses',
  DAILY_LEDGER: 'DailyLedger',
  BRANCH_LOCATIONS: 'BranchLocations'
};

const BRANCH_ROLES = ['CO', 'SCO', 'BM'];
const AREA_ROLE = 'AM';
const ALL_BRANCH_ROLES = ['AUDIT', 'HO', 'ADMIN'];
const ROLE_LABELS = { CO: 'C.O', SCO: 'S.C.O', BM: 'B.M', AM: 'A.M', AUDIT: 'Audit', HO: 'H.O', ADMIN: 'Admin' };

const LEGACY_ROLE_MAP = { BRANCH: 'BM', AREA: 'AM', ADMIN: 'ADMIN' };
function normRole_(role) {
  const r = String(role || '').trim().toUpperCase();
  return LEGACY_ROLE_MAP[r] || r;
}
function isBranchRole_(role) { return BRANCH_ROLES.indexOf(normRole_(role)) !== -1; }
function isAreaRole_(role) { return normRole_(role) === AREA_ROLE; }
function isAllBranchRole_(role) { return ALL_BRANCH_ROLES.indexOf(normRole_(role)) !== -1; }

const CUSTOMER_HEADERS = ['CustomerID','Day','GroupName','CustomerName','DisbDate','LoanAmt','EMI',
  'HusbandName','PhNo','BranchName','AreaName','OpeningOutstanding','CurrentOutstanding',
  'AadharNo','PanNo','ACNo','IFSCCode','Status','CreatedAt'];

const CLOSED_CUSTOMER_HEADERS = CUSTOMER_HEADERS.concat(['ClosedDate']);

const STAFF_HEADERS = ['Phone', 'Name', 'PasswordHash', 'Role', 'Branch', 'Area', 'MustChangePassword', 'CreatedAt',
  'AccountNo', 'IFSC', 'Salary', 'Security', 'Address', 'Aadhar', 'PAN', 'DLNo', 'IDCard', 'Qualification', 'Leave'];

const AREA_HEADERS = ['AreaName','BranchName'];

const COLLECTION_HEADERS = ['Timestamp','StaffPhone','StaffName','Branch','Area','CustomerID',
  'CustomerName','GroupName','PutAmt','OutstandingBefore','OutstandingAfter'];

const DISBURSEMENT_HEADERS = ['Timestamp','StaffPhone','Branch','Area','CustomerID','CustomerName',
  'GroupName','LoanAmt','DisbDate','EMI'];

const GROUP_HEADERS = ['GroupName','Day','Address','BranchName','AreaName','CreatedBy','CreatedAt'];

const TRANSACTION_HEADERS = ['Timestamp','StaffPhone','StaffName','Branch','Area',
  'PNBDeposit','HDFCDeposit','PNBUPI','HDFCUPI','Total','MiscInc','MiscExp'];

const DAILY_LEDGER_HEADERS = ['Date', 'Branch', 'OpeningCustomers', 'OpeningOutstanding', 'TotalCustomers', 'TotalOutstanding',
  'DeathNo', 'DeathOutstanding', 'OpenCash', 'CloseCash', 'PNBDeposit', 'PNBUPI', 'HDFCDeposit', 'HDFCUPI',
  'MiscInc', 'MiscExp', 'FulpaidNo', 'DisbNo', 'DisbAmt', 'UpdatedAt'];

const ATTENDANCE_HEADERS = ['Date', 'Branch', 'Area', 'StaffPhone', 'StaffName', 'Status', 'MarkedBy', 'MarkedAt',
  'CheckInTime', 'CheckInLat', 'CheckInLng', 'CheckOutTime', 'CheckOutLat', 'CheckOutLng'];

const BRANCH_LOCATION_HEADERS = ['BranchName', 'Latitude', 'Longitude', 'SetBy', 'SetAt'];

const EXPENSE_HEADERS = ['Timestamp', 'StaffPhone', 'StaffName', 'Branch', 'Area', 'Category', 'Amount', 'Note'];

const TOKEN_VALID_HOURS = 18;
const CHECKIN_RADIUS_METERS = 200;
const CHECKIN_CUTOFF = '07:30';
const CHECKOUT_CUTOFF = '17:00';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEETS.CUSTOMERS, CUSTOMER_HEADERS);
  ensureSheet_(ss, SHEETS.STAFF, STAFF_HEADERS);
  ensureSheet_(ss, SHEETS.AREAS, AREA_HEADERS);
  ensureSheet_(ss, SHEETS.COLLECTIONS, COLLECTION_HEADERS);
  ensureSheet_(ss, SHEETS.DISBURSEMENTS, DISBURSEMENT_HEADERS);
  ensureSheet_(ss, SHEETS.GROUPS, GROUP_HEADERS);
  ensureSheet_(ss, SHEETS.TRANSACTIONS, TRANSACTION_HEADERS);
  ensureSheet_(ss, SHEETS.CLOSED_CUSTOMERS, CLOSED_CUSTOMER_HEADERS);
  ensureSheet_(ss, SHEETS.COLLECTIONS_ARCHIVE, COLLECTION_HEADERS);
  ensureSheet_(ss, SHEETS.TRANSACTIONS_ARCHIVE, TRANSACTION_HEADERS);
  ensureSheet_(ss, SHEETS.EXPENSES_ARCHIVE, EXPENSE_HEADERS);
  ensureSheet_(ss, SHEETS.ATTENDANCE, ATTENDANCE_HEADERS);
  ensureSheet_(ss, SHEETS.EXPENSES, EXPENSE_HEADERS);
  ensureSheet_(ss, SHEETS.DAILY_LEDGER, DAILY_LEDGER_HEADERS);
  ensureSheet_(ss, SHEETS.BRANCH_LOCATIONS, BRANCH_LOCATION_HEADERS);
  installDailyRolloverTrigger_();
  installMonthlyArchiveTrigger_();

  
  
  
  const staffSheet = ss.getSheetByName(SHEETS.STAFF);
  if (staffSheet.getLastRow() < 2) {
    staffSheet.appendRow(['admin', 'Administrator', hash_('admin', 'Sampoorn'), 'ADMIN', '', '', true, new Date()]);
  }
  SpreadsheetApp.getUi().alert('Setup complete.');
}

function withKeyedLock_(key, fn) {
  const cache = CacheService.getScriptCache();
  const lockKey = 'kl_' + key;
  const token = Utilities.getUuid();
  const start = Date.now();
  let acquired = false;
  while (Date.now() - start < 10000) {
    if (!cache.get(lockKey)) {
      cache.put(lockKey, token, 20); 
      Utilities.sleep(20); 
      if (cache.get(lockKey) === token) { acquired = true; break; }
    }
    Utilities.sleep(80 + Math.floor(Math.random() * 80)); 
  }
  if (!acquired) throw new Error('System is busy right now, please try again in a moment');
  try {
    return fn();
  } finally {
    cache.remove(lockKey);
  }
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Sampoorn API is live' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_({ ok: false, error: 'Bad request' });
  }
  const action = body.action;
  try {
    switch (action) {
      case 'login': return respond_(login_(body));
      case 'changePassword': return respond_(changePassword_(body));
      case 'getGroups': return respond_(getGroups_(body));
      case 'getLoanTable': return respond_({ ok: true, table: LOAN_TABLE });
      case 'createGroup': return respond_(createGroup_(body));
      case 'submitTransaction': return respond_(submitTransaction_(body));
      case 'getDailySheet': return respond_(getDailySheet_(body));
      case 'getCustomers': return respond_(getCustomers_(body));
      case 'getBranchCollectionData': return respond_(getBranchCollectionData_(body));
      case 'getBranchGroupsAllDays': return respond_(getBranchGroupsAllDays_(body));
      case 'submitCollection': return respond_(submitCollection_(body));
      case 'addDisbursement': return respond_(addDisbursement_(body));
      case 'getBranchSummary': return respond_(getBranchSummary_(body));
      case 'getAreaSummary': return respond_(getAreaSummary_(body));
      case 'getAdminSummary': return respond_(getAdminSummary_(body));
      case 'getStaffList': return respond_(getStaffList_(body));
      case 'searchStaff': return respond_(searchStaff_(body));
      case 'addStaff': return respond_(addStaff_(body));
      case 'resetStaffPassword': return respond_(resetStaffPassword_(body));
      case 'getLogs': return respond_(getLogs_(body));
      case 'getDisbursementLogs': return respond_(getDisbursementLogs_(body));
      case 'deleteCustomerCompletely': return respond_(deleteCustomerCompletely_(body));
      case 'deleteCollection': return respond_(deleteCollection_(body));
      case 'updateCollection': return respond_(updateCollection_(body));
      case 'getAllowedBranches': return respond_(getAllowedBranches_(body));
      case 'searchCustomers': return respond_(searchCustomers_(body));
      case 'getBranchGroupCustomers': return respond_(getBranchGroupCustomers_(body));
      case 'getCustomerRepaymentHistory': return respond_(getCustomerRepaymentHistory_(body));
      case 'getGroupsForBranch': return respond_(getGroupsForBranch_(body));
      case 'getGroupCustomersForDate': return respond_(getGroupCustomersForDate_(body));
      case 'getAMBranchDailySheet': return respond_(getAMBranchDailySheet_(body));
      case 'getAreaDailySheetSummary': return respond_(getAreaDailySheetSummary_(body));
      case 'saveOpenCash': return respond_(saveOpenCash_(body));
      case 'getBranchLedger': return respond_(getBranchLedger_(body));
      case 'getAMDisbursements': return respond_(getAMDisbursements_(body));
      case 'getCustomerDetails': return respond_(getCustomerDetails_(body));
      case 'updateCustomerDetails': return respond_(updateCustomerDetails_(body));
      case 'getAMTransactions': return respond_(getAMTransactions_(body));
      case 'updateTransaction': return respond_(updateTransaction_(body));
      case 'deleteTransaction': return respond_(deleteTransaction_(body));
      case 'getAttendance': return respond_(getAttendance_(body));
      case 'setBranchLocation': return respond_(setBranchLocation_(body));
      case 'resetBranchLocation': return respond_(resetBranchLocation_(body));
      case 'getBranchLocation': return respond_(getBranchLocation_(body));
      case 'checkIn': return respond_(checkIn_(body));
      case 'checkOut': return respond_(checkOut_(body));
      case 'getAttendanceRegister': return respond_(getAttendanceRegister_(body));
      case 'getBranchLocations': return respond_(getBranchLocations_(body));
      case 'addExpense': return respond_(addExpense_(body));
      case 'getExpenses': return respond_(getExpenses_(body));
      case 'getHOOverview': return respond_(getHOOverview_(body));
      case 'getLoanDisbReport': return respond_(getLoanDisbReport_(body));
      case 'getCollectionReport': return respond_(getCollectionReport_(body));
      case 'getOutstandingReport': return respond_(getOutstandingReport_(body));
      case 'getSimpleNightReport': return respond_(getSimpleNightReport_(body));
      case 'getDetailedNightReport': return respond_(getDetailedNightReport_(body));
      default: return respond_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return respond_({ ok: false, error: String(err) });
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hashLegacy_(str) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return raw.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function hash_(phone, str) {
  return hashLegacy_(String(phone).trim() + ':' + str);
}

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
  if (!s) throw new Error('SECRET_KEY not set in Script Properties');
  return s;
}

function makeToken_(payload) {
  const json = JSON.stringify(payload);
  const b64 = Utilities.base64EncodeWebSafe(json);
  const sigRaw = Utilities.computeHmacSha256Signature(b64, secret_());
  const sig = Utilities.base64EncodeWebSafe(sigRaw);
  return b64 + '.' + sig;
}

function verifyToken_(token) {
  if (!token || token.indexOf('.') === -1) throw new Error('Not logged in');
  const [b64, sig] = token.split('.');
  const expectedSigRaw = Utilities.computeHmacSha256Signature(b64, secret_());
  const expectedSig = Utilities.base64EncodeWebSafe(expectedSigRaw);
  if (sig !== expectedSig) throw new Error('Invalid session, please login again');
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString());
  if (Date.now() > payload.exp) throw new Error('Session expired, please login again');
  return payload;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

function loginAttemptKey_(phone) { return 'loginfail_' + phone; }

function checkLoginLock_(phone) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(loginAttemptKey_(phone));
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (data.count >= MAX_LOGIN_ATTEMPTS) return LOGIN_LOCKOUT_MINUTES;
  return null;
}

function recordLoginFailure_(phone) {
  const cache = CacheService.getScriptCache();
  const key = loginAttemptKey_(phone);
  const raw = cache.get(key);
  const data = raw ? JSON.parse(raw) : { count: 0 };
  data.count++;
  cache.put(key, JSON.stringify(data), LOGIN_LOCKOUT_MINUTES * 60);
}

function clearLoginFailures_(phone) {
  CacheService.getScriptCache().remove(loginAttemptKey_(phone));
}

function login_(body) {
  const phone = String(body.phone || '').trim();
  const lockedMinutes = checkLoginLock_(phone);
  if (lockedMinutes) {
    return { ok: false, error: 'Too many wrong attempts. Try again in ' + lockedMinutes + ' minutes, or ask an Admin to reset your password.' };
  }

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.STAFF);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const phoneCol = headers.indexOf('Phone');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][phoneCol]).trim() === phone) {
      const rec = rowToObj_(headers, rows[i]);
      const password = String(body.password || '');
      const matchesSalted = rec.PasswordHash === hash_(phone, password);
      const matchesLegacy = !matchesSalted && rec.PasswordHash === hashLegacy_(password);
      if (!matchesSalted && !matchesLegacy) {
        recordLoginFailure_(phone);
        return { ok: false, error: 'Incorrect password' };
      }
      clearLoginFailures_(phone);
      
      
      if (matchesLegacy) {
        const pwCol = headers.indexOf('PasswordHash') + 1;
        sh.getRange(i + 1, pwCol).setValue(hash_(phone, password));
      }
      const payload = {
        phone: rec.Phone, role: rec.Role, branch: rec.Branch, area: rec.Area,
        name: rec.Name, exp: Date.now() + TOKEN_VALID_HOURS * 3600 * 1000
      };
      return {
        ok: true, token: makeToken_(payload), role: rec.Role, name: rec.Name,
        branch: rec.Branch, area: rec.Area, mustChangePassword: rec.MustChangePassword === true || rec.MustChangePassword === 'TRUE'
      };
    }
  }
  return { ok: false, error: 'User not found' };
}

function changePassword_(body) {
  const payload = verifyToken_(body.token);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.STAFF);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const phoneCol = headers.indexOf('Phone');
  const pwCol = headers.indexOf('PasswordHash');
  const mustCol = headers.indexOf('MustChangePassword');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][phoneCol]).trim() === String(payload.phone).trim()) {
      const currentHash = rows[i][pwCol];
      const oldPw = String(body.oldPassword || '');
      const oldOk = currentHash === hash_(payload.phone, oldPw) || currentHash === hashLegacy_(oldPw);
      if (!body.skipOldCheck && !oldOk) {
        return { ok: false, error: 'Current password is incorrect' };
      }
      sh.getRange(i + 1, pwCol + 1).setValue(hash_(payload.phone, String(body.newPassword)));
      sh.getRange(i + 1, mustCol + 1).setValue(false);
      return { ok: true };
    }
  }
  return { ok: false, error: 'User not found' };
}

function rowToObj_(headers, row) {
  const o = {};
  headers.forEach((h, i) => o[h] = row[i]);
  return o;
}

function sheetAsObjects_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === '' && rows[i].every(c => c === '')) continue;
    out.push({ _row: i + 1, ...rowToObj_(headers, rows[i]) });
  }
  return { sh, headers, out };
}

function branchesForArea_(area) {
  const { out } = sheetAsObjects_(SHEETS.AREAS);
  return out.filter(r => r.AreaName === area).map(r => r.BranchName);
}

function searchCustomers_(body) {
  const payload = verifyToken_(body.token);
  const query = String(body.query || '').trim().toUpperCase();
  if (!query) return { ok: true, customers: [] };
  const { out: active } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: closed } = sheetAsObjects_(SHEETS.CLOSED_CUSTOMERS);
  const all = active.map(c => Object.assign({}, c, { _status: 'Active' }))
    .concat(closed.map(c => Object.assign({}, c, { _status: 'Closed' })));
  const matches = all.filter(c => c.BranchName === payload.branch &&
    (String(c.CustomerName || '').toUpperCase().indexOf(query) !== -1 ||
     String(c.PhNo || '').indexOf(query) !== -1 ||
     String(c.CustomerID || '').toUpperCase().indexOf(query) !== -1));
  return { ok: true, customers: matches.slice(0, 30).map(c => ({
    customerId: c.CustomerID, name: c.CustomerName, phNo: c.PhNo, groupName: c.GroupName,
    status: c._status, currentOutstanding: c.CurrentOutstanding
  })) };
}

function getBranchGroupCustomers_(body) {
  const payload = verifyToken_(body.token);
  const { out: active } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const list = active.filter(c => c.BranchName === payload.branch && c.GroupName === body.group);
  return { ok: true, customers: list.map(c => ({
    customerId: c.CustomerID, name: c.CustomerName, phNo: c.PhNo, groupName: c.GroupName,
    status: 'Active', currentOutstanding: c.CurrentOutstanding
  })) };
}

function getCustomerRepaymentHistory_(body) {
  const payload = verifyToken_(body.token);
  const found = findCustomerAnySheet_(body.customerId);
  if (!found) return { ok: false, error: 'Customer not found' };
  const cust = found.rec;
  if (payload.branch !== cust.BranchName && !amAuthorized_(payload, cust.BranchName)) {
    return { ok: false, error: 'Not authorized for this customer' };
  }
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const history = colls.filter(r => r.CustomerID === body.customerId)
    .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp))
    .map(r => ({ timestamp: r.Timestamp, putAmt: r.PutAmt, staffName: r.StaffName,
      outstandingBefore: r.OutstandingBefore, outstandingAfter: r.OutstandingAfter }));
  return { ok: true, customer: cust, status: found.closed ? 'Closed' : 'Active', history };
}

function getGroups_(body) {
  const payload = verifyToken_(body.token);
  const { out: custRows } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: groupRows } = sheetAsObjects_(SHEETS.GROUPS);
  let customerGroups = custRows.filter(c => c.BranchName === payload.branch && c.Status !== 'Closed');
  if (body.day) customerGroups = customerGroups.filter(c => c.Day === body.day);
  let createdGroups = groupRows.filter(g => g.BranchName === payload.branch);
  if (body.day) createdGroups = createdGroups.filter(g => g.Day === body.day);
  const set = new Set([...customerGroups.map(c => c.GroupName), ...createdGroups.map(g => g.GroupName)]);
  const groups = [...set].filter(Boolean).sort();
  return { ok: true, groups };
}

function createGroup_(body) {
  const payload = verifyToken_(body.token);
  const day = String(body.day || '').trim();
  const groupName = String(body.groupName || '').trim();
  const address = String(body.address || '').trim();
  if (!day || !groupName) return { ok: false, error: 'Day and Group Name are required' };
  const { out } = sheetAsObjects_(SHEETS.GROUPS);
  const dup = out.some(g => g.BranchName === payload.branch && g.Day === day && String(g.GroupName).toLowerCase() === groupName.toLowerCase());
  if (dup) return { ok: false, error: 'This group already exists for this day' };
  const areaName = branchAreaLookup_(payload.branch);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.GROUPS);
  sh.appendRow([groupName, day, address, payload.branch, areaName, payload.phone, new Date()]);
  return { ok: true };
}

function submitTransaction_(body) {
  const payload = verifyToken_(body.token);
  const pnbDeposit = Number(body.pnbDeposit) || 0;
  const hdfcDeposit = Number(body.hdfcDeposit) || 0;
  const pnbUpi = Number(body.pnbUpi) || 0;
  const hdfcUpi = Number(body.hdfcUpi) || 0;
  const miscInc = Number(body.miscInc) || 0;
  const miscExp = Number(body.miscExp) || 0;
  const total = pnbDeposit + hdfcDeposit + pnbUpi + hdfcUpi;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRANSACTIONS);
  sh.appendRow([new Date(), payload.phone, payload.name, payload.branch, payload.area,
    pnbDeposit, hdfcDeposit, pnbUpi, hdfcUpi, total, miscInc, miscExp]);
  const cashDelta = miscInc - miscExp - total;
  adjustDayRow_(payload.branch, todayStr_(), { pnbDeposit, pnbUpi, hdfcDeposit, hdfcUpi, miscInc, miscExp, cash: cashDelta });
  return { ok: true };
}

function getCustomers_(body) {
  const payload = verifyToken_(body.token);
  const { out } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const today = todayStr_();
  const list = out.filter(c => c.BranchName === payload.branch && c.GroupName === body.group && c.Status !== 'Closed')
    .map(c => {
      const todayColl = colls.find(r => r.CustomerID === c.CustomerID && dateStr_(r.Timestamp) === today);
      return {
        customerId: c.CustomerID, name: c.CustomerName, husbandName: c.HusbandName, phNo: c.PhNo,
        loanAmt: c.LoanAmt, emi: c.EMI, disbDate: c.DisbDate, openingOutstanding: c.OpeningOutstanding,
        currentOutstanding: c.CurrentOutstanding,
        collectedToday: !!todayColl, collectedAmt: todayColl ? todayColl.PutAmt : null
      };
    });
  return { ok: true, customers: list };
}

function getBranchCollectionData_(body) {
  const payload = verifyToken_(body.token);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const todayColls = getTodayCollections_();
  const collByCustomer = {};
  todayColls.forEach(r => { if (r.Branch === payload.branch) collByCustomer[r.CustomerID] = r; });

  const list = custs.filter(c => c.BranchName === payload.branch && c.Status !== 'Closed').map(c => {
    const todayColl = collByCustomer[c.CustomerID];
    return {
      customerId: c.CustomerID, name: c.CustomerName, husbandName: c.HusbandName, phNo: c.PhNo,
      day: c.Day, groupName: c.GroupName, loanAmt: c.LoanAmt, emi: c.EMI,
      currentOutstanding: c.CurrentOutstanding,
      collectedToday: !!todayColl, collectedAmt: todayColl ? todayColl.PutAmt : null
    };
  });
  return { ok: true, customers: list };
}

function getBranchGroupsAllDays_(body) {
  const payload = verifyToken_(body.token);
  const { out: custRows } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: groupRows } = sheetAsObjects_(SHEETS.GROUPS);
  const pairMap = {};
  custRows.filter(c => c.BranchName === payload.branch && c.Status !== 'Closed' && c.GroupName)
    .forEach(c => { pairMap[c.Day + '|' + c.GroupName] = { day: c.Day, groupName: c.GroupName }; });
  groupRows.filter(g => g.BranchName === payload.branch)
    .forEach(g => { pairMap[g.Day + '|' + g.GroupName] = { day: g.Day, groupName: g.GroupName }; });
  return { ok: true, pairs: Object.values(pairMap) };
}

function findCustomerAnySheet_(customerId) {
  const active = sheetAsObjects_(SHEETS.CUSTOMERS);
  const rec = active.out.find(c => c.CustomerID === customerId);
  if (rec) return { sh: active.sh, headers: active.headers, rec, closed: false };
  const closed = sheetAsObjects_(SHEETS.CLOSED_CUSTOMERS);
  const rec2 = closed.out.find(c => c.CustomerID === customerId);
  if (rec2) return { sh: closed.sh, headers: closed.headers, rec: rec2, closed: true };
  return null;
}

function findDayRow_(branch, dateStr) {
  const { out } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  return out.find(r => r.Branch === branch && dateStr_(r.Date) === dateStr) || null;
}

function mostRecentPriorRow_(branch, beforeDateStr) {
  const { out } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const candidates = out.filter(r => r.Branch === branch && dateStr_(r.Date) < beforeDateStr);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (dateStr_(a.Date) < dateStr_(b.Date) ? 1 : -1));
  return candidates[0];
}

function latestRowUpTo_(branch, dateStr) {
  return findDayRow_(branch, dateStr) || mostRecentPriorRow_(branch, dateStr);
}

function ensureDayRowUnlocked_(branch, dateStr) {
  const existing = findDayRow_(branch, dateStr);
  if (existing) return existing;
  const prior = mostRecentPriorRow_(branch, dateStr);
  const carry = prior ? {
    OpeningCustomers: Number(prior.TotalCustomers) || 0,
    OpeningOutstanding: Number(prior.TotalOutstanding) || 0,
    TotalCustomers: Number(prior.TotalCustomers) || 0,
    TotalOutstanding: Number(prior.TotalOutstanding) || 0,
    DeathNo: Number(prior.DeathNo) || 0,
    DeathOutstanding: Number(prior.DeathOutstanding) || 0,
    OpenCash: Number(prior.CloseCash) || 0,
    CloseCash: Number(prior.CloseCash) || 0
  } : { OpeningCustomers: 0, OpeningOutstanding: 0, TotalCustomers: 0, TotalOutstanding: 0,
    DeathNo: 0, DeathOutstanding: 0, OpenCash: 0, CloseCash: 0 };
  const flow = { PNBDeposit: 0, PNBUPI: 0, HDFCDeposit: 0, HDFCUPI: 0, MiscInc: 0, MiscExp: 0, FulpaidNo: 0, DisbNo: 0, DisbAmt: 0 };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DAILY_LEDGER);
  const rowNum = sh.getLastRow() + 1;
  sh.appendRow([dateStr, branch, carry.OpeningCustomers, carry.OpeningOutstanding, carry.TotalCustomers, carry.TotalOutstanding,
    carry.DeathNo, carry.DeathOutstanding, carry.OpenCash, carry.CloseCash,
    flow.PNBDeposit, flow.PNBUPI, flow.HDFCDeposit, flow.HDFCUPI, flow.MiscInc, flow.MiscExp,
    flow.FulpaidNo, flow.DisbNo, flow.DisbAmt, new Date()]);
  return Object.assign({ _row: rowNum, Date: dateStr, Branch: branch, hadNoPriorRow: !prior }, carry, flow);
}

function withDayRowLock_(branch, dateStr, fn) {
  return withKeyedLock_('dayrow_' + branch + '_' + dateStr, () => {
    const row = ensureDayRowUnlocked_(branch, dateStr);
    return fn(row);
  });
}

function adjustDayRow_(branch, dateStr, deltas) {
  if (!branch) return;
  const hasChange = Object.values(deltas).some(v => v);
  if (!hasChange) return;
  withDayRowLock_(branch, dateStr, (row) => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DAILY_LEDGER);
    const newVals = {
      TotalCustomers: (Number(row.TotalCustomers) || 0) + (deltas.customers || 0),
      TotalOutstanding: (Number(row.TotalOutstanding) || 0) + (deltas.outstanding || 0),
      DeathNo: (Number(row.DeathNo) || 0) + (deltas.deathNo || 0),
      DeathOutstanding: (Number(row.DeathOutstanding) || 0) + (deltas.deathOutstanding || 0),
      CloseCash: (Number(row.CloseCash) || 0) + (deltas.cash || 0),
      PNBDeposit: (Number(row.PNBDeposit) || 0) + (deltas.pnbDeposit || 0),
      PNBUPI: (Number(row.PNBUPI) || 0) + (deltas.pnbUpi || 0),
      HDFCDeposit: (Number(row.HDFCDeposit) || 0) + (deltas.hdfcDeposit || 0),
      HDFCUPI: (Number(row.HDFCUPI) || 0) + (deltas.hdfcUpi || 0),
      MiscInc: (Number(row.MiscInc) || 0) + (deltas.miscInc || 0),
      MiscExp: (Number(row.MiscExp) || 0) + (deltas.miscExp || 0),
      FulpaidNo: (Number(row.FulpaidNo) || 0) + (deltas.fulpaidNo || 0),
      DisbNo: (Number(row.DisbNo) || 0) + (deltas.disbNo || 0),
      DisbAmt: (Number(row.DisbAmt) || 0) + (deltas.disbAmt || 0)
    };
    DAILY_LEDGER_HEADERS.forEach((h, i) => {
      if (newVals[h] !== undefined) sh.getRange(row._row, i + 1).setValue(newVals[h]);
    });
    sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('UpdatedAt') + 1).setValue(new Date());
  });
}

function propagateForward_(branch, fromDateStr, deltas) {
  if (!branch) return;
  const hasChange = Object.values(deltas).some(v => v);
  if (!hasChange) return;
  withKeyedLock_('dayrow_' + branch + '_HISTORY', () => {
    ensureDayRowUnlocked_(branch, fromDateStr); 
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DAILY_LEDGER);
    const { out } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
    const affected = out.filter(r => r.Branch === branch && dateStr_(r.Date) >= fromDateStr)
      .sort((a, b) => (dateStr_(a.Date) < dateStr_(b.Date) ? -1 : 1));
    affected.forEach(row => {
      const newVals = {
        TotalCustomers: (Number(row.TotalCustomers) || 0) + (deltas.customers || 0),
        TotalOutstanding: (Number(row.TotalOutstanding) || 0) + (deltas.outstanding || 0),
        DeathNo: (Number(row.DeathNo) || 0) + (deltas.deathNo || 0),
        DeathOutstanding: (Number(row.DeathOutstanding) || 0) + (deltas.deathOutstanding || 0),
        OpenCash: (Number(row.OpenCash) || 0) + (deltas.cash || 0),
        CloseCash: (Number(row.CloseCash) || 0) + (deltas.cash || 0)
      };
      DAILY_LEDGER_HEADERS.forEach((h, i) => {
        if (newVals[h] !== undefined) sh.getRange(row._row, i + 1).setValue(newVals[h]);
      });
      sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('UpdatedAt') + 1).setValue(new Date());
    });
  });
}

function applyOutstandingDelta_(cust, delta) {
  if (!delta || !cust) return;
  const isDeath = String(cust.EMI || '').trim().toLowerCase() === 'death';
  adjustDayRow_(cust.BranchName, todayStr_(), { outstanding: delta, deathOutstanding: isDeath ? delta : 0 });
}

function rebuildDailyLedger() {
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: areaRows } = sheetAsObjects_(SHEETS.AREAS);
  const branches = [...new Set(areaRows.map(r => r.BranchName))];
  const today = todayStr_();

  branches.forEach(branch => {
    const active = custs.filter(c => c.BranchName === branch); 
    const totalCustomers = active.length;
    const totalOutstanding = active.reduce((s, c) => s + (Number(c.CurrentOutstanding) || 0), 0);
    const deathCusts = active.filter(c => String(c.EMI || '').trim().toLowerCase() === 'death');
    const deathNo = deathCusts.length;
    const deathOutstanding = deathCusts.reduce((s, c) => s + (Number(c.CurrentOutstanding) || 0), 0);

    withDayRowLock_(branch, today, (row) => {
      const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DAILY_LEDGER);
      const vals = { TotalCustomers: totalCustomers, TotalOutstanding: totalOutstanding, DeathNo: deathNo, DeathOutstanding: deathOutstanding };
      DAILY_LEDGER_HEADERS.forEach((h, i) => { if (vals[h] !== undefined) sh.getRange(row._row, i + 1).setValue(vals[h]); });
      sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('UpdatedAt') + 1).setValue(new Date());
    });
  });
  Logger.log('DailyLedger seeded for ' + branches.length + ' branches on ' + today + '.');
  return { ok: true, branches: branches.length };
}

function dailyRollover() {
  const { out: areaRows } = sheetAsObjects_(SHEETS.AREAS);
  const branches = [...new Set(areaRows.map(r => r.BranchName))];
  const today = todayStr_();

  branches.forEach(branch => {
    withDayRowLock_(branch, today, () => {});
  });
  Logger.log('Daily rollover done for ' + branches.length + ' branches on ' + today + '.');
}

function installDailyRolloverTrigger_() {
  const already = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyRollover');
  if (already) return;
  ScriptApp.newTrigger('dailyRollover').timeBased().everyDays(1).atHour(0).create();
}

function moveCustomerToClosed_(activeRec) {
  const closedSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CLOSED_CUSTOMERS);
  const values = CUSTOMER_HEADERS.map(h => activeRec[h]);
  values.push(new Date());
  closedSh.appendRow(values);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CUSTOMERS).deleteRow(activeRec._row);
}

function moveCustomerToActive_(closedRec) {
  const activeSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CUSTOMERS);
  const values = CUSTOMER_HEADERS.map(h => closedRec[h]);
  activeSh.appendRow(values);
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CLOSED_CUSTOMERS).deleteRow(closedRec._row);
}

function syncCustomerClosedState_(customerId) {
  const found = findCustomerAnySheet_(customerId);
  if (!found) return;
  const outstanding = Number(found.rec.CurrentOutstanding) || 0;
  const isDeath = String(found.rec.EMI || '').trim().toLowerCase() === 'death';
  if (!found.closed && outstanding <= 0) {
    moveCustomerToClosed_(found.rec);
    adjustDayRow_(found.rec.BranchName, todayStr_(), { customers: -1, deathNo: isDeath ? -1 : 0, fulpaidNo: 1 });
  } else if (found.closed && outstanding > 0) {
    moveCustomerToActive_(found.rec);
    adjustDayRow_(found.rec.BranchName, todayStr_(), { customers: 1, deathNo: isDeath ? 1 : 0, fulpaidNo: -1 });
  }
}

function submitCollection_(body) {
  const payload = verifyToken_(body.token);
  const putAmt = Number(body.putAmt);
  if (body.putAmt === undefined || body.putAmt === null || body.putAmt === '' || isNaN(putAmt) || putAmt < 0) {
    return { ok: false, error: 'Please enter a valid amount (0 or more)' };
  }

  return withKeyedLock_('coll_' + body.customerId, () => {
    const { sh, headers, out } = sheetAsObjects_(SHEETS.CUSTOMERS);
    const cust = out.find(c => c.CustomerID === body.customerId);
    if (!cust) return { ok: false, error: 'Customer not found' };
    if (!amAuthorized_(payload, cust.BranchName) && cust.BranchName !== payload.branch) {
      return { ok: false, error: 'You do not have permission for this customer' };
    }

    
    
    const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
    const today = todayStr_();
    const already = colls.some(r => r.CustomerID === cust.CustomerID && dateStr_(r.Timestamp) === today);
    if (already) {
      return { ok: false, error: 'Already submitted for today. Ask your Admin to edit or delete it.' };
    }

    const before = Number(cust.CurrentOutstanding) || 0;
    const after = Math.max(0, before - putAmt);
    const outCol = headers.indexOf('CurrentOutstanding') + 1;
    sh.getRange(cust._row, outCol).setValue(after);
    applyOutstandingDelta_(cust, after - before);
    
    
    
    const custArea = branchAreaLookup_(cust.BranchName);
    adjustDayRow_(cust.BranchName, today, { cash: putAmt });

    const logSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.COLLECTIONS);
    logSh.appendRow([new Date(), payload.phone, payload.name, cust.BranchName, custArea,
      cust.CustomerID, cust.CustomerName, cust.GroupName, putAmt, before, after]);
    if (after <= 0) syncCustomerClosedState_(cust.CustomerID);
    return { ok: true, newOutstanding: after };
  });
}

const LOAN_TABLE = {
  10000: { outstanding: 12400, emi: 250, lastEmi: 150 },
  15000: { outstanding: 18600, emi: 375, lastEmi: 225 },
  20000: { outstanding: 24800, emi: 500, lastEmi: 300 },
  25000: { outstanding: 31000, emi: 620, lastEmi: 620 },
  30000: { outstanding: 37200, emi: 750, lastEmi: 450 },
  35000: { outstanding: 43400, emi: 870, lastEmi: 770 },
  40000: { outstanding: 49600, emi: 1000, lastEmi: 600 },
  45000: { outstanding: 55800, emi: 1120, lastEmi: 920 },
  50000: { outstanding: 62000, emi: 1250, lastEmi: 750 },
  55000: { outstanding: 68200, emi: 1380, lastEmi: 580 },
  60000: { outstanding: 74400, emi: 1500, lastEmi: 900 }
};

function addDisbursement_(body) {
  const payload = verifyToken_(body.token);
  const { sh, out } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const areaRow = branchAreaLookup_(payload.branch);
  const newId = 'C' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const loanAmt = Number(body.loanAmt) || 0;
  const slab = LOAN_TABLE[loanAmt];
  if (!slab) return { ok: false, error: 'Loan amount must be one of the standard slabs (10,000 to 60,000 in steps of 5,000)' };
  const outstandingWithMarkup = slab.outstanding;
  const emi = slab.emi;
  const disbDate = todayStr_(); 
  sh.appendRow([
    newId, body.day || '', body.groupName || '', body.customerName || '', disbDate,
    loanAmt, emi, body.husbandName || '', body.phNo || '', payload.branch, areaRow,
    outstandingWithMarkup, outstandingWithMarkup, body.aadharNo || '', body.panNo || '', body.acNo || '', body.ifscCode || '',
    'Active', new Date()
  ]);
  const logSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DISBURSEMENTS);
  logSh.appendRow([new Date(), payload.phone, payload.branch, areaRow, newId, body.customerName,
    body.groupName, loanAmt, disbDate, emi]);
  adjustDayRow_(payload.branch, todayStr_(), { customers: 1, outstanding: outstandingWithMarkup, disbNo: 1, disbAmt: loanAmt });
  return { ok: true, customerId: newId };
}

function deleteCollection_(body) {
  const payload = verifyToken_(body.token);

  const rowNum = Number(body.row);
  if (!rowNum || rowNum < 2) return { ok: false, error: 'Invalid collection reference' };

  return withKeyedLock_('collrow_' + rowNum, () => {
    const { sh: collSh, out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
    const rec = colls.find(r => r._row === rowNum);
    if (!rec) return { ok: false, error: 'Collection entry not found (already deleted?)' };
    if (normRole_(payload.role) !== 'ADMIN') return { ok: false, error: 'Only Admin can edit or delete a collection entry' };

    
    const found = findCustomerAnySheet_(rec.CustomerID);
    const collDate = dateStr_(rec.Timestamp);
    const isToday = collDate === todayStr_();
    if (found) {
      const outCol = found.headers.indexOf('CurrentOutstanding') + 1;
      const restoredAmt = Number(rec.PutAmt) || 0;
      const restored = (Number(found.rec.CurrentOutstanding) || 0) + restoredAmt;
      found.sh.getRange(found.rec._row, outCol).setValue(restored);
      const isDeath = String(found.rec.EMI || '').trim().toLowerCase() === 'death';
      if (isToday) {
        adjustDayRow_(rec.Branch, collDate, { outstanding: restoredAmt, deathOutstanding: isDeath ? restoredAmt : 0, cash: -restoredAmt });
      } else {
        propagateForward_(rec.Branch, collDate, { outstanding: restoredAmt, deathOutstanding: isDeath ? restoredAmt : 0, cash: -restoredAmt });
      }
    }

    
    collSh.deleteRow(rec._row);

    if (found) syncCustomerClosedState_(rec.CustomerID);
    return { ok: true, customerId: rec.CustomerID, restoredAmt: Number(rec.PutAmt) || 0 };
  });
}

function updateCollection_(body) {
  const payload = verifyToken_(body.token);
  const rowNum = Number(body.row);
  const newAmt = Number(body.newAmt);
  if (!rowNum || rowNum < 2) return { ok: false, error: 'Invalid collection reference' };
  if (isNaN(newAmt) || newAmt < 0) return { ok: false, error: 'Please enter a valid amount (0 or more)' };

  return withKeyedLock_('collrow_' + rowNum, () => {
    const { sh: collSh, headers: collHeaders, out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
    const rec = colls.find(r => r._row === rowNum);
    if (!rec) return { ok: false, error: 'Collection entry not found' };
    if (normRole_(payload.role) !== 'ADMIN') return { ok: false, error: 'Only Admin can edit or delete a collection entry' };

    const found = findCustomerAnySheet_(rec.CustomerID);
    const oldAmt = Number(rec.PutAmt) || 0;
    const diff = newAmt - oldAmt;
    const collDate = dateStr_(rec.Timestamp);
    const isToday = collDate === todayStr_();
    let newOutstanding = Number(rec.OutstandingAfter) || 0;
    if (found) {
      const beforeEdit = Number(found.rec.CurrentOutstanding) || 0;
      newOutstanding = Math.max(0, beforeEdit - diff);
      found.sh.getRange(found.rec._row, found.headers.indexOf('CurrentOutstanding') + 1).setValue(newOutstanding);
      const outstandingDelta = newOutstanding - beforeEdit;
      const isDeath = String(found.rec.EMI || '').trim().toLowerCase() === 'death';
      if (isToday) {
        adjustDayRow_(rec.Branch, collDate, { outstanding: outstandingDelta, deathOutstanding: isDeath ? outstandingDelta : 0, cash: diff });
      } else {
        propagateForward_(rec.Branch, collDate, { outstanding: outstandingDelta, deathOutstanding: isDeath ? outstandingDelta : 0, cash: diff });
      }
    }
    collSh.getRange(rec._row, collHeaders.indexOf('PutAmt') + 1).setValue(newAmt);
    collSh.getRange(rec._row, collHeaders.indexOf('OutstandingAfter') + 1).setValue(newOutstanding);
    if (found) syncCustomerClosedState_(rec.CustomerID);
    return { ok: true, newOutstanding };
  });
}

function getGroupsForBranch_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch;
  if (!amAuthorized_(payload, branch)) return { ok: false, error: 'Not authorized for this branch' };
  const { out: custRows } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: groupRows } = sheetAsObjects_(SHEETS.GROUPS);
  const customerGroups = custRows.filter(c => c.BranchName === branch && c.Status !== 'Closed');
  const createdGroups = groupRows.filter(g => g.BranchName === branch);
  const set = new Set([...customerGroups.map(c => c.GroupName), ...createdGroups.map(g => g.GroupName)]);
  return { ok: true, groups: [...set].filter(Boolean).sort() };
}

function getGroupCustomersForDate_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch, group = body.group, dateStr = body.date || todayStr_();
  if (!amAuthorized_(payload, branch)) return { ok: false, error: 'Not authorized for this branch' };
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const list = custs.filter(c => c.BranchName === branch && c.GroupName === group && c.Status !== 'Closed').map(c => {
    const rec = colls.find(r => r.CustomerID === c.CustomerID && dateStr_(r.Timestamp) === dateStr);
    return {
      customerId: c.CustomerID, name: c.CustomerName, husbandName: c.HusbandName, phNo: c.PhNo,
      loanAmt: c.LoanAmt, emi: c.EMI, currentOutstanding: c.CurrentOutstanding,
      collectionRow: rec ? rec._row : null, collectedAmt: rec ? rec.PutAmt : null
    };
  });
  return { ok: true, customers: list };
}

function branchAreaLookup_(branch) {
  const { out } = sheetAsObjects_(SHEETS.AREAS);
  const rec = out.find(r => r.BranchName === branch);
  return rec ? rec.AreaName : '';
}

function amAuthorized_(payload, branch) {
  if (normRole_(payload.role) === 'ADMIN') return true;
  if (isAreaRole_(payload.role)) return branchesForArea_(payload.area).indexOf(branch) !== -1;
  return false;
}

function todayStr_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function dateStr_(d) { return Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function getBranchSummary_(body) {
  const payload = verifyToken_(body.token);
  return branchSummaryFor_(payload.branch);
}

function getTodayCollections_() {
  return getCollectionsForDate_(todayStr_());
}

function getCollectionsForDate_(dateStr) {
  if (dateStr === todayStr_()) {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.COLLECTIONS);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];
    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    const windowSize = 3000;
    const startRow = Math.max(2, lastRow - windowSize + 1);
    const rows = sh.getRange(startRow, 1, lastRow - startRow + 1, lastCol).getValues();
    const out = [];
    rows.forEach(r => {
      if (r[0] === '' && r.every(c => c === '')) return;
      const obj = rowToObj_(headers, r);
      if (dateStr_(obj.Timestamp) === dateStr) out.push(obj);
    });
    return out;
  }
  const { out } = sheetAsObjects_(SHEETS.COLLECTIONS);
  let list = out.filter(r => dateStr_(r.Timestamp) === dateStr);
  if (!list.length) {
    const { out: archived } = sheetAsObjects_(SHEETS.COLLECTIONS_ARCHIVE);
    list = archived.filter(r => dateStr_(r.Timestamp) === dateStr);
  }
  return list;
}

function computeOverviewLive_(branch, custs, todayColls, allColls) {
  return computeOverviewLiveForDate_(branch, todayStr_(), custs, todayColls, allColls);
}

const OVERVIEW_DAY_NAMES_ = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function computeOverviewLiveForDate_(branch, dateStr, custs, dateColls, allColls) {
  const dayNames = OVERVIEW_DAY_NAMES_;
  const targetDayName = dayNames[new Date(dateStr + 'T00:00:00').getDay()];

  const collByCustomer = {};
  dateColls.forEach(r => { if (r.Branch === branch) collByCustomer[r.CustomerID] = r; });

  const branchCusts = custs.filter(c => c.BranchName === branch && c.Status !== 'Closed');

  let realizableNo = 0, realizableAmt = 0, realisedNo = 0, realisedAmt = 0, advanceAmt = 0, loanCloserAmt = 0,
    overdueNo = 0, overdueAmt = 0, overdueOutstanding = 0, overdueCollectAmt = 0, deathNo = 0, deathOutstanding = 0;

  branchCusts.forEach(c => {
    const emiStr = String(c.EMI || '').trim().toLowerCase();
    const emiNum = Number(c.EMI);
    const coll = collByCustomer[c.CustomerID];
    const putAmt = coll ? Number(coll.PutAmt) || 0 : 0;
    const outstanding = coll ? Number(coll.OutstandingAfter) || 0 : Number(c.CurrentOutstanding) || 0;

    if (emiStr === 'death') { deathNo++; deathOutstanding += outstanding; return; }

    const isDueToday = c.Day === targetDayName && isFinite(emiNum) && emiStr !== '';
    if (isDueToday) {
      realizableNo++; realizableAmt += emiNum;
      if (putAmt >= emiNum) {
        realisedNo++; realisedAmt += emiNum;
        const excess = putAmt - emiNum;
        if (outstanding <= 0) loanCloserAmt += excess; else advanceAmt += excess;
      }
    } else if (emiStr === 'timeover') {
      overdueNo++;
      overdueAmt += outstanding;
      overdueOutstanding += outstanding;
    }

    if (coll && (c.Day !== targetDayName || emiStr === 'timeover')) {
      overdueCollectAmt += putAmt;
    }
  });

  const netCollection = realisedAmt + advanceAmt + overdueCollectAmt + loanCloserAmt;

  return { realizableNo, realizableAmt, realisedNo, realisedAmt, advanceAmt, loanCloserAmt,
    overdueNo, overdueAmt, overdueOutstanding, overdueCollectAmt, netCollection, deathNo, deathOutstanding };
}

function branchSummaryFor_(branch, ledgerOut, custs, todayColls, allColls) {
  const today = todayStr_();
  const todayRow = ledgerOut ? ledgerOut.find(r => r.Branch === branch && dateStr_(r.Date) === today) : findDayRow_(branch, today);
  let row = todayRow;
  if (!row) {
    if (ledgerOut) {
      const priorRows = ledgerOut.filter(r => r.Branch === branch && dateStr_(r.Date) < today);
      priorRows.sort((a, b) => (dateStr_(a.Date) < dateStr_(b.Date) ? 1 : -1));
      row = priorRows[0] || null;
    } else {
      row = mostRecentPriorRow_(branch, today);
    }
  }

  custs = custs || sheetAsObjects_(SHEETS.CUSTOMERS).out;
  todayColls = todayColls || getTodayCollections_();
  const live = computeOverviewLive_(branch, custs, todayColls, allColls);

  if (!row) {
    return {
      ok: true, branch, customerCount: 0, totalOutstanding: 0,
      openCash: 0, closeCash: 0, cashStarted: false,
      ...live
    };
  }

  return {
    ok: true, branch,
    customerCount: Number(row.TotalCustomers) || 0,
    totalOutstanding: Number(row.TotalOutstanding) || 0,
    openCash: Number(row.OpenCash) || 0, closeCash: Number(row.CloseCash) || 0, cashStarted: true,
    ...live
  };
}

function grandLiveStatsForBranches_(branchSet, custs, dateColls, allColls, dateStr) {
  const dayNames = OVERVIEW_DAY_NAMES_;
  const targetDayName = dayNames[new Date(dateStr + 'T00:00:00').getDay()];

  const collByCustomer = {};
  dateColls.forEach(r => { if (branchSet.has(r.Branch)) collByCustomer[r.CustomerID] = r; });

  let realizableNo = 0, realizableAmt = 0, realisedNo = 0, realisedAmt = 0, advanceAmt = 0, loanCloserAmt = 0,
    overdueNo = 0, overdueAmt = 0, overdueOutstanding = 0, overdueCollectAmt = 0, deathNo = 0, deathOutstanding = 0;

  custs.forEach(c => {
    if (!branchSet.has(c.BranchName) || c.Status === 'Closed') return;
    const emiStr = String(c.EMI || '').trim().toLowerCase();
    const emiNum = Number(c.EMI);
    const coll = collByCustomer[c.CustomerID];
    const putAmt = coll ? Number(coll.PutAmt) || 0 : 0;
    const outstanding = coll ? Number(coll.OutstandingAfter) || 0 : Number(c.CurrentOutstanding) || 0;

    if (emiStr === 'death') { deathNo++; deathOutstanding += outstanding; return; }

    const isDueToday = c.Day === targetDayName && isFinite(emiNum) && emiStr !== '';
    if (isDueToday) {
      realizableNo++; realizableAmt += emiNum;
      if (putAmt >= emiNum) {
        realisedNo++; realisedAmt += emiNum;
        const excess = putAmt - emiNum;
        if (outstanding <= 0) loanCloserAmt += excess; else advanceAmt += excess;
      }
    } else if (emiStr === 'timeover') {
      overdueNo++;
      overdueAmt += outstanding;
      overdueOutstanding += outstanding;
    }

    if (coll && (c.Day !== targetDayName || emiStr === 'timeover')) {
      overdueCollectAmt += putAmt;
    }
  });

  const netCollection = realisedAmt + advanceAmt + overdueCollectAmt + loanCloserAmt;

  return { realizableNo, realizableAmt, realisedNo, realisedAmt, advanceAmt, loanCloserAmt,
    overdueNo, overdueAmt, overdueOutstanding, overdueCollectAmt, netCollection, deathNo, deathOutstanding };
}

function grandLedgerStatsForBranches_(branchSet, ledgerOut, dateStr) {
  const rowsByBranch = {};
  ledgerOut.forEach(r => {
    if (!branchSet.has(r.Branch)) return;
    (rowsByBranch[r.Branch] || (rowsByBranch[r.Branch] = [])).push(r);
  });

  let customerCount = 0, totalOutstanding = 0, openCash = 0, closeCash = 0;
  Object.keys(rowsByBranch).forEach(branch => {
    const rows = rowsByBranch[branch];
    let best = null, bestPrior = null;
    rows.forEach(r => {
      const d = dateStr_(r.Date);
      if (d === dateStr) { best = r; return; }
      if (d < dateStr && (!bestPrior || dateStr_(bestPrior.Date) < d)) bestPrior = r;
    });
    const row = best || bestPrior;
    if (!row) return;
    customerCount += Number(row.TotalCustomers) || 0;
    totalOutstanding += Number(row.TotalOutstanding) || 0;
    openCash += Number(row.OpenCash) || 0;
    closeCash += Number(row.CloseCash) || 0;
  });

  return { customerCount, totalOutstanding, openCash, closeCash };
}

function roundTo2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function nightReportRowForBranch_(branch, dateStr, ledgerOut, custs, dateColls, allColls) {
  const row = ledgerOut.find(r => r.Branch === branch && dateStr_(r.Date) === dateStr) || null;
  const live = computeOverviewLiveForDate_(branch, dateStr, custs, dateColls, allColls);

  const openingCustomer = row ? Number(row.OpeningCustomers) || 0 : 0;
  const openingOutstanding = row ? Number(row.OpeningOutstanding) || 0 : 0;
  const openCash = row ? Number(row.OpenCash) || 0 : 0;
  const closingCustomer = row ? Number(row.TotalCustomers) || 0 : 0;
  const closingOutstanding = row ? Number(row.TotalOutstanding) || 0 : 0;
  const closeCash = row ? Number(row.CloseCash) || 0 : 0;
  const pnbDeposit = row ? Number(row.PNBDeposit) || 0 : 0;
  const pnbUpi = row ? Number(row.PNBUPI) || 0 : 0;
  const hdfcDeposit = row ? Number(row.HDFCDeposit) || 0 : 0;
  const hdfcUpi = row ? Number(row.HDFCUPI) || 0 : 0;
  const miscInc = row ? Number(row.MiscInc) || 0 : 0;
  const miscExp = row ? Number(row.MiscExp) || 0 : 0;
  const fulpaidNo = row ? Number(row.FulpaidNo) || 0 : 0;
  const disbNo = row ? Number(row.DisbNo) || 0 : 0;
  const disbAmt = row ? Number(row.DisbAmt) || 0 : 0;

  const totalIncome = openCash + live.netCollection + miscInc;
  const totalExpense = pnbDeposit + hdfcDeposit + pnbUpi + hdfcUpi + miscExp;
  const otr = live.realizableAmt > 0 ? roundTo2_(live.realisedAmt / live.realizableAmt * 100) : 0;

  return {
    branch, openingCustomer, openingOutstanding, openCash,
    realizableNo: live.realizableNo, realizableAmt: live.realizableAmt,
    realisedNo: live.realisedNo, realisedAmt: live.realisedAmt,
    advanceAmt: live.advanceAmt, loanCloserAmt: live.loanCloserAmt, overdueCollectAmt: live.overdueCollectAmt,
    netCollection: live.netCollection, miscInc, totalIncome,
    fulpaidNo, disbNo, disbAmt,
    closingCustomer, closingOutstanding,
    pnbUpi, pnbDeposit, hdfcUpi, hdfcDeposit, miscExp, totalExpense, closeCash,
    otr,
    overdueNo: live.overdueNo, overdueAmt: live.overdueAmt, overdueOutstanding: live.overdueOutstanding
  };
}

const NIGHT_REPORT_SUM_KEYS = ['openingCustomer', 'openingOutstanding', 'openCash',
  'realizableNo', 'realizableAmt', 'realisedNo', 'realisedAmt', 'advanceAmt', 'loanCloserAmt',
  'overdueCollectAmt', 'netCollection', 'miscInc', 'totalIncome', 'fulpaidNo', 'disbNo', 'disbAmt',
  'closingCustomer', 'closingOutstanding', 'pnbUpi', 'pnbDeposit', 'hdfcUpi', 'hdfcDeposit',
  'miscExp', 'totalExpense', 'closeCash', 'overdueNo', 'overdueAmt', 'overdueOutstanding'];

function sumNightReportRows_(rows) {
  const total = { branch: 'Total' };
  NIGHT_REPORT_SUM_KEYS.forEach(k => { total[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); });
  total.otr = total.realizableAmt > 0 ? roundTo2_(total.realisedAmt / total.realizableAmt * 100) : 0;
  return total;
}

function getAreaSummary_(body) {
  const payload = verifyToken_(body.token);
  const branches = branchesForArea_(payload.area);
  const branchSet = new Set(branches);
  const today = todayStr_();
  const { out: ledgerOut } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const todayColls = getTodayCollections_();
  const { out: allColls } = sheetAsObjects_(SHEETS.COLLECTIONS);

  const live = grandLiveStatsForBranches_(branchSet, custs, todayColls, allColls, today);
  const ledger = grandLedgerStatsForBranches_(branchSet, ledgerOut, today);

  return { ok: true, area: payload.area, ...ledger, ...live };
}

function getAdminSummary_(body) {
  const payload = verifyToken_(body.token);
  requireAllBranchAccess_(payload);
  const { out: areaRows } = sheetAsObjects_(SHEETS.AREAS);
  const branchSet = new Set(areaRows.map(r => r.BranchName));
  const today = todayStr_();
  const { out: ledgerOut } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const todayColls = getTodayCollections_();
  const { out: allColls } = sheetAsObjects_(SHEETS.COLLECTIONS);

  const live = grandLiveStatsForBranches_(branchSet, custs, todayColls, allColls, today);
  const ledger = grandLedgerStatsForBranches_(branchSet, ledgerOut, today);

  return {
    ok: true,
    grandCustomerCount: ledger.customerCount,
    grandTotalOutstanding: ledger.totalOutstanding,
    grandNetCollection: live.netCollection,
    grandRealizableNo: live.realizableNo,
    grandRealizableAmt: live.realizableAmt,
    grandRealisedNo: live.realisedNo,
    grandRealisedAmt: live.realisedAmt,
    grandAdvanceAmt: live.advanceAmt,
    grandLoanCloserAmt: live.loanCloserAmt,
    grandOverdueNo: live.overdueNo,
    grandOverdueAmt: live.overdueAmt,
    grandOverdueOutstanding: live.overdueOutstanding,
    grandOverdueCollectAmt: live.overdueCollectAmt,
    grandDeathNo: live.deathNo,
    grandDeathOutstanding: live.deathOutstanding,
    grandOpenCash: ledger.openCash,
    grandCloseCash: ledger.closeCash
  };
}

function requireAdmin_(payload) {
  if (normRole_(payload.role) !== 'ADMIN') throw new Error('Admins only');
}

function getHOOverview_(body) {
  const payload = verifyToken_(body.token);
  requireAllBranchAccess_(payload);
  const branches = allowedBranchesForPayload_(payload);
  const today = todayStr_();

  const { out: ledgerOut } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const totals = branches.reduce((acc, branch) => {
    const rows = ledgerOut.filter(r => r.Branch === branch && dateStr_(r.Date) <= today);
    if (!rows.length) return acc;
    rows.sort((a, b) => (dateStr_(a.Date) < dateStr_(b.Date) ? 1 : -1));
    const row = rows[0]; 
    acc.totalCustomers += Number(row.TotalCustomers) || 0;
    acc.totalOutstanding += Number(row.TotalOutstanding) || 0;
    acc.deathNo += Number(row.DeathNo) || 0;
    acc.deathOutstanding += Number(row.DeathOutstanding) || 0;
    acc.openCash += Number(row.OpenCash) || 0;
    acc.closeCash += Number(row.CloseCash) || 0;
    return acc;
  }, { totalCustomers: 0, totalOutstanding: 0, deathNo: 0, deathOutstanding: 0, openCash: 0, closeCash: 0 });

  return { ok: true, ...totals, branchCount: branches.length };
}

function requireAllBranchAccess_(payload) {
  if (!isAllBranchRole_(payload.role)) throw new Error('You do not have permission to view this');
}

function allowedBranchesForPayload_(payload) {
  if (isBranchRole_(payload.role)) return [payload.branch];
  if (isAreaRole_(payload.role)) return branchesForArea_(payload.area);
  if (isAllBranchRole_(payload.role)) {
    const { out: areaRows } = sheetAsObjects_(SHEETS.AREAS);
    return [...new Set(areaRows.map(r => r.BranchName))];
  }
  return [];
}

function getLoanDisbReport_(body) {
  const payload = verifyToken_(body.token);
  const allowed = allowedBranchesForPayload_(payload);
  if (!allowed.length) return { ok: false, error: 'No branches available for your account' };
  const requested = body.branch || 'ALL';
  const branches = requested === 'ALL' ? allowed : (allowed.indexOf(requested) !== -1 ? [requested] : []);
  if (!branches.length) return { ok: false, error: 'You do not have permission for this branch' };
  const dateStr = body.date || todayStr_();

  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const custById = {};
  custs.forEach(c => { custById[c.CustomerID] = c; });

  const filtered = disb.filter(r => branches.indexOf(r.Branch) !== -1 && dateStr_(r.Timestamp) === dateStr);
  const rows = filtered.map(r => {
    const cust = custById[r.CustomerID] || {};
    return {
      disbDate: r.DisbDate, branch: r.Branch, group: r.GroupName, customerName: r.CustomerName,
      phNo: cust.PhNo || '', coApplicantName: cust.HusbandName || '',
      loanAmt: Number(r.LoanAmt) || 0, emiAmt: r.EMI, outstanding: Number(cust.CurrentOutstanding) || 0,
      aadharNo: cust.AadharNo || '', panNo: cust.PanNo || '', acNo: cust.ACNo || '', ifscCode: cust.IFSCCode || ''
    };
  });
  return {
    ok: true, dateStr, rows,
    totalLoanNo: rows.length,
    totalLoanAmt: rows.reduce((s, r) => s + r.loanAmt, 0)
  };
}

function getOutstandingReport_(body) {
  const payload = verifyToken_(body.token);
  const allowed = allowedBranchesForPayload_(payload);
  if (!allowed.length) return { ok: false, error: 'No branches available for your account' };
  const requested = body.branch || 'ALL';
  const branches = requested === 'ALL' ? allowed : (allowed.indexOf(requested) !== -1 ? [requested] : []);
  if (!branches.length) return { ok: false, error: 'You do not have permission for this branch' };
  const dateStr = body.date || todayStr_();

  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const dateColls = getCollectionsForDate_(dateStr);
  const collByCustomer = {};
  dateColls.forEach(r => { collByCustomer[r.CustomerID] = r; });

  const filtered = custs.filter(c => branches.indexOf(c.BranchName) !== -1 && c.Status !== 'Closed');
  const rows = filtered.map(c => {
    const coll = collByCustomer[c.CustomerID];
    const currentOutstanding = Number(c.CurrentOutstanding) || 0;
    const openingOutstanding = coll ? (Number(coll.OutstandingBefore) || 0) : currentOutstanding;
    const collection = coll ? (Number(coll.PutAmt) || 0) : 0;
    const closingOutstanding = coll ? (Number(coll.OutstandingAfter) || 0) : currentOutstanding;
    return {
      day: c.Day || '', branch: c.BranchName, group: c.GroupName, customerId: c.CustomerID, customerName: c.CustomerName,
      phNo: c.PhNo || '', husbandName: c.HusbandName || '', disbDate: c.DisbDate ? dateStr_(c.DisbDate) : '',
      disbAmt: Number(c.LoanAmt) || 0, emiAmt: c.EMI,
      openingOutstanding: openingOutstanding, collection: collection, closingOutstanding: closingOutstanding
    };
  });

  const total = {
    disbAmt: rows.reduce((s, r) => s + r.disbAmt, 0),
    openingOutstanding: rows.reduce((s, r) => s + r.openingOutstanding, 0),
    collection: rows.reduce((s, r) => s + r.collection, 0),
    closingOutstanding: rows.reduce((s, r) => s + r.closingOutstanding, 0)
  };

  return { ok: true, dateStr, rows, total };
}

function computeGroupOverviewForDate_(branch, dateStr, custs, dateColls) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDayName = dayNames[new Date(dateStr + 'T00:00:00').getDay()];
  const collByCustomer = {};
  dateColls.forEach(r => { if (r.Branch === branch) collByCustomer[r.CustomerID] = r; });

  const groups = {};
  custs.filter(c => c.BranchName === branch && c.Status !== 'Closed').forEach(c => {
    const g = c.GroupName || '';
    if (!groups[g]) groups[g] = { realizableAmt: 0, realisedAmt: 0, advanceAmt: 0, loanCloserAmt: 0, overdueCollectAmt: 0 };
    const emiStr = String(c.EMI || '').trim().toLowerCase();
    const emiNum = Number(c.EMI);
    const coll = collByCustomer[c.CustomerID];
    const putAmt = coll ? Number(coll.PutAmt) || 0 : 0;
    const outstanding = coll ? Number(coll.OutstandingAfter) || 0 : Number(c.CurrentOutstanding) || 0;
    if (emiStr === 'death') return;

    const isDueToday = c.Day === targetDayName && isFinite(emiNum) && emiStr !== '';
    if (isDueToday) {
      groups[g].realizableAmt += emiNum;
      if (putAmt >= emiNum) {
        groups[g].realisedAmt += emiNum;
        const excess = putAmt - emiNum;
        if (outstanding <= 0) groups[g].loanCloserAmt += excess; else groups[g].advanceAmt += excess;
      }
    }
    if (coll && (c.Day !== targetDayName || emiStr === 'timeover')) {
      groups[g].overdueCollectAmt += putAmt;
    }
  });

  return Object.keys(groups).sort().map(g => {
    const x = groups[g];
    return { group: g, realizableAmt: x.realizableAmt,
      netCollection: x.realisedAmt + x.advanceAmt + x.loanCloserAmt + x.overdueCollectAmt };
  });
}

function getCollectionReport_(body) {
  const payload = verifyToken_(body.token);
  const allowed = allowedBranchesForPayload_(payload);
  if (!allowed.length) return { ok: false, error: 'No branches available for your account' };
  const dateStr = body.date || todayStr_();
  const requestedBranch = body.branch || 'ALL';

  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const dateColls = getCollectionsForDate_(dateStr);

  if (requestedBranch === 'ALL') {
    const { out: allColls } = sheetAsObjects_(SHEETS.COLLECTIONS);
    const rows = allowed.map(b => {
      const live = computeOverviewLiveForDate_(b, dateStr, custs, dateColls, allColls);
      return { branch: b, realizableAmt: live.realizableAmt, netCollection: live.netCollection };
    });
    const total = {
      realizableAmt: rows.reduce((s, r) => s + r.realizableAmt, 0),
      netCollection: rows.reduce((s, r) => s + r.netCollection, 0)
    };
    return { ok: true, mode: 'branch', dateStr, rows, total };
  }

  if (allowed.indexOf(requestedBranch) === -1) return { ok: false, error: 'Not authorized for this branch' };
  const rows = computeGroupOverviewForDate_(requestedBranch, dateStr, custs, dateColls);
  const total = {
    realizableAmt: rows.reduce((s, r) => s + r.realizableAmt, 0),
    netCollection: rows.reduce((s, r) => s + r.netCollection, 0)
  };
  return { ok: true, mode: 'group', dateStr, branch: requestedBranch, rows, total };
}

function getSimpleNightReport_(body) {
  const payload = verifyToken_(body.token);
  const allowed = allowedBranchesForPayload_(payload);
  if (!allowed.length) return { ok: false, error: 'No branches available for your account' };
  const dateStr = body.date || todayStr_();
  const requestedBranch = body.branch;
  const branches = requestedBranch ? (allowed.indexOf(requestedBranch) !== -1 ? [requestedBranch] : []) : allowed;
  if (!branches.length) return { ok: false, error: 'Not authorized for this branch' };

  const { out: ledgerOut } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const dateColls = getCollectionsForDate_(dateStr);
  const { out: allColls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const rows = branches.map(b => nightReportRowForBranch_(b, dateStr, ledgerOut, custs, dateColls, allColls));
  const summary = sumNightReportRows_(rows);
  return { ok: true, dateStr, summary };
}

function getDetailedNightReport_(body) {
  const payload = verifyToken_(body.token);
  const allowed = allowedBranchesForPayload_(payload);
  if (!allowed.length) return { ok: false, error: 'No branches available for your account' };
  const dateStr = body.date || todayStr_();
  const requestedBranch = body.branch;
  const branches = requestedBranch ? (allowed.indexOf(requestedBranch) !== -1 ? [requestedBranch] : []) : allowed;
  if (!branches.length) return { ok: false, error: 'Not authorized for this branch' };

  const { out: ledgerOut } = sheetAsObjects_(SHEETS.DAILY_LEDGER);
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const dateColls = getCollectionsForDate_(dateStr);
  const { out: allColls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const rows = branches.map(b => nightReportRowForBranch_(b, dateStr, ledgerOut, custs, dateColls, allColls));
  const total = sumNightReportRows_(rows);
  return { ok: true, dateStr, rows, total };
}

function getAttendance_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch || payload.branch;
  if (!amAuthorized_(payload, branch) && payload.branch !== branch) return { ok: false, error: 'Not authorized for this branch' };
  const dateStr = body.date || todayStr_();
  const { out: staffOut } = sheetAsObjects_(SHEETS.STAFF);
  const { out: attOut } = sheetAsObjects_(SHEETS.ATTENDANCE);
  const branchStaff = staffOut.filter(s => s.Branch === branch);
  const list = branchStaff.map(s => {
    const rec = attOut.find(r => r.Branch === branch && r.StaffPhone === s.Phone && dateStr_(r.Date) === dateStr);
    return {
      phone: s.Phone, name: s.Name, role: s.Role, status: computeAttendanceStatus_(rec),
      checkInTime: rec ? rec.CheckInTime : '', checkOutTime: rec ? rec.CheckOutTime : ''
    };
  });
  return { ok: true, dateStr, staff: list };
}


function distanceMeters_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function branchLocationFor_(branch) {
  const { out } = sheetAsObjects_(SHEETS.BRANCH_LOCATIONS);
  return out.find(r => r.BranchName === branch) || null;
}

function setBranchLocation_(body) {
  const payload = verifyToken_(body.token);
  const lat = Number(body.latitude), lng = Number(body.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return { ok: false, error: 'Location not available' };
  const { sh, out } = sheetAsObjects_(SHEETS.BRANCH_LOCATIONS);
  const existing = out.find(r => r.BranchName === payload.branch);
  if (existing) return { ok: false, error: 'Location already set for this branch. Ask Admin to reset it first.' };
  sh.appendRow([payload.branch, lat, lng, payload.name, new Date()]);
  return { ok: true };
}

function resetBranchLocation_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const branch = body.branch;
  if (!branch) return { ok: false, error: 'Branch is required' };
  const { sh, out } = sheetAsObjects_(SHEETS.BRANCH_LOCATIONS);
  const existing = out.find(r => r.BranchName === branch);
  if (!existing) return { ok: false, error: 'No location set for this branch' };
  sh.deleteRow(existing._row);
  return { ok: true };
}

function getBranchLocation_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch || payload.branch;
  const loc = branchLocationFor_(branch);
  if (!loc) return { ok: true, set: false };
  return { ok: true, set: true, latitude: Number(loc.Latitude), longitude: Number(loc.Longitude) };
}

function getBranchLocations_(body) {
  const payload = verifyToken_(body.token);
  requireAllBranchAccess_(payload);
  const { out } = sheetAsObjects_(SHEETS.BRANCH_LOCATIONS);
  return { ok: true, locations: out.map(r => ({
    branch: r.BranchName, latitude: Number(r.Latitude), longitude: Number(r.Longitude), setBy: r.SetBy, setAt: r.SetAt
  })) };
}

function nearestBranchLocation_(lat, lng) {
  const { out } = sheetAsObjects_(SHEETS.BRANCH_LOCATIONS);
  if (!out.length) return null;
  let best = null;
  out.forEach(loc => {
    const dist = distanceMeters_(lat, lng, Number(loc.Latitude), Number(loc.Longitude));
    if (!best || dist < best.dist) best = { dist, branch: loc.BranchName };
  });
  return best;
}

function checkIn_(body) {
  const payload = verifyToken_(body.token);
  const lat = Number(body.latitude), lng = Number(body.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return { ok: false, error: 'Location not available - please allow location access and try again' };

  const nearest = nearestBranchLocation_(lat, lng);
  if (!nearest) return { ok: false, error: 'No branch locations set yet' };
  if (nearest.dist > CHECKIN_RADIUS_METERS) {
    return { ok: false, error: 'You are ' + Math.round(nearest.dist) + 'm from the nearest office (' + nearest.branch + '). Must be within ' + CHECKIN_RADIUS_METERS + 'm to check in.' };
  }

  const today = todayStr_();
  return withKeyedLock_('att_' + payload.branch + '_' + payload.phone + '_' + today, () => {
    const { sh, headers, out } = sheetAsObjects_(SHEETS.ATTENDANCE);
    const existing = out.find(r => r.Branch === payload.branch && r.StaffPhone === payload.phone && dateStr_(r.Date) === today);
    if (existing && existing.CheckInTime) return { ok: false, error: 'Already checked in today at ' + existing.CheckInTime };
    const timeLabel = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
    if (existing) {
      sh.getRange(existing._row, headers.indexOf('CheckInTime') + 1).setValue(timeLabel);
      sh.getRange(existing._row, headers.indexOf('CheckInLat') + 1).setValue(lat);
      sh.getRange(existing._row, headers.indexOf('CheckInLng') + 1).setValue(lng);
    } else {
      sh.appendRow([today, payload.branch, payload.area || '', payload.phone, payload.name, '', '', '',
        timeLabel, lat, lng, '', '', '']);
    }
    return { ok: true, checkInTime: timeLabel, onTime: timeLabel < CHECKIN_CUTOFF };
  });
}

function checkOut_(body) {
  const payload = verifyToken_(body.token);
  const lat = Number(body.latitude), lng = Number(body.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return { ok: false, error: 'Location not available - please allow location access and try again' };

  const nowTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
  if (nowTime < CHECKOUT_CUTOFF) return { ok: false, error: 'Check-out is only allowed after 5:00 PM' };

  const nearest = nearestBranchLocation_(lat, lng);
  if (!nearest) return { ok: false, error: 'No branch locations set yet' };
  if (nearest.dist > CHECKIN_RADIUS_METERS) {
    return { ok: false, error: 'You are ' + Math.round(nearest.dist) + 'm from the nearest office (' + nearest.branch + '). Must be within ' + CHECKIN_RADIUS_METERS + 'm to check out.' };
  }

  const today = todayStr_();
  return withKeyedLock_('att_' + payload.branch + '_' + payload.phone + '_' + today, () => {
    const { sh, headers, out } = sheetAsObjects_(SHEETS.ATTENDANCE);
    const existing = out.find(r => r.Branch === payload.branch && r.StaffPhone === payload.phone && dateStr_(r.Date) === today);
    if (!existing || !existing.CheckInTime) return { ok: false, error: 'You have not checked in today yet' };
    if (existing.CheckOutTime) return { ok: false, error: 'Already checked out today at ' + existing.CheckOutTime };
    sh.getRange(existing._row, headers.indexOf('CheckOutTime') + 1).setValue(nowTime);
    sh.getRange(existing._row, headers.indexOf('CheckOutLat') + 1).setValue(lat);
    sh.getRange(existing._row, headers.indexOf('CheckOutLng') + 1).setValue(lng);
    return { ok: true, checkOutTime: nowTime };
  });
}

function computeAttendanceStatus_(row) {
  if (row && row.CheckInTime) {
    if (row.CheckOutTime && row.CheckInTime < CHECKIN_CUTOFF && row.CheckOutTime >= CHECKOUT_CUTOFF) return 'Full';
    return 'Half';
  }
  return 'Absent';
}

function getAttendanceRegister_(body) {
  const payload = verifyToken_(body.token);
  requireAllBranchAccess_(payload);
  const fromDate = body.fromDate || todayStr_();
  const toDate = body.toDate || todayStr_();

  const dates = [];
  const d = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  while (d <= end && dates.length < 62) {
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    d.setDate(d.getDate() + 1);
  }

  const { out: staffOut } = sheetAsObjects_(SHEETS.STAFF);
  let staffList = staffOut.filter(s => isBranchRole_(s.Role) || isAreaRole_(s.Role));
  if (body.branch) staffList = staffList.filter(s => s.Branch === body.branch);

  const { out: attOut } = sheetAsObjects_(SHEETS.ATTENDANCE);

  const rows = staffList.map(s => {
    const byDate = {};
    let fullCount = 0, halfCount = 0, absentCount = 0;
    dates.forEach(dt => {
      const rec = attOut.find(r => r.StaffPhone === s.Phone && dateStr_(r.Date) === dt);
      const status = computeAttendanceStatus_(rec);
      byDate[dt] = status;
      if (status === 'Full' || status === 'Present') fullCount++;
      else if (status === 'Half') halfCount++;
      else absentCount++;
    });
    return { phone: s.Phone, name: s.Name, branch: s.Branch, byDate, fullCount, halfCount, absentCount };
  });

  return { ok: true, dates, rows };
}

function addExpense_(body) {
  const payload = verifyToken_(body.token);
  const amount = Number(body.amount);
  if (!body.category) return { ok: false, error: 'Please choose a category' };
  if (isNaN(amount) || amount <= 0) return { ok: false, error: 'Please enter a valid amount' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EXPENSES);
  sh.appendRow([new Date(), payload.phone, payload.name, payload.branch, payload.area, body.category, amount, body.note || '']);
  return { ok: true };
}

function getExpenses_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch || payload.branch;
  if (!amAuthorized_(payload, branch) && payload.branch !== branch) return { ok: false, error: 'Not authorized for this branch' };
  const { out } = sheetAsObjects_(SHEETS.EXPENSES);
  const list = out.filter(r => r.Branch === branch).slice(-100).reverse();
  return { ok: true, expenses: list };
}

function getStaffList_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const { out } = sheetAsObjects_(SHEETS.STAFF);
  return { ok: true, staff: out.map(s => ({
    phone: s.Phone, name: s.Name, role: s.Role, branch: s.Branch, area: s.Area, salary: s.Salary
  })) };
}

function addStaff_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  return withKeyedLock_('staffphone_' + body.phone, () => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.STAFF);
    const { out } = sheetAsObjects_(SHEETS.STAFF);
    if (out.some(s => String(s.Phone) === String(body.phone))) return { ok: false, error: 'This phone number is already registered' };
    sh.appendRow([
      body.phone, body.name, hash_(body.phone, 'Sampoorn'), body.role, body.branch || '', body.area || '', true, new Date(),
      body.accountNo || '', body.ifsc || '', body.salary || '', body.security || '', body.address || '',
      body.aadhar || '', body.pan || '', body.dl || '', body.idCard || '', body.qualification || '', body.leave || ''
    ]);
    return { ok: true };
  });
}

function resetStaffPassword_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const { sh, headers, out } = sheetAsObjects_(SHEETS.STAFF);
  const rec = out.find(s => String(s.Phone) === String(body.phone));
  if (!rec) return { ok: false, error: 'User not found' };
  const pwCol = headers.indexOf('PasswordHash') + 1;
  const mustCol = headers.indexOf('MustChangePassword') + 1;
  sh.getRange(rec._row, pwCol).setValue(hash_(rec.Phone, 'Sampoorn'));
  sh.getRange(rec._row, mustCol).setValue(true);
  clearLoginFailures_(String(rec.Phone));
  return { ok: true };
}

function getAllowedBranches_(body) {
  const payload = verifyToken_(body.token);
  return { ok: true, branches: allowedBranchesForPayload_(payload) };
}

function getAMDisbursements_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch;
  if (!amAuthorized_(payload, branch)) return { ok: false, error: 'Not authorized for this branch' };
  const dateStr = body.date || todayStr_();
  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const list = disb.filter(r => r.Branch === branch && dateStr_(r.Timestamp) === dateStr)
    .map(r => ({ customerId: r.CustomerID, customerName: r.CustomerName, groupName: r.GroupName, loanAmt: r.LoanAmt, disbDate: r.DisbDate, emi: r.EMI }));
  return { ok: true, disbursements: list };
}

function getCustomerDetails_(body) {
  const payload = verifyToken_(body.token);
  const found = findCustomerAnySheet_(body.customerId);
  if (!found) return { ok: false, error: 'Customer not found' };
  const cust = found.rec;
  if (!amAuthorized_(payload, cust.BranchName) && payload.branch !== cust.BranchName) {
    return { ok: false, error: 'Not authorized for this customer' };
  }
  return { ok: true, customer: cust };
}

function updateCustomerDetails_(body) {
  const payload = verifyToken_(body.token);
  const found = findCustomerAnySheet_(body.customerId);
  if (!found) return { ok: false, error: 'Customer not found' };
  if (!amAuthorized_(payload, found.rec.BranchName)) return { ok: false, error: 'Not authorized for this customer' };

  
  
  
  
  const beforeOutstanding = Number(found.rec.CurrentOutstanding) || 0;
  const wasDeath = String(found.rec.EMI || '').trim().toLowerCase() === 'death';
  const wasClosedBefore = found.closed;

  const editable = ['CustomerName', 'HusbandName', 'PhNo', 'Day', 'GroupName', 'LoanAmt', 'EMI',
    'DisbDate', 'AadharNo', 'PanNo', 'ACNo', 'IFSCCode', 'CurrentOutstanding'];
  editable.forEach(field => {
    if (body[field] !== undefined && body[field] !== null) {
      const col = found.headers.indexOf(field) + 1;
      if (col > 0) found.sh.getRange(found.rec._row, col).setValue(body[field]);
    }
  });

  
  
  
  
  
  
  
  const afterOutstanding = body.CurrentOutstanding !== undefined ? Number(body.CurrentOutstanding) || 0 : beforeOutstanding;
  const isDeathNow = body.EMI !== undefined ? String(body.EMI).trim().toLowerCase() === 'death' : wasDeath;
  const willBeClosedAfter = afterOutstanding <= 0;

  const contribBefore = wasClosedBefore ? 0 : beforeOutstanding;
  const contribAfter = willBeClosedAfter ? 0 : afterOutstanding;
  const outstandingDelta = contribAfter - contribBefore;

  const deathContribBefore = (!wasClosedBefore && wasDeath) ? beforeOutstanding : 0;
  const deathContribAfter = (!willBeClosedAfter && isDeathNow) ? afterOutstanding : 0;
  const deathOutstandingDelta = deathContribAfter - deathContribBefore;

  let deathNoDelta = 0;
  if (wasClosedBefore === willBeClosedAfter) { 
    const wasCounted = !wasClosedBefore && wasDeath;
    const isCounted = !willBeClosedAfter && isDeathNow;
    deathNoDelta = (isCounted ? 1 : 0) - (wasCounted ? 1 : 0);
  }

  adjustDayRow_(found.rec.BranchName, todayStr_(), { outstanding: outstandingDelta, deathNo: deathNoDelta, deathOutstanding: deathOutstandingDelta });

  
  
  if (body.CurrentOutstanding !== undefined) syncCustomerClosedState_(body.customerId);
  return { ok: true };
}

function getAMTransactions_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch;
  if (!amAuthorized_(payload, branch)) return { ok: false, error: 'Not authorized for this branch' };
  const dateStr = body.date || todayStr_();
  const { out } = sheetAsObjects_(SHEETS.TRANSACTIONS);
  const list = out.filter(r => r.Branch === branch && dateStr_(r.Timestamp) === dateStr)
    .map(r => ({ row: r._row, staffName: r.StaffName, pnbDeposit: r.PNBDeposit, hdfcDeposit: r.HDFCDeposit,
      pnbUpi: r.PNBUPI, hdfcUpi: r.HDFCUPI, total: r.Total, miscInc: r.MiscInc, miscExp: r.MiscExp, timestamp: r.Timestamp }));
  return { ok: true, transactions: list };
}

function updateTransaction_(body) {
  const payload = verifyToken_(body.token);
  const { sh, headers, out } = sheetAsObjects_(SHEETS.TRANSACTIONS);
  const rec = out.find(r => r._row === Number(body.row));
  if (!rec) return { ok: false, error: 'Transaction not found' };
  if (!amAuthorized_(payload, rec.Branch)) return { ok: false, error: 'Not authorized for this branch' };
  const pnbDeposit = Number(body.pnbDeposit) || 0, hdfcDeposit = Number(body.hdfcDeposit) || 0,
    pnbUpi = Number(body.pnbUpi) || 0, hdfcUpi = Number(body.hdfcUpi) || 0,
    miscInc = Number(body.miscInc) || 0, miscExp = Number(body.miscExp) || 0;
  const total = pnbDeposit + hdfcDeposit + pnbUpi + hdfcUpi;
  const oldPnbDeposit = Number(rec.PNBDeposit) || 0, oldHdfcDeposit = Number(rec.HDFCDeposit) || 0,
    oldPnbUpi = Number(rec.PNBUPI) || 0, oldHdfcUpi = Number(rec.HDFCUPI) || 0,
    oldMiscInc = Number(rec.MiscInc) || 0, oldMiscExp = Number(rec.MiscExp) || 0, oldTotal = Number(rec.Total) || 0;
  sh.getRange(rec._row, headers.indexOf('PNBDeposit') + 1, 1, 5).setValues([[pnbDeposit, hdfcDeposit, pnbUpi, hdfcUpi, total]]);
  sh.getRange(rec._row, headers.indexOf('MiscInc') + 1, 1, 2).setValues([[miscInc, miscExp]]);

  const txDate = dateStr_(rec.Timestamp);
  const isToday = txDate === todayStr_();
  const cashDelta = (miscInc - oldMiscInc) - (miscExp - oldMiscExp) - (total - oldTotal);
  const flowDelta = { pnbDeposit: pnbDeposit - oldPnbDeposit, pnbUpi: pnbUpi - oldPnbUpi,
    hdfcDeposit: hdfcDeposit - oldHdfcDeposit, hdfcUpi: hdfcUpi - oldHdfcUpi,
    miscInc: miscInc - oldMiscInc, miscExp: miscExp - oldMiscExp };
  if (isToday) {
    adjustDayRow_(rec.Branch, txDate, Object.assign({}, flowDelta, { cash: cashDelta }));
  } else {
    adjustDayRow_(rec.Branch, txDate, flowDelta);
    propagateForward_(rec.Branch, txDate, { cash: cashDelta });
  }
  return { ok: true };
}

function deleteTransaction_(body) {
  const payload = verifyToken_(body.token);
  const { sh, out } = sheetAsObjects_(SHEETS.TRANSACTIONS);
  const rec = out.find(r => r._row === Number(body.row));
  if (!rec) return { ok: false, error: 'Transaction not found' };
  if (!amAuthorized_(payload, rec.Branch)) return { ok: false, error: 'Not authorized for this branch' };

  const txDate = dateStr_(rec.Timestamp);
  const isToday = txDate === todayStr_();
  const pnbDeposit = Number(rec.PNBDeposit) || 0, hdfcDeposit = Number(rec.HDFCDeposit) || 0,
    pnbUpi = Number(rec.PNBUPI) || 0, hdfcUpi = Number(rec.HDFCUPI) || 0,
    miscInc = Number(rec.MiscInc) || 0, miscExp = Number(rec.MiscExp) || 0, total = Number(rec.Total) || 0;
  const cashDelta = -miscInc + miscExp + total;
  const flowDelta = { pnbDeposit: -pnbDeposit, pnbUpi: -pnbUpi, hdfcDeposit: -hdfcDeposit, hdfcUpi: -hdfcUpi,
    miscInc: -miscInc, miscExp: -miscExp };

  sh.deleteRow(rec._row);

  if (isToday) {
    adjustDayRow_(rec.Branch, txDate, Object.assign({}, flowDelta, { cash: cashDelta }));
  } else {
    adjustDayRow_(rec.Branch, txDate, flowDelta);
    propagateForward_(rec.Branch, txDate, { cash: cashDelta });
  }
  return { ok: true };
}

function getLogs_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const branch = body.branch;
  const group = body.group;
  if (!branch) return { ok: false, error: 'Please select a branch' };
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  let collFiltered = colls.filter(r => r.Branch === branch);
  if (group) {
    collFiltered = collFiltered.filter(r => r.GroupName === group);
  }
  return { ok: true, collections: collFiltered.slice(-200).reverse() };
}

function getDisbursementLogs_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const branch = body.branch;
  if (!branch) return { ok: false, error: 'Please select a branch' };
  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const filtered = disb.filter(r => r.Branch === branch);
  return { ok: true, disbursements: filtered.slice(-200).reverse() };
}

function deleteRowsByCustomerId_(sheetName, customerId) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return;
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('CustomerID');
  if (idCol === -1) return;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][idCol]) === String(customerId)) {
      sh.deleteRow(i + 1);
    }
  }
}

function deleteCustomerCompletely_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const customerId = body.customerId;
  if (!customerId) return { ok: false, error: 'Customer ID is required' };

  const found = findCustomerAnySheet_(customerId);
  if (found) {
    if (!found.closed) {
      const outstanding = Number(found.rec.CurrentOutstanding) || 0;
      const isDeath = String(found.rec.EMI || '').trim().toLowerCase() === 'death';
      adjustDayRow_(found.rec.BranchName, todayStr_(), {
        customers: -1, outstanding: -outstanding,
        deathNo: isDeath ? -1 : 0, deathOutstanding: isDeath ? -outstanding : 0
      });
    }
    found.sh.deleteRow(found.rec._row);
  }

  deleteRowsByCustomerId_(SHEETS.COLLECTIONS, customerId);
  deleteRowsByCustomerId_(SHEETS.COLLECTIONS_ARCHIVE, customerId);
  deleteRowsByCustomerId_(SHEETS.DISBURSEMENTS, customerId);

  return { ok: true };
}

function searchStaff_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const query = String(body.query || '').trim().toUpperCase();
  if (!query) return { ok: true, staff: [] };
  const { out } = sheetAsObjects_(SHEETS.STAFF);
  const matches = out.filter(s => String(s.Name || '').toUpperCase().indexOf(query) !== -1 ||
    String(s.Phone || '').indexOf(query) !== -1);
  return { ok: true, staff: matches.slice(0, 30).map(s => ({
    phone: s.Phone, name: s.Name, role: s.Role, branch: s.Branch, area: s.Area, salary: s.Salary
  })) };
}

function dailySheetCore_(branch, dateStr, custs, colls, disb) {
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const targetDate = new Date(dateStr + 'T00:00:00');
  const targetDayName = dayNames[targetDate.getDay()];

  const branchCusts = custs.filter(c => c.BranchName === branch && c.Status !== 'Closed');
  const custById = {};
  branchCusts.forEach(c => custById[c.CustomerID] = c);

  const groups = {};
  function ensureGroup(g) {
    if (!groups[g]) groups[g] = { groupName: g, realizable: 0, realised: 0, advance: 0, overdue: 0, loanCloser: 0, fulpaidNo: 0, loanNo: 0, loanAmt: 0 };
    return groups[g];
  }
  function hasEmi(c) {
    const n = Number(c.EMI);
    return isFinite(n) && String(c.EMI).trim() !== '';
  }
  function disbursedOnThisDate(c) {
    if (!c.DisbDate) return false;
    try { return dateStr_(c.DisbDate) === dateStr; } catch (e) { return false; }
  }

  branchCusts.filter(c => c.Day === targetDayName).forEach(c => {
    const g = ensureGroup(c.GroupName);
    if (hasEmi(c) && !disbursedOnThisDate(c)) g.realizable += Number(c.EMI);
    if ((Number(c.CurrentOutstanding) || 0) <= 0) g.fulpaidNo += 1;
  });

  colls.filter(r => r.Branch === branch && dateStr_(r.Timestamp) === dateStr).forEach(r => {
    const g = ensureGroup(r.GroupName);
    const cust = custById[r.CustomerID];
    const putAmt = Number(r.PutAmt) || 0;
    const outstandingAfter = Number(r.OutstandingAfter);
    if (cust && hasEmi(cust)) {
      const emiNum = Number(cust.EMI);
      const realisedPortion = Math.min(putAmt, emiNum);
      const excess = Math.max(0, putAmt - emiNum);
      g.realised += realisedPortion;
      if (outstandingAfter <= 0) g.loanCloser += excess;
      else g.advance += excess;
    } else {
      g.overdue += putAmt;
    }
  });

  disb.filter(r => r.Branch === branch && dateStr_(r.Timestamp) === dateStr).forEach(r => {
    const g = ensureGroup(r.GroupName);
    g.loanNo += 1;
    g.loanAmt += Number(r.LoanAmt) || 0;
  });

  const rows = Object.values(groups).sort((a, b) => a.groupName.localeCompare(b.groupName))
    .filter(g => g.realizable || g.realised || g.advance || g.overdue || g.loanCloser || g.fulpaidNo || g.loanNo || g.loanAmt);
  rows.forEach(g => { g.netCollection = g.realised + g.advance + g.overdue + g.loanCloser; });

  const total = rows.reduce((acc, g) => {
    acc.realizable += g.realizable; acc.realised += g.realised; acc.advance += g.advance;
    acc.overdue += g.overdue; acc.loanCloser += g.loanCloser; acc.netCollection += g.netCollection;
    acc.fulpaidNo += g.fulpaidNo; acc.loanNo += g.loanNo; acc.loanAmt += g.loanAmt;
    return acc;
  }, { realizable: 0, realised: 0, advance: 0, overdue: 0, loanCloser: 0, netCollection: 0, fulpaidNo: 0, loanNo: 0, loanAmt: 0 });

  return { rows, total };
}

function getDailySheet_(body) {
  const payload = verifyToken_(body.token);
  const dateStr = todayStr_();
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const { rows, total } = dailySheetCore_(payload.branch, dateStr, custs, colls, disb);
  return {
    ok: true,
    dateLabel: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'EEEE, dd MMM yyyy'),
    rows, total
  };
}

function getAMBranchDailySheet_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch;
  if (!amAuthorized_(payload, branch)) return { ok: false, error: 'Not authorized for this branch' };
  const dateStr = body.date || todayStr_();
  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const { rows, total } = dailySheetCore_(branch, dateStr, custs, colls, disb);
  return { ok: true, branch, dateStr, rows, total };
}

function prevDateStr_(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function nextDateStr_(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getBranchLedger_(body) {
  const payload = verifyToken_(body.token);
  const branch = body.branch || payload.branch;
  if (!amAuthorized_(payload, branch) && payload.branch !== branch) return { ok: false, error: 'Not authorized for this branch' };
  const dateStr = body.date || todayStr_();
  const isToday = dateStr === todayStr_();
  const row = isToday ? latestRowUpTo_(branch, dateStr) : findDayRow_(branch, dateStr);
  if (!row) return { ok: true, branch, dateStr, openCash: 0, closeCash: 0, started: false };
  return { ok: true, branch, dateStr, openCash: Number(row.OpenCash) || 0, closeCash: Number(row.CloseCash) || 0, started: true };
}

function saveOpenCash_(body) {
  const payload = verifyToken_(body.token);
  requireAdmin_(payload);
  const branch = body.branch, dateStr = body.date || todayStr_();
  const newOpenCash = Number(body.openCash) || 0;

  withDayRowLock_(branch, dateStr, (row) => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DAILY_LEDGER);
    const deltaOpen = newOpenCash - (Number(row.OpenCash) || 0);
    sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('OpenCash') + 1).setValue(newOpenCash);
    sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('CloseCash') + 1).setValue((Number(row.CloseCash) || 0) + deltaOpen);
    sh.getRange(row._row, DAILY_LEDGER_HEADERS.indexOf('UpdatedAt') + 1).setValue(new Date());
  });
  return { ok: true };
}

function getAreaDailySheetSummary_(body) {
  const payload = verifyToken_(body.token);
  const branches = allowedBranchesForPayload_(payload);
  if (!branches.length) return { ok: false, error: 'No branches available for your account' };
  const dateStr = body.date || todayStr_();
  const isToday = dateStr === todayStr_();

  const { out: custs } = sheetAsObjects_(SHEETS.CUSTOMERS);
  const { out: colls } = sheetAsObjects_(SHEETS.COLLECTIONS);
  const { out: disb } = sheetAsObjects_(SHEETS.DISBURSEMENTS);
  const { out: txs } = sheetAsObjects_(SHEETS.TRANSACTIONS);

  const branchRows = branches.map(branch => {
    const { total } = dailySheetCore_(branch, dateStr, custs, colls, disb);
    const dayTxs = txs.filter(r => r.Branch === branch && dateStr_(r.Timestamp) === dateStr);
    const transaction = dayTxs.reduce((s, r) => s + (Number(r.Total) || 0), 0);
    const miscInc = dayTxs.reduce((s, r) => s + (Number(r.MiscInc) || 0), 0);
    const miscExp = dayTxs.reduce((s, r) => s + (Number(r.MiscExp) || 0), 0);
    const row = isToday ? latestRowUpTo_(branch, dateStr) : findDayRow_(branch, dateStr);
    const openCash = row ? Number(row.OpenCash) || 0 : 0;
    const closeCash = row ? Number(row.CloseCash) || 0 : 0;
    return Object.assign({ branch, openCash, miscInc, transaction, miscExp,
      totalIncome: openCash + total.netCollection + miscInc,
      totalExpense: transaction + miscExp, closeCash }, total);
  });

  const sumKeys = ['openCash', 'realizable', 'realised', 'advance', 'overdue', 'loanCloser', 'netCollection',
    'miscInc', 'totalIncome', 'fulpaidNo', 'loanNo', 'loanAmt', 'transaction', 'miscExp', 'totalExpense', 'closeCash'];
  const total = branchRows.reduce((acc, r) => {
    sumKeys.forEach(k => { acc[k] = (acc[k] || 0) + (Number(r[k]) || 0); });
    return acc;
  }, {});

  return { ok: true, dateStr, branches: branchRows, total };
}

const ARCHIVE_OLDER_THAN_DAYS = 180;

function archiveOldCollections() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const liveSh = ss.getSheetByName(SHEETS.COLLECTIONS);
  const archiveSh = ss.getSheetByName(SHEETS.COLLECTIONS_ARCHIVE);
  const cutoff = new Date(Date.now() - ARCHIVE_OLDER_THAN_DAYS * 24 * 3600 * 1000);

  const rows = liveSh.getDataRange().getValues();
  const headers = rows[0];
  const tsCol = headers.indexOf('Timestamp');

  const toKeep = [headers];
  const toArchive = [];
  for (let i = 1; i < rows.length; i++) {
    const ts = new Date(rows[i][tsCol]);
    if (ts < cutoff) toArchive.push(rows[i]);
    else toKeep.push(rows[i]);
  }

  if (toArchive.length === 0) {
    Logger.log('Nothing older than ' + ARCHIVE_OLDER_THAN_DAYS + ' days - live sheet is already lean.');
    return { ok: true, archived: 0 };
  }

  archiveSh.getRange(archiveSh.getLastRow() + 1, 1, toArchive.length, toArchive[0].length).setValues(toArchive);
  liveSh.clearContents();
  liveSh.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
  liveSh.setFrozenRows(1);

  Logger.log('Archived ' + toArchive.length + ' rows older than ' + ARCHIVE_OLDER_THAN_DAYS + ' days. ' + (toKeep.length - 1) + ' rows kept live.');
  return { ok: true, archived: toArchive.length, kept: toKeep.length - 1 };
}

function archiveSheetBeforeThisMonth_(liveSheetName, archiveSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const liveSh = ss.getSheetByName(liveSheetName);
  const archiveSh = ss.getSheetByName(archiveSheetName);
  if (!liveSh || !archiveSh) return { ok: false, archived: 0 };

  const cutoff = new Date(); cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0);

  const rows = liveSh.getDataRange().getValues();
  const headers = rows[0];
  const tsCol = headers.indexOf('Timestamp');

  const toKeep = [headers];
  const toArchive = [];
  for (let i = 1; i < rows.length; i++) {
    const ts = new Date(rows[i][tsCol]);
    if (ts < cutoff) toArchive.push(rows[i]);
    else toKeep.push(rows[i]);
  }
  if (!toArchive.length) return { ok: true, archived: 0 };

  archiveSh.getRange(archiveSh.getLastRow() + 1, 1, toArchive.length, toArchive[0].length).setValues(toArchive);
  liveSh.clearContents();
  liveSh.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
  liveSh.setFrozenRows(1);
  return { ok: true, archived: toArchive.length };
}

function monthlyArchive() {
  const coll = archiveSheetBeforeThisMonth_(SHEETS.COLLECTIONS, SHEETS.COLLECTIONS_ARCHIVE);
  const tx = archiveSheetBeforeThisMonth_(SHEETS.TRANSACTIONS, SHEETS.TRANSACTIONS_ARCHIVE);
  const exp = archiveSheetBeforeThisMonth_(SHEETS.EXPENSES, SHEETS.EXPENSES_ARCHIVE);
  Logger.log('Monthly archive done. Collections: ' + coll.archived + ', Transactions: ' + tx.archived + ', Expenses: ' + exp.archived + ' rows moved.');
}

function installMonthlyArchiveTrigger_() {
  const already = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'monthlyArchive');
  if (already) return;
  ScriptApp.newTrigger('monthlyArchive').timeBased().onMonthDay(1).atHour(1).create();
}

function bulkFixStaffRows() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Staff');
  const rows = sh.getDataRange().getValues();
  const { out: areaRows } = sheetAsObjects_(SHEETS.AREAS);
  let fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const phone = String(rows[i][0]).trim();
    const passwordHash = rows[i][2];
    if (!phone || passwordHash) continue; 
    const branch = String(rows[i][4] || '').trim();
    const areaMatch = areaRows.find(a => a.BranchName === branch);
    sh.getRange(i + 1, 3).setValue(hash_(phone, 'Sampoorn'));  
    sh.getRange(i + 1, 4).setValue(rows[i][3] || 'BM');        
    sh.getRange(i + 1, 6).setValue(areaMatch ? areaMatch.AreaName : '');
    sh.getRange(i + 1, 7).setValue(true);
    sh.getRange(i + 1, 8).setValue(new Date());
    fixed++;
  }
  Logger.log(fixed + ' staff rows fixed');
}

function importStaffFromSheet() {
  const ROLE_MAP = { 'C.O': 'CO', 'S.C.O': 'SCO', 'B.M': 'BM', 'A.M': 'AM', 'AUDIT': 'AUDIT', 'H.O': 'HO', 'ADMIN': 'ADMIN' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const importSh = ss.getSheetByName('StaffImport');
  if (!importSh) {
    Logger.log('No "StaffImport" tab found. See the instructions above this function.');
    return { ok: false, error: 'StaffImport tab not found' };
  }
  const rows = importSh.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim());
  const col = name => headers.indexOf(name);

  const sh = ss.getSheetByName(SHEETS.STAFF);
  const { out: existing } = sheetAsObjects_(SHEETS.STAFF);
  const existingPhones = new Set(existing.map(s => String(s.Phone)));

  let added = 0, skipped = 0;
  const skippedNames = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const phone = String(r[col('Phone')] || '').trim();
    const name = String(r[col('Name')] || '').trim();
    if (!phone || !name) continue;
    if (existingPhones.has(phone)) { skipped++; skippedNames.push(name + ' (' + phone + ')'); continue; }
    const role = ROLE_MAP[String(r[col('Role')] || '').toUpperCase()] || String(r[col('Role')] || '').toUpperCase();
    sh.appendRow([
      phone, name, hash_(phone, 'Sampoorn'), role, r[col('Branch')] || '', r[col('Area')] || '', true, new Date(),
      r[col('AccountNo')] || '', r[col('IFSC')] || '', r[col('Salary')] || '', r[col('Security')] || '', r[col('Address')] || '',
      r[col('Aadhar')] || '', r[col('PAN')] || '', r[col('DLNo')] || '', r[col('IDCard')] || '', r[col('Qualification')] || '', r[col('Leave')] || ''
    ]);
    existingPhones.add(phone);
    added++;
  }

  Logger.log('Staff import done. Added: ' + added + ', Skipped (already existed): ' + skipped);
  if (skippedNames.length) Logger.log('Skipped: ' + skippedNames.join(', '));
  Logger.log('Staff can now log in with their phone number and password "Sampoorn" - they will be prompted to change it after logging in. Delete the "StaffImport" tab now, its job is done.');
  return { ok: true, added, skipped, skippedNames };
}

function fixMissingStaffHeader() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.STAFF);
  const firstCell = String(sh.getRange(1, 1).getValue());
  if (firstCell === 'Phone') {
    Logger.log('Header already present - nothing to do.');
    return;
  }
  sh.insertRowBefore(1);
  sh.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]);
  sh.setFrozenRows(1);
  Logger.log('Header row inserted successfully. Staff sheet is fixed.');
}
