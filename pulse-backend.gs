/**
 * Pulse backend (Google Apps Script)
 *  • Live alerts: Bank of America alert emails → Finance → Live alerts
 *  • Device sync: keeps Pulse on your phone and PC in step (data saved in a file in your Google Drive,
 *    journal photos in a "Pulse photos" folder)
 *
 * Runs inside YOUR Google account (the Gmail that receives the BofA alerts, directly or forwarded).
 * It only reads Bank of America alert emails, only touches its own "pulse-sync.json" file in Drive,
 * and only answers requests that carry your private key.
 *
 * UPDATING FROM THE ALERTS-ONLY VERSION: paste this whole file over the old code → Save → run `setup`
 * once (it asks for one new permission, Google Drive) → Deploy → Manage deployments → pencil →
 * Version: New version → Deploy. The URL and key stay the same.
 *
 * ONE-TIME SETUP
 *  1. Bank of America app → Menu → Alerts → turn on email alerts for debit/credit card purchases
 *     (set the threshold to $0.01 so every purchase alerts), deposits, and Zelle.
 *  2. Go to https://script.google.com → New project → delete the sample code → paste this whole file → Save.
 *  3. In the function dropdown at the top pick `setup` → Run → approve the permissions
 *     (Google says the app "isn't verified" because it's your own private script:
 *      Advanced → Go to project → Allow).
 *     The log (View → Logs / Execution log) prints your DASHBOARD KEY and a few transactions it found.
 *  4. Deploy → New deployment → gear icon → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *     → Deploy → copy the Web app URL (ends in /exec).
 *  5. Dashboard → Finance → Live alerts → paste the Web app URL and the key → Connect.
 *  6. Sync: Pulse → Settings → Sync between devices → paste the same URL and key → Connect.
 *     Do this on your PC first, then on your phone.
 *
 * If you edit this file later: Deploy → Manage deployments → pencil → Version: New version → Deploy
 * (the URL stays the same).
 *
 * If an alert isn't picked up: run `debugLatest` and send the logged text (you can blank out names).
 * To change the key (e.g. if you shared the link by accident): run `resetKey`, then update the dashboard.
 *
 * ACCOUNTS (Pulse draft 2)
 *  This version adds sign-in on top of everything above (the key-based requests Draft 1 makes still work).
 *  • Creating an account needs your DASHBOARD KEY, so only you can make accounts on your script.
 *  • Your password never reaches this script: Pulse derives a login proof from it on your device, and this
 *    script stores only a salted hash of that proof.
 *  • API keys are encrypted on your device with a key derived from your password before they're uploaded,
 *    so the "vault" stored here can't be read without your password.
 *  • Each account gets its own sync file ("pulse-sync-<user>.json") and photo folder in your Drive.
 *  After pasting this version: Save → Deploy → Manage deployments → pencil → Version: New version → Deploy.
 */

// Matches alerts sent straight from BofA and ones you forward from another Gmail.
const SEARCH = '(from:bankofamerica.com OR "bankofamerica.com" OR "Bank of America")';

// Bank of America emails that are never transactions.
const NOT_TRANSACTIONS = /statement|password|passcode|sign[- ]?in|log ?in|security code|verify|verification|profile|e-?bill|document|privacy|survey|offer|rewards|new device|update your|contact information|card is on its way|travel notice/i;

const DEFAULT_DAYS = 14;
const MAX_THREADS = 300;

/* ---------------- Setup helpers (run from the editor) ---------------- */

function setup() {
  const key = getKey_(true);
  syncFile_();    // creates pulse-sync.json in your Drive (and asks for the Drive permission)
  photoFolder_(); // creates the "Pulse photos" folder for journal photos
  const sample = collect_(DEFAULT_DAYS);
  Logger.log('DASHBOARD KEY (paste into Finance → Live alerts):\n' + key);
  Logger.log('Found ' + sample.txns.length + ' transaction alerts in the last ' + DEFAULT_DAYS + ' days' +
    (sample.unparsed.length ? '; ' + sample.unparsed.length + ' alert emails could not be read (run debugLatest).' : '.'));
  sample.txns.slice(0, 8).forEach(t => Logger.log(t.date + '  ' + (t.amount > 0 ? '+' : '') + t.amount.toFixed(2) + '  ' + t.merchant));
}

function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('DASHBOARD_KEY');
  Logger.log('New DASHBOARD KEY:\n' + getKey_(true));
}

/* SHARED DRIVE (one Google account for you and friends)
   Run `setInviteCode` once: the log prints an invite code. Friends create their Slate account with just a username,
   password and that code, and their data lives in this account's Drive (you can open it; tell them). Run it again for
   a new code (the old one stops working). Run `closeSignups` to stop new accounts; everyone already here keeps
   signing in as normal. */
function setInviteCode() {
  const words = ['maple', 'cedar', 'harbor', 'lantern', 'summit', 'meadow', 'canyon', 'falcon', 'willow', 'ember', 'river', 'atlas'];
  const code = words[Math.floor(Math.random() * words.length)] + '-' + String(1000 + Math.floor(Math.random() * 9000));
  PropertiesService.getScriptProperties().setProperty('INVITE_CODE', code);
  Logger.log('INVITE CODE (give this to friends for "Create an account"):\n' + code);
}

function closeSignups() {
  PropertiesService.getScriptProperties().deleteProperty('INVITE_CODE');
  Logger.log('Invite sign-ups are closed. Accounts already here keep working.');
}

// Prints the 3 most recent Bank of America emails so the parser can be tuned to your exact format.
function debugLatest() {
  const threads = GmailApp.search(SEARCH + ' newer_than:30d', 0, 10);
  let shown = 0;
  threads.forEach(thread => thread.getMessages().forEach(msg => {
    if (shown >= 3) return;
    shown++;
    Logger.log('=== ' + msg.getDate() + '\nSUBJECT: ' + msg.getSubject() + '\nFROM: ' + msg.getFrom() + '\n' +
      msg.getPlainBody().replace(/\d{9,}/g, '•••').slice(0, 1500));
    Logger.log('PARSED AS: ' + JSON.stringify(parse_(msg.getSubject(), msg.getPlainBody(), msg.getDate(), Session.getScriptTimeZone())));
  }));
  if (!shown) Logger.log('No Bank of America emails found in the last 30 days. Check the alerts are going to this Gmail account.');
}

/* ---------------- Web app endpoint (called by the dashboard) ---------------- */

function doGet(e) {
  const params = (e && e.parameter) || {};
  const key = getKey_(false);
  if (!key || params.key !== key) {
    return json_({ ok: false, error: 'Wrong or missing key. Run setup() in the script and copy the key again.' });
  }
  if (params.action === 'pull') return json_(syncPull_(params.since));
  if (params.action === 'image') return json_(getImage_(params.id));
  const days =Math.min(90, Math.max(1, parseInt(params.days, 10) || DEFAULT_DAYS));
  const cache = CacheService.getScriptCache();
  const cacheKey = 'txns_' + days;
  const cached = cache.get(cacheKey);
  if (cached) return text_(cached);
  const body = JSON.stringify(collect_(days));
  if (body.length < 95000) cache.put(cacheKey, body, 45);
  return text_(body);
}

// Pulse sends sync changes here as a plain-text JSON body: { key, action: 'push', changes: { [name]: { v, t } } }
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }
  // Pulse draft 2 sends every request as POST with an `api` field (accounts, per-user sync, photos, alerts).
  if (body.api) return json_(accountApi_(body));
  const key = getKey_(false);
  if (!key || body.key !== key) return json_({ ok: false, error: 'Wrong or missing key.' });
  if (body.action === 'push') return json_(syncPush_(body.changes));
  if (body.action === 'putImage') return json_(putImage_(body.id, body.data));
  if (body.action === 'deleteImage') return json_(deleteImage_(body.id));
  return json_({ ok: false, error: 'Unknown action.' });
}

/* ---------------- Journal photos ----------------
   Each photo is one file named by its id in a "Pulse photos" folder in your Drive. */

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const folder = DriveApp.createFolder('Pulse photos');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

const validPhotoId_ = id => typeof id === 'string' && /^[a-z0-9]{4,64}$/i.test(id);

function putImage_(id, dataUrl, folder) {
  if (!validPhotoId_(id)) return { ok: false, error: 'Bad photo id.' };
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, error: 'Bad photo data.' };
  folder = folder || photoFolder_();
  const existing = folder.getFilesByName(id);
  while (existing.hasNext()) existing.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], id));
  return { ok: true };
}

function getImage_(id, folder) {
  if (!validPhotoId_(id)) return { ok: false, error: 'Bad photo id.' };
  const files = (folder || photoFolder_()).getFilesByName(id);
  if (!files.hasNext()) return { ok: false, error: 'Photo not found.', missing: true };
  const blob = files.next().getBlob();
  return { ok: true, data: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

function deleteImage_(id, folder) {
  if (!validPhotoId_(id)) return { ok: false, error: 'Bad photo id.' };
  const files = (folder || photoFolder_()).getFilesByName(id);
  while (files.hasNext()) files.next().setTrashed(true);
  return { ok: true };
}

/* ---------------- Device sync ----------------
   One JSON file in your Drive holds every synced setting: { version, keys: { name: { v: text|null, t: ms } } }.
   Each piece (today's goals, the trade journal, finance, …) keeps the newest copy by timestamp;
   null means it was deleted. `version` goes up on every change so devices can skip unchanged pulls. */

function syncFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SYNC_FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const file = DriveApp.createFile('pulse-sync.json', JSON.stringify({ version: 0, keys: {} }), 'application/json');
  props.setProperty('SYNC_FILE_ID', file.getId());
  return file;
}

function readSync_(file) {
  try {
    const doc = JSON.parse((file || syncFile_()).getBlob().getDataAsString());
    return { version: doc.version || 0, keys: doc.keys || {} };
  } catch (err) {
    return { version: 0, keys: {} };
  }
}

function syncPull_(since, file) {
  const doc = readSync_(file);
  if (since !== undefined && since !== '' && Number(since) === doc.version) {
    return { ok: true, version: doc.version, unchanged: true };
  }
  return { ok: true, version: doc.version, keys: doc.keys };
}

function syncPush_(changes, file) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const doc = readSync_(file);
    let accepted = 0;
    Object.keys(changes || {}).forEach(name => {
      const c = changes[name];
      if (!c || typeof c.t !== 'number') return;
      const current = doc.keys[name];
      if (!current || c.t >= current.t) {
        doc.keys[name] = { v: typeof c.v === 'string' ? c.v : null, t: c.t };
        accepted++;
      }
    });
    if (accepted) {
      doc.version += 1;
      (file || syncFile_()).setContent(JSON.stringify(doc));
    }
    return { ok: true, version: doc.version, accepted: accepted };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Gmail → transactions ---------------- */

function collect_(days) {
  const tz = Session.getScriptTimeZone();
  const threads = GmailApp.search(SEARCH + ' newer_than:' + days + 'd', 0, MAX_THREADS);
  const txns = [];
  const unparsed = [];
  const seen = {};
  threads.forEach(thread => thread.getMessages().forEach(msg => {
    const id = msg.getId();
    if (seen[id]) return;
    seen[id] = true;
    const subject = msg.getSubject() || '';
    const body = msg.getPlainBody() || '';
    if (!/bank ?of ?america|bankofamerica/i.test(msg.getFrom() + '\n' + body)) return;
    if (NOT_TRANSACTIONS.test(subject)) return;
    const tx = parse_(subject, body, msg.getDate(), tz);
    if (tx) {
      tx.id = id;
      txns.push(tx);
    } else if (/transaction|purchase|deposit|zelle|payment|withdrawal|transfer|charge|refund|credit|debit/i.test(subject)) {
      unparsed.push({ id: id, date: Utilities.formatDate(msg.getDate(), tz, 'yyyy-MM-dd'), subject: subject });
    }
  }));
  txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { ok: true, generated: new Date().toISOString(), txns: txns, unparsed: unparsed.slice(0, 25) };
}

// Reads "Label: value" lines, e.g. "Amount: $25.00", "Where: SAFEWAY #0219".
function field_(text, labels) {
  for (let i = 0; i < labels.length; i++) {
    const re = new RegExp('(?:^|\\n)[ \\t*>]*' + labels[i] + '[ \\t]*:?[ \\t]*([^\\n]+)', 'i');
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

function parse_(subject, body, sentAt, tz) {
  const text = String(body || '').replace(/\r/g, '').replace(/ /g, ' ');
  const subj = String(subject || '');
  const all = (subj + '\n' + text).toLowerCase();

  // Amount: prefer an "Amount:" line, otherwise the first dollar figure in the subject or body.
  const amountLine = field_(text, ['Amount', 'Transaction amount', 'Purchase amount', 'Deposit amount', 'Payment amount', 'Transfer amount']);
  const m = (amountLine.match(/\$?\s*([\d,]+\.\d{2})/)) || (subj + '\n' + text).match(/\$\s?([\d,]+\.\d{2})/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!amount) return null;

  // Direction: decide from the subject first, then the body.
  const isIn = s => /deposit|you received|received money|money received|was credited|refund|direct dep|incoming|credit(?! card)/.test(s);
  const isOut = s => /purchase|you sent|was sent|sent money|withdrawal|debit card|credit card|payment to|charge|transaction/.test(s);
  const s = subj.toLowerCase();
  let incoming = isIn(s) && !/you sent|was sent|sent money/.test(s);
  if (!isIn(s) && !isOut(s)) incoming = isIn(all) && !isOut(all);

  // Who / where.
  let merchant = field_(text, ['Where', 'Merchant', 'Merchant name', 'Description', 'Location', 'At']);
  const zelle = /zelle/.test(all);
  if (!merchant || zelle) {
    const who = field_(text, incoming ? ['From', 'Sender', 'Sent by', 'Received from'] : ['To', 'Recipient', 'Sent to', 'Paid to']);
    const fromSubject = subj.match(incoming ? /\bfrom\s+(.+?)\s*$/i : /\bto\s+(.+?)\s*$/i);
    const name = (who && !/@|bank of america/i.test(who) ? who : '') || (fromSubject ? fromSubject[1] : '');
    if (zelle) merchant = 'Zelle payment ' + (incoming ? 'from ' : 'to ') + (name || 'someone');
    else if (!merchant) merchant = name;
  }
  if (!merchant) {
    const at = subj.match(/\bat\s+(.+?)\s*$/i);
    merchant = at ? at[1] : (incoming ? 'Deposit' : subj);
  }
  if (incoming && !zelle && /deposit/.test(all) && !/refund/.test(all)) merchant = /atm/.test(all) ? 'ATM deposit' : merchant || 'Deposit';

  // Date: the alert's own "Date:" line, else when the email arrived.
  let when = sentAt;
  let dateLine = field_(text, ['Date', 'Transaction date', 'Posted date', 'Date posted']);
  if (!dateLine) {
    // Sentence style: "…was made to your account on September 28, 2026."
    const inline = text.match(/\bon\s+([A-Z][a-z]+\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (inline) dateLine = inline[1];
  }
  if (dateLine) {
    const parsed = new Date(dateLine.replace(/\s+at\s+.*$/i, '').replace(/(\d)(st|nd|rd|th)\b/, '$1'));
    if (!isNaN(parsed)) when = parsed;
  }

  const acct = all.match(/ending in\s*(\d{4})/);
  return {
    date: Utilities.formatDate(when, tz, 'yyyy-MM-dd'),
    amount: incoming ? amount : -amount,
    merchant: String(merchant).replace(/\d{9,}/g, '').trim().slice(0, 120),
    account: acct ? acct[1] : '',
    subject: subj.slice(0, 140),
    received: sentAt.toISOString()
  };
}

/* ---------------- Utilities ---------------- */

function getKey_(create) {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('DASHBOARD_KEY');
  if (!key && create) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('DASHBOARD_KEY', key);
  }
  return key;
}

function text_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}

function json_(obj) {
  return text_(JSON.stringify(obj));
}

/* ---------------- Accounts (Pulse draft 2) ----------------
   One "pulse-accounts.json" file in your Drive: { users: { name: { salt, verifier, vault, created } },
   sessions: { token: { user, exp } } }. `verifier` is a salted SHA-256 of the login proof Pulse derives
   from the password on the device (the password itself is never sent). `vault` is ciphertext Pulse
   encrypted on the device; this script can't read it. */

const USER_RE_ = /^[a-z0-9_.-]{3,32}$/;
const SESSION_MS_ = 30 * 24 * 3600 * 1000;
const MAX_FAILS_ = 5;

function accountApi_(b) {
  const api = String(b.api || '');
  if (api === 'ping') return { ok: true, accounts: true };
  if (api === 'signup') return signup_(b);
  if (api === 'signin') return signin_(b);
  if (api === 'whereIs') return whereIs_(b);
  if (api === 'claimName') return claimName_(b);
  if (api === 'checkKey') return checkKey_(b);
  if (api === 'shareImage') return shareImage_(b);
  if (FRIENDS_APIS_.indexOf(api) >= 0) return friendsApi_(api, b);
  // Optional add-on file (coach mode). Scripts without it answer these like any unknown request.
  if (api.indexOf('coach') === 0 && typeof coachApi_ === 'function') return coachApi_(b);

  const user = sessionUser_(b.token);
  if (!user) return { ok: false, error: 'Your session ended — please sign in again.', signedOut: true };

  switch (api) {
    case 'signout': return signout_(b.token);
    case 'vault': return saveVault_(user, b.vault);
    case 'password': return changePassword_(user, b);
    case 'pull': return syncPull_(b.since, userSyncFile_(user));
    case 'push': return syncPush_(b.changes, userSyncFile_(user));
    case 'putImage': return putImage_(b.id, b.data, userPhotoFolder_(user));
    case 'getImage': return getImage_(b.id, userPhotoFolder_(user));
    case 'deleteImage': return deleteImage_(b.id, userPhotoFolder_(user));
    case 'alerts': return collect_(Math.min(90, Math.max(1, parseInt(b.days, 10) || DEFAULT_DAYS)));
    case 'whoami': return { ok: true, user: user };
    case 'sharePass': return sharePass_(user, b);
    default: return { ok: false, error: 'Unknown request.' };
  }
}

/* The lookup list: on the script a Slate site is built with, username -> that person's script link, so a new device can
   sign in with just a username and password. No passwords or data. A name stays with whoever claimed it first. */
const SCRIPT_URL_RE_ = /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/exec$/;

function whereIs_(b) {
  const name = String(b.username || '').trim().toLowerCase();
  if (readAccounts_().users[name]) return { ok: true, server: 'self' };
  return { ok: true, server: PropertiesService.getScriptProperties().getProperty('dir:' + name) };
}

function claimName_(b) {
  const name = String(b.username || '').trim().toLowerCase();
  const server = String(b.server || '').trim();
  if (!USER_RE_.test(name) || !SCRIPT_URL_RE_.test(server)) return { ok: false, error: 'Bad request.' };
  const props = PropertiesService.getScriptProperties();
  const held = props.getProperty('dir:' + name);
  if (readAccounts_().users[name] || (held && held !== server)) return { ok: false, error: 'That username is taken.' };
  props.setProperty('dir:' + name, server);
  return { ok: true };
}

// Proves the owner of this script is at the keyboard, to reset a forgotten PIN.
function checkKey_(b) {
  const owner = getKey_(false);
  if (!owner || String(b.dashboardKey || '').trim() !== owner) return { ok: false, error: 'That dashboard key isn’t right. It’s printed in the script log when you run setup().' };
  return { ok: true };
}

function signup_(b) {
  const owner = getKey_(false);
  const invite = PropertiesService.getScriptProperties().getProperty('INVITE_CODE');
  if (b.invite !== undefined) {
    // Shared Drive sign-up: the invite code from setInviteCode stands in for the dashboard key. Wrong guesses are
    // limited like sign-in so the code can't be guessed by brute force.
    if (!invite) return { ok: false, error: 'Sign-ups on this Slate are closed. Ask whoever runs it for a new invite.' };
    const cache = CacheService.getScriptCache();
    const tries = parseInt(cache.get('invite_fails') || '0', 10);
    if (tries >= 20) return { ok: false, error: 'Too many wrong invite codes. Wait 10 minutes and try again.' };
    if (String(b.invite).trim().toLowerCase() !== invite.toLowerCase()) {
      cache.put('invite_fails', String(tries + 1), 600);
      return { ok: false, error: 'That invite code isn’t right.' };
    }
  } else {
    if (!owner) return { ok: false, error: 'Run setup() in the script first.' };
    if (String(b.dashboardKey || '').trim() !== owner) return { ok: false, error: 'That dashboard key isn’t right. It’s printed in the script log when you run setup().' };
  }
  const name = String(b.username || '').trim().toLowerCase();
  if (!USER_RE_.test(name)) return { ok: false, error: 'Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.' };
  if (!/^[a-f0-9]{64}$/.test(String(b.auth || ''))) return { ok: false, error: 'Bad sign-up request.' };
  return withAccounts_(doc => {
    if (doc.users[name]) return { ok: false, error: 'That username is taken.' };
    const salt = Utilities.getUuid();
    doc.users[name] = { salt: salt, verifier: sha256Hex_(salt + ':' + b.auth), vault: String(b.vault || ''), created: Date.now() };
    const token = newSession_(doc, name);
    return { ok: true, token: token, user: name };
  });
}

function signin_(b) {
  const name = String(b.username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fails_' + name;
  const fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= MAX_FAILS_) return { ok: false, error: 'Too many attempts. Wait 10 minutes and try again.' };
  return withAccounts_(doc => {
    const rec = doc.users[name];
    if (!rec || sha256Hex_(rec.salt + ':' + String(b.auth || '')) !== rec.verifier) {
      cache.put(failKey, String(fails + 1), 600);
      return { ok: false, error: 'Wrong username or password.' };
    }
    cache.remove(failKey);
    const token = newSession_(doc, name);
    return { ok: true, token: token, user: name, vault: rec.vault || '' };
  });
}

function signout_(token) {
  return withAccounts_(doc => {
    delete doc.sessions[token];
    return { ok: true };
  });
}

function saveVault_(user, vault) {
  if (String(vault || '').length > 50000) return { ok: false, error: 'Vault too large.' };
  return withAccounts_(doc => {
    doc.users[user].vault = String(vault || '');
    return { ok: true };
  });
}

function changePassword_(user, b) {
  if (!/^[a-f0-9]{64}$/.test(String(b.newAuth || ''))) return { ok: false, error: 'Bad request.' };
  return withAccounts_(doc => {
    const rec = doc.users[user];
    if (sha256Hex_(rec.salt + ':' + String(b.oldAuth || '')) !== rec.verifier) return { ok: false, error: 'Current password is wrong.' };
    rec.salt = Utilities.getUuid();
    rec.verifier = sha256Hex_(rec.salt + ':' + b.newAuth);
    rec.vault = String(b.vault || '');
    // Sign out every other device.
    Object.keys(doc.sessions).forEach(t => { if (doc.sessions[t].user === user && t !== b.token) delete doc.sessions[t]; });
    return { ok: true };
  });
}

function sessionUser_(token) {
  if (typeof token !== 'string' || token.length < 32) return null;
  const doc = readAccounts_();
  const s = doc.sessions[token];
  if (!s || s.exp < Date.now() || !doc.users[s.user]) return null;
  return s.user;
}

function newSession_(doc, user) {
  const now = Date.now();
  Object.keys(doc.sessions).forEach(t => { if (doc.sessions[t].exp < now) delete doc.sessions[t]; });
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  doc.sessions[token] = { user: user, exp: now + SESSION_MS_ };
  return token;
}

function accountsFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ACCOUNTS_FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const file = DriveApp.createFile('pulse-accounts.json', JSON.stringify({ users: {}, sessions: {} }), 'application/json');
  props.setProperty('ACCOUNTS_FILE_ID', file.getId());
  return file;
}

function readAccounts_() {
  try {
    const doc = JSON.parse(accountsFile_().getBlob().getDataAsString());
    return { users: doc.users || {}, sessions: doc.sessions || {} };
  } catch (err) {
    return { users: {}, sessions: {} };
  }
}

// Read-modify-write under the script lock; `fn` returns the response and may mutate `doc`.
function withAccounts_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const doc = readAccounts_();
    const before = JSON.stringify(doc);
    const result = fn(doc);
    const after = JSON.stringify(doc);
    if (after !== before) accountsFile_().setContent(after);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function userSyncFile_(user) {
  const props = PropertiesService.getScriptProperties();
  const prop = 'SYNC_FILE_' + user;
  const id = props.getProperty(prop);
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const file = DriveApp.createFile('pulse-sync-' + user + '.json', JSON.stringify({ version: 0, keys: {} }), 'application/json');
  props.setProperty(prop, file.getId());
  return file;
}

function userPhotoFolder_(user) {
  const props = PropertiesService.getScriptProperties();
  const prop = 'PHOTO_FOLDER_' + user;
  const id = props.getProperty(prop);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const folder = DriveApp.createFolder('Pulse photos (' + user + ')');
  props.setProperty(prop, folder.getId());
  return folder;
}

function sha256Hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/* ---------------- Friends ----------------
   On the script a Slate site is built with (the shared one), "pulse-friends.json" holds who is friends with whom and
   the open requests: { friends: { "a|b": { since, share: null | "asked:<name>" | "on" } }, requests: [{ from, to, kind,
   at }] }. Each person who shares their journals has one "copy-<name>.json" in the "Slate friends" folder: a copy their
   own device made (money already taken out there) plus the pass that opens their screenshots. People whose account is
   on another script are checked by asking that script who the token belongs to (whoami), and only if the lookup list
   sends their username to that script. Every script also answers whoami, sharePass and shareImage for its own users. */

const FRIENDS_APIS_ = ['friends', 'friendRequest', 'friendAnswer', 'friendRemove', 'shareRequest', 'shareStop', 'shareUpload', 'shareView'];
const SHARE_PASS_RE_ = /^[a-f0-9]{32}$/;
const pairKey_ = (a, b) => [a, b].sort().join('|');
const userName_ = s => String(s || '').trim().toLowerCase();

// Who is calling: { user, server } (server null for accounts on this script), or null.
function caller_(b) {
  const token = String(b.token || '');
  if (!b.server) {
    const user = sessionUser_(token);
    return user ? { user: user, server: null } : null;
  }
  const user = userName_(b.user), server = String(b.server).trim();
  if (!USER_RE_.test(user) || !SCRIPT_URL_RE_.test(server) || token.length < 32) return null;
  // An account here is checked here, never through another script (its saved script address may just be out of date).
  if (readAccounts_().users[user]) return sessionUser_(token) === user ? { user: user, server: null } : null;
  if (PropertiesService.getScriptProperties().getProperty('dir:' + user) !== server) return null;
  const cache = CacheService.getScriptCache(), key = 'who:' + sha256Hex_(token + '|' + server);
  if (cache.get(key) === user) return { user: user, server: server };
  let res;
  try {
    res = JSON.parse(UrlFetchApp.fetch(server, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ api: 'whoami', token: token }), followRedirects: true, muteHttpExceptions: true }).getContentText());
  } catch (err) {
    return null;
  }
  if (!res || !res.ok || res.user !== user) return null;
  cache.put(key, user, 600);
  return { user: user, server: server };
}

function friendsFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FRIENDS_FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const file = DriveApp.createFile('pulse-friends.json', JSON.stringify({ friends: {}, requests: [] }), 'application/json');
  props.setProperty('FRIENDS_FILE_ID', file.getId());
  return file;
}

function readFriends_() {
  try {
    const doc = JSON.parse(friendsFile_().getBlob().getDataAsString());
    return { friends: doc.friends || {}, requests: doc.requests || [] };
  } catch (err) {
    return { friends: {}, requests: [] };
  }
}

function withFriends_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const doc = readFriends_();
    const before = JSON.stringify(doc);
    const result = fn(doc);
    const after = JSON.stringify(doc);
    if (after !== before) friendsFile_().setContent(after);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function friendsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FRIENDS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted — make a new one */ }
  }
  const folder = DriveApp.createFolder('Slate friends');
  props.setProperty('FRIENDS_FOLDER_ID', folder.getId());
  return folder;
}

// The friends rules, on the parsed file. `exists(name)` says whether a username is a Slate user. Mutates `doc`.
function friendsApply_(doc, me, act, exists) {
  const name = userName_(act.name);
  if (!USER_RE_.test(name)) return { ok: false, error: 'Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.' };
  if (name === me) return { ok: false, error: 'That’s you.' };
  const key = pairKey_(me, name), pair = doc.friends[key];
  const has = (from, to, kind) => doc.requests.some(r => r.from === from && r.to === to && r.kind === kind);
  const drop = (from, to, kind) => { doc.requests = doc.requests.filter(r => !(r.from === from && r.to === to && (!kind || r.kind === kind))); };
  const now = Date.now();
  switch (act.op) {
    case 'request':
      if (pair) return { ok: false, error: 'You’re already friends.' };
      if (has(me, name, 'friend')) return { ok: false, error: 'Already sent.' };
      if (!exists(name)) return { ok: false, error: 'No Slate user called ' + name + '.' };
      if (has(name, me, 'friend')) {
        drop(name, me, 'friend');
        doc.friends[key] = { since: now, share: null };
        return { ok: true, friends: true };
      }
      doc.requests.push({ from: me, to: name, kind: 'friend', at: now });
      return { ok: true };
    case 'answer': {
      const kind = act.kind === 'share' ? 'share' : 'friend';
      if (!has(name, me, kind)) return { ok: false, error: 'That request isn’t there anymore.' };
      drop(name, me, kind);
      if (kind === 'friend') {
        if (act.accept) doc.friends[key] = { since: now, share: null };
      } else if (pair) {
        pair.share = act.accept ? 'on' : null;
      }
      return { ok: true };
    }
    case 'remove':
      if (!pair && !has(me, name, 'friend')) return { ok: false, error: 'You’re not friends with ' + name + '.' };
      delete doc.friends[key];
      drop(me, name);
      drop(name, me);
      return { ok: true };
    case 'shareRequest':
      if (!pair) return { ok: false, error: 'Add them as a friend first.' };
      if (pair.share === 'on') return { ok: false, error: 'You already share journals.' };
      if (has(name, me, 'share')) {
        drop(name, me, 'share');
        pair.share = 'on';
        return { ok: true, sharing: true };
      }
      if (has(me, name, 'share')) return { ok: false, error: 'Already sent.' };
      pair.share = 'asked:' + me;
      doc.requests.push({ from: me, to: name, kind: 'share', at: now });
      return { ok: true };
    case 'shareStop':
      if (!pair) return { ok: false, error: 'You’re not friends with ' + name + '.' };
      pair.share = null;
      drop(me, name, 'share');
      drop(name, me, 'share');
      return { ok: true };
  }
  return { ok: false, error: 'Unknown request.' };
}

const sharesWithAnyone_ = (doc, me) => Object.keys(doc.friends).some(k => k.split('|').indexOf(me) >= 0 && doc.friends[k].share === 'on');

// Bin a copy nobody may read anymore.
function dropCopy_(doc, name) {
  if (sharesWithAnyone_(doc, name)) return;
  const files = friendsFolder_().getFilesByName('copy-' + name + '.json');
  while (files.hasNext()) files.next().setTrashed(true);
  PropertiesService.getScriptProperties().deleteProperty('copyAt:' + name);
}

function friendsList_(doc, me) {
  const props = PropertiesService.getScriptProperties();
  const friends = Object.keys(doc.friends).filter(k => k.split('|').indexOf(me) >= 0).map(k => {
    const parts = k.split('|'), name = parts[0] === me ? parts[1] : parts[0], p = doc.friends[k];
    const row = { name: name, share: p.share === 'on' ? 'on' : p.share === 'asked:' + me ? 'asked-by-me' : p.share ? 'asked-by-them' : 'none' };
    const at = p.share === 'on' ? props.getProperty('copyAt:' + name) : null;
    if (at) row.copyAt = Number(at);
    return row;
  }).sort((a, b) => a.name < b.name ? -1 : 1);
  return {
    friends: friends,
    requests: doc.requests.filter(r => r.to === me).map(r => ({ from: r.from, kind: r.kind, at: r.at })),
    sent: doc.requests.filter(r => r.from === me).map(r => ({ to: r.to, kind: r.kind, at: r.at })),
  };
}

function friendsApi_(api, b) {
  const me = caller_(b);
  if (!me) return { ok: false, error: 'Couldn’t confirm your account for friends. If it lives on your own Google script, update that script to the newest Slate version (setup guide, Part 5). Otherwise sign out and back in.' };
  const props = PropertiesService.getScriptProperties();
  const exists = n => !!readAccounts_().users[n] || !!props.getProperty('dir:' + n);
  const act = op => withFriends_(doc => {
    const res = friendsApply_(doc, me.user, op, exists);
    if (res.ok && (op.op === 'remove' || op.op === 'shareStop')) { dropCopy_(doc, me.user); dropCopy_(doc, userName_(op.name)); }
    return res;
  });
  switch (api) {
    case 'friends': return Object.assign({ ok: true, me: me.user }, friendsList_(readFriends_(), me.user));
    case 'friendRequest': return act({ op: 'request', name: b.to });
    case 'friendAnswer': return act({ op: 'answer', name: b.from, kind: b.kind, accept: !!b.accept });
    case 'friendRemove': return act({ op: 'remove', name: b.name });
    case 'shareRequest': return act({ op: 'shareRequest', name: b.to });
    case 'shareStop': return act({ op: 'shareStop', name: b.name });
    case 'shareUpload': return shareUpload_(me, b);
    case 'shareView': return shareView_(me, b);
  }
  return { ok: false, error: 'Unknown request.' };
}

// Saved outside the lock: each person writes only their own copy, so a big upload never holds up anyone's sync.
function shareUpload_(me, b) {
  const data = String(b.data || ''), pass = String(b.pass || '');
  if (!SHARE_PASS_RE_.test(pass) || !data) return { ok: false, error: 'Bad request.' };
  if (!sharesWithAnyone_(readFriends_(), me.user)) return { ok: true, skipped: true };
  const at = Date.now();
  const body = JSON.stringify({ at: at, money: !!b.money, server: me.server, pass: pass, data: data });
  const folder = friendsFolder_(), name = 'copy-' + me.user + '.json', files = folder.getFilesByName(name);
  let kept = null;
  while (files.hasNext()) {
    const f = files.next();
    if (kept) f.setTrashed(true); // two first uploads at once can leave two files: keep one
    else (kept = f).setContent(body);
  }
  if (!kept) folder.createFile(name, body, 'application/json');
  // Sharing may have stopped while this was saving: then nobody may read it, so bin it.
  const after = readFriends_();
  if (!sharesWithAnyone_(after, me.user)) {
    dropCopy_(after, me.user);
    return { ok: true, skipped: true };
  }
  PropertiesService.getScriptProperties().setProperty('copyAt:' + me.user, String(at));
  return { ok: true, at: at };
}

function shareView_(me, b) {
  const name = userName_(b.name), pair = readFriends_().friends[pairKey_(me.user, name)];
  if (!pair || pair.share !== 'on') return { ok: false, error: 'Not shared with you.' };
  const files = friendsFolder_().getFilesByName('copy-' + name + '.json');
  if (!files.hasNext()) return { ok: true, empty: true };
  const c = JSON.parse(files.next().getBlob().getDataAsString());
  return { ok: true, at: c.at, money: !!c.money, server: c.server || null, pass: c.pass, data: c.data };
}

// The pass that opens your shared screenshots, and which ones. Kept in a file (script properties cap at 9 KB).
function sharePass_(user, b) {
  const pass = String(b.pass || '');
  const images = Array.isArray(b.images) ? b.images.filter(validPhotoId_) : [];
  if (!SHARE_PASS_RE_.test(pass)) return { ok: false, error: 'Bad request.' };
  const folder = userPhotoFolder_(user), body = JSON.stringify({ pass: pass, images: images });
  const files = folder.getFilesByName('share-pass.json');
  if (files.hasNext()) files.next().setContent(body);
  else folder.createFile('share-pass.json', body, 'application/json');
  return { ok: true };
}

function shareImage_(b) {
  const user = userName_(b.user), id = String(b.id || ''), pass = String(b.pass || '');
  const no = { ok: false, error: 'Not shared.' };
  if (!readAccounts_().users[user] || !validPhotoId_(id) || !SHARE_PASS_RE_.test(pass)) return no;
  const folder = userPhotoFolder_(user), files = folder.getFilesByName('share-pass.json');
  if (!files.hasNext()) return no;
  let saved;
  try { saved = JSON.parse(files.next().getBlob().getDataAsString()); } catch (err) { return no; }
  if (saved.pass !== pass || (saved.images || []).indexOf(id) < 0) return no;
  return getImage_(id, folder);
}
