
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  "apiKey": "AIzaSyDNIRnr11v4lpOclCdJqLZdqC2oeuaEplg",
  "authDomain": "angels-family-organizer.firebaseapp.com",
  "projectId": "angels-family-organizer",
  "storageBucket": "angels-family-organizer.firebasestorage.app",
  "messagingSenderId": "213978522896",
  "appId": "1:213978522896:web:e8365c7764e222b1a3b195"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const servicesMeta = [
  {step:'1',org:'Missouri Children’s Division',phone:'1-855-373-4636',goal:'Confirm case plan requirements'},
  {step:'2',org:'ParentLink',phone:'800-552-8522',goal:'Parenting education / support'},
  {step:'3',org:'Lutheran Family & Children’s Services',phone:'866-326-5327',goal:'Family counseling'},
  {step:'4',org:'KVC Missouri',phone:'844-424-3577',goal:'Family stabilization services'},
  {step:'5',org:'Missouri Family Support Division',phone:'855-373-4636',goal:'Household support programs'}
];
const routineNames = ['Morning routine','Homework / responsibilities','Positive communication','Dinner / family check-in','Bedtime routine'];
const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const $ = (id) => document.getElementById(id);

let currentUser = null;
let boardUnsub = null;
let saveTimer = null;
let applyingRemote = false;
let initialized = false;

function defaultData(){
  return {
    parentName:'Angel Letner',
    supportName:'Joseph Thomas Butcher',
    boardId:'angel-jt-family-board',
    reviewDate:'',
    agreement:'Maintain stability, complete recommended services, track progress, and support consistent routines in the home while documenting follow-through.',
    weeklySummary:'',
    weeklyChallenges:'',
    weeklyNextSteps:'',
    visitNotes:'',
    sharedComments:'',
    notificationPrefs:{ missed:true, completed:true, appointments:true, goals:true, notes:true },
    services: servicesMeta.map(() => ({contacted:'',appointment:'',status:'',notes:''})),
    routines: routineNames.map(() => ({days:days.map(()=>'') , notes:''})),
    goals:[{title:'Complete parenting support intake',status:'',notes:''}],
    events:[{title:'Call ParentLink',date:'',notes:''}]
  };
}

function statusClass(v){
  if(v==='Yes') return 'status yes';
  if(v==='No') return 'status no';
  return 'status pending';
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function setMessage(text, type=''){
  const el = $('authMessage');
  el.textContent = text || '';
  el.className = 'message' + (type ? ' ' + type : '');
}

function buildTables(){
  const sbody = $('serviceTableBody');
  sbody.innerHTML = '';
  servicesMeta.forEach((svc, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${svc.step}</td>
      <td>${svc.org}</td>
      <td>${svc.phone}</td>
      <td>${svc.goal}</td>
      <td><input id="svc_contacted_${i}" type="date"></td>
      <td><input id="svc_appt_${i}" type="date"></td>
      <td><select id="svc_status_${i}" class="status pending"><option value="">Pending</option><option value="Yes">Completed</option><option value="No">Missed</option></select></td>
      <td><input id="svc_notes_${i}" type="text" placeholder="Notes"></td>
    `;
    sbody.appendChild(tr);
  });

  const rbody = $('routineTableBody');
  rbody.innerHTML = '';
  routineNames.forEach((name, r) => {
    const tr = document.createElement('tr');
    let html = `<td>${name}</td>`;
    days.forEach((_, d) => {
      html += `<td><select id="rt_${r}_${d}" class="status pending"><option value="">-</option><option value="Yes">Yes</option><option value="No">No</option></select></td>`;
    });
    html += `<td><input id="rt_notes_${r}" type="text" placeholder="Notes"></td>`;
    tr.innerHTML = html;
    rbody.appendChild(tr);
  });
}

function renderGoals(goals){
  const wrap = $('goalsList');
  wrap.innerHTML = '';
  goals.forEach((g, i) => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.style.padding = '12px';
    div.innerHTML = `
      <div class="form-grid">
        <div><input id="goal_title_${i}" type="text" value="${escapeHtml(g.title || '')}" placeholder="Goal title"></div>
        <div><select id="goal_status_${i}" class="${statusClass(g.status || '')}"><option value="">Pending</option><option value="Yes">Completed</option><option value="No">Missed</option></select></div>
      </div>
      <div class="section-gap"><textarea id="goal_notes_${i}" placeholder="Notes">${escapeHtml(g.notes || '')}</textarea></div>
    `;
    wrap.appendChild(div);
  });
}

function renderEvents(events){
  const wrap = $('calendarList');
  wrap.innerHTML = '';
  events.forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.style.padding = '12px';
    div.innerHTML = `
      <div class="form-grid">
        <div><input id="event_title_${i}" type="text" value="${escapeHtml(e.title || '')}" placeholder="Appointment / class / court date"></div>
        <div><input id="event_date_${i}" type="date" value="${e.date || ''}"></div>
      </div>
      <div class="section-gap"><textarea id="event_notes_${i}" placeholder="Notes">${escapeHtml(e.notes || '')}</textarea></div>
    `;
    wrap.appendChild(div);
  });
}

function readData(){
  const goalCount = document.querySelectorAll('[id^="goal_title_"]').length;
  const eventCount = document.querySelectorAll('[id^="event_title_"]').length;
  return {
    parentName:$('parentName').value,
    supportName:$('supportName').value,
    boardId:$('boardId').value.trim() || 'angel-jt-family-board',
    reviewDate:$('reviewDate').value,
    agreement:$('agreement').value,
    weeklySummary:$('weeklySummary').value,
    weeklyChallenges:$('weeklyChallenges').value,
    weeklyNextSteps:$('weeklyNextSteps').value,
    visitNotes:$('visitNotes').value,
    sharedComments:$('sharedComments').value,
    notificationPrefs:{
      missed:$('notifMissed').checked,
      completed:$('notifCompleted').checked,
      appointments:$('notifAppointments').checked,
      goals:$('notifGoals').checked,
      notes:$('notifNotes').checked
    },
    services: servicesMeta.map((_, i) => ({
      contacted:$(`svc_contacted_${i}`).value,
      appointment:$(`svc_appt_${i}`).value,
      status:$(`svc_status_${i}`).value,
      notes:$(`svc_notes_${i}`).value
    })),
    routines: routineNames.map((_, r) => ({
      days: days.map((_, d) => $(`rt_${r}_${d}`).value),
      notes:$(`rt_notes_${r}`).value
    })),
    goals: Array.from({length:goalCount}, (_, i) => ({
      title:$(`goal_title_${i}`).value,
      status:$(`goal_status_${i}`).value,
      notes:$(`goal_notes_${i}`).value
    })),
    events: Array.from({length:eventCount}, (_, i) => ({
      title:$(`event_title_${i}`).value,
      date:$(`event_date_${i}`).value,
      notes:$(`event_notes_${i}`).value
    }))
  };
}

function applyData(data){
  applyingRemote = true;
  $('parentName').value = data.parentName || '';
  $('supportName').value = data.supportName || '';
  $('boardId').value = data.boardId || 'angel-jt-family-board';
  $('reviewDate').value = data.reviewDate || '';
  $('agreement').value = data.agreement || '';
  $('weeklySummary').value = data.weeklySummary || '';
  $('weeklyChallenges').value = data.weeklyChallenges || '';
  $('weeklyNextSteps').value = data.weeklyNextSteps || '';
  $('visitNotes').value = data.visitNotes || '';
  $('sharedComments').value = data.sharedComments || '';
  $('notifMissed').checked = data.notificationPrefs?.missed ?? true;
  $('notifCompleted').checked = data.notificationPrefs?.completed ?? true;
  $('notifAppointments').checked = data.notificationPrefs?.appointments ?? true;
  $('notifGoals').checked = data.notificationPrefs?.goals ?? true;
  $('notifNotes').checked = data.notificationPrefs?.notes ?? true;

  (data.services || []).forEach((row, i) => {
    if($(`svc_contacted_${i}`)) $(`svc_contacted_${i}`).value = row.contacted || '';
    if($(`svc_appt_${i}`)) $(`svc_appt_${i}`).value = row.appointment || '';
    if($(`svc_status_${i}`)) {
      $(`svc_status_${i}`).value = row.status || '';
      $(`svc_status_${i}`).className = statusClass(row.status || '');
    }
    if($(`svc_notes_${i}`)) $(`svc_notes_${i}`).value = row.notes || '';
  });

  (data.routines || []).forEach((row, r) => {
    (row.days || []).forEach((val, d) => {
      if($(`rt_${r}_${d}`)) {
        $(`rt_${r}_${d}`).value = val || '';
        $(`rt_${r}_${d}`).className = statusClass(val || '');
      }
    });
    if($(`rt_notes_${r}`)) $(`rt_notes_${r}`).value = row.notes || '';
  });

  renderGoals(data.goals || []);
  renderEvents(data.events || []);
  attachFieldEvents();
  updateMetrics(data);
  renderTimeline(data);
  applyingRemote = false;
}

function updateMetrics(data = readData()){
  const totalService = data.services.length;
  const doneService = data.services.filter(x => x.status === 'Yes').length;
  const servicePct = totalService ? Math.round((doneService/totalService)*100) : 0;
  $('serviceBar').style.width = servicePct + '%';
  $('servicePercentLabel').textContent = servicePct + '%';

  const flat = data.routines.flatMap(r => r.days || []);
  const tracked = flat.filter(x => x === 'Yes' || x === 'No').length;
  const done = flat.filter(x => x === 'Yes').length;
  const missed = flat.filter(x => x === 'No').length;
  const routinePct = tracked ? Math.round((done/tracked)*100) : 0;
  $('routineBar').style.width = routinePct + '%';
  $('routinePercentLabel').textContent = routinePct + '%';
  $('stabilityBar').style.width = routinePct + '%';
  $('stabilityScoreLabel').textContent = `${routinePct}/100`;
  $('missedCountLabel').textContent = String(missed);
}

function renderTimeline(data){
  const items = [];
  data.services.forEach((svc, i) => {
    if(svc.status === 'Yes' && (svc.appointment || svc.contacted)) items.push({title: servicesMeta[i].org + ' completed', date: svc.appointment || svc.contacted, note: svc.notes || servicesMeta[i].goal});
  });
  (data.goals || []).forEach(g => { if(g.title) items.push({title:'Parenting goal: ' + g.title, date:'', note:g.notes || ''}); });
  (data.events || []).forEach(e => { if(e.title || e.date) items.push({title:'Appointment: ' + (e.title || 'Event'), date:e.date || '', note:e.notes || ''}); });

  const wrap = $('timeline');
  wrap.innerHTML = '';
  if(!items.length){
    wrap.innerHTML = '<div class="panel" style="padding:12px"><strong>No timeline entries yet</strong></div>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.style.padding = '12px';
    div.innerHTML = `<strong>${escapeHtml(item.title)}</strong><div class="dim">${escapeHtml(item.date || 'No date')}</div><div>${escapeHtml(item.note || '')}</div>`;
    wrap.appendChild(div);
  });
}

async function ensureBoard(boardId){
  const ref = doc(db, 'familyBoards', boardId);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { payload: defaultData(), updatedAt: serverTimestamp(), updatedBy: currentUser?.email || 'unknown' }, { merge:true });
  }
  return ref;
}

async function connectBoard(){
  if(!currentUser) return;
  const boardId = ($('boardId').value.trim() || 'angel-jt-family-board').replace(/[^\w-]/g, '-');
  if(boardUnsub) boardUnsub();
  const ref = await ensureBoard(boardId);
  boardUnsub = onSnapshot(ref, (snap) => {
    if(!snap.exists()) return;
    const payload = snap.data()?.payload || defaultData();
    $('syncMode').textContent = 'Live sync active';
    $('syncDetails').textContent = `Board ID: ${boardId} • Signed in as ${currentUser.email}`;
    applyData(payload);
  });
}

async function saveNow(){
  if(applyingRemote || !currentUser) return;
  $('saveState').textContent = 'Saving…';
  const data = readData();
  updateMetrics(data);
  renderTimeline(data);
  const boardId = (data.boardId || 'angel-jt-family-board').replace(/[^\w-]/g, '-');
  await setDoc(doc(db, 'familyBoards', boardId), { payload:data, updatedAt:serverTimestamp(), updatedBy:currentUser.email }, { merge:true });
  $('saveState').textContent = 'Saved';
}

function scheduleSave(){
  clearTimeout(saveTimer);
  $('saveState').textContent = 'Saving…';
  saveTimer = setTimeout(() => saveNow().catch(console.error), 320);
}

function maybeNotify(text, enabled){
  if(!enabled || !('Notification' in window)) return;
  if(Notification.permission === 'granted') new Notification(text);
}

async function enableNotifications(){
  if(!('Notification' in window)) return alert('Notifications are not supported in this browser.');
  const permission = await Notification.requestPermission();
  if(permission === 'granted') new Notification('Notifications enabled');
}

function addGoal(){
  const data = readData();
  data.goals.push({title:'',status:'',notes:''});
  applyData(data);
  scheduleSave();
}

function addEvent(){
  const data = readData();
  data.events.push({title:'',date:'',notes:''});
  applyData(data);
  scheduleSave();
}

function resetWeek(){
  const data = readData();
  data.routines = data.routines.map(() => ({days:days.map(()=>'') , notes:''}));
  applyData(data);
  scheduleSave();
}

function printReport(){
  const d = readData();
  const routineRows = routineNames.map((name, i) => `<tr><td>${escapeHtml(name)}</td><td>${(d.routines[i]?.days||[]).filter(v=>v==='Yes').length} / 7</td></tr>`).join('');
  const serviceRows = servicesMeta.map((svc, i) => `<tr><td>${escapeHtml(svc.org)}</td><td>${escapeHtml(d.services[i]?.status || 'Pending')}</td><td>${escapeHtml(d.services[i]?.contacted || '')}</td><td>${escapeHtml(d.services[i]?.appointment || '')}</td></tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Weekly Report</title><style>
      body{font-family:Arial;padding:24px;color:#333}
      table{width:100%;border-collapse:collapse;margin:12px 0 24px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
    </style></head><body>
      <h1>Angel's Family Organizer — Weekly Report</h1>
      <p>Parent: ${escapeHtml(d.parentName)} · Support: ${escapeHtml(d.supportName)} · Review date: ${escapeHtml(d.reviewDate)}</p>
      <h2>Service Steps</h2>
      <table><tr><th>Organization</th><th>Status</th><th>Date Contacted</th><th>Appointment</th></tr>${serviceRows}</table>
      <h2>Routine Completion</h2>
      <table><tr><th>Routine</th><th>Completed Days</th></tr>${routineRows}</table>
      <h2>Weekly Summary</h2><p>${escapeHtml(d.weeklySummary).replace(/\n/g,'<br>')}</p>
      <h2>Challenges</h2><p>${escapeHtml(d.weeklyChallenges).replace(/\n/g,'<br>')}</p>
      <h2>Next Steps</h2><p>${escapeHtml(d.weeklyNextSteps).replace(/\n/g,'<br>')}</p>
      <h2>Notes</h2><p>${escapeHtml(d.sharedComments).replace(/\n/g,'<br>')}</p>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function friendlyError(code){
  const map = {
    'auth/invalid-email':'Enter a valid email address.',
    'auth/missing-password':'Enter your password first.',
    'auth/invalid-credential':'Wrong email or password.',
    'auth/wrong-password':'Wrong password.',
    'auth/user-not-found':'No account found for that email.',
    'auth/email-already-in-use':'That email already has an account.',
    'auth/weak-password':'Password should be at least 6 characters.',
    'auth/network-request-failed':'Network issue. Check your connection and try again.'
  };
  return map[code] || 'Something went wrong.';
}

async function doSignIn(){
  try {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if(!email) return setMessage('Enter your email address first.','error');
    if(!password) return setMessage('Enter your password first.','error');
    await signInWithEmailAndPassword(auth, email, password);
    setMessage('Signed in.','success');
  } catch (err) {
    setMessage(friendlyError(err.code), 'error');
  }
}

async function doSignUp(){
  try {
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if(!email) return setMessage('Enter your email address first.','error');
    if(!password) return setMessage('Enter a password first.','error');
    await createUserWithEmailAndPassword(auth, email, password);
    setMessage('Account created.','success');
  } catch (err) {
    setMessage(friendlyError(err.code), 'error');
  }
}

async function doReset(){
  try {
    const email = $('authEmail').value.trim();
    if(!email) return setMessage('Type your email first, then tap Reset Password.','error');
    await sendPasswordResetEmail(auth, email);
    setMessage('Password reset email sent. Check inbox and spam.','success');
  } catch (err) {
    setMessage(friendlyError(err.code), 'error');
  }
}

function attachFieldEvents(){
  document.querySelectorAll('input, textarea, select').forEach(el => {
    if(el.dataset.bound === '1') return;
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      if(el.tagName === 'SELECT') el.className = statusClass(el.value);
      scheduleSave();
    });
    el.dataset.bound = '1';
  });
}

function addRippleEvents(){
  document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('button, .action, a, input, textarea, select, summary');
    if(!target) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
}

function initButtons(){
  $('signInBtn').addEventListener('click', doSignIn);
  $('signUpBtn').addEventListener('click', doSignUp);
  $('resetPasswordBtn').addEventListener('click', doReset);
  $('signOutBtn').addEventListener('click', () => signOut(auth));
  $('saveBtn').addEventListener('click', () => saveNow().catch(console.error));
  $('notifyBtn').addEventListener('click', enableNotifications);
  $('printReportBtn').addEventListener('click', printReport);
  $('homeBtn').addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));
  $('resetWeekBtn').addEventListener('click', resetWeek);
  $('addGoalBtn').addEventListener('click', addGoal);
  $('addEventBtn').addEventListener('click', addEvent);
  $('boardId').addEventListener('change', () => connectBoard().catch(console.error));
}

function initUI(){
  if(initialized) return;
  initialized = true;
  buildTables();
  initButtons();
  attachFieldEvents();
  addRippleEvents();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  initUI();
  if(user){
    $('authView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    if(boardUnsub) boardUnsub();
    await connectBoard();
  } else {
    if(boardUnsub) boardUnsub();
    $('appView').classList.add('hidden');
    $('authView').classList.remove('hidden');
  }
});
