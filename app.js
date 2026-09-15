/* =========================================================================
   TV Neerstedt – Spielstatistik
   Läuft standardmäßig komplett lokal (IndexedDB auf diesem Gerät, keine
   Internetverbindung nötig). Trägst du unten bei FIREBASE_CONFIG ein eigenes
   Firebase-Projekt ein, schaltet die App automatisch auf Cloud-Synchronisation
   um (siehe SETUP-FIREBASE.md): Eingaben funktionieren weiterhin komplett
   offline, gleichen sich aber automatisch zwischen all deinen Geräten ab,
   sobald wieder eine Internetverbindung besteht.
   ========================================================================= */

/* ---------------------------- Hilfsfunktionen ---------------------------- */
function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,9); }
function fmtDate(d){
  if(!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ------------------------------ Toast/Fehler ------------------------------ */
let toastTimer=null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display='block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.display='none'; }, 2200);
}
window.addEventListener('error', (e)=>{
  console.error('App-Fehler', e.error||e.message);
  try{ toast('Hinweis: kleiner Fehler aufgetreten, App läuft weiter.'); }catch(_){}
});
window.addEventListener('unhandledrejection', (e)=>{
  console.error('App-Fehler (Promise)', e.reason);
  try{ toast('Hinweis: kleiner Fehler aufgetreten, App läuft weiter.'); }catch(_){}
});

/* ================================ SPEICHER-BACKEND (lokal oder Cloud) ================================
   Zwei austauschbare Implementierungen hinter derselben kleinen API
   (openDB/idbGetAll/idbGetAllByIndex/idbGet/idbPut/idbDelete). Der Rest der
   App ruft ausschließlich diese fünf Funktionen auf und merkt nichts vom
   Wechsel zwischen lokal und Cloud. */

// Hier eigene Firebase-Projektdaten eintragen, um Cloud-Synchronisation zu
// aktivieren (Anleitung: SETUP-FIREBASE.md). Solange apiKey auf dem
// Platzhalter steht, läuft die App unverändert rein lokal wie bisher.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA1Q21tDBUvAxpIAQeT6Bun5licc9YTfGY",
  authDomain: "tvn-statistik-nicholas-chilala.firebaseapp.com",
  projectId: "tvn-statistik-nicholas-chilala",
  storageBucket: "tvn-statistik-nicholas-chilala.firebasestorage.app",
  messagingSenderId: "422323899846",
  appId: "1:422323899846:web:0f9509c61d7cd69e1cb6c7",
};
const CLOUD_SYNC_ENABLED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'DEIN_API_KEY');
let CLOUD_SYNC_ACTIVE = CLOUD_SYNC_ENABLED; // kann bei Verbindungsfehlern zur Laufzeit auf false zurückfallen

/* ---- Sync-Status-Anzeige (kleines Badge auf dem Startbildschirm) ---- */
let syncStatus = CLOUD_SYNC_ENABLED ? 'connecting' : 'local'; // local | connecting | online | offline | error
function setSyncStatus(s){ syncStatus = s; try{ renderSyncBadge(); }catch(_){} }
function renderSyncBadge(){
  const el = document.getElementById('sync-badge');
  if(!el) return;
  const map = {
    local:      {icon:'📴', text:'Nur lokal auf diesem Gerät gespeichert'},
    connecting: {icon:'☁️', text:'Verbinde mit Cloud-Synchronisation…'},
    online:     {icon:'☁️', text:'Cloud-Synchronisation aktiv'},
    offline:    {icon:'📴', text:'Cloud-Sync eingerichtet – gerade offline, gleicht sich bei Verbindung automatisch ab'},
    error:      {icon:'⚠️', text:'Cloud-Sync-Fehler – Daten werden trotzdem lokal auf diesem Gerät gespeichert'},
  };
  const m = map[syncStatus] || map.local;
  el.textContent = m.icon + ' ' + m.text;
}
window.addEventListener('online', ()=> setSyncStatus(CLOUD_SYNC_ACTIVE ? 'online' : syncStatus));
window.addEventListener('offline', ()=> setSyncStatus(CLOUD_SYNC_ACTIVE ? 'offline' : syncStatus));

/* -------- Lokaler Speicher: IndexedDB (immer als Fallback verfügbar) -------- */
const DB_NAME = 'tvnStatsDB_v1';
const DB_VERSION = 1;
let db = null;
function localOpenDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const d = e.target.result;
      if(!d.objectStoreNames.contains('players')) d.createObjectStore('players',{keyPath:'id'});
      if(!d.objectStoreNames.contains('seasons')) d.createObjectStore('seasons',{keyPath:'id'});
      if(!d.objectStoreNames.contains('games')) d.createObjectStore('games',{keyPath:'id'});
      if(!d.objectStoreNames.contains('events')){
        const s = d.createObjectStore('events',{keyPath:'id'});
        s.createIndex('gameId','gameId',{unique:false});
      }
      if(!d.objectStoreNames.contains('ratings')){
        const s = d.createObjectStore('ratings',{keyPath:'id'});
        s.createIndex('gameId','gameId',{unique:false});
      }
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
    };
    req.onsuccess = (e)=>{ db = e.target.result; resolve(db); };
    req.onerror = (e)=>{ reject(e.target.error); };
  });
}
function storeTx(name, mode='readonly'){ return db.transaction(name, mode).objectStore(name); }
function localGetAll(store){ return new Promise((res,rej)=>{ const r=storeTx(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localGetAllByIndex(store, indexName, key){ return new Promise((res,rej)=>{ const r=storeTx(store).index(indexName).getAll(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localGet(store, id){ return new Promise((res,rej)=>{ const r=storeTx(store).get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localPut(store, obj){ return new Promise((res,rej)=>{ const r=storeTx(store,'readwrite').put(obj); r.onsuccess=()=>res(obj); r.onerror=()=>rej(r.error); }); }
function localDelete(store, id){ return new Promise((res,rej)=>{ const r=storeTx(store,'readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

/* -------- Cloud-Speicher: Firebase Firestore (nur aktiv, wenn FIREBASE_CONFIG ausgefüllt ist) -------- */
let fsDb = null;
async function fsInitDB(){
  try{
    if(typeof firebase === 'undefined'){ throw new Error('Firebase-Bibliothek nicht geladen (kein Internet beim allerersten Start?)'); }
    firebase.initializeApp(FIREBASE_CONFIG);
    await firebase.auth().signInAnonymously();
    fsDb = firebase.firestore();
    try{ await fsDb.enablePersistence({synchronizeTabs:true}); }
    catch(e){ console.warn('Firestore-Offline-Cache konnte nicht aktiviert werden (z.B. mehrere offene Tabs).', e); }
    setSyncStatus(navigator.onLine===false ? 'offline' : 'online');
  }catch(err){
    console.error('Cloud-Sync konnte nicht initialisiert werden – nutze für diese Sitzung nur lokalen Speicher.', err);
    CLOUD_SYNC_ACTIVE = false;
    setSyncStatus('error');
    await localOpenDB();
  }
}
function fsGetAll(store){ return fsDb.collection(store).get().then(snap=> snap.docs.map(d=>d.data())); }
function fsGetAllByIndex(store, indexName, key){ return fsDb.collection(store).where(indexName,'==',key).get().then(snap=> snap.docs.map(d=>d.data())); }
function fsGet(store, id){ return fsDb.collection(store).doc(id).get().then(d=> d.exists? d.data() : undefined); }
function fsPut(store, obj){ return fsDb.collection(store).doc(obj.id).set(obj).then(()=>obj); }
function fsDelete(store, id){ return fsDb.collection(store).doc(id).delete(); }

/* -------- Öffentliche Speicher-API: leitet je nach Modus an lokal oder Cloud weiter -------- */
async function openDB(){
  if(CLOUD_SYNC_ACTIVE){ await fsInitDB(); }
  else { await localOpenDB(); }
}
function idbGetAll(store){ return CLOUD_SYNC_ACTIVE ? fsGetAll(store) : localGetAll(store); }
function idbGetAllByIndex(store, indexName, key){ return CLOUD_SYNC_ACTIVE ? fsGetAllByIndex(store, indexName, key) : localGetAllByIndex(store, indexName, key); }
function idbGet(store, id){ return CLOUD_SYNC_ACTIVE ? fsGet(store, id) : localGet(store, id); }
function idbPut(store, obj){ return CLOUD_SYNC_ACTIVE ? fsPut(store, obj) : localPut(store, obj); }
function idbDelete(store, id){ return CLOUD_SYNC_ACTIVE ? fsDelete(store, id) : localDelete(store, id); }

async function safe(fn, fallbackMsg){
  try{ return await fn(); }
  catch(err){ console.error(err); toast(fallbackMsg || 'Aktion fehlgeschlagen – bitte erneut versuchen.'); return null; }
}

/* ================================ Ereignis-Katalog ================================ */
const EVENT_TYPES = {
  tor:            {label:'Tor',                 cat:'angriff', scoreUs:1},
  fehlwurf:       {label:'Fehlwurf',             cat:'angriff'},
  siebenm_tor:    {label:'7m-Tor',               cat:'angriff', scoreUs:1, sm:true},
  siebenm_fehl:   {label:'7m-Fehlwurf',          cat:'angriff', sm:true},
  assist:         {label:'Assist',               cat:'angriff'},
  techF_an:       {label:'Technischer Fehler',   cat:'angriff'},
  passfang:       {label:'Pass-/Fangfehler',     cat:'angriff'},
  siebenm_geholt: {label:'7m herausgeholt',      cat:'angriff'},
  einsgewonnen:   {label:'1:1 Aktion gewonnen',  cat:'angriff'},
  zweiMin_geholt: {label:'2-Min herausgeholt',   cat:'angriff'},

  steal:              {label:'Steal / abgefangener Ball',   cat:'abwehr'},
  fehlerprovoziert:   {label:'Techn. Fehler provoziert',    cat:'abwehr'},
  geblockt:           {label:'Geblockter Ball',             cat:'abwehr'},
  zweiMin_erhalten:   {label:'2-Min erhalten',               cat:'abwehr'},
  siebenm_verursacht: {label:'7m verursacht',                cat:'abwehr'},
  einsverloren:       {label:'1:1 Aktion verloren',          cat:'abwehr'},
  parade:             {label:'Parade',                       cat:'torhueter', gk:true},
  siebenm_parade:     {label:'7m-Parade',                    cat:'torhueter', gk:true, sm:true},
  gegentor:           {label:'Gegentor',                     cat:'torhueter', gk:true, scoreThem:1},
  siebenm_gegentor:   {label:'7m-Gegentor',                  cat:'torhueter', gk:true, sm:true, scoreThem:1},
};
const ANGRIFF_KEYS   = Object.keys(EVENT_TYPES).filter(k=>EVENT_TYPES[k].cat==='angriff');
const ABWEHR_KEYS    = Object.keys(EVENT_TYPES).filter(k=>EVENT_TYPES[k].cat==='abwehr');
const TORHUETER_KEYS = Object.keys(EVENT_TYPES).filter(k=>EVENT_TYPES[k].cat==='torhueter');
const POSITIONS = ['Tor','Rückraum','Kreis','Außen'];
const RATING_OPTS = [{v:-2,l:'--'},{v:-1,l:'-'},{v:0,l:'0'},{v:1,l:'+'},{v:2,l:'++'}];

/* ================================ App-Status ================================ */
const state = {
  screen:'home',
  currentSeasonId:null,
  currentGameId:null,
  liveMenu:null,      // null | 'angriff' | 'abwehr' | 'torhueter' | 'notiz' | 'gegentorQuick'
  pickType:null,      // gewählter Ereignistyp, wartet auf Spieler
  ratingPhase:null,   // 'halftime' | 'fulltime'
  historyGameId:null,
  gamesTab:'season',  // 'season' | 'archive'
  statsSort:{key:'tore', dir:'desc'},
  postAddGameId:null, postAddHalf:null, postAddCat:null, postAddType:null,
};

let cache = { players:[], seasons:[], games:[], events:[], ratings:[] };

async function reloadAll(){
  cache.players = await idbGetAll('players');
  cache.seasons = await idbGetAll('seasons');
  cache.games   = await idbGetAll('games');
}
async function loadGameData(gameId){
  cache.events  = await idbGetAllByIndex('events','gameId', gameId);
  cache.ratings = await idbGetAllByIndex('ratings','gameId', gameId);
}

function activeSeason(){ return cache.seasons.find(s=>s.id===state.currentSeasonId); }
function activePlayers(){ return cache.players.filter(p=>p.active!==false).sort((a,b)=>a.lastName.localeCompare(b.lastName,'de')); }
function playerName(id){ const p=cache.players.find(x=>x.id===id); return p? (p.firstName+' '+p.lastName) : '(gelöschter Spieler)'; }
function playerPos(id){ const p=cache.players.find(x=>x.id===id); return p? p.position : ''; }
function seasonGames(seasonId){ return cache.games.filter(g=>g.seasonId===seasonId).sort((a,b)=> (b.date||'').localeCompare(a.date||'')); }

/* ================================ Initialisierung ================================ */
async function init(){
  await openDB();
  await reloadAll();

  if(cache.seasons.length===0){
    const s = { id:uid(), label: guessSeasonLabel(), status:'active', createdAt:Date.now() };
    await idbPut('seasons', s);
    cache.seasons.push(s);
  }
  const active = cache.seasons.find(s=>s.status==='active');
  state.currentSeasonId = active ? active.id : cache.seasons[0].id;

  if(cache.players.length===0){
    // Startkader 1. Herren TV Neerstedt (kann jederzeit unter "Kader verwalten" angepasst werden)
    const roster = [
      ['Maximilian','Ruholl','Rückraum'], ['Marvin','Auffarth','Außen'], ['Marek','Damm','Rückraum'],
      ['Raik','Steenken','Rückraum'], ['Jan Niklas','Bruning','Rückraum'], ['Max','Hülsmann','Rückraum'],
      ['Tjark','Müller','Tor'], ['Kevin','Pecht','Tor'], ['Jannik','Wefer','Rückraum'],
      ['Christian','Wilhelm','Kreis'], ['Niels','Hansen','Rückraum'], ['Florian','Schrader','Kreis'],
      ['Henrik','Tolck','Außen'], ['Max','Tapken','Außen'], ['Willem','Boyens','Rückraum'],
      ['David','Niemann','Kreis'], ['Lars','Powelkin','Außen'], ['Niclas','Deeken','Rückraum'],
    ];
    for(const [firstName,lastName,position] of roster){
      const p = {id:uid(), firstName, lastName, position, active:true, createdAt:Date.now()};
      await idbPut('players', p);
      cache.players.push(p);
    }
  }

  const liveGame = cache.games.find(g=>g.status==='live');
  if(liveGame){ state.currentGameId = liveGame.id; await loadGameData(liveGame.id); state.screen='live'; }

  registerSW();
  render();
}

function guessSeasonLabel(){
  const y = new Date().getFullYear();
  const m = new Date().getMonth()+1;
  return (m>=6 ? y : y-1) + '/' + String((m>=6? y+1 : y)).slice(-2);
}

function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* z.B. auf Vorschau-Hosting ohne SW-Unterstützung: ignorieren */ });
  }
}

/* ================================ Navigation ================================ */
function go(screen, extra){
  state.screen = screen;
  Object.assign(state, extra||{});
  render();
  window.scrollTo(0,0);
}

/* ================================ RENDER-ROUTER ================================ */
function render(){
  const app = document.getElementById('app');
  try{
    let html = '';
    switch(state.screen){
      case 'home': html = screenHome(); break;
      case 'roster': html = screenRoster(); break;
      case 'newGame': html = screenNewGame(); break;
      case 'live': html = screenLive(); break;
      case 'liveDashboard': html = screenLiveDashboard(); break;
      case 'postGameAdd': html = screenPostGameAdd(); break;
      case 'history': html = screenHistory(); break;
      case 'ratings': html = screenRatings(); break;
      case 'games': html = screenGames(); break;
      case 'gameDetail': html = screenGameDetail(); break;
      case 'seasonStats': html = screenSeasonStats(); break;
      case 'closeSeason': html = screenCloseSeason(); break;
      default: html = screenHome();
    }
    app.innerHTML = html;
    if(state.screen==='seasonStats'){
      loadSeasonStatsInto(state.statsSeasonId || state.currentSeasonId);
    }
    if(state.screen==='home'){ renderSyncBadge(); }
  }catch(err){
    console.error(err);
    app.innerHTML = '<div class="card"><p>Es ist ein unerwarteter Anzeigefehler aufgetreten. Deine Daten sind sicher gespeichert.</p><button class="btn btn-primary" onclick="go(\'home\')">Zur Startseite</button></div>';
  }
}

/* ================================ SCREEN: HOME ================================ */
function screenHome(){
  const season = activeSeason();
  const live = cache.games.find(g=>g.status==='live');
  return `
    <div class="topbar">
      <div>
        <h1>TV Neerstedt</h1>
        <div class="sub">Spielstatistik · Saison ${escapeHtml(season?season.label:'')}</div>
      </div>
    </div>
    <div class="sub" id="sync-badge" style="margin:-8px 0 14px;"></div>

    ${live ? `<div class="card" style="border-left:5px solid var(--ocher);">
      <div class="list-item"><div><div class="main">Laufendes Spiel</div><div class="sub">${escapeHtml(live.opponent||'Gegner')} · ${escapeHtml(live.homeAway)}</div></div></div>
      <button class="btn btn-primary" onclick="resumeLive('${live.id}')">Spiel fortsetzen</button>
    </div>` : ''}

    <button class="btn btn-gold btn-block-lg" ${live?'disabled':''} onclick="go('newGame')">+ Neues Spiel starten</button>
    <button class="btn btn-outline" onclick="go('games')">Spiele &amp; Auswertung</button>
    <button class="btn btn-outline" onclick="go('roster')">Kader verwalten</button>

    <div class="card">
      <div style="font-weight:700; margin-bottom:8px;">Datensicherung</div>
      <div class="sub" style="margin-bottom:10px;">${CLOUD_SYNC_ENABLED ? 'Zusätzlich zur Cloud-Synchronisation empfiehlt sich ab und zu ein Backup.' : 'Alle Daten liegen nur auf diesem Gerät. Regelmäßig sichern!'}</div>
      <button class="btn btn-sm btn-outline" onclick="exportBackup()">Backup exportieren</button>
      <label class="btn btn-sm btn-outline" style="display:inline-block; margin:0 6px 6px 0;">
        Backup importieren
        <input type="file" accept="application/json" style="display:none" onchange="importBackup(event)">
      </label>
    </div>

    <button class="btn btn-outline" onclick="go('closeSeason')">Saison abschließen &amp; neue starten</button>

    <div class="footer-note">TV Neerstedt · 1. Herren · lokal &amp; offline gespeichert</div>
  `;
}

async function resumeLive(gameId){
  state.currentGameId = gameId;
  await loadGameData(gameId);
  go('live');
}

/* ================================ SCREEN: KADER ================================ */
function screenRoster(){
  const active = cache.players.filter(p=>p.active!==false).sort((a,b)=>a.lastName.localeCompare(b.lastName,'de'));
  const inactive = cache.players.filter(p=>p.active===false);
  return `
    <div class="topbar">
      <button class="back-btn" onclick="go('home')">&larr; Zurück</button>
      <h1>Kader verwalten</h1><span></span>
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:8px;">Spieler hinzufügen</div>
      <div class="field"><label>Vorname</label><input type="text" id="np-first" placeholder="Vorname"></div>
      <div class="field"><label>Nachname</label><input type="text" id="np-last" placeholder="Nachname"></div>
      <div class="field"><label>Position</label>
        <select id="np-pos">${POSITIONS.map(p=>`<option value="${p}">${p}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" onclick="addPlayer()">Spieler speichern</button>
    </div>

    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Aktueller Kader (${active.length})</div>
      ${active.map(p=>`
        <div class="list-item">
          <div><div class="main">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</div><div class="sub">${escapeHtml(p.position)}</div></div>
          <div>
            <button class="btn btn-sm btn-outline" onclick="editPlayer('${p.id}')">Bearbeiten</button>
            <button class="btn btn-sm btn-danger" onclick="deactivatePlayer('${p.id}')">Entfernen</button>
          </div>
        </div>`).join('') || '<div class="empty-hint">Noch keine Spieler.</div>'}
    </div>

    ${inactive.length? `<div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Entfernte Spieler (${inactive.length})</div>
      <div class="sub" style="margin-bottom:8px;">Bleiben in vergangenen Statistiken sichtbar, erscheinen aber nicht mehr bei neuen Spielen.</div>
      ${inactive.map(p=>`
        <div class="list-item">
          <div><div class="main">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</div><div class="sub">${escapeHtml(p.position)}</div></div>
          <div>
            <button class="btn btn-sm btn-outline" onclick="reactivatePlayer('${p.id}')">Reaktivieren</button>
            <button class="btn btn-sm btn-danger" onclick="hardDeletePlayer('${p.id}')">Endgültig löschen</button>
          </div>
        </div>`).join('')}
    </div>` : ''}
  `;
}

async function addPlayer(){
  const firstName = document.getElementById('np-first').value.trim();
  const lastName = document.getElementById('np-last').value.trim();
  const position = document.getElementById('np-pos').value;
  if(!firstName || !lastName){ toast('Bitte Vor- und Nachname eingeben.'); return; }
  await safe(async ()=>{
    const p = {id:uid(), firstName, lastName, position, active:true, createdAt:Date.now()};
    await idbPut('players', p);
    cache.players.push(p);
    toast('Spieler hinzugefügt.');
    go('roster');
  }, 'Spieler konnte nicht gespeichert werden.');
}
async function editPlayer(id){
  const p = cache.players.find(x=>x.id===id); if(!p) return;
  const firstName = prompt('Vorname', p.firstName); if(firstName===null) return;
  const lastName = prompt('Nachname', p.lastName); if(lastName===null) return;
  const position = prompt('Position (Tor/Rückraum/Kreis/Außen)', p.position); if(position===null) return;
  await safe(async ()=>{
    p.firstName=firstName.trim()||p.firstName; p.lastName=lastName.trim()||p.lastName; p.position=position.trim()||p.position;
    await idbPut('players', p);
    go('roster');
  }, 'Änderung konnte nicht gespeichert werden.');
}
async function deactivatePlayer(id){
  if(!confirm('Diesen Spieler aus dem aktiven Kader entfernen? Bisherige Statistiken bleiben erhalten.')) return;
  await safe(async ()=>{
    const p = cache.players.find(x=>x.id===id); p.active=false;
    await idbPut('players', p);
    go('roster');
  });
}
async function reactivatePlayer(id){
  await safe(async ()=>{
    const p = cache.players.find(x=>x.id===id); p.active=true;
    await idbPut('players', p);
    go('roster');
  });
}
async function hardDeletePlayer(id){
  const referenced = await playerHasEvents(id);
  if(referenced){ toast('Nicht möglich: Für diesen Spieler existieren bereits Statistiken.'); return; }
  if(!confirm('Spieler endgültig und unwiderruflich löschen?')) return;
  await safe(async ()=>{
    await idbDelete('players', id);
    cache.players = cache.players.filter(p=>p.id!==id);
    go('roster');
  });
}
async function playerHasEvents(playerId){
  for(const g of cache.games){
    const evs = await idbGetAllByIndex('events','gameId', g.id);
    if(evs.some(e=>e.playerId===playerId)) return true;
  }
  return false;
}

/* ================================ SCREEN: NEUES SPIEL ================================ */
function screenNewGame(){
  const opponents = [...new Set(cache.games.map(g=>g.opponent).filter(Boolean))];
  const players = activePlayers();
  return `
    <div class="topbar">
      <button class="back-btn" onclick="go('home')">&larr; Zurück</button>
      <h1>Neues Spiel</h1><span></span>
    </div>
    <div class="card">
      <div class="field"><label>Gegner</label>
        <input type="text" id="ng-opp" list="opp-list" placeholder="Gegner eintragen">
        <datalist id="opp-list">${opponents.map(o=>`<option value="${escapeHtml(o)}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Heim / Auswärts</label>
        <select id="ng-ha"><option value="Heim">Heim</option><option value="Auswärts">Auswärts</option></select>
      </div>
      <div class="field"><label>Datum</label><input type="date" id="ng-date" value="${todayISO()}"></div>
      <div class="field"><label>Wettbewerb (optional)</label><input type="text" id="ng-liga" placeholder="z.B. Oberliga Männer Nord, Freundschaftsspiel"></div>
    </div>
    <div class="card">
      <div style="font-weight:700; margin-bottom:6px;">Spieltagskader</div>
      <div class="sub" style="margin-bottom:6px;">Alle vorausgewählt – abwählen, wer heute nicht dabei ist.</div>
      ${players.map(p=>`
        <div class="checkline">
          <input type="checkbox" id="sq-${p.id}" checked>
          <label for="sq-${p.id}">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)} <span class="sub">(${escapeHtml(p.position)})</span></label>
        </div>`).join('') || '<div class="empty-hint">Kein Kader vorhanden – bitte zuerst Spieler anlegen.</div>'}
    </div>
    <button class="btn btn-primary btn-block-lg" onclick="startGame()">Spiel starten</button>
  `;
}

async function startGame(){
  const opponent = document.getElementById('ng-opp').value.trim();
  const homeAway = document.getElementById('ng-ha').value;
  const date = document.getElementById('ng-date').value || todayISO();
  const liga = document.getElementById('ng-liga').value.trim();
  if(!opponent){ toast('Bitte Gegner eintragen.'); return; }
  const squad = activePlayers().filter(p=>{
    const el = document.getElementById('sq-'+p.id); return el && el.checked;
  }).map(p=>p.id);
  if(squad.length===0){ toast('Bitte mindestens einen Spieler auswählen.'); return; }
  await safe(async ()=>{
    const game = {
      id:uid(), seasonId:state.currentSeasonId, opponent, homeAway, date, liga,
      squad, status:'live', currentHalf:1, createdAt:Date.now()
    };
    await idbPut('games', game);
    cache.games.push(game);
    state.currentGameId = game.id;
    await loadGameData(game.id);
    go('live');
  }, 'Spiel konnte nicht gestartet werden.');
}

/* ================================ LIVE-SPIEL: Hilfsfunktionen ================================ */
function currentGame(){ return cache.games.find(g=>g.id===state.currentGameId); }
function gameScore(events){
  let us=0, them=0;
  events.forEach(e=>{ const t=EVENT_TYPES[e.type]; if(!t) return; if(t.scoreUs) us+=t.scoreUs; if(t.scoreThem) them+=t.scoreThem; });
  return {us, them};
}
function halfScore(events, half){ return gameScore(events.filter(e=>e.half===half)); }

/* ---- Team-Trefferquote mit Form-Trend (letzte ~5 Würfe vs. Spielschnitt) ---- */
const WURF_KEYS = ['tor','fehlwurf','siebenm_tor','siebenm_fehl'];
function teamShotTrend(events){
  const shots = events.filter(e=>WURF_KEYS.includes(e.type)).sort((a,b)=>a.timestamp-b.timestamp);
  const total = shots.length;
  if(total===0) return null;
  const isGoal = e=> e.type==='tor' || e.type==='siebenm_tor';
  const totalTore = shots.filter(isGoal).length;
  const quote = Math.round(totalTore/total*100);
  const recentN = Math.min(5, total);
  const recent = shots.slice(-recentN);
  const recentTore = recent.filter(isGoal).length;
  const recentQuote = Math.round(recentTore/recentN*100);
  let trend = 'flat';
  if(recentQuote - quote >= 1) trend = 'up';
  else if(quote - recentQuote >= 1) trend = 'down';
  return {total, totalTore, quote, trend};
}
function renderShotQuoteBadge(events){
  const s = teamShotTrend(events);
  if(!s) return `<div class="quote-badge quote-flat">Trefferquote: – <span class="quote-detail">(noch keine Würfe)</span></div>`;
  const arrow = s.trend==='up' ? '▲' : s.trend==='down' ? '▼' : '▬';
  const cls = 'quote-' + s.trend;
  return `<div class="quote-badge ${cls}">Trefferquote: <b>${s.quote}%</b> <span class="quote-arrow">${arrow}</span> <span class="quote-detail">(${s.totalTore}/${s.total} · Trend: letzte ${Math.min(5,s.total)} Würfe)</span></div>`;
}

/* ================================ SCREEN: LIVE ================================ */
function screenLive(){
  const game = currentGame();
  if(!game) return `<div class="card"><p>Kein aktives Spiel.</p><button class="btn btn-primary" onclick="go('home')">Zur Startseite</button></div>`;
  const score = gameScore(cache.events);
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const lastEvent = [...cache.events].sort((a,b)=>b.timestamp-a.timestamp)[0];

  const keepers = squad.filter(p=>p.position==='Tor');
  const pickIsGk = !!(state.pickType && EVENT_TYPES[state.pickType] && EVENT_TYPES[state.pickType].gk);
  const pickerList = pickIsGk && keepers.length ? keepers : squad;

  let body = '';
  if(state.pickType){
    body = `
      <div class="topbar"><button class="back-btn" onclick="state.pickType=null; render();">&larr; Zurück</button><h1>${EVENT_TYPES[state.pickType].label}</h1><span></span></div>
      <div class="sub" style="margin-bottom:10px;">${pickIsGk ? 'Wer stand im Tor?' : 'Wer war beteiligt?'}</div>
      <div class="grid-players">
        ${pickerList.map(p=>`<button class="player-btn" onclick="logEvent('${p.id}')"><span class="name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span><span class="pos">${escapeHtml(p.position)}</span></button>`).join('')}
      </div>
    `;
  } else if(state.liveMenu==='angriff' || state.liveMenu==='abwehr' || state.liveMenu==='torhueter'){
    const keys = state.liveMenu==='angriff'? ANGRIFF_KEYS : state.liveMenu==='abwehr'? ABWEHR_KEYS : TORHUETER_KEYS;
    const title = state.liveMenu==='angriff'?'Angriff':state.liveMenu==='abwehr'?'Abwehr':'Torhüter';
    body = `
      <div class="topbar"><button class="back-btn" onclick="liveBack()">&larr; Zurück</button><h1>${title}</h1><span></span></div>
      ${keys.map(k=>`<button class="event-menu-btn ${state.liveMenu}" onclick="pickEventType('${k}')">${EVENT_TYPES[k].label}</button>`).join('')}
    `;
  } else if(state.liveMenu==='gegentorQuick'){
    body = `
      <div class="topbar"><button class="back-btn" onclick="liveBack()">&larr; Zurück</button><h1>Gegentor</h1><span></span></div>
      <div class="sub" style="margin-bottom:10px;">Art des Gegentors:</div>
      <button class="event-menu-btn abwehr" onclick="pickEventType('gegentor')">Tor</button>
      <button class="event-menu-btn abwehr" onclick="pickEventType('siebenm_gegentor')">7m-Tor</button>
    `;
  } else if(state.liveMenu==='notiz'){
    body = `
      <div class="topbar"><button class="back-btn" onclick="liveBack()">&larr; Zurück</button><h1>Notiz</h1><span></span></div>
      <div class="field"><textarea id="note-text" rows="4" placeholder="Notiz eintragen..."></textarea></div>
      <div class="field"><label>Spieler zuordnen (optional)</label>
        <select id="note-player"><option value="">– kein Spieler –</option>${squad.map(p=>`<option value="${p.id}">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" onclick="saveNote()">Notiz speichern</button>
    `;
  } else {
    body = `
      <div class="topbar">
        <button class="back-btn" onclick="go('home')">&larr; Start</button>
        <h1>${escapeHtml(game.opponent)}</h1>
        <button class="back-btn" onclick="go('history')">Verlauf</button>
      </div>
      <div class="scoreboard">
        <div class="score">${score.us} : ${score.them}</div>
        <div class="meta">${escapeHtml(game.homeAway)} · ${fmtDate(game.date)}</div>
        <div class="half-pill">Halbzeit ${game.currentHalf}</div>
        ${renderShotQuoteBadge(cache.events)}
      </div>

      <button class="btn btn-danger btn-block-lg" onclick="state.liveMenu='gegentorQuick'; render();">+1 Gegentor (Gegner)</button>

      <div class="grid2">
        <button class="event-menu-btn angriff" style="text-align:center; font-size:1rem; padding:18px 8px;" onclick="state.liveMenu='angriff'; render();">⚔️ Angriff</button>
        <button class="event-menu-btn abwehr" style="text-align:center; font-size:1rem; padding:18px 8px;" onclick="state.liveMenu='abwehr'; render();">🛡️ Abwehr</button>
        <button class="event-menu-btn torhueter" style="text-align:center; font-size:1rem; padding:18px 8px;" onclick="state.liveMenu='torhueter'; render();">🥅 Torhüter</button>
        <button class="event-menu-btn notiz" style="text-align:center; font-size:1rem; padding:18px 8px;" onclick="state.liveMenu='notiz'; render();">📝 Notiz</button>
      </div>

      <button class="btn btn-outline" onclick="go('liveDashboard')">📊 Dashboard</button>

      ${lastEvent? `<div class="card">
        <div class="sub">Letzte Eingabe: <b>${EVENT_TYPES[lastEvent.type]? EVENT_TYPES[lastEvent.type].label : 'Notiz'}</b>${lastEvent.playerId? ' – '+escapeHtml(playerName(lastEvent.playerId)) : ''}</div>
        <button class="btn btn-sm btn-danger" onclick="undoLast()">Rückgängig machen</button>
      </div>` : ''}

      <hr class="sep">
      ${game.currentHalf===1
        ? `<button class="btn btn-outline" onclick="endHalf()">Halbzeit beenden</button>`
        : `<button class="btn btn-outline" onclick="endGame()">Spiel beenden</button>`
      }
    `;
  }
  return body;
}

function liveBack(){ state.liveMenu=null; state.pickType=null; render(); }
function pickEventType(key){ state.pickType = key; render(); }

async function logEvent(playerId){
  const key = state.pickType;
  await safe(async ()=>{
    const ev = { id:uid(), gameId:state.currentGameId, half:currentGame().currentHalf, type:key, playerId, timestamp:Date.now() };
    await idbPut('events', ev);
    cache.events.push(ev);
    toast(EVENT_TYPES[key].label + ' – ' + playerName(playerId));
    state.pickType=null; state.liveMenu=null;
    render();
  }, 'Eintrag konnte nicht gespeichert werden.');
}

async function saveNote(){
  const text = document.getElementById('note-text').value.trim();
  const playerId = document.getElementById('note-player').value || null;
  if(!text){ toast('Bitte Text eingeben.'); return; }
  await safe(async ()=>{
    const ev = { id:uid(), gameId:state.currentGameId, half:currentGame().currentHalf, type:'notiz', note:text, playerId, timestamp:Date.now() };
    await idbPut('events', ev);
    cache.events.push(ev);
    toast('Notiz gespeichert.');
    state.liveMenu=null;
    render();
  }, 'Notiz konnte nicht gespeichert werden.');
}

async function undoLast(){
  const last = [...cache.events].sort((a,b)=>b.timestamp-a.timestamp)[0];
  if(!last) return;
  if(!confirm('Letzte Eingabe wirklich löschen?')) return;
  await safe(async ()=>{
    await idbDelete('events', last.id);
    cache.events = cache.events.filter(e=>e.id!==last.id);
    render();
  });
}

async function endHalf(){
  state.ratingPhase='halftime';
  go('ratings');
}
async function endGame(){
  state.ratingPhase='fulltime';
  go('ratings');
}

/* ================================ SCREEN: AD-HOC-DASHBOARD (während des Spiels) ================================ */
function screenLiveDashboard(){
  const game = currentGame();
  if(!game) return `<div class="card"><p>Kein aktives Spiel.</p><button class="btn btn-primary" onclick="go('home')">Zur Startseite</button></div>`;
  const score = gameScore(cache.events);
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const stats = computeStats(cache.events);
  const cols = ['wurf','tor','quote','smWurf','smTor','assist','paraden','gegentore','gkQuote'];
  const rows = squad.map(p=>({p, s: stats[p.id] || {}}));
  return `
    <div class="topbar"><button class="back-btn" onclick="go('live')">&larr; Zurück</button><h1>Dashboard</h1><span></span></div>
    <div class="scoreboard"><div class="score">${score.us} : ${score.them}</div><div class="meta">Halbzeit ${game.currentHalf} · Live-Übersicht</div></div>
    <div class="table-scroll"><table class="stats">
      <thead><tr><th>Spieler</th>${cols.map(c=>`<th>${STAT_COLS.find(x=>x.key===c).label}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(({p,s})=>`<tr>
          <td>${escapeHtml(p.firstName[0])}. ${escapeHtml(p.lastName)}</td>
          ${cols.map(c=>`<td>${s[c]==null?'–':s[c]}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="footer-note">Quoten in % · aktualisiert sich bei jeder neuen Eingabe</div>
  `;
}

/* ================================ SCREEN: BEWERTUNG ================================ */
function screenRatings(){
  const game = currentGame();
  const phase = state.ratingPhase;
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const title = phase==='halftime' ? 'Bewertung – Halbzeit' : 'Bewertung – Spielende';
  return `
    <div class="topbar"><span></span><h1>${title}</h1><span></span></div>
    <div class="sub" style="margin-bottom:10px;">Rein subjektive Einschätzung je Spieler.</div>
    ${squad.map(p=>{
      const r = getRating(p.id, phase);
      return `<div class="rating-row">
        <div class="pname">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)} <span class="sub">(${escapeHtml(p.position)})</span></div>
        <div class="rating-label">Angriffsleistung</div>
        <div class="rating-group">${RATING_OPTS.map(o=>`<div class="rating-seg ${r.ang===o.v?activeClass(o.v):''}" onclick="setRating('${p.id}','ang',${o.v})">${o.l}</div>`).join('')}</div>
        <div class="rating-label">Abwehrleistung</div>
        <div class="rating-group">${RATING_OPTS.map(o=>`<div class="rating-seg ${r.abw===o.v?activeClass(o.v):''}" onclick="setRating('${p.id}','abw',${o.v})">${o.l}</div>`).join('')}</div>
      </div>`;
    }).join('')}
    <button class="btn btn-primary btn-block-lg" onclick="confirmRatings()">${phase==='halftime'?'Weiter zur 2. Halbzeit':'Spiel beenden & speichern'}</button>
  `;
}
function activeClass(v){ return 'active-' + (v<0? 'neg'+Math.abs(v) : v); }
function ratingId(playerId, phase){ return state.currentGameId+'_'+playerId+'_'+phase; }
function getRating(playerId, phase){
  const found = cache.ratings.find(r=>r.id===ratingId(playerId,phase));
  return found || {ang:null, abw:null};
}
async function setRating(playerId, field, value){
  await safe(async ()=>{
    const id = ratingId(playerId, state.ratingPhase);
    let r = cache.ratings.find(x=>x.id===id);
    if(!r){ r = {id, gameId:state.currentGameId, playerId, phase:state.ratingPhase, ang:null, abw:null}; cache.ratings.push(r); }
    r[field] = value;
    await idbPut('ratings', r);
    render();
  });
}
async function confirmRatings(){
  const game = currentGame();
  await safe(async ()=>{
    if(state.ratingPhase==='halftime'){
      game.currentHalf = 2;
      await idbPut('games', game);
      state.ratingPhase=null;
      go('live');
    } else {
      game.status='finished';
      game.finishedAt = Date.now();
      await idbPut('games', game);
      state.ratingPhase=null;
      toast('Spiel gespeichert.');
      go('gameDetail', {historyGameId:game.id});
    }
  }, 'Konnte nicht gespeichert werden.');
}

/* ================================ SCREEN: VERLAUF (bearbeiten/löschen) ================================ */
async function viewHistoryFor(gameId){
  state.currentGameId = gameId;
  await loadGameData(gameId);
  go('history');
}
function historyBack(){
  const game = currentGame();
  if(game && game.status==='live') go('live');
  else go('gameDetail', {historyGameId: game? game.id : state.historyGameId});
}
function screenHistory(){
  const game = currentGame();
  const evs = [...cache.events].sort((a,b)=>a.timestamp-b.timestamp);
  return `
    <div class="topbar"><button class="back-btn" onclick="historyBack()">&larr; Zurück</button><h1>Verlauf</h1><span></span></div>
    ${[1,2].map(half=>`
      <div class="card">
        <div style="font-weight:700; margin-bottom:6px;">Halbzeit ${half}</div>
        ${evs.filter(e=>e.half===half).map(e=>historyRow(e)).join('') || '<div class="empty-hint">Keine Einträge.</div>'}
      </div>
    `).join('')}
  `;
}
function historyRow(e){
  const t = EVENT_TYPES[e.type];
  const label = t? t.label : 'Notiz';
  const time = new Date(e.timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  return `<div class="history-row" onclick="toggleHistoryActions('${e.id}')">
    <div class="top"><span>${escapeHtml(label)}</span><span>${time}</span></div>
    <div class="sub">${e.playerId? escapeHtml(playerName(e.playerId)) : ''}${e.note? ' – '+escapeHtml(e.note):''}</div>
    <div class="history-actions" id="ha-${e.id}" style="display:none;">
      <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); editHistoryEvent('${e.id}')">Bearbeiten</button>
      <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteHistoryEvent('${e.id}')">Löschen</button>
    </div>
  </div>`;
}
function toggleHistoryActions(id){
  const el = document.getElementById('ha-'+id);
  if(!el) return;
  el.style.display = el.style.display==='none' ? 'flex' : 'none';
}
async function editHistoryEvent(id){
  const e = cache.events.find(x=>x.id===id); if(!e) return;
  if(e.type==='notiz'){
    const text = prompt('Notiz bearbeiten', e.note||''); if(text===null) return;
    await safe(async ()=>{ e.note=text; await idbPut('events', e); render(); });
    return;
  }
  const allKeys = Object.keys(EVENT_TYPES);
  const listStr = allKeys.map((k,i)=>`${i+1}. ${EVENT_TYPES[k].label}`).join('\n');
  const idx = prompt('Neuen Ereignistyp wählen (Nummer eingeben):\n'+listStr, '');
  if(idx===null || idx.trim()==='') return;
  const n = parseInt(idx.trim(),10);
  if(!n || n<1 || n>allKeys.length){ toast('Ungültige Auswahl.'); return; }
  const game = currentGame();
  const squad = game.squad.map(pid=>cache.players.find(p=>p.id===pid)).filter(Boolean);
  const pListStr = squad.map((p,i)=>`${i+1}. ${p.firstName} ${p.lastName}`).join('\n');
  const pIdx = prompt('Spieler wählen (Nummer eingeben):\n'+pListStr, '');
  if(pIdx===null || pIdx.trim()==='') return;
  const pn = parseInt(pIdx.trim(),10);
  if(!pn || pn<1 || pn>squad.length){ toast('Ungültige Auswahl.'); return; }
  await safe(async ()=>{
    e.type = allKeys[n-1];
    e.playerId = squad[pn-1].id;
    await idbPut('events', e);
    render();
  }, 'Änderung konnte nicht gespeichert werden.');
}
async function deleteHistoryEvent(id){
  if(!confirm('Diesen Eintrag wirklich löschen?')) return;
  await safe(async ()=>{
    await idbDelete('events', id);
    cache.events = cache.events.filter(e=>e.id!==id);
    render();
  });
}

/* ================================ STATISTIK-BERECHNUNG ================================ */
function computeStats(events){
  const m = {};
  function row(pid){
    if(!m[pid]) m[pid] = {
      wurf:0,tor:0, smWurf:0,smTor:0, assist:0, techF:0, passfang:0, smGeholt:0, einsGew:0, zweiMinGeholt:0,
      steal:0, fehlerProv:0, geblockt:0, zweiMinErh:0, smVerurs:0, einsVerl:0,
      paraden:0, gegentore:0, gkSm:0, gkSmGehalten:0
    };
    return m[pid];
  }
  events.forEach(e=>{
    const t = EVENT_TYPES[e.type]; if(!t || !e.playerId) return;
    const r = row(e.playerId);
    switch(e.type){
      case 'tor': r.wurf++; r.tor++; break;
      case 'fehlwurf': r.wurf++; break;
      case 'siebenm_tor': r.wurf++; r.tor++; r.smWurf++; r.smTor++; break;
      case 'siebenm_fehl': r.wurf++; r.smWurf++; break;
      case 'assist': r.assist++; break;
      case 'techF_an': r.techF++; break;
      case 'passfang': r.passfang++; break;
      case 'siebenm_geholt': r.smGeholt++; break;
      case 'einsgewonnen': r.einsGew++; break;
      case 'zweiMin_geholt': r.zweiMinGeholt++; break;
      case 'steal': r.steal++; break;
      case 'fehlerprovoziert': r.fehlerProv++; break;
      case 'geblockt': r.geblockt++; break;
      case 'zweiMin_erhalten': r.zweiMinErh++; break;
      case 'siebenm_verursacht': r.smVerurs++; break;
      case 'einsverloren': r.einsVerl++; break;
      case 'parade': r.paraden++; break;
      case 'siebenm_parade': r.paraden++; r.gkSm++; r.gkSmGehalten++; break;
      case 'gegentor': r.gegentore++; break;
      case 'siebenm_gegentor': r.gegentore++; r.gkSm++; break;
    }
  });
  Object.keys(m).forEach(pid=>{
    const r = m[pid];
    r.quote = r.wurf? Math.round(r.tor/r.wurf*100) : null;
    r.smQuote = r.smWurf? Math.round(r.smTor/r.smWurf*100) : null;
    r.gkQuote = (r.paraden+r.gegentore)? Math.round(r.paraden/(r.paraden+r.gegentore)*100) : null;
    r.gkSmQuote = r.gkSm? Math.round(r.gkSmGehalten/r.gkSm*100) : null;
  });
  return m;
}
function avgRating(ratings, playerId, field){
  const rs = ratings.filter(r=>r.playerId===playerId && r[field]!==null && r[field]!==undefined);
  if(!rs.length) return null;
  return (rs.reduce((s,r)=>s+r[field],0)/rs.length).toFixed(1);
}

const STAT_COLS = [
  {key:'wurf', label:'Würfe'}, {key:'tor', label:'Tore'}, {key:'quote', label:'Quote %'},
  {key:'smWurf', label:'7m W.'}, {key:'smTor', label:'7m T.'},
  {key:'assist', label:'Assists'}, {key:'techF', label:'Techn. F.'}, {key:'passfang', label:'Pass/Fang F.'},
  {key:'smGeholt', label:'7m geholt'}, {key:'einsGew', label:'1:1 gew.'}, {key:'zweiMinGeholt', label:'2min geholt'},
  {key:'steal', label:'Steals'}, {key:'fehlerProv', label:'F. prov.'}, {key:'geblockt', label:'Geblockt'},
  {key:'zweiMinErh', label:'2min erh.'}, {key:'smVerurs', label:'7m versch.'}, {key:'einsVerl', label:'1:1 verl.'},
  {key:'paraden', label:'Paraden'}, {key:'gegentore', label:'Gegentore'}, {key:'gkQuote', label:'TW-Quote %'},
];

function statsTable(playersList, statMap, ratings){
  const sortKey = state.statsSort.key, dir = state.statsSort.dir;
  const rows = playersList.map(p=>({p, s: statMap[p.id] || {}}));
  rows.sort((a,b)=>{
    const va = a.s[sortKey]??-Infinity, vb = b.s[sortKey]??-Infinity;
    return dir==='desc' ? vb-va : va-vb;
  });
  return `<div class="table-scroll"><table class="stats">
    <thead><tr>
      <th onclick="setSort('name')">Spieler</th>
      ${STAT_COLS.map(c=>`<th onclick="setSort('${c.key}')">${c.label}</th>`).join('')}
      <th>Angr.⌀</th><th>Abw.⌀</th>
    </tr></thead>
    <tbody>
      ${rows.map(({p,s})=>`<tr>
        <td>${escapeHtml(p.firstName[0])}. ${escapeHtml(p.lastName)}</td>
        ${STAT_COLS.map(c=>`<td>${s[c.key]==null?'–':s[c.key]}</td>`).join('')}
        <td>${avgRating(ratings,p.id,'ang') ?? '–'}</td>
        <td>${avgRating(ratings,p.id,'abw') ?? '–'}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}
function setSort(key){
  if(key==='name') return;
  if(state.statsSort.key===key) state.statsSort.dir = state.statsSort.dir==='desc'?'asc':'desc';
  else state.statsSort = {key, dir:'desc'};
  render();
}

/* ================================ SCREEN: SPIELE & AUSWERTUNG ================================ */
function screenGames(){
  const activeSeasonGames = seasonGames(state.currentSeasonId);
  const archivedSeasons = cache.seasons.filter(s=>s.status==='archived');
  return `
    <div class="topbar"><button class="back-btn" onclick="go('home')">&larr; Zurück</button><h1>Spiele</h1><span></span></div>
    <div class="tabs">
      <div class="tab ${state.gamesTab==='season'?'active':''}" onclick="state.gamesTab='season'; render();">Aktuelle Saison</div>
      <div class="tab ${state.gamesTab==='archive'?'active':''}" onclick="state.gamesTab='archive'; render();">Archiv</div>
    </div>
    ${state.gamesTab==='season' ? `
      <button class="btn btn-gold" onclick="go('seasonStats',{statsSeasonId: state.currentSeasonId})">Saison-Auswertung ansehen</button>
      <div class="card">
        ${activeSeasonGames.map(g=>gameListItem(g)).join('') || '<div class="empty-hint">Noch keine Spiele in dieser Saison.</div>'}
      </div>
    ` : `
      ${archivedSeasons.length? archivedSeasons.map(s=>`
        <div class="card">
          <div class="list-item"><div class="main">Saison ${escapeHtml(s.label)}</div>
          <button class="btn btn-sm btn-outline" onclick="go('seasonStats',{statsSeasonId:'${s.id}'})">Auswertung</button></div>
          ${seasonGames(s.id).map(g=>gameListItem(g)).join('') || '<div class="empty-hint">Keine Spiele.</div>'}
        </div>
      `).join('') : '<div class="empty-hint">Noch keine archivierten Saisons.</div>'}
    `}
  `;
}
function gameListItem(g){
  const scoreLabel = g.status==='finished' ? '' : (g.status==='live'?' (läuft)':'');
  return `<div class="list-item" onclick="openGameDetail('${g.id}')" style="cursor:pointer;">
    <div><div class="main">${escapeHtml(g.opponent)}${scoreLabel}</div><div class="sub">${fmtDate(g.date)} · ${escapeHtml(g.homeAway)}${g.liga? ' · '+escapeHtml(g.liga):''}</div></div>
    <div>›</div>
  </div>`;
}
async function openGameDetail(gameId){
  await loadGameData(gameId);
  go('gameDetail', {historyGameId:gameId});
}

/* ================================ SCREEN: SPIEL-DETAIL ================================ */
function screenGameDetail(){
  const game = cache.games.find(g=>g.id===state.historyGameId);
  if(!game) return `<div class="card"><p>Spiel nicht gefunden.</p></div>`;
  const stats = computeStats(cache.events);
  const score = gameScore(cache.events);
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const notes = cache.events.filter(e=>e.type==='notiz');
  return `
    <div class="topbar"><button class="back-btn" onclick="go('games')">&larr; Zurück</button><h1>${escapeHtml(game.opponent)}</h1><span></span></div>
    <div class="scoreboard"><div class="score">${score.us} : ${score.them}</div><div class="meta">${escapeHtml(game.homeAway)} · ${fmtDate(game.date)}${game.liga? ' · '+escapeHtml(game.liga):''}</div></div>
    ${statsTable(squad, stats, cache.ratings)}
    ${notes.length? `<div class="card"><div style="font-weight:700; margin-bottom:6px;">Notizen</div>
      ${notes.map(n=>`<div class="list-item"><div><div class="sub">HZ${n.half} · ${n.playerId? escapeHtml(playerName(n.playerId))+' – ':''}${escapeHtml(n.note)}</div></div></div>`).join('')}
    </div>`:''}
    <button class="btn btn-outline" onclick="openPostGameAdd('${game.id}')">+ Aktion nachtragen</button>
    <button class="btn btn-outline" onclick="viewHistoryFor('${game.id}')">Verlauf ansehen/bearbeiten</button>
    <button class="btn btn-gold" onclick="exportGameXlsx('${game.id}')">Als Excel exportieren</button>
  `;
}

/* ================================ NACHTRAGEN: Aktion nach Spielende hinzufügen ================================ */
async function openPostGameAdd(gameId){
  state.postAddGameId = gameId;
  state.postAddHalf = null; state.postAddCat = null; state.postAddType = null;
  await loadGameData(gameId);
  go('postGameAdd');
}
function postAddPickHalf(h){ state.postAddHalf = h; render(); }
function postAddPickCat(c){ state.postAddCat = c; render(); }
function postAddPickType(k){ state.postAddType = k; render(); }
function postAddBack(){
  if(state.postAddType){ state.postAddType=null; render(); }
  else if(state.postAddCat){ state.postAddCat=null; render(); }
  else if(state.postAddHalf){ state.postAddHalf=null; render(); }
  else go('gameDetail', {historyGameId: state.postAddGameId});
}
function screenPostGameAdd(){
  const game = cache.games.find(g=>g.id===state.postAddGameId);
  if(!game) return `<div class="card"><p>Spiel nicht gefunden.</p></div>`;
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const keepers = squad.filter(p=>p.position==='Tor');

  if(!state.postAddHalf){
    return `
      <div class="topbar"><button class="back-btn" onclick="postAddBack()">&larr; Zurück</button><h1>Aktion nachtragen</h1><span></span></div>
      <div class="sub" style="margin-bottom:10px;">Für welche Halbzeit?</div>
      <button class="btn btn-outline" onclick="postAddPickHalf(1)">Halbzeit 1</button>
      <button class="btn btn-outline" onclick="postAddPickHalf(2)">Halbzeit 2</button>
    `;
  }
  if(!state.postAddCat){
    return `
      <div class="topbar"><button class="back-btn" onclick="postAddBack()">&larr; Zurück</button><h1>Halbzeit ${state.postAddHalf}</h1><span></span></div>
      <div class="grid2">
        <button class="event-menu-btn angriff" style="text-align:center; padding:18px 8px;" onclick="postAddPickCat('angriff')">⚔️ Angriff</button>
        <button class="event-menu-btn abwehr" style="text-align:center; padding:18px 8px;" onclick="postAddPickCat('abwehr')">🛡️ Abwehr</button>
        <button class="event-menu-btn torhueter" style="text-align:center; padding:18px 8px;" onclick="postAddPickCat('torhueter')">🥅 Torhüter</button>
        <button class="event-menu-btn notiz" style="text-align:center; padding:18px 8px;" onclick="postAddPickCat('notiz')">📝 Notiz</button>
      </div>
    `;
  }
  if(state.postAddCat==='notiz'){
    return `
      <div class="topbar"><button class="back-btn" onclick="postAddBack()">&larr; Zurück</button><h1>Notiz nachtragen</h1><span></span></div>
      <div class="field"><textarea id="pa-note-text" rows="4" placeholder="Notiz eintragen..."></textarea></div>
      <div class="field"><label>Spieler zuordnen (optional)</label>
        <select id="pa-note-player"><option value="">– kein Spieler –</option>${squad.map(p=>`<option value="${p.id}">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" onclick="postAddSaveNote()">Notiz speichern</button>
    `;
  }
  if(!state.postAddType){
    const keys = state.postAddCat==='angriff'? ANGRIFF_KEYS : state.postAddCat==='abwehr'? ABWEHR_KEYS : TORHUETER_KEYS;
    return `
      <div class="topbar"><button class="back-btn" onclick="postAddBack()">&larr; Zurück</button><h1>Halbzeit ${state.postAddHalf}</h1><span></span></div>
      ${keys.map(k=>`<button class="event-menu-btn ${state.postAddCat}" onclick="postAddPickType('${k}')">${EVENT_TYPES[k].label}</button>`).join('')}
    `;
  }
  const postPickIsGk = !!(EVENT_TYPES[state.postAddType] && EVENT_TYPES[state.postAddType].gk);
  const pickerList = postPickIsGk && keepers.length ? keepers : squad;
  return `
    <div class="topbar"><button class="back-btn" onclick="postAddBack()">&larr; Zurück</button><h1>${EVENT_TYPES[state.postAddType].label}</h1><span></span></div>
    <div class="sub" style="margin-bottom:10px;">${postPickIsGk ? 'Wer stand im Tor?' : 'Wer war beteiligt?'}</div>
    <div class="grid-players">
      ${pickerList.map(p=>`<button class="player-btn" onclick="postAddLogEvent('${p.id}')"><span class="name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span><span class="pos">${escapeHtml(p.position)}</span></button>`).join('')}
    </div>
  `;
}
async function postAddLogEvent(playerId){
  const key = state.postAddType, gameId = state.postAddGameId, half = state.postAddHalf;
  await safe(async ()=>{
    const ev = { id:uid(), gameId, half, type:key, playerId, timestamp:Date.now() };
    await idbPut('events', ev);
    cache.events.push(ev);
    toast('Nachgetragen: ' + EVENT_TYPES[key].label + ' – ' + playerName(playerId));
    state.postAddType=null; state.postAddCat=null; state.postAddHalf=null;
    go('gameDetail', {historyGameId: gameId});
  }, 'Konnte nicht nachgetragen werden.');
}
async function postAddSaveNote(){
  const text = document.getElementById('pa-note-text').value.trim();
  const playerId = document.getElementById('pa-note-player').value || null;
  if(!text){ toast('Bitte Text eingeben.'); return; }
  const gameId = state.postAddGameId, half = state.postAddHalf;
  await safe(async ()=>{
    const ev = { id:uid(), gameId, half, type:'notiz', note:text, playerId, timestamp:Date.now() };
    await idbPut('events', ev);
    cache.events.push(ev);
    toast('Notiz nachgetragen.');
    state.postAddCat=null; state.postAddHalf=null;
    go('gameDetail', {historyGameId: gameId});
  }, 'Notiz konnte nicht nachgetragen werden.');
}

/* ================================ SCREEN: SAISON-AUSWERTUNG ================================ */
function screenSeasonStats(){
  const seasonId = state.statsSeasonId || state.currentSeasonId;
  const season = cache.seasons.find(s=>s.id===seasonId);
  return `<div class="topbar"><button class="back-btn" onclick="go('games')">&larr; Zurück</button><h1>Saison ${escapeHtml(season?season.label:'')}</h1><span></span></div>
  <div id="season-stats-holder" class="empty-hint">Lade Auswertung…</div>`;
}
// Da IndexedDB-Zugriffe asynchron sind, aber render() synchron aufgebaut wird,
// laden wir die Saison-Events einmalig vorab und cachen sie zwischen.
let _seasonEventsCache = {seasonId:null, events:[], ratings:[]};
async function ensureSeasonEvents(seasonId){
  if(_seasonEventsCache.seasonId===seasonId) return _seasonEventsCache;
  let allEv = [], allRt = [];
  for(const g of seasonGames(seasonId)){
    const evs = await idbGetAllByIndex('events','gameId', g.id);
    const rts = await idbGetAllByIndex('ratings','gameId', g.id);
    allEv = allEv.concat(evs); allRt = allRt.concat(rts);
  }
  _seasonEventsCache = {seasonId, events:allEv, ratings:allRt};
  return _seasonEventsCache;
}
async function loadSeasonStatsInto(seasonId){
  const data = await ensureSeasonEvents(seasonId);
  const stats = computeStats(data.events);
  const holder = document.getElementById('season-stats-holder');
  if(!holder) return;
  holder.outerHTML = `
    <div class="card">${statsTable(cache.players, stats, data.ratings)}</div>
    <button class="btn btn-gold" onclick="exportSeasonXlsx('${seasonId}')">Saison als Excel exportieren</button>
  `;
}

/* ================================ SAISON ABSCHLIESSEN ================================ */
function screenCloseSeason(){
  const season = activeSeason();
  return `
    <div class="topbar"><button class="back-btn" onclick="go('home')">&larr; Zurück</button><h1>Saison abschließen</h1><span></span></div>
    <div class="card">
      <p>Die aktuelle Saison <b>${escapeHtml(season?season.label:'')}</b> wird archiviert (alle Spiele bleiben einsehbar und exportierbar). Der Kader wird für die neue Saison übernommen.</p>
      <div class="field"><label>Bezeichnung der neuen Saison</label><input type="text" id="new-season-label" value="${guessSeasonLabel()}"></div>
      <button class="btn btn-primary btn-block-lg" onclick="closeSeason()">Saison abschließen &amp; neue starten</button>
    </div>
  `;
}
async function closeSeason(){
  const label = document.getElementById('new-season-label').value.trim() || guessSeasonLabel();
  if(!confirm('Saison wirklich abschließen? Dies kann nicht rückgängig gemacht werden (Daten bleiben aber im Archiv erhalten).')) return;
  await safe(async ()=>{
    const old = activeSeason();
    old.status='archived'; old.archivedAt=Date.now();
    await idbPut('seasons', old);
    const ns = {id:uid(), label, status:'active', createdAt:Date.now()};
    await idbPut('seasons', ns);
    cache.seasons.push(ns);
    state.currentSeasonId = ns.id;
    toast('Neue Saison gestartet.');
    go('home');
  }, 'Saison konnte nicht abgeschlossen werden.');
}

/* ================================ DATEI SPEICHERN (Download) ================================
   In der als Claude-Artifact veröffentlichten Vorschau blockiert die Sandbox normale
   Browser-Downloads (<a download>) komplett. Dort läuft aber die "downloads"-Capability
   der Plattform (window.claude.use('downloads')), die dem Betrachter denselben Effekt über
   einen Bestätigungsdialog anbietet. In der installierten/eigen gehosteten App gibt es kein
   window.claude – dort funktioniert der normale Browser-Download wie gewohnt. */
async function saveFileBlob(filename, blob){
  if(typeof window.claude !== 'undefined' && window.claude && typeof window.claude.use === 'function'){
    try{
      const downloads = await window.claude.use('downloads');
      if(downloads){
        await downloads.save({filename, data: blob});
        toast('Datei gespeichert.');
        return;
      }
      toast('Download in dieser Vorschau nicht verfügbar – bitte die installierte App-Version nutzen.');
      return;
    }catch(err){
      console.error('downloads.save fehlgeschlagen', err);
      if(err && err.code==='declined'){ return; } // Nutzer hat abgelehnt, kein Fehler-Toast nötig
      toast('Download nicht möglich (' + (err && err.code ? err.code : 'Fehler') + ').');
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Download gestartet.');
}

/* ================================ EXPORT: EXCEL (SheetJS) ================================ */
function buildGameSheets(wb, game, events, ratings, sheetPrefix){
  const squad = game.squad.map(id=>cache.players.find(p=>p.id===id)).filter(Boolean);
  const stats = computeStats(events);
  const rows = squad.map(p=>{
    const s = stats[p.id] || {};
    const row = {Spieler: p.firstName+' '+p.lastName, Position: p.position};
    STAT_COLS.forEach(c=> row[c.label] = s[c.key]==null? '' : s[c.key]);
    row['Angriffsleistung Ø'] = avgRating(ratings, p.id, 'ang') ?? '';
    row['Abwehrleistung Ø'] = avgRating(ratings, p.id, 'abw') ?? '';
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, (sheetPrefix||'Statistik').slice(0,31));

  const evRows = events.slice().sort((a,b)=>a.timestamp-b.timestamp).map(e=>({
    Halbzeit: e.half,
    Zeit: new Date(e.timestamp).toLocaleString('de-DE'),
    Ereignis: EVENT_TYPES[e.type]? EVENT_TYPES[e.type].label : 'Notiz',
    Spieler: e.playerId? playerName(e.playerId) : '',
    Notiz: e.note || ''
  }));
  const wsEv = XLSX.utils.json_to_sheet(evRows);
  XLSX.utils.book_append_sheet(wb, wsEv, (sheetPrefix+'-Verlauf').slice(0,31));
}
function exportGameXlsx(gameId){
  safe(async ()=>{
    const game = cache.games.find(g=>g.id===gameId);
    await loadGameData(gameId);
    const wb = XLSX.utils.book_new();
    const score = gameScore(cache.events);
    const infoWs = XLSX.utils.json_to_sheet([{
      Gegner:game.opponent, HeimAuswaerts:game.homeAway, Datum:fmtDate(game.date), Wettbewerb:game.liga||'',
      Ergebnis: score.us+':'+score.them
    }]);
    XLSX.utils.book_append_sheet(wb, infoWs, 'Spielinfo');
    buildGameSheets(wb, game, cache.events, cache.ratings, 'Statistik');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveFileBlob(`TVN_${game.opponent.replace(/[^a-z0-9]/gi,'_')}_${game.date}.xlsx`, blob);
  }, 'Export fehlgeschlagen.');
}
function exportSeasonXlsx(seasonId){
  safe(async ()=>{
    const season = cache.seasons.find(s=>s.id===seasonId);
    const games = seasonGames(seasonId);
    const data = await ensureSeasonEvents(seasonId);
    const wb = XLSX.utils.book_new();
    const gamesWs = XLSX.utils.json_to_sheet(games.map(g=>{
      const evs = data.events.filter(e=>e.gameId===g.id);
      const sc = gameScore(evs);
      return {Datum:fmtDate(g.date), Gegner:g.opponent, HeimAuswaerts:g.homeAway, Wettbewerb:g.liga||'', Ergebnis:sc.us+':'+sc.them, Status:g.status};
    }));
    XLSX.utils.book_append_sheet(wb, gamesWs, 'Spiele');
    const stats = computeStats(data.events);
    const rows = cache.players.map(p=>{
      const s = stats[p.id] || {};
      const row = {Spieler:p.firstName+' '+p.lastName, Position:p.position};
      STAT_COLS.forEach(c=> row[c.label] = s[c.key]==null? '' : s[c.key]);
      row['Angriffsleistung Ø'] = avgRating(data.ratings, p.id, 'ang') ?? '';
      row['Abwehrleistung Ø'] = avgRating(data.ratings, p.id, 'abw') ?? '';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Saison-Statistik');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveFileBlob(`TVN_Saison_${season.label.replace(/[^a-z0-9]/gi,'_')}.xlsx`, blob);
  }, 'Export fehlgeschlagen.');
}

/* ================================ BACKUP / WIEDERHERSTELLUNG ================================ */
async function exportBackup(){
  await safe(async ()=>{
    const allEvents = [];
    const allRatings = [];
    for(const g of cache.games){
      const evs = await idbGetAllByIndex('events','gameId', g.id);
      const rts = await idbGetAllByIndex('ratings','gameId', g.id);
      allEvents.push(...evs); allRatings.push(...rts);
    }
    const backup = {
      exportedAt:new Date().toISOString(), version:1,
      players:cache.players, seasons:cache.seasons, games:cache.games,
      events:allEvents, ratings:allRatings
    };
    const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
    await saveFileBlob(`TVN_Backup_${todayISO()}.json`, blob);
  }, 'Backup konnte nicht erstellt werden.');
}
function importBackup(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    await safe(async ()=>{
      const data = JSON.parse(reader.result);
      if(!confirm('Backup importieren? Bestehende Daten mit gleicher ID werden überschrieben.')) return;
      for(const p of data.players||[]) await idbPut('players', p);
      for(const s of data.seasons||[]) await idbPut('seasons', s);
      for(const g of data.games||[]) await idbPut('games', g);
      for(const e of data.events||[]) await idbPut('events', e);
      for(const r of data.ratings||[]) await idbPut('ratings', r);
      await reloadAll();
      const active = cache.seasons.find(s=>s.status==='active');
      if(active) state.currentSeasonId = active.id;
      toast('Backup importiert.');
      go('home');
    }, 'Backup konnte nicht importiert werden – Datei prüfen.');
  };
  reader.readAsText(file);
}

/* ================================ START ================================ */
window.addEventListener('DOMContentLoaded', init);
