
const SUPABASE_URL = 'https://nwpuiwfptkswloauphzn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53cHVpd2ZwdGtzd2xvYXVwaHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDY5OTEsImV4cCI6MjA5NzM4Mjk5MX0.kOcnfzbxI2xoSRsM26LiyesE8SszyPJ4eBkLRDKgQPc';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');

  if (!email || !password) { showLoginError('Inserisci email e password'); return; }

  btn.disabled = true;
  btn.textContent = 'Accesso in corso...';
  err.style.display = 'none';

  try {
    // Forza logout sessione precedente
    await db.auth.signOut();

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
      showLoginError('Errore: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Accedi';
      return;
    }

    if (!data?.user) {
      showLoginError('Nessun utente ricevuto, riprova');
      btn.disabled = false;
      btn.textContent = 'Accedi';
      return;
    }

    await initApp(data.user);

  } catch(e) {
    showLoginError('Errore di connessione: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Accedi';
  }
}

function showLoginError(msg) {
  const err = document.getElementById('login-error');
  err.textContent = msg;
  err.style.display = 'block';
}

async function doLogout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Accedi';
  document.getElementById('login-password').value = '';
}

async function initApp(user) {
  try {
    currentUser = user;

    // Mostra subito l'app con i dati dell'email
    const emailName = user.email.split('@')[0];
    document.getElementById('header-avatar').textContent = emailName[0].toUpperCase();
    document.getElementById('header-user-name').textContent = user.email;
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    showPage('dashboard');

    // Popola catalogo spesa e carica dati iniziali
    setTimeout(async () => {
      await loadCatalogoSpesa();
      await popolaCatalogoIniziale();
    }, 1000);

    // Carica profilo e permessi in background
    setTimeout(async () => {
      try {
        const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
          currentProfile = profile;
          const nome = profile.nome || emailName;
          const cognome = profile.cognome || '';
          const iniziali = ((nome[0] || '') + (cognome[0] || '')).toUpperCase();
          document.getElementById('header-avatar').textContent = iniziali;
          document.getElementById('header-user-name').textContent = nome + (cognome ? ' ' + cognome : '');
          if (profile.ruolo === 'admin') {
            document.getElementById('admin-section').style.display = 'block';
          }
        }
        await applicaPermessi(user.id);
        await loadCategorie();
        await assicuraSagreCaricate();
        loadDashboard();
      } catch(e) {
        loadDashboard();
      }
    }, 500);

  } catch(e) {
    showLoginError('Errore: ' + e.message);
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn').textContent = 'Accedi';
  }
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.s-item').forEach(i => i.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  document.querySelectorAll('.s-item').forEach(item => {
    if (item.getAttribute('onclick')?.includes(`'${pageId}'`)) item.classList.add('active');
  });
  closeSidebar();
  if (pageId === 'soci' || pageId === 'db-avanzato') loadSoci();
  if (pageId === 'quote') loadQuote();
  if (pageId === 'cassa') loadCassa();
  if (pageId === 'impostazioni-anno') loadImpostazioniAnno();
  if (pageId === 'impostazioni') loadImpostazioni();
  if (pageId === 'utenti') loadUtenti();
  if (pageId === 'sagra') loadSagre();
  if (pageId === 'movimenti-sagra') loadMovimentiSagra();
  if (pageId === 'sponsor') loadSponsor();
  if (pageId === 'spesa') loadSpesa();
  if (pageId === 'prima-nota') loadPrimaNota();
  if (pageId === 'inventario') loadInventario();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

async function loadDashboard() {
  const anno = new Date().getFullYear();
  const ora = new Date().getHours();
  const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const nome = currentProfile?.nome || '';

  document.getElementById('dash-greeting-text').textContent = `${saluto}${nome ? ', ' + nome : ''} 👋`;
  document.getElementById('dash-subtitle').textContent = `Anno ${anno} — ${currentProfile?.ruolo || 'utente'}`;
  document.getElementById('dash-anno').textContent = anno;

  const { count: nSoci } = await db.from('soci').select('*', { count: 'exact', head: true }).eq('attivo', true);
  document.getElementById('dash-soci').textContent = nSoci ?? 0;

  const { data: quote } = await db.from('quote').select('pagato').eq('anno', anno);
  const pagate = quote?.filter(q => q.pagato).length ?? 0;
  const daPagare = (quote?.length ?? 0) - pagate;
  document.getElementById('dash-quote-pagate').textContent = pagate;
  document.getElementById('dash-quote-nopag').textContent = daPagare;

  const { data: movimenti } = await db.from('movimenti_cassa').select('tipo, importo');
  let saldo = 0;
  movimenti?.forEach(m => { saldo += m.tipo === 'entrata' ? +m.importo : -m.importo; });
  document.getElementById('dash-saldo').textContent = saldo.toFixed(2);

  const { count: nVol } = await db.from('volontari').select('*', { count: 'exact', head: true }).eq('attivo', true);
  document.getElementById('dash-volontari').textContent = nVol ?? 0;

  const { count: nInv } = await db.from('inventario').select('*', { count: 'exact', head: true });
  document.getElementById('dash-inventario').textContent = nInv ?? 0;

  // Ultime quote
  const { data: ultimeQuote } = await db
    .from('quote')
    .select('pagato, data_pagamento, anno, soci(nome, cognome)')
    .order('created_at', { ascending: false })
    .limit(5);

  const list = document.getElementById('dash-quote-list');
  if (!ultimeQuote || ultimeQuote.length === 0) {
    list.innerHTML = '<div class="table-row"><span class="row-name" style="color:var(--testo-muted)">Nessuna quota registrata</span></div>';
  } else {
    list.innerHTML = ultimeQuote.map(q => `
      <div class="table-row">
        <div>
          <div class="row-name">${q.soci?.cognome || ''} ${q.soci?.nome || ''}</div>
          <div class="row-sub">${q.anno}</div>
        </div>
        <span class="badge ${q.pagato ? 'badge-ok' : 'badge-no'}">${q.pagato ? 'Pagata' : 'Da pagare'}</span>
      </div>
    `).join('');
  }
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

db.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentProfile = null;
  }
});

// All'avvio: pulisci sempre la sessione e mostra login
(async () => {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('sb-')) localStorage.removeItem(k);
  });
  await db.auth.signOut();
})();

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});



// ===== DATI SOCI =====
let tuttiSoci = [];
let impostazioniAnno = [];
const ANNO_CORRENTE = new Date().getFullYear();

const PAGINE_DISPONIBILI = [
  { id: 'dashboard',         label: 'Dashboard',           gruppo: 'Generale' },
  { id: 'soci',              label: 'Soci',                gruppo: 'Associazione' },
  { id: 'db-avanzato',       label: 'DB Avanzato',         gruppo: 'Associazione' },
  { id: 'quote',             label: 'Quote annuali',       gruppo: 'Associazione' },
  { id: 'cassa',             label: 'Cassa generale',      gruppo: 'Associazione' },
  { id: 'documenti',         label: 'Documenti',           gruppo: 'Associazione' },
  { id: 'sagra',             label: 'Edizioni sagra',      gruppo: 'Sagra' },
  { id: 'movimenti-sagra',   label: 'Entrate / Uscite',    gruppo: 'Sagra' },
  { id: 'volontari',         label: 'Volontari',           gruppo: 'Sagra' },
  { id: 'turni',             label: 'Turni',               gruppo: 'Sagra' },
  { id: 'spesa',             label: 'Lista spesa',         gruppo: 'Sagra' },
  { id: 'inventario',        label: 'Inventario',          gruppo: 'Risorse' },
  { id: 'impostazioni-anno', label: 'Anni e quote',        gruppo: 'Amministrazione' },
  { id: 'utenti',            label: 'Utenti',              gruppo: 'Amministrazione' },
];

function statoSocio(s) {
  return parseInt(s.anno_rinnovo) === ANNO_CORRENTE ? 'attivo' : 'non_rinnovato';
}

function excelSerialToDate(val) {
  const num = parseInt(val);
  if (isNaN(num) || num < 1000) return null;
  // Data seriale Excel: giorni dal 01/01/1900 (con bug leapyear 1900)
  const date = new Date(Date.UTC(1900, 0, 1) + (num - 2) * 86400000);
  const d = String(date.getUTCDate()).padStart(2,'0');
  const m = String(date.getUTCMonth()+1).padStart(2,'0');
  const y = date.getUTCFullYear();
  return `${y}-${m}-${d}`;
}

function parseDataIT(str) {
  if (!str) return null;
  const p = str.split('/');
  if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
  return str;
}

function formatDataIT(str) {
  if (!str) return '';
  const p = str.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return str;
}

async function loadSoci() {
  const { data, error } = await db.from('soci').select('*').eq('attivo', true).order('cognome');
  if (error) { console.error(error); return; }
  tuttiSoci = data || [];

  // Carica quota anno corrente per la barra rinnovo
  const { data: imp } = await db.from('impostazioni_anno').select('quota').eq('anno', ANNO_CORRENTE).single();
  impostazioniAnno = imp ? [{ anno: ANNO_CORRENTE, quota: imp.quota }] : [];
  const barraQuota = document.getElementById('barra-quota');
  if (barraQuota) barraQuota.textContent = imp ? parseFloat(imp.quota).toFixed(2) : '—';

  renderSoci(tuttiSoci);
  renderDB(tuttiSoci);
}

function renderSoci(soci) {
  const search = (document.getElementById('soci-search')?.value || '').toLowerCase();
  const filtered = search
    ? soci.filter(s => `${s.cognome} ${s.nome} ${s.codice_fiscale}`.toLowerCase().includes(search))
    : soci;

  const attivi = filtered.filter(s => statoSocio(s) === 'attivo');
  const nonRinn = filtered.filter(s => statoSocio(s) === 'non_rinnovato');

  document.getElementById('badge-attivi').textContent = attivi.length;
  document.getElementById('badge-nonrinn').textContent = nonRinn.length;

  document.getElementById('lista-attivi').innerHTML = attivi.length
    ? attivi.map(s => rowSocio(s, 'attivo')).join('')
    : '<div class="table-row"><span class="row-name" style="color:var(--testo-muted)">Nessun socio attivo</span></div>';

  document.getElementById('lista-nonrinn').innerHTML = nonRinn.length
    ? nonRinn.map(s => rowSocio(s, 'non_rinnovato')).join('')
    : '<div class="table-row"><span class="row-name" style="color:var(--testo-muted)">Tutti in regola!</span></div>';
}

function rowSocio(s, stato) {
  const badge = stato === 'attivo'
    ? '<span class="badge badge-ok">Attivo</span>'
    : `<span class="badge badge-no">${s.anno_rinnovo || '—'}</span>`;
  return `<div class="table-row">
    <input type="checkbox" class="socio-checkbox" data-id="${s.id}" onchange="aggiornaBarraRinnovo()"
      style="margin-right:4px;width:16px;height:16px;cursor:pointer;accent-color:var(--blu);">
    <div style="flex:1;">
      <div class="row-name">${s.cognome} ${s.nome}</div>
      <div class="row-sub">${s.codice_fiscale} · ${s.citta || ''} · ${s.telefono || ''}</div>
    </div>
    ${badge}
    <button class="btn btn-sm" onclick="generaTessera('${s.id}')" title="Tessera"><i class="ti ti-id"></i></button>
    <button class="btn btn-sm" onclick='openModalSocio(${JSON.stringify(s)})'><i class="ti ti-edit"></i></button>
    ${stato === 'non_rinnovato' ? `<button class="btn btn-sm" style="color:var(--verde)" onclick="rinnovaQuota('${s.id}')"><i class="ti ti-refresh"></i> Rinnova</button>` : ''}
  </div>`;
}

function filterSoci() { renderSoci(tuttiSoci); }

// ===== DB AVANZATO =====
function renderDB(soci) {
  const search = (document.getElementById('db-search')?.value || '').toLowerCase();
  const filtered = search
    ? soci.filter(s => JSON.stringify(s).toLowerCase().includes(search))
    : soci;

  const tbody = document.getElementById('db-tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="padding:32px;text-align:center;color:var(--testo-muted);">Nessun risultato</td></tr>';
    return;
  }

  const anno = ANNO_CORRENTE;
  tbody.innerHTML = filtered.map((s, i) => {
    const stato = statoSocio(s);
    const badgeColor = stato === 'attivo' ? 'badge-ok' : 'badge-no';
    const badgeText = stato === 'attivo' ? 'Attivo' : 'Non rinnovato';
    const bg = i % 2 === 0 ? '' : 'background:#F5F7FB;';
    return `<tr style="${bg}">
      <td style="padding:7px 12px;font-family:monospace;font-size:11px;">${s.codice_fiscale || ''}</td>
      <td style="padding:7px 12px;">${s.cognome || ''}</td>
      <td style="padding:7px 12px;">${s.nome || ''}</td>
      <td style="padding:7px 12px;text-align:center;">${s.sesso || ''}</td>
      <td style="padding:7px 12px;white-space:nowrap;">${formatDataIT(s.data_nascita) || ''}</td>
      <td style="padding:7px 12px;">${s.luogo_nascita || ''}</td>
      <td style="padding:7px 12px;">${s.indirizzo || ''}</td>
      <td style="padding:7px 12px;">${s.cap || ''}</td>
      <td style="padding:7px 12px;">${s.citta || ''}</td>
      <td style="padding:7px 12px;white-space:nowrap;">${s.telefono || ''}</td>
      <td style="padding:7px 12px;font-size:11px;">${s.email || ''}</td>
      <td style="padding:7px 12px;white-space:nowrap;">${formatDataIT(s.data_iscrizione) || ''}</td>
      <td style="padding:7px 12px;text-align:center;font-weight:600;">${s.anno_rinnovo || ''}</td>
      <td style="padding:7px 12px;"><span class="badge ${badgeColor}">${badgeText}</span></td>
      <td style="padding:7px 12px;text-align:center;white-space:nowrap;">
        <button class="btn btn-sm" onclick="generaTessera('${s.id}')" title="Tessera"><i class="ti ti-id"></i></button>
        <button class="btn btn-sm" onclick='openModalSocio(${JSON.stringify(s)})'><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaSocio('${s.id}','${s.cognome} ${s.nome}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function filterDB() { renderDB(tuttiSoci); }

// ===== MODALE SOCIO =====
function openModalSocio(s = null) {
  const modal = document.getElementById('modal-socio');
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
  document.getElementById('modal-socio-title').textContent = s ? 'Modifica socio' : 'Nuovo socio';
  document.getElementById('m-socio-id').value = s?.id || '';
  document.getElementById('m-cf').value = s?.codice_fiscale || '';
  document.getElementById('m-cognome').value = s?.cognome || '';
  document.getElementById('m-nome').value = s?.nome || '';
  document.getElementById('m-sesso').value = s?.sesso || '';
  document.getElementById('m-data-nascita').value = formatDataIT(s?.data_nascita) || '';
  document.getElementById('m-cap-nascita').value = s?.cap_nascita || '';
  document.getElementById('m-luogo-nascita').value = s?.luogo_nascita || '';
  document.getElementById('m-indirizzo').value = s?.indirizzo || '';
  document.getElementById('m-cap').value = s?.cap || '';
  document.getElementById('m-citta').value = s?.citta || '';
  document.getElementById('m-telefono').value = s?.telefono || '';
  document.getElementById('m-email').value = s?.email || '';
  document.getElementById('m-data-iscrizione').value = formatDataIT(s?.data_iscrizione) || '';
  document.getElementById('m-anno-rinnovo').value = s?.anno_rinnovo || ANNO_CORRENTE;
}

function closeModalSocio() {
  const m = document.getElementById('modal-socio');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveSocio() {
  const cf = document.getElementById('m-cf').value.trim().toUpperCase();
  const cognome = document.getElementById('m-cognome').value.trim();
  const nome = document.getElementById('m-nome').value.trim();
  if (!cf || !cognome || !nome) { showToast('CF, cognome e nome sono obbligatori', 'error'); return; }

  const payload = {
    codice_fiscale: cf,
    cognome, nome,
    sesso: document.getElementById('m-sesso').value || null,
    data_nascita: parseDataIT(document.getElementById('m-data-nascita').value) || null,
    cap_nascita: document.getElementById('m-cap-nascita').value.trim() || null,
    luogo_nascita: document.getElementById('m-luogo-nascita').value.trim() || null,
    indirizzo: document.getElementById('m-indirizzo').value.trim() || null,
    cap: document.getElementById('m-cap').value.trim() || null,
    citta: document.getElementById('m-citta').value.trim() || null,
    telefono: document.getElementById('m-telefono').value.trim() || null,
    email: document.getElementById('m-email').value.trim() || null,
    data_iscrizione: parseDataIT(document.getElementById('m-data-iscrizione').value) || null,
    anno_rinnovo: parseInt(document.getElementById('m-anno-rinnovo').value) || null,
    attivo: true,
    updated_at: new Date().toISOString()
  };

  const id = document.getElementById('m-socio-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('soci').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('soci').insert(payload));
  }

  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast(id ? 'Socio aggiornato' : 'Socio aggiunto', 'success');
  closeModalSocio();
  loadSoci();
}

async function eliminaSocio(id, nome) {
  if (!confirm(`Eliminare ${nome}?`)) return;
  const { error } = await db.from('soci').update({ attivo: false }).eq('id', id);
  if (error) { showToast('Errore', 'error'); return; }
  showToast('Socio rimosso', 'success');
  loadSoci();
}

async function rinnovaQuota(id) {
  const socio = tuttiSoci.find(s => s.id === id);
  const quota = getQuotaAnnoCorrente();
  const oggi = new Date().toISOString().split('T')[0];

  const { error } = await db.from('soci').update({ anno_rinnovo: ANNO_CORRENTE, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('Errore', 'error'); return; }

  // Registra in quote
  await db.from('quote').insert({ socio_id: id, anno: ANNO_CORRENTE, pagato: true, data_pagamento: oggi, importo: quota });

  // Registra entrata in cassa generale
  const nomeSocio = socio ? `${socio.cognome} ${socio.nome}` : 'Socio';
  await db.from('movimenti_cassa').insert({
    tipo: 'entrata',
    categoria: 'Quote associative',
    descrizione: `Quota ${ANNO_CORRENTE} — ${nomeSocio}`,
    importo: quota,
    data: oggi,
    metodo_pagamento: 'contanti'
  });

  showToast('Quota rinnovata!', 'success');
  loadSoci();
}

// ===== IMPORT EXCEL =====
async function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Trova riga header (quella con codice_fiscale o Codice Fiscale)
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const r = rows[i].map(c => String(c).toLowerCase());
      if (r.some(c => c.includes('codice') || c.includes('fiscale') || c === 'codice_fiscale')) {
        headerRow = i; break;
      }
    }
    if (headerRow < 0) { showToast('Intestazioni non trovate', 'error'); return; }

    const rawHeaders = rows[headerRow].map(c => String(c).toLowerCase().trim()
      .replace(/[*]/g,'')
      .replace(/è/g,'e').replace(/à/g,'a').replace(/ì/g,'i').replace(/ò/g,'o').replace(/ù/g,'u'));

    const keyMap = {
      // codice fiscale
      'codice_fiscale': 'codice_fiscale', 'codice fiscale': 'codice_fiscale',
      // nome cognome
      'cognome': 'cognome', 'nome': 'nome',
      // sesso
      'sesso': 'sesso', 'sesso_(m/f)': 'sesso',
      // data nascita
      'data_nascita': 'data_nascita', 'data nascita': 'data_nascita',
      'data_nascita_(gg/mm/aaaa)': 'data_nascita', 'data di nascita': 'data_nascita',
      // luogo nascita
      'luogo_nascita': 'luogo_nascita', 'luogo nascita': 'luogo_nascita',
      'comune_nascita': 'luogo_nascita', 'comune nascita': 'luogo_nascita',
      'comune di nascita': 'luogo_nascita',
      // cap nascita
      'cap_nascita': 'cap_nascita', 'cap nascita': 'cap_nascita',
      'cap di nascita': 'cap_nascita',
      // indirizzo
      'indirizzo': 'indirizzo', 'indirizzo_residenza': 'indirizzo',
      'indirizzo residenza': 'indirizzo', 'residenza': 'indirizzo',
      // cap
      'cap': 'cap',
      // citta
      'citta': 'citta', 'città': 'citta', 'comune': 'citta',
      // telefono
      'telefono': 'telefono', 'cellulare': 'telefono', 'cell': 'telefono',
      // email
      'email': 'email', 'e-mail': 'email',
      // iscrizione
      'data_iscrizione': 'data_iscrizione', 'data iscrizione': 'data_iscrizione',
      'data_iscrizione_(gg/mm/aaaa)': 'data_iscrizione',
      'data iscrizione*': 'data_iscrizione',
      // anno rinnovo
      'anno_rinnovo': 'anno_rinnovo', 'anno rinnovo': 'anno_rinnovo'
    };

    const dataRows = rows.slice(headerRow + 1).filter(r => r.some(c => c !== ''));
    let importati = 0, errori = 0;

    for (const row of dataRows) {
      const obj = {};
      rawHeaders.forEach((h, i) => {
        const normalized = h.replace(/_/g, ' ').trim();
        const key = keyMap[h] || keyMap[normalized];
        if (key) obj[key] = String(row[i] || '').trim();
      });
      if (!obj.codice_fiscale || !obj.cognome || !obj.nome) { errori++; continue; }

      obj.codice_fiscale = obj.codice_fiscale.toUpperCase();
      if (obj.data_nascita) {
        // Se è numero seriale Excel convertilo, altrimenti parseDataIT
        if (/^\d+(\.\d+)?$/.test(obj.data_nascita.trim())) {
          obj.data_nascita = excelSerialToDate(obj.data_nascita);
        } else {
          obj.data_nascita = parseDataIT(obj.data_nascita);
        }
        if (!obj.data_nascita) delete obj.data_nascita;
      }
      if (obj.data_iscrizione) {
        if (/^\d+(\.\d+)?$/.test(obj.data_iscrizione.trim())) {
          obj.data_iscrizione = excelSerialToDate(obj.data_iscrizione);
        } else {
          obj.data_iscrizione = parseDataIT(obj.data_iscrizione);
        }
        if (!obj.data_iscrizione) delete obj.data_iscrizione;
      }
      if (obj.anno_rinnovo) obj.anno_rinnovo = parseInt(obj.anno_rinnovo) || null;
      obj.attivo = true;
      obj.updated_at = new Date().toISOString();

      // Prima prova ad aggiornare, se non esiste inserisce
      const { data: existing } = await db.from('soci').select('id').eq('codice_fiscale', obj.codice_fiscale).single();
      let error;
      if (existing?.id) {
        ({ error } = await db.from('soci').update(obj).eq('codice_fiscale', obj.codice_fiscale));
      } else {
        ({ error } = await db.from('soci').insert(obj));
      }
      if (error) { console.error('Insert error:', error.message, obj); errori++; } else importati++;
    }

    showToast(`Importati: ${importati} | Errori: ${errori}`, importati > 0 ? 'success' : 'error');
    input.value = '';
    loadSoci();
  };
  reader.readAsArrayBuffer(file);
}

// ===== EXPORT EXCEL =====
function exportExcel() {
  const anno = ANNO_CORRENTE;
  const rows = [
    ['codice_fiscale','cognome','nome','sesso','data_nascita','cap_nascita','luogo_nascita','indirizzo','cap','citta','telefono','email','data_iscrizione','anno_rinnovo'],
    ...tuttiSoci.map(s => [
      s.codice_fiscale, s.cognome, s.nome, s.sesso,
      formatDataIT(s.data_nascita), s.cap_nascita, s.luogo_nascita,
      s.indirizzo, s.cap, s.citta,
      s.telefono, s.email,
      formatDataIT(s.data_iscrizione), s.anno_rinnovo
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SOCI');
  XLSX.writeFile(wb, `soci_export_${anno}.xlsx`);
  showToast('Export completato!', 'success');
}

// ===== IMPOSTAZIONI ANNO =====
async function loadImpostazioniAnno() {
  const { data } = await db.from('impostazioni_anno').select('*').order('anno', { ascending: false });
  impostazioniAnno = data || [];
  renderImpostazioniAnno();
}

function renderImpostazioniAnno() {
  const tbody = document.getElementById('impostazioni-anno-tbody');
  if (!tbody) return;
  if (!impostazioniAnno.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--testo-muted);">Nessun anno configurato</td></tr>';
    return;
  }
  tbody.innerHTML = impostazioniAnno.map(a => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:10px 16px;font-weight:600;">${a.anno}</td>
      <td style="padding:10px 16px;">€ ${parseFloat(a.quota).toFixed(2)}</td>
      <td style="padding:10px 16px;color:var(--testo-muted);">${a.note || '—'}</td>
      <td style="padding:10px 16px;text-align:center;">
        <button class="btn btn-sm" onclick="openModalAnno(${JSON.stringify(a).replace(/"/g,'&quot;')})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaAnno('${a.id}',${a.anno})"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function openModalAnno(a = null) {
  document.getElementById('modal-anno').style.display = 'flex';
  document.getElementById('modal-anno').style.pointerEvents = 'auto';
  document.getElementById('m-anno-id').value = a?.id || '';
  document.getElementById('m-anno').value = a?.anno || ANNO_CORRENTE;
  document.getElementById('m-quota').value = a?.quota || 20;
  document.getElementById('m-anno-note').value = a?.note || '';
}

function closeModalAnno() {
  const m = document.getElementById('modal-anno');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveAnno() {
  const anno = parseInt(document.getElementById('m-anno').value);
  const quota = parseFloat(document.getElementById('m-quota').value);
  if (!anno || isNaN(quota)) { showToast('Anno e quota obbligatori', 'error'); return; }

  const payload = { anno, quota, note: document.getElementById('m-anno-note').value.trim() || null };
  const id = document.getElementById('m-anno-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('impostazioni_anno').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('impostazioni_anno').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Salvato!', 'success');
  closeModalAnno();
  loadImpostazioniAnno();
}

async function eliminaAnno(id, anno) {
  if (!confirm(`Eliminare la configurazione per il ${anno}?`)) return;
  const { error } = await db.from('impostazioni_anno').delete().eq('id', id);
  if (error) { showToast('Errore', 'error'); return; }
  showToast('Eliminato', 'success');
  loadImpostazioniAnno();
}

function getQuotaAnnoCorrente() {
  const imp = impostazioniAnno.find(a => a.anno === ANNO_CORRENTE);
  return imp?.quota || 0;
}

// ===== SELEZIONE E RINNOVO MASSIVO =====
function toggleSelezioneTutti(checked) {
  document.querySelectorAll('.socio-checkbox').forEach(cb => cb.checked = checked);
  aggiornaBarraRinnovo();
}

function aggiornaBarraRinnovo() {
  const selezionati = document.querySelectorAll('.socio-checkbox:checked').length;
  const barra = document.getElementById('barra-rinnovo');
  const count = document.getElementById('rinnovo-count');
  if (selezionati > 0) {
    barra.style.display = 'flex';
    count.textContent = selezionati;
  } else {
    barra.style.display = 'none';
  }
}

async function rinnovaMassivo() {
  const checkboxes = document.querySelectorAll('.socio-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
  if (!ids.length) return;

  const quota = getQuotaAnnoCorrente();
  const oggi = new Date().toISOString().split('T')[0];

  let ok = 0, err = 0;
  for (const id of ids) {
    const socio = tuttiSoci.find(s => s.id === id);
    const nomeSocio = socio ? `${socio.cognome} ${socio.nome}` : 'Socio';

    const { error: e1 } = await db.from('soci').update({ anno_rinnovo: ANNO_CORRENTE, updated_at: new Date().toISOString() }).eq('id', id);
    const { error: e2 } = await db.from('quote').insert({ socio_id: id, anno: ANNO_CORRENTE, importo: quota, pagato: true, data_pagamento: oggi });

    // Entrata in cassa generale
    const { error: e3 } = await db.from('movimenti_cassa').insert({
      tipo: 'entrata',
      categoria: 'Quote associative',
      descrizione: `Quota ${ANNO_CORRENTE} — ${nomeSocio}`,
      importo: quota,
      data: oggi,
      metodo_pagamento: 'contanti'
    });

    if (e1 || e2 || e3) err++; else ok++;
  }

  showToast(`Rinnovati: ${ok}${err ? ' | Errori: ' + err : ''}`, ok > 0 ? 'success' : 'error');
  document.getElementById('barra-rinnovo').style.display = 'none';
  loadSoci();
}

// ===== GESTIONE UTENTI =====
let tuttiUtenti = [];

async function loadUtenti() {
  const { data: profili } = await db.from('profiles').select('*').order('cognome');
  const { data: permessi } = await db.from('utenti_permessi').select('*');
  tuttiUtenti = (profili || []).map(p => ({
    ...p,
    permessi: permessi?.find(x => x.user_id === p.id)?.permessi || {}
  }));
  renderUtenti();
}

function renderUtenti() {
  const tbody = document.getElementById('utenti-tbody');
  if (!tbody) return;
  if (!tuttiUtenti.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--testo-muted);">Nessun utente</td></tr>';
    return;
  }
  tbody.innerHTML = tuttiUtenti.map(u => {
    const nPagine = Object.values(u.permessi).filter(Boolean).length;
    const isMe = u.id === currentUser?.id;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:10px 16px;">
        <div style="font-weight:500;">${u.cognome || ''} ${u.nome || ''}</div>
        <div style="font-size:11px;color:var(--testo-muted);">${u.email}</div>
      </td>
      <td style="padding:10px 16px;">
        <span class="badge ${u.attivo ? 'badge-ok' : 'badge-no'}">${u.attivo ? 'Attivo' : 'Disattivo'}</span>
      </td>
      <td style="padding:10px 16px;font-size:13px;color:var(--testo-muted);">
        ${nPagine === PAGINE_DISPONIBILI.length ? 'Tutte le pagine' : nPagine + ' pagine'}
      </td>
      <td style="padding:10px 16px;text-align:center;">
        <button class="btn btn-sm" onclick="openModalUtente('${u.id}')"><i class="ti ti-edit"></i> Permessi</button>
        ${!isMe ? `<button class="btn btn-sm" style="color:#991B1B" onclick="toggleAttivoUtente('${u.id}',${u.attivo})">${u.attivo ? '<i class="ti ti-user-off"></i>' : '<i class="ti ti-user-check"></i>'}</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function openModalUtente(userId) {
  const u = tuttiUtenti.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('modal-utente-title').textContent = `${u.cognome || ''} ${u.nome || ''} — Permessi`;
  document.getElementById('m-utente-id').value = userId;

  // Raggruppa pagine per gruppo
  const gruppi = [...new Set(PAGINE_DISPONIBILI.map(p => p.gruppo))];
  let html = '';
  for (const gruppo of gruppi) {
    const pagine = PAGINE_DISPONIBILI.filter(p => p.gruppo === gruppo);
    html += `<div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--testo-muted);margin-bottom:8px;">${gruppo}</div>
      ${pagine.map(p => `
        <label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;font-size:13px;">
          <input type="checkbox" class="perm-checkbox" data-page="${p.id}"
            ${u.permessi[p.id] !== false && (u.permessi[p.id] === true || Object.keys(u.permessi).length === 0) ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--blu);cursor:pointer;">
          ${p.label}
        </label>
      `).join('')}
    </div>`;
  }

  document.getElementById('permessi-container').innerHTML = html;
  document.getElementById('modal-utente').style.display = 'flex';
  document.getElementById('modal-utente').style.pointerEvents = 'auto';
}

function closeModalUtente() {
  const m = document.getElementById('modal-utente');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

function selezionaTuttiPermessi(checked) {
  document.querySelectorAll('.perm-checkbox').forEach(cb => cb.checked = checked);
}

async function savePermessi() {
  const userId = document.getElementById('m-utente-id').value;
  const permessi = {};
  document.querySelectorAll('.perm-checkbox').forEach(cb => {
    permessi[cb.dataset.page] = cb.checked;
  });

  // Upsert permessi
  const { data: existing } = await db.from('utenti_permessi').select('id').eq('user_id', userId).single();
  let error;
  if (existing?.id) {
    ({ error } = await db.from('utenti_permessi').update({ permessi, updated_at: new Date().toISOString() }).eq('user_id', userId));
  } else {
    ({ error } = await db.from('utenti_permessi').insert({ user_id: userId, permessi }));
  }

  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Permessi salvati!', 'success');
  closeModalUtente();
  loadUtenti();
}

async function toggleAttivoUtente(userId, attivo) {
  const { error } = await db.from('profiles').update({ attivo: !attivo }).eq('id', userId);
  if (error) { showToast('Errore', 'error'); return; }
  showToast(attivo ? 'Utente disattivato' : 'Utente attivato', 'success');
  loadUtenti();
}

// Applica permessi al menu dopo il login
async function applicaPermessi(userId) {
  const { data } = await db.from('utenti_permessi').select('permessi').eq('user_id', userId).single();
  if (!data) return; // nessun permesso configurato = vede tutto

  const permessi = data.permessi;
  // Nascondi voci sidebar non permesse
  document.querySelectorAll('.s-item').forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    const match = onclick.match(/'([^']+)'/);
    if (match) {
      const pageId = match[1];
      const permesso = permessi[pageId];
      if (permesso === false) item.style.display = 'none';
    }
  });
}

// Il caricamento soci è gestito direttamente in showPage

// ===== SAGRE =====
let tutteSagre = [];
let sagraSelezionata = null;

async function loadSagre() {
  const { data } = await db.from('sagre').select('*').order('anno', { ascending: false });
  tutteSagre = data || [];
  renderSagre();
}

function renderSagre() {
  const container = document.getElementById('sagre-list');
  if (!container) return;
  if (!tutteSagre.length) {
    container.innerHTML = '<div class="coming-soon"><i class="ti ti-tent"></i><h3>Nessuna edizione</h3><p>Crea la prima edizione della sagra</p></div>';
    return;
  }
  container.innerHTML = tutteSagre.map(s => `
    <div class="table-card" style="margin-bottom:12px;cursor:pointer;" onclick="selezionaSagra('${s.id}')">
      <div class="table-row" style="padding:14px 16px;">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;color:var(--blu-notte);">${s.nome}</div>
          <div class="row-sub">${s.data_inizio ? formatDataIT(s.data_inizio) : ''} ${s.data_fine ? '→ ' + formatDataIT(s.data_fine) : ''}</div>
        </div>
        <span class="badge ${s.chiusa ? 'badge-pietra' : 'badge-ok'}">${s.chiusa ? 'Chiusa' : 'Aperta'}</span>
        <button class="btn btn-sm" onclick="event.stopPropagation();openModalSagra(${JSON.stringify(s).replace(/"/g,'&quot;')})"><i class="ti ti-edit"></i></button>
      </div>
    </div>
  `).join('');
}

function openModalSagra(s = null) {
  document.getElementById('modal-sagra').style.display = 'flex';
  document.getElementById('modal-sagra').style.pointerEvents = 'auto';
  document.getElementById('m-sagra-id').value = s?.id || '';
  document.getElementById('m-sagra-anno').value = s?.anno || new Date().getFullYear();
  document.getElementById('m-sagra-nome').value = s?.nome || 'Sagra della Bastia ' + new Date().getFullYear();
  document.getElementById('m-sagra-inizio').value = s?.data_inizio || '';
  document.getElementById('m-sagra-fine').value = s?.data_fine || '';
  document.getElementById('m-sagra-note').value = s?.note || '';
  document.getElementById('m-sagra-stato').value = s?.chiusa ? 'chiusa' : 'aperta';
}

function closeModalSagra() {
  const m = document.getElementById('modal-sagra');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveSagra() {
  const anno = parseInt(document.getElementById('m-sagra-anno').value);
  const nome = document.getElementById('m-sagra-nome').value.trim();
  if (!anno || !nome) { showToast('Anno e nome obbligatori', 'error'); return; }
  const payload = {
    anno, nome,
    data_inizio: document.getElementById('m-sagra-inizio').value || null,
    data_fine: document.getElementById('m-sagra-fine').value || null,
    note: document.getElementById('m-sagra-note').value.trim() || null,
    chiusa: document.getElementById('m-sagra-stato').value === 'chiusa'
  };
  const id = document.getElementById('m-sagra-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('sagre').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('sagre').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Edizione salvata!', 'success');
  closeModalSagra();
  loadSagre();
}

function selezionaSagra(id) {
  sagraSelezionata = tutteSagre.find(s => s.id === id);
  showPage('movimenti-sagra');
}

function getSagraId() {
  if (sagraSelezionata?.id) return sagraSelezionata.id;
  if (!tutteSagre.length) return null;
  // Preferisci la più recente NON chiusa
  const aperte = tutteSagre.filter(s => !s.chiusa).sort((a,b) => b.anno - a.anno);
  if (aperte.length) return aperte[0].id;
  // Altrimenti la più recente in assoluto
  return [...tutteSagre].sort((a,b) => b.anno - a.anno)[0]?.id || null;
}

async function assicuraSagreCaricate() {
  if (!tutteSagre.length) {
    const { data } = await db.from('sagre').select('*').order('anno', { ascending: false });
    tutteSagre = data || [];
  }
  // Imposta sempre la sagra corrente se non selezionata
  if (!sagraSelezionata && tutteSagre.length) {
    const aperte = tutteSagre.filter(s => !s.chiusa).sort((a,b) => b.anno - a.anno);
    sagraSelezionata = aperte.length ? aperte[0] : tutteSagre[0];
  }
}

// ===== MOVIMENTI SAGRA =====
let tuttiMovimenti = [];

async function loadMovimentiSagra() {
  await assicuraSagreCaricate();
  const sagraId = getSagraId();
  aggiornaHeaderSagra('ms-sagra-header');
  if (!sagraId) {
    document.getElementById('ms-entrate-list').innerHTML = '<div style="padding:16px;color:var(--testo-muted)">Nessuna edizione selezionata — vai su Edizioni Sagra</div>';
    return;
  }
  const { data } = await db.from('movimenti_sagra').select('*').eq('sagra_id', sagraId).order('data');
  tuttiMovimenti = data || [];
  renderMovimentiSagra();
  aggiornaBilancioSagra();
}

function aggiornaHeaderSagra(elId) {
  const el = document.getElementById(elId);
  if (el && sagraSelezionata) el.textContent = sagraSelezionata.nome;
  else if (el && tutteSagre[0]) el.textContent = tutteSagre[0].nome;
}

function renderMovimentiSagra() {
  const search = (document.getElementById('ms-search')?.value || '').toLowerCase();
  const filtro = document.getElementById('ms-filtro')?.value || 'tutti';
  let lista = tuttiMovimenti;
  if (search) lista = lista.filter(m => JSON.stringify(m).toLowerCase().includes(search));
  if (filtro !== 'tutti') lista = lista.filter(m => m.tipo === filtro);

  const entrate = lista.filter(m => m.tipo === 'entrata');
  const uscite = lista.filter(m => m.tipo === 'uscita');

  document.getElementById('ms-entrate-list').innerHTML = entrate.length
    ? entrate.map(m => rowMovimento(m)).join('')
    : '<div style="padding:12px 16px;color:var(--testo-muted);font-size:13px;">Nessuna entrata</div>';

  document.getElementById('ms-uscite-list').innerHTML = uscite.length
    ? uscite.map(m => rowMovimento(m)).join('')
    : '<div style="padding:12px 16px;color:var(--testo-muted);font-size:13px;">Nessuna uscita</div>';
}

function rowMovimento(m) {
  const isEntrata = m.tipo === 'entrata';
  const color = isEntrata ? 'var(--verde)' : '#991B1B';
  return `<div class="table-row">
    <div style="flex:1;">
      <div class="row-name">${m.descrizione}${m.fornitore ? ' — <span style="color:var(--testo-muted)">' + m.fornitore + '</span>' : ''}</div>
      <div class="row-sub">${m.categoria || ''} · ${m.data ? formatDataIT(m.data) : ''} · ${m.metodo_pagamento || ''} ${m.offerta ? '· <span style="color:var(--oro)">Offerta</span>' : ''} ${m.pagato === false ? '· <span style="color:#991B1B">Da pagare</span>' : ''}</div>
    </div>
    <span style="font-weight:600;color:${color};white-space:nowrap;">€ ${parseFloat(m.importo).toFixed(2)}</span>
    <button class="btn btn-sm" onclick='openModalMovimento(${JSON.stringify(m).replace(/'/g,"\\'")})'><i class="ti ti-edit"></i></button>
    <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaMovimento('${m.id}')"><i class="ti ti-trash"></i></button>
  </div>`;
}

function aggiornaBilancioSagra() {
  const entrate = tuttiMovimenti.filter(m => m.tipo === 'entrata' && m.a_bilancio !== false).reduce((s, m) => s + parseFloat(m.importo), 0);
  const uscite = tuttiMovimenti.filter(m => m.tipo === 'uscita' && m.a_bilancio !== false && !m.offerta).reduce((s, m) => s + parseFloat(m.importo), 0);
  const utile = entrate - uscite;
  document.getElementById('ms-tot-entrate').textContent = '€ ' + entrate.toFixed(2);
  document.getElementById('ms-tot-uscite').textContent = '€ ' + uscite.toFixed(2);
  document.getElementById('ms-utile').textContent = '€ ' + utile.toFixed(2);
  document.getElementById('ms-utile').style.color = utile >= 0 ? 'var(--verde)' : '#991B1B';
}

function openModalMovimento(m = null) {
  document.getElementById('modal-movimento').style.display = 'flex';
  document.getElementById('modal-movimento').style.pointerEvents = 'auto';
  buildCategorieSelect('m-mov-categoria', 'sagra');
  document.getElementById('m-mov-id').value = m?.id || '';
  document.getElementById('m-mov-tipo').value = m?.tipo || 'entrata';
  document.getElementById('m-mov-categoria').value = m?.categoria || '';
  document.getElementById('m-mov-descrizione').value = m?.descrizione || '';
  document.getElementById('m-mov-fornitore').value = m?.fornitore || '';
  document.getElementById('m-mov-importo').value = m?.importo || '';
  document.getElementById('m-mov-data').value = m?.data || new Date().toISOString().split('T')[0];
  document.getElementById('m-mov-metodo').value = m?.metodo_pagamento || 'contanti';
  document.getElementById('m-mov-pagato').checked = m ? (m.pagato !== false) : true;
  document.getElementById('m-mov-offerta').checked = m?.offerta || false;
  document.getElementById('m-mov-bilancio').checked = m ? (m.a_bilancio !== false) : true;
}

function closeModalMovimento() {
  const m = document.getElementById('modal-movimento');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveMovimento() {
  const sagraId = getSagraId();
  if (!sagraId) { showToast('Seleziona prima un\'edizione sagra', 'error'); return; }
  const descrizione = document.getElementById('m-mov-descrizione').value.trim();
  const importo = parseFloat(document.getElementById('m-mov-importo').value);
  if (!descrizione || isNaN(importo)) { showToast('Descrizione e importo obbligatori', 'error'); return; }

  const payload = {
    sagra_id: sagraId,
    tipo: document.getElementById('m-mov-tipo').value,
    categoria: document.getElementById('m-mov-categoria').value.trim() || null,
    descrizione,
    fornitore: document.getElementById('m-mov-fornitore').value.trim() || null,
    importo,
    data: document.getElementById('m-mov-data').value,
    metodo_pagamento: document.getElementById('m-mov-metodo').value || null,
    pagato: document.getElementById('m-mov-pagato').checked,
    offerta: document.getElementById('m-mov-offerta').checked,
    a_bilancio: document.getElementById('m-mov-bilancio').checked
  };

  const id = document.getElementById('m-mov-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('movimenti_sagra').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('movimenti_sagra').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Salvato!', 'success');
  closeModalMovimento();
  loadMovimentiSagra();
}

async function eliminaMovimento(id) {
  if (!confirm('Eliminare questo movimento?')) return;
  await db.from('movimenti_sagra').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadMovimentiSagra();
}

// ===== SPONSOR =====
let tuttiSponsor = [];

async function loadSponsor() {
  await assicuraSagreCaricate();
  const sagraId = getSagraId();
  aggiornaHeaderSagra('sp-sagra-header');
  if (!sagraId) {
    document.getElementById('sponsor-tbody').innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--testo-muted);">Crea prima un\'edizione sagra</td></tr>';
    return;
  }
  const { data } = await db.from('sponsor').select('*').eq('sagra_id', sagraId).order('ditta');
  tuttiSponsor = data || [];
  renderSponsor();
  // Carica storico sponsor per autocomplete
  loadStoricoSponsor();
}

let storicoSponsor = [];
async function loadStoricoSponsor() {
  const { data } = await db.from('sponsor').select('ditta,tipo,importo,dettaglio').order('ditta');
  // Deduplica per ditta
  const map = {};
  (data || []).forEach(s => { if (!map[s.ditta]) map[s.ditta] = s; });
  storicoSponsor = Object.values(map);
  // Aggiorna datalist
  const dl = document.getElementById('sponsor-storico-list');
  if (dl) dl.innerHTML = storicoSponsor.map(s => `<option value="${s.ditta}">`).join('');
}

function renderSponsor() {
  const tbody = document.getElementById('sponsor-tbody');
  if (!tbody) return;
  if (!tuttiSponsor.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--testo-muted);">Nessuno sponsor</td></tr>';
    return;
  }
  const tipoLabel = { offerta: 'Offerta €', materiale: 'Materiale', mano_dopera: 'Mano d\'opera', altro: 'Altro' };
  tbody.innerHTML = tuttiSponsor.map((s, i) => `
    <tr style="${i%2===0?'':'background:#F5F7FB;'}border-bottom:1px solid var(--border);">
      <td style="padding:8px 12px;font-weight:500;">${s.ditta}</td>
      <td style="padding:8px 12px;"><span class="badge badge-pietra">${tipoLabel[s.tipo] || s.tipo}</span></td>
      <td style="padding:8px 12px;">${s.importo ? '€ ' + parseFloat(s.importo).toFixed(2) : '—'}</td>
      <td style="padding:8px 12px;font-size:12px;color:var(--testo-muted);">${s.dettaglio || '—'}</td>
      <td style="padding:8px 12px;"><span class="badge ${s.ricevuto ? 'badge-ok' : 'badge-no'}">${s.ricevuto ? 'Ricevuto' : 'In attesa'}</span></td>
      <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
        <button class="btn btn-sm" onclick='openModalSponsor(${JSON.stringify(s).replace(/"/g,"&quot;")})'><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaSponsor('${s.id}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function openModalSponsor(s = null) {
  document.getElementById('modal-sponsor').style.display = 'flex';
  document.getElementById('modal-sponsor').style.pointerEvents = 'auto';
  document.getElementById('m-sp-id').value = s?.id || '';
  document.getElementById('m-sp-ditta').value = s?.ditta || '';
  document.getElementById('m-sp-tipo').value = s?.tipo || 'offerta';
  document.getElementById('m-sp-importo').value = s?.importo || '';
  document.getElementById('m-sp-dettaglio').value = s?.dettaglio || '';
  document.getElementById('m-sp-modo').value = s?.modo_pagamento || '';
  document.getElementById('m-sp-ricevuto').checked = s?.ricevuto || false;
  document.getElementById('m-sp-note').value = s?.note || '';
  // Setup autocomplete storico
  setTimeout(() => setupAutocompleteSponsor(), 100);
}

function setupAutocompleteSponsor() {
  const input = document.getElementById('m-sp-ditta');
  if (!input || input._sponsorSetup) return;
  input._sponsorSetup = true;
  input.addEventListener('change', () => {
    const match = storicoSponsor.find(s => s.ditta === input.value);
    if (match && !document.getElementById('m-sp-id').value) {
      // Precompila con dati storici se è un nuovo sponsor
      if (match.tipo) document.getElementById('m-sp-tipo').value = match.tipo;
      if (match.importo) document.getElementById('m-sp-importo').value = match.importo;
      if (match.dettaglio) document.getElementById('m-sp-dettaglio').value = match.dettaglio;
      showToast('Dati precompilati dallo storico — verifica e aggiorna', '');
    }
  });
}

function closeModalSponsor() {
  const m = document.getElementById('modal-sponsor');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveSponsor() {
  const sagraId = getSagraId();
  if (!sagraId) { showToast('Seleziona prima un\'edizione sagra', 'error'); return; }
  const ditta = document.getElementById('m-sp-ditta').value.trim();
  if (!ditta) { showToast('Nome ditta obbligatorio', 'error'); return; }
  const payload = {
    sagra_id: sagraId,
    ditta,
    tipo: document.getElementById('m-sp-tipo').value,
    importo: parseFloat(document.getElementById('m-sp-importo').value) || null,
    dettaglio: document.getElementById('m-sp-dettaglio').value.trim() || null,
    modo_pagamento: document.getElementById('m-sp-modo').value.trim() || null,
    ricevuto: document.getElementById('m-sp-ricevuto').checked,
    note: document.getElementById('m-sp-note').value.trim() || null
  };
  const id = document.getElementById('m-sp-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('sponsor').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('sponsor').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Sponsor salvato!', 'success');
  closeModalSponsor();
  loadSponsor();
}

async function eliminaSponsor(id) {
  if (!confirm('Eliminare questo sponsor?')) return;
  await db.from('sponsor').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadSponsor();
}

// ===== LISTA SPESA =====
let tuttiArticoliSpesa = [];

async function loadSpesa() {
  await assicuraSagreCaricate();
  const sagraId = getSagraId();
  aggiornaHeaderSagra('spesa-sagra-header');
  if (!sagraId) return;
  const { data } = await db.from('lista_spesa').select('*').eq('sagra_id', sagraId).order('stand').order('categoria');
  tuttiArticoliSpesa = data || [];
  renderSpesa();
  aggiornaStatsSpesa();
}

function renderSpesa() {
  const search = (document.getElementById('spesa-search')?.value || '').toLowerCase();
  const filtroStato = document.getElementById('spesa-filtro-stato')?.value || 'tutti';
  const filtroGiorno = document.getElementById('spesa-filtro-giorno')?.value || 'tutti';

  let lista = tuttiArticoliSpesa;
  if (search) lista = lista.filter(a => JSON.stringify(a).toLowerCase().includes(search));
  if (filtroStato !== 'tutti') lista = lista.filter(a => a.stato === filtroStato);
  if (filtroGiorno !== 'tutti') lista = lista.filter(a => a.giorno === filtroGiorno);

  const container = document.getElementById('spesa-list');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--testo-muted);">Nessun articolo trovato</div>';
    return;
  }

  // Raggruppa per stand/categoria
  const gruppi = {};
  lista.forEach(a => {
    const key = (a.stand || 'Generico') + ' — ' + (a.categoria || 'Vario');
    if (!gruppi[key]) gruppi[key] = [];
    gruppi[key].push(a);
  });

  container.innerHTML = Object.entries(gruppi).map(([gruppo, articoli]) => `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--testo-muted);padding:6px 16px;background:#F2EDE4;">${gruppo}</div>
      ${articoli.map(a => rowSpesa(a)).join('')}
    </div>
  `).join('');
}

function rowSpesa(a) {
  const statoColor = { da_ordinare: 'badge-no', ordinato: 'badge-pietra', comprato: 'badge-ok' };
  const statoLabel = { da_ordinare: 'Da ordinare', ordinato: 'Ordinato', comprato: 'Comprato' };
  const giornoLabel = { sabato: 'Sab', domenica: 'Dom', entrambi: 'Entrambi' };
  return `<div class="table-row">
    <input type="checkbox" ${a.stato === 'comprato' ? 'checked' : ''} onchange="toggleSpesaAcquistata('${a.id}', this.checked)"
      style="width:16px;height:16px;accent-color:var(--verde);cursor:pointer;margin-right:4px;">
    <div style="flex:1;">
      <div class="row-name" style="${a.stato === 'comprato' ? 'text-decoration:line-through;opacity:0.6;' : ''}">${a.articolo}</div>
      <div class="row-sub">${a.fornitore || ''} ${a.quantita ? '· Q: ' + a.quantita + (a.unita ? ' ' + a.unita : '') : ''} ${a.prezzo_totale ? '· € ' + parseFloat(a.prezzo_totale).toFixed(2) : ''} ${a.giorno ? '· ' + (giornoLabel[a.giorno] || a.giorno) : ''}</div>
    </div>
    <span class="badge ${statoColor[a.stato] || 'badge-no'}">${statoLabel[a.stato] || a.stato}</span>
    <button class="btn btn-sm" onclick='openModalSpesa(${JSON.stringify(a).replace(/"/g,"&quot;")})'><i class="ti ti-edit"></i></button>
    <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaSpesa('${a.id}')"><i class="ti ti-trash"></i></button>
  </div>`;
}

function aggiornaStatsSpesa() {
  const tot = tuttiArticoliSpesa.length;
  const comprati = tuttiArticoliSpesa.filter(a => a.stato === 'comprato').length;
  const ordinati = tuttiArticoliSpesa.filter(a => a.stato === 'ordinato').length;
  const daOrdinare = tuttiArticoliSpesa.filter(a => a.stato === 'da_ordinare').length;
  const totSpesa = tuttiArticoliSpesa.filter(a => a.prezzo_totale).reduce((s, a) => s + parseFloat(a.prezzo_totale), 0);
  if (document.getElementById('spesa-stat-tot')) document.getElementById('spesa-stat-tot').textContent = tot;
  if (document.getElementById('spesa-stat-comprati')) document.getElementById('spesa-stat-comprati').textContent = comprati;
  if (document.getElementById('spesa-stat-ordinati')) document.getElementById('spesa-stat-ordinati').textContent = ordinati;
  if (document.getElementById('spesa-stat-da-ordinare')) document.getElementById('spesa-stat-da-ordinare').textContent = daOrdinare;
  if (document.getElementById('spesa-stat-costo')) document.getElementById('spesa-stat-costo').textContent = '€ ' + totSpesa.toFixed(2);
}

async function toggleSpesaAcquistata(id, checked) {
  const stato = checked ? 'comprato' : 'ordinato';
  await db.from('lista_spesa').update({ stato, acquistato: checked, data_acquisto: checked ? new Date().toISOString().split('T')[0] : null }).eq('id', id);
  loadSpesa();
}

function openModalSpesa(a = null) {
  document.getElementById('modal-spesa').style.display = 'flex';
  document.getElementById('modal-spesa').style.pointerEvents = 'auto';
  setTimeout(() => setupAutocompleteSpesa(), 100);
  document.getElementById('m-spesa-id').value = a?.id || '';
  document.getElementById('m-spesa-articolo').value = a?.articolo || '';
  document.getElementById('m-spesa-fornitore').value = a?.fornitore || '';
  document.getElementById('m-spesa-categoria').value = a?.categoria || '';
  document.getElementById('m-spesa-stand').value = a?.stand || '';
  document.getElementById('m-spesa-giorno').value = a?.giorno || 'entrambi';
  document.getElementById('m-spesa-qta').value = a?.quantita || '';
  document.getElementById('m-spesa-unita').value = a?.unita || 'pz';
  document.getElementById('m-spesa-prezzo').value = a?.prezzo_unitario || '';
  document.getElementById('m-spesa-iva').value = a?.iva || '';
  document.getElementById('m-spesa-stato').value = a?.stato || 'da_ordinare';
  document.getElementById('m-spesa-note').value = a?.note || '';
}

function closeModalSpesa() {
  const m = document.getElementById('modal-spesa');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveSpesa() {
  const sagraId = getSagraId();
  if (!sagraId) { showToast('Seleziona prima un\'edizione sagra', 'error'); return; }
  const articolo = document.getElementById('m-spesa-articolo').value.trim();
  if (!articolo) { showToast('Articolo obbligatorio', 'error'); return; }

  const qta = parseFloat(document.getElementById('m-spesa-qta').value) || null;
  const prezzo = parseFloat(document.getElementById('m-spesa-prezzo').value) || null;
  const iva = parseFloat(document.getElementById('m-spesa-iva').value) || null;
  const prezzoTot = (qta && prezzo) ? (iva ? qta * prezzo * (1 + iva) : qta * prezzo) : null;

  const payload = {
    sagra_id: sagraId,
    articolo,
    fornitore: document.getElementById('m-spesa-fornitore').value.trim() || null,
    categoria: document.getElementById('m-spesa-categoria').value.trim() || null,
    stand: document.getElementById('m-spesa-stand').value.trim() || null,
    giorno: document.getElementById('m-spesa-giorno').value || null,
    quantita: qta,
    unita: document.getElementById('m-spesa-unita').value || null,
    prezzo_unitario: prezzo,
    iva,
    prezzo_totale: prezzoTot ? parseFloat(prezzoTot.toFixed(2)) : null,
    stato: document.getElementById('m-spesa-stato').value,
    note: document.getElementById('m-spesa-note').value.trim() || null,
    acquistato: document.getElementById('m-spesa-stato').value === 'comprato'
  };

  const id = document.getElementById('m-spesa-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('lista_spesa').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('lista_spesa').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  // Aggiunge automaticamente al catalogo
  const _articolo = document.getElementById('m-spesa-articolo').value.trim();
  const _fornitore = document.getElementById('m-spesa-fornitore').value.trim();
  const _categoria = document.getElementById('m-spesa-categoria').value.trim();
  const _stand = document.getElementById('m-spesa-stand').value.trim();
  const _unita = document.getElementById('m-spesa-unita').value.trim();
  const _prezzo = parseFloat(document.getElementById('m-spesa-prezzo').value) || null;
  const _iva = parseFloat(document.getElementById('m-spesa-iva').value) || null;
  await aggiungiACatalogo(_articolo, _fornitore, _categoria, _stand, _unita, _prezzo, _iva);
  await loadCatalogoSpesa();
  showToast('Salvato!', 'success');
  closeModalSpesa();
  loadSpesa();
}

async function eliminaSpesa(id) {
  if (!confirm('Eliminare questo articolo?')) return;
  await db.from('lista_spesa').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadSpesa();
}

// ===== PRIMA NOTA =====
let primaNotaData = [];
const STANDS_PRIMA_NOTA = ['CASSA CENTRALE', 'RISTORANTE SABATO', 'RISTORANTE DOMENICA', 'BAR', 'TORTE', 'LOTTERIA'];
const GIORNI_PRIMA_NOTA = ['venerdi', 'sabato', 'domenica'];

async function loadPrimaNota() {
  await assicuraSagreCaricate();
  const sagraId = getSagraId();
  aggiornaHeaderSagra('pn-sagra-header');
  if (!sagraId) return;
  const { data } = await db.from('prima_nota').select('*').eq('sagra_id', sagraId);
  primaNotaData = data || [];
  renderPrimaNota();
}

function getPrimaNota(stand, giorno) {
  return primaNotaData.find(p => p.stand === stand && p.giorno === giorno) || null;
}

function renderPrimaNota() {
  const container = document.getElementById('prima-nota-container');
  if (!container) return;

  const giornoAttivo = document.getElementById('pn-giorno-tab')?.value || 'sabato';

  let html = '';
  let totBattuto = 0, totContanti = 0, totPos = 0, totPrelievi = 0, totArrotondato = 0;

  STANDS_PRIMA_NOTA.forEach(stand => {
    const pn = getPrimaNota(stand, giornoAttivo);
    const battuto = pn?.battuto || 0;
    const contanti = pn?.contanti || 0;
    const pos = pn?.pos || 0;
    const prelievi = pn?.prelievi || 0;
    const arrotondato = pn?.arrotondato || 0;
    totBattuto += battuto; totContanti += contanti; totPos += pos;
    totPrelievi += prelievi; totArrotondato += arrotondato;

    html += `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${stand}</td>
      ${['battuto','contanti','pos','prelievi','arrotondato'].map(campo => `
        <td style="padding:4px 6px;">
          <input type="number" step="0.01" value="${pn?.[campo] || ''}" placeholder="0"
            onchange="savePrimaNota('${stand}','${giornoAttivo}','${campo}',this.value)"
            style="width:90px;padding:5px 8px;border:1px solid #D4C9BE;border-radius:6px;font-size:13px;text-align:right;outline:none;">
        </td>
      `).join('')}
      <td style="padding:8px 12px;font-weight:600;color:var(--verde);text-align:right;">${(contanti + pos).toFixed(2)}</td>
    </tr>`;
  });

  html += `<tr style="background:#F2EDE4;font-weight:700;">
    <td style="padding:10px 12px;">TOTALE</td>
    <td style="padding:10px 12px;text-align:right;">${totBattuto.toFixed(2)}</td>
    <td style="padding:10px 12px;text-align:right;">${totContanti.toFixed(2)}</td>
    <td style="padding:10px 12px;text-align:right;">${totPos.toFixed(2)}</td>
    <td style="padding:10px 12px;text-align:right;">${totPrelievi.toFixed(2)}</td>
    <td style="padding:10px 12px;text-align:right;">${totArrotondato.toFixed(2)}</td>
    <td style="padding:10px 12px;text-align:right;color:var(--verde);">${(totContanti + totPos).toFixed(2)}</td>
  </tr>`;

  container.innerHTML = html;

  // Aggiorna riepilogo
  if (document.getElementById('pn-tot-incasso')) {
    document.getElementById('pn-tot-incasso').textContent = '€ ' + totBattuto.toFixed(2);
    document.getElementById('pn-tot-contanti').textContent = '€ ' + totContanti.toFixed(2);
    document.getElementById('pn-tot-pos').textContent = '€ ' + totPos.toFixed(2);
  }
}

async function savePrimaNota(stand, giorno, campo, valore) {
  const sagraId = getSagraId();
  if (!sagraId) return;
  const existing = getPrimaNota(stand, giorno);
  const val = parseFloat(valore) || 0;
  let error;
  if (existing?.id) {
    ({ error } = await db.from('prima_nota').update({ [campo]: val }).eq('id', existing.id));
  } else {
    ({ error } = await db.from('prima_nota').insert({ sagra_id: sagraId, stand, giorno, [campo]: val }));
  }
  if (!error) {
    const { data } = await db.from('prima_nota').select('*').eq('sagra_id', sagraId);
    primaNotaData = data || [];
    renderPrimaNota();
  }
}

// ===== CATALOGO SPESA =====
let catalogoSpesa = [];

async function loadCatalogoSpesa() {
  const { data } = await db.from('catalogo_spesa').select('*').order('articolo');
  catalogoSpesa = data || [];
}

async function aggiungiACatalogo(articolo, fornitore, categoria, stand, unita, prezzo_unitario, iva) {
  if (!articolo) return;
  await db.from('catalogo_spesa').upsert({
    articolo, fornitore: fornitore || null, categoria: categoria || null,
    stand: stand || null, unita: unita || null,
    prezzo_unitario: prezzo_unitario || null, iva: iva || null
  }, { onConflict: 'articolo' });
}

function setupAutocompleteSpesa() {
  const input = document.getElementById('m-spesa-articolo');
  const lista = document.getElementById('autocomplete-spesa');
  if (!input || !lista) return;

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase().trim();
    if (!val || val.length < 2) { lista.style.display = 'none'; return; }
    const matches = catalogoSpesa.filter(c => c.articolo.toLowerCase().includes(val)).slice(0, 8);
    if (!matches.length) { lista.style.display = 'none'; return; }
    lista.innerHTML = matches.map(c => `
      <div onclick="selezionaArticoloCatalogo('${c.articolo.replace(/'/g,"\\'")}','${(c.fornitore||'').replace(/'/g,"\\'")}','${(c.categoria||'').replace(/'/g,"\\'")}','${(c.stand||'').replace(/'/g,"\\'")}','${(c.unita||'').replace(/'/g,"\\'")}',${c.prezzo_unitario||'null'},${c.iva||'null'})"
        style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
        onmouseover="this.style.background='#EEF2F8'" onmouseout="this.style.background='white'">
        <div style="font-weight:500;">${c.articolo}</div>
        <div style="font-size:11px;color:var(--testo-muted);">${c.fornitore || ''} ${c.categoria ? '· ' + c.categoria : ''}</div>
      </div>
    `).join('');
    lista.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!lista.contains(e.target) && e.target !== input) lista.style.display = 'none';
  });
}

function selezionaArticoloCatalogo(articolo, fornitore, categoria, stand, unita, prezzo, iva) {
  document.getElementById('m-spesa-articolo').value = articolo;
  document.getElementById('m-spesa-fornitore').value = fornitore || '';
  document.getElementById('m-spesa-categoria').value = categoria || '';
  document.getElementById('m-spesa-stand').value = stand || '';
  document.getElementById('m-spesa-unita').value = unita || '';
  document.getElementById('m-spesa-prezzo').value = prezzo !== 'null' ? prezzo : '';
  document.getElementById('m-spesa-iva').value = iva !== 'null' ? iva : '';
  document.getElementById('autocomplete-spesa').style.display = 'none';
}

// Override saveSpesa per aggiungere al catalogo
// catalogo integrato direttamente in saveSpesa

// ===== COPIA DA EDIZIONE PRECEDENTE =====
async function copiaSpesaEdizionePrecedente() {
  const sagraId = getSagraId();
  if (!sagraId) { showToast('Seleziona prima un\'edizione', 'error'); return; }

  // Trova edizione precedente
  const sagreOrdinate = [...tutteSagre].sort((a, b) => b.anno - a.anno);
  const idx = sagreOrdinate.findIndex(s => s.id === sagraId);
  const precedente = sagreOrdinate[idx + 1];

  if (!precedente) { showToast('Nessuna edizione precedente trovata', 'error'); return; }

  if (!confirm(`Copiare tutti gli articoli dalla ${precedente.nome} come "Da ordinare"?`)) return;

  const { data: articoli } = await db.from('lista_spesa').select('*').eq('sagra_id', precedente.id);
  if (!articoli?.length) { showToast('Nessun articolo nella edizione precedente', 'error'); return; }

  let ok = 0;
  for (const a of articoli) {
    const { error } = await db.from('lista_spesa').insert({
      sagra_id: sagraId,
      articolo: a.articolo,
      fornitore: a.fornitore,
      categoria: a.categoria,
      stand: a.stand,
      giorno: a.giorno,
      quantita: a.quantita,
      unita: a.unita,
      prezzo_unitario: a.prezzo_unitario,
      iva: a.iva,
      stato: 'da_ordinare',
      acquistato: false
    });
    if (!error) ok++;
  }

  showToast(`Copiati ${ok} articoli da ${precedente.anno}!`, 'success');
  loadSpesa();
}

// Popola catalogo con articoli esistenti al primo avvio
async function popolaCatalogoIniziale() {
  const { count } = await db.from('catalogo_spesa').select('*', { count: 'exact', head: true });
  if (count > 0) return; // già popolato
  const { data: articoli } = await db.from('lista_spesa').select('articolo,fornitore,categoria,stand,unita,prezzo_unitario,iva');
  if (!articoli?.length) return;
  const unici = {};
  articoli.forEach(a => { if (a.articolo && !unici[a.articolo]) unici[a.articolo] = a; });
  for (const a of Object.values(unici)) {
    await db.from('catalogo_spesa').upsert(a, { onConflict: 'articolo' });
  }
  await loadCatalogoSpesa();
}

// ===== INVENTARIO =====
let tuttoInventario = [];
let categorieInventario = [];

async function loadInventario() {
  const { data } = await db.from('inventario').select('*').order('categoria').order('nome');
  tuttoInventario = data || [];
  categorieInventario = [...new Set(tuttoInventario.map(i => i.categoria).filter(Boolean))].sort();
  renderInventario();
  aggiornaStatsInventario();
}

function renderInventario() {
  const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const filtroCategoria = document.getElementById('inv-filtro-cat')?.value || 'tutti';
  let lista = tuttoInventario;
  if (search) lista = lista.filter(i => JSON.stringify(i).toLowerCase().includes(search));
  if (filtroCategoria !== 'tutti') lista = lista.filter(i => i.categoria === filtroCategoria);

  // Aggiorna select categorie
  const sel = document.getElementById('inv-filtro-cat');
  if (sel) {
    const curr = sel.value;
    sel.innerHTML = '<option value="tutti">Tutte le categorie</option>' +
      categorieInventario.map(c => `<option value="${c}" ${c===curr?'selected':''}>${c}</option>`).join('');
  }

  const container = document.getElementById('inventario-list');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--testo-muted);">Nessun articolo trovato</div>';
    return;
  }

  // Raggruppa per categoria
  const gruppi = {};
  lista.forEach(i => {
    const cat = i.categoria || 'Senza categoria';
    if (!gruppi[cat]) gruppi[cat] = [];
    gruppi[cat].push(i);
  });

  const statoColor = { ottimo: 'badge-ok', buono: 'badge-ok', da_revisionare: 'badge-no', fuori_uso: 'badge-pietra' };
  const statoLabel = { ottimo: 'Ottimo', buono: 'Buono', da_revisionare: 'Da revisionare', fuori_uso: 'Fuori uso' };

  container.innerHTML = Object.entries(gruppi).map(([cat, articoli]) => `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--testo-muted);padding:6px 16px;background:#F2EDE4;display:flex;align-items:center;justify-content:space-between;">
        <span>${cat}</span>
        <span>${articoli.length} articoli</span>
      </div>
      ${articoli.map(i => `
        <div class="table-row">
          <div style="flex:1;">
            <div class="row-name">${i.nome}</div>
            <div class="row-sub">${i.posizione ? '📍 ' + i.posizione + ' · ' : ''}Q: <strong>${i.quantita} ${i.unita || 'pz'}</strong>${i.note ? ' · ' + i.note : ''}</div>
          </div>

          <button class="btn btn-sm" onclick='openModalInventario(${JSON.stringify(i).replace(/"/g,"&quot;")})'><i class="ti ti-edit"></i></button>
          <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaInventario('${i.id}')"><i class="ti ti-trash"></i></button>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function aggiornaStatsInventario() {
  const tot = tuttoInventario.length;
  const daRev = tuttoInventario.filter(i => i.stato === 'da_revisionare').length;
  const fuoriUso = tuttoInventario.filter(i => i.stato === 'fuori_uso').length;
  const categorie = categorieInventario.length;
  if (document.getElementById('inv-stat-tot')) document.getElementById('inv-stat-tot').textContent = tot;
  if (document.getElementById('inv-stat-cat')) document.getElementById('inv-stat-cat').textContent = categorie;
}

function openModalInventario(i = null) {
  document.getElementById('modal-inventario').style.display = 'flex';
  document.getElementById('modal-inventario').style.pointerEvents = 'auto';
  document.getElementById('m-inv-id').value = i?.id || '';
  document.getElementById('m-inv-nome').value = i?.nome || '';
  document.getElementById('m-inv-categoria').value = i?.categoria || '';
  document.getElementById('m-inv-quantita').value = i?.quantita ?? '';
  document.getElementById('m-inv-unita').value = i?.unita || 'pz';

  document.getElementById('m-inv-note').value = i?.note || '';
  // Aggiorna datalist categorie
  const dl = document.getElementById('inv-categorie-list');
  if (dl) dl.innerHTML = categorieInventario.map(c => `<option value="${c}">`).join('');
}

function closeModalInventario() {
  const m = document.getElementById('modal-inventario');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveInventario() {
  const nome = document.getElementById('m-inv-nome').value.trim();
  const quantita = parseInt(document.getElementById('m-inv-quantita').value);
  if (!nome || isNaN(quantita)) { showToast('Nome e quantità obbligatori', 'error'); return; }

  const payload = {
    nome,
    categoria: document.getElementById('m-inv-categoria').value.trim() || null,
    quantita,
    unita: document.getElementById('m-inv-unita').value.trim() || 'pz',
    note: document.getElementById('m-inv-note').value.trim() || null,
    updated_at: new Date().toISOString()
  };

  const id = document.getElementById('m-inv-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('inventario').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('inventario').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Salvato!', 'success');
  closeModalInventario();
  loadInventario();
}

async function eliminaInventario(id) {
  if (!confirm('Eliminare questo articolo?')) return;
  await db.from('inventario').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadInventario();
}

// ===== MARIELLO — AI ASSISTANT =====
const MARIELLO_PROXY_URL = 'https://beautiful-chebakia-4ed63e.netlify.app/api/chat';
let marielloMessages = [];
let marielloAperto = false;

const MARIELLO_SYSTEM_PROMPT = `Sei Mariello, un personaggio molto preciso e devi restarci fedele in OGNI risposta.

CHI SEI:
Hai 60 anni, sei di Camarza (entroterra genovese), di mestiere fai l'impresario edile. Ti presti da una vita al volontariato per il Comitato Festeggiamenti N.S. della Bastia. Sei un uomo all'antica nei modi ma con la testa sul futuro — vai d'accordo coi giovani, capisci la tecnologia (anche se la chiami "questo computer qui"), e non hai problemi a usare una webapp. Hai la battuta sempre pronta, a volte tagliente, mai stucchevole. Sei diretto, pieno di grinta, schietto fino all'osso. Non hai paura di dire le cose come stanno, anche se a qualcuno non piace.

COME PARLI:
- Parli SEMPRE con un forte accento e cadenza genovese, anche quando l'argomento è serio (bilanci, soci, conti).
- Usi intercalari genovesi in abbondanza: "belin", "figeu", "a-a gh'è...", "ma vatte a piggiâ...", "cribbio", "madonna ca brûggia", "porco cane", "öh", "saciu mi", "voscià" (per rispetto, raramente), "zeneise" quando ti riferisci a te stesso.
- Quando vuoi dire "stupido" a qualcuno (sempre in modo scherzoso e mai davvero offensivo), usi "stüpido" o "stüpidón" (pronuncia genovese, con la u alla francese) oppure "belinón" — sono i TUOI modi preferiti di dare dello sciocco a qualcuno, li usi spesso e con affetto, mai con cattiveria vera.
- NON usi MAI bestemmie o imprecazioni blasfeme — usi solo le imprecazioni colorite del dialetto laico (belin, cribbio, porco cane, madonna ca brûggia, ecc).
- Le tue battute sono pungenti ma mai cattive — sei un brontolone con il cuore d'oro.
- Quando dai un dato numerico (saldi, soci, sponsor) lo dici con precisione, ma sempre nel tuo modo di parlare — non diventi "neutro" solo perché parli di numeri.

COSA FAI:
Hai accesso completo ai dati del Comitato Festeggiamenti N.S. della Bastia: soci, quote associative, edizioni della sagra, entrate e uscite, sponsor, lista spesa, inventario, prima nota casse. Rispondi a QUALSIASI domanda su questi dati con precisione, basandoti SOLO sui dati che ti vengono forniti nel contesto — non inventare numeri.

Se non hai il dato richiesto nel contesto fornito, dillo chiaramente (sempre nel tuo stile) invece di inventarlo.

Sei breve e concreto nelle risposte — non fai sermoni, vai dritto al punto come un vero genovese che non vuole perdere tempo.`;

async function loadContestoMariello() {
  const [soci, quote, sagre, movimenti, sponsorData, spesa, inventario, primaNota] = await Promise.all([
    db.from('soci').select('*').eq('attivo', true),
    db.from('quote').select('*'),
    db.from('sagre').select('*'),
    db.from('movimenti_sagra').select('*'),
    db.from('sponsor').select('*'),
    db.from('lista_spesa').select('*'),
    db.from('inventario').select('*'),
    db.from('prima_nota').select('*')
  ]);

  return {
    data_oggi: new Date().toISOString().split('T')[0],
    soci: soci.data || [],
    quote: quote.data || [],
    sagre: sagre.data || [],
    movimenti_sagra: movimenti.data || [],
    sponsor: sponsorData.data || [],
    lista_spesa: spesa.data || [],
    inventario: inventario.data || [],
    prima_nota: primaNota.data || []
  };
}

function toggleMariello() {
  marielloAperto = !marielloAperto;
  const panel = document.getElementById('mariello-panel');
  panel.style.display = marielloAperto ? 'flex' : 'none';
  if (marielloAperto && marielloMessages.length === 0) {
    aggiungiMessaggioMariello('assistant', 'Öh, belin, eccomi qui! Sò Mariello, da Camarza, e sò chì pe\' deve ti seu in sce tutto: soci, ballanci, sponsor, magazén... Spera ben de no fâmi perde tempo, che de lou da fâ ghe n\'è sempre! Dimme cose ti veu savei.');
  }
}

function aggiungiMessaggioMariello(ruolo, testo) {
  const container = document.getElementById('mariello-messages');
  const bubble = document.createElement('div');
  bubble.style.cssText = `
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 1.4;
    margin-bottom: 8px;
    white-space: pre-wrap;
    ${ruolo === 'user'
      ? 'background:var(--blu-notte);color:white;align-self:flex-end;border-bottom-right-radius:4px;'
      : 'background:#F2EDE4;color:var(--testo);align-self:flex-start;border-bottom-left-radius:4px;'}
  `;
  bubble.textContent = testo;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function inviaMessaggioMariello() {
  const input = document.getElementById('mariello-input');
  const testo = input.value.trim();
  if (!testo) return;

  input.value = '';
  input.disabled = true;
  aggiungiMessaggioMariello('user', testo);
  marielloMessages.push({ role: 'user', content: testo });

  // Indicatore "sta scrivendo"
  const container = document.getElementById('mariello-messages');
  const typing = document.createElement('div');
  typing.id = 'mariello-typing';
  typing.style.cssText = 'align-self:flex-start;font-size:13px;color:var(--testo-muted);padding:6px 14px;font-style:italic;';
  typing.textContent = 'Mariello sta scrivendo...';
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;

  try {
    const contesto = await loadContestoMariello();
    const systemCompleto = MARIELLO_SYSTEM_PROMPT + '\n\nDATI ATTUALI DEL COMITATO (JSON):\n' + JSON.stringify(contesto);

    const response = await fetch(MARIELLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemCompleto,
        messages: marielloMessages.slice(-10) // ultimi 10 messaggi per non gonfiare troppo
      })
    });

    const data = await response.json();
    document.getElementById('mariello-typing')?.remove();

    if (data.error) {
      aggiungiMessaggioMariello('assistant', 'Öh belin, gh\'è quarche problema co\' a connesción. Riprova tra un po\'.');
      console.error('Mariello error:', data.error);
    } else {
      const risposta = data.content?.[0]?.text || 'Scusa figeu, no g\'ho capio ben. Repeti?';
      aggiungiMessaggioMariello('assistant', risposta);
      marielloMessages.push({ role: 'assistant', content: risposta });
    }
  } catch (e) {
    document.getElementById('mariello-typing')?.remove();
    aggiungiMessaggioMariello('assistant', 'Madonna ca brûggia, no riesco a conetteme! Contrlla a connesción e riprova.');
    console.error(e);
  }

  input.disabled = false;
  input.focus();
}

// ===== TESSERA SOCIO =====
async function assegnaNumeroTessera(socioId) {
  // Trova il massimo numero tessera esistente
  const { data } = await db.from('soci').select('numero_tessera').not('numero_tessera', 'is', null).order('numero_tessera', { ascending: false }).limit(1);
  const prossimo = (data?.[0]?.numero_tessera || 0) + 1;
  await db.from('soci').update({ numero_tessera: prossimo }).eq('id', socioId);
  return prossimo;
}

async function generaTessera(socioId) {
  const socio = tuttiSoci.find(s => s.id === socioId);
  if (!socio) { showToast('Socio non trovato', 'error'); return; }

  let numeroTessera = socio.numero_tessera;
  if (!numeroTessera) {
    numeroTessera = await assegnaNumeroTessera(socioId);
    socio.numero_tessera = numeroTessera;
  }

  // Genera HTML tessera e lo renderizza su canvas per scaricarlo come immagine/PDF
  apriAnteprimaTessera(socio, numeroTessera);
}

function htmlTesseraSocio(socio, numero) {
  const numeroFormattato = String(numero).padStart(4, '0');
  return `
    <div class="tessera-card" style="width:340px;height:214px;background:#F0EDE8;font-family:'Segoe UI',sans-serif;position:relative;overflow:hidden;box-sizing:border-box;border:1px solid #D4C9BE;border-radius:14px;">
      <div style="position:absolute;inset:0;border-radius:14px;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;width:100%;height:6px;background:#1E2D47;"></div>
        <img src="logo-bg.png" style="position:absolute;right:-30px;top:-20px;height:260px;width:auto;opacity:0.13;">
        <div style="position:relative;padding:14px 16px 0 16px;height:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px;">
            <div style="width:42px;height:42px;border-radius:8px;background:white;border:1.5px solid #D4C9BE;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
              <img src="logo.jpg" style="width:88%;height:88%;object-fit:contain;">
            </div>
            <div style="font-size:12.5px;font-weight:700;color:#1E2D47;line-height:1.15;white-space:nowrap;">Comitato Festeggiamenti N. S. della Bastia</div>
          </div>
          <div style="border-top:1px solid #D4C9BE;margin-bottom:8px;"></div>
          <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:#B8901A;margin-bottom:3px;">TESSERA SOCIO</div>
          <div style="font-size:24px;font-weight:700;color:#1E2D47;margin-bottom:8px;white-space:nowrap;">${socio.cognome} ${socio.nome}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:0.04em;color:#7A6548;">CODICE FISCALE</div>
          <div style="font-size:13px;font-family:monospace;color:#1E2D47;">${socio.codice_fiscale}</div>
        </div>
        <div style="position:absolute;bottom:12px;right:16px;background:#1E2D47;border-radius:10px;padding:6px 14px;text-align:left;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.04em;color:#8AAAD4;">N° TESSERA</div>
          <div style="font-size:22px;font-weight:700;color:#C9A030;">${numeroFormattato}</div>
        </div>
      </div>
    </div>
  `;
}

function apriAnteprimaTessera(socio, numero) {
  document.getElementById('tessera-modal-body').innerHTML = `<div id="tessera-stampa">${htmlTesseraSocio(socio, numero)}</div>`;
  document.getElementById('modal-tessera').style.display = 'flex';
  document.getElementById('modal-tessera').style.pointerEvents = 'auto';
  document.getElementById('m-tessera-socio-id').value = socio.id;
}

function closeModalTessera() {
  const m = document.getElementById('modal-tessera');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function scaricaTesseraPNG() {
  const tessera = document.getElementById('tessera-stampa');
  if (!window.html2canvas) {
    showToast('Caricamento libreria...', '');
    await caricaHtml2Canvas();
  }
  const canvas = await html2canvas(tessera, { scale: 3, backgroundColor: null });
  const link = document.createElement('a');
  const socioId = document.getElementById('m-tessera-socio-id').value;
  const socio = tuttiSoci.find(s => s.id === socioId);
  link.download = `tessera_${socio?.cognome || 'socio'}_${socio?.nome || ''}.png`.replace(/\s+/g, '_');
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function caricaHtml2Canvas() {
  return new Promise((resolve) => {
    if (window.html2canvas) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// ===== STAMPA MASSIVA TESSERE =====
async function stampaTessereSelezionate() {
  const checkboxes = document.querySelectorAll('.socio-checkbox:checked');
  const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
  if (!ids.length) { showToast('Seleziona almeno un socio', 'error'); return; }

  showToast('Genero il PDF...', '');

  // Assicura che tutti abbiano un numero tessera
  for (const id of ids) {
    const socio = tuttiSoci.find(s => s.id === id);
    if (socio && !socio.numero_tessera) {
      const num = await assegnaNumeroTessera(id);
      socio.numero_tessera = num;
    }
  }

  const sociSelezionati = ids.map(id => tuttiSoci.find(s => s.id === id)).filter(Boolean);

  if (!window.jspdf) await caricaJsPDF();
  await caricaHtml2Canvas();

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const CARD_W = 85.6, CARD_H = 54; // standard tessera
  const MARGIN_X = (210 - CARD_W * 2) / 3;
  const MARGIN_Y = (297 - CARD_H * 4) / 5;
  const COLS = 2, ROWS = 4;
  const PER_PAGE = COLS * ROWS;

  // Container temporaneo fuori schermo per renderizzare ogni tessera
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0';
  document.body.appendChild(tempContainer);

  for (let i = 0; i < sociSelezionati.length; i++) {
    const socio = sociSelezionati[i];
    const posInPage = i % PER_PAGE;
    if (i > 0 && posInPage === 0) pdf.addPage();

    const col = posInPage % COLS;
    const row = Math.floor(posInPage / COLS);
    const x = MARGIN_X + col * (CARD_W + MARGIN_X);
    const y = MARGIN_Y + row * (CARD_H + MARGIN_Y);

    tempContainer.innerHTML = htmlTesseraSocio(socio, socio.numero_tessera);

    await new Promise(r => setTimeout(r, 50)); // attende il rendering del logo

    const canvas = await html2canvas(tempContainer.firstElementChild, { scale: 3, backgroundColor: null });
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', x, y, CARD_W, CARD_H);

    // Linee guida per il ritaglio (tratteggiate, leggere)
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineDashPattern([1, 1], 0);
    pdf.rect(x, y, CARD_W, CARD_H);
  }

  document.body.removeChild(tempContainer);
  pdf.save(`tessere_soci_${new Date().toISOString().split('T')[0]}.pdf`);
  showToast(`PDF generato: ${sociSelezionati.length} tessere`, 'success');
}

function caricaJsPDF() {
  return new Promise((resolve) => {
    if (window.jspdf) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}


// ===== QUOTE ANNUALI =====
let tutteQuote = [];

async function loadQuote() {
  const { data } = await db
    .from('quote')
    .select('*, soci(nome, cognome, codice_fiscale)')
    .order('anno', { ascending: false })
    .order('created_at', { ascending: false });
  tutteQuote = data || [];
  renderQuote();
  aggiornaStatsQuote();
}

function renderQuote() {
  const anno = document.getElementById('quote-filtro-anno')?.value || 'tutti';
  const stato = document.getElementById('quote-filtro-stato')?.value || 'tutti';
  const search = (document.getElementById('quote-search')?.value || '').toLowerCase();

  let lista = tutteQuote;
  if (anno !== 'tutti') lista = lista.filter(q => String(q.anno) === anno);
  if (stato === 'pagate') lista = lista.filter(q => q.pagato);
  if (stato === 'non_pagate') lista = lista.filter(q => !q.pagato);
  if (search) lista = lista.filter(q =>
    `${q.soci?.cognome} ${q.soci?.nome} ${q.soci?.codice_fiscale}`.toLowerCase().includes(search)
  );

  // Aggiorna select anni
  const anni = [...new Set(tutteQuote.map(q => q.anno))].sort((a,b) => b - a);
  const sel = document.getElementById('quote-filtro-anno');
  if (sel) {
    const curr = sel.value;
    sel.innerHTML = '<option value="tutti">Tutti gli anni</option>' +
      anni.map(a => `<option value="${a}" ${String(a)===curr?'selected':''}>${a}</option>`).join('');
  }

  const tbody = document.getElementById('quote-tbody');
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--testo-muted);">Nessuna quota trovata</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map((q, i) => `
    <tr style="${i%2===0?'':'background:#F5F7FB;'}border-bottom:1px solid var(--border);">
      <td style="padding:9px 14px;font-weight:500;">${q.soci?.cognome || ''} ${q.soci?.nome || ''}</td>
      <td style="padding:9px 14px;font-size:12px;font-family:monospace;color:var(--testo-muted);">${q.soci?.codice_fiscale || ''}</td>
      <td style="padding:9px 14px;text-align:center;font-weight:600;">${q.anno}</td>
      <td style="padding:9px 14px;text-align:right;">€ ${parseFloat(q.importo||0).toFixed(2)}</td>
      <td style="padding:9px 14px;text-align:center;">
        <span class="badge ${q.pagato ? 'badge-ok' : 'badge-no'}">${q.pagato ? 'Pagata' : 'Da pagare'}</span>
      </td>
      <td style="padding:9px 14px;text-align:center;white-space:nowrap;">
        <span style="font-size:12px;color:var(--testo-muted);">${q.data_pagamento ? formatDataIT(q.data_pagamento) : '—'}</span>
        <button class="btn btn-sm" onclick="eliminaQuota('${q.id}')" style="color:#991B1B;margin-left:4px;"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function aggiornaStatsQuote() {
  const anno = ANNO_CORRENTE;
  const qAnno = tutteQuote.filter(q => q.anno === anno);
  const pagate = qAnno.filter(q => q.pagato).length;
  const totIncassato = qAnno.filter(q => q.pagato).reduce((s,q) => s + parseFloat(q.importo||0), 0);
  if (document.getElementById('q-stat-pagate')) document.getElementById('q-stat-pagate').textContent = pagate;
  if (document.getElementById('q-stat-totale')) document.getElementById('q-stat-totale').textContent = '€ ' + totIncassato.toFixed(2);
  if (document.getElementById('q-stat-anno')) document.getElementById('q-stat-anno').textContent = anno;
}

async function eliminaQuota(id) {
  if (!confirm('Eliminare questo record quota?')) return;
  await db.from('quote').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadQuote();
}


// ===== CASSA GENERALE =====
let tuttiMovimentiCassa = [];

async function loadCassa() {
  const { data } = await db.from('movimenti_cassa').select('*').order('data', { ascending: false });
  tuttiMovimentiCassa = data || [];
  renderCassa();
  aggiornaBilancioCassa();
}

const _cassaCollassate = new Set();

function toggleGruppoCassa(cat) {
  if (_cassaCollassate.has(cat)) _cassaCollassate.delete(cat);
  else _cassaCollassate.add(cat);
  renderCassa();
}

function renderCassa() {
  const search = (document.getElementById('cassa-search')?.value || '').toLowerCase();
  const filtroTipo = document.getElementById('cassa-filtro-tipo')?.value || 'tutti';

  let lista = tuttiMovimentiCassa;
  if (search) lista = lista.filter(m => JSON.stringify(m).toLowerCase().includes(search));
  if (filtroTipo !== 'tutti') lista = lista.filter(m => m.tipo === filtroTipo);

  const container = document.getElementById('cassa-list');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--testo-muted);">Nessun movimento</div>';
    return;
  }

  // Raggruppa per categoria
  const gruppi = {};
  lista.forEach(m => {
    const cat = m.categoria || 'Senza categoria';
    if (!gruppi[cat]) gruppi[cat] = [];
    gruppi[cat].push(m);
  });

  container.innerHTML = Object.entries(gruppi).map(([cat, movimenti]) => {
    const totEntrate = movimenti.filter(m => m.tipo === 'entrata').reduce((s,m) => s + parseFloat(m.importo||0), 0);
    const totUscite = movimenti.filter(m => m.tipo === 'uscita').reduce((s,m) => s + parseFloat(m.importo||0), 0);
    const saldo = totEntrate - totUscite;
    const collassato = _cassaCollassate.has(cat);
    const saldoColor = saldo >= 0 ? 'var(--verde)' : '#991B1B';
    const segnoSaldo = saldo >= 0 ? '+' : '';

    return `
      <div style="margin-bottom:4px;">
        <div onclick="toggleGruppoCassa('${cat}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#F2EDE4;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <i class="ti ti-chevron-${collassato ? 'right' : 'down'}" style="font-size:14px;color:var(--testo-muted);"></i>
            <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--testo-muted);">${cat}</span>
            <span style="font-size:11px;color:var(--testo-muted);">(${movimenti.length})</span>
          </div>
          <div style="display:flex;gap:16px;align-items:center;">
            ${totEntrate > 0 ? `<span style="font-size:12px;color:var(--verde);font-weight:500;">+€ ${totEntrate.toFixed(2)}</span>` : ''}
            ${totUscite > 0 ? `<span style="font-size:12px;color:#991B1B;font-weight:500;">-€ ${totUscite.toFixed(2)}</span>` : ''}
            <span style="font-size:13px;font-weight:700;color:${saldoColor};">${segnoSaldo}€ ${saldo.toFixed(2)}</span>
          </div>
        </div>
        ${collassato ? '' : movimenti.map(m => {
          const isEntrata = m.tipo === 'entrata';
          const color = isEntrata ? 'var(--verde)' : '#991B1B';
          const segno = isEntrata ? '+' : '-';
          return `<div class="table-row" style="padding-left:42px;">
            <div style="flex:1;">
              <div class="row-name">${m.descrizione}</div>
              <div class="row-sub">${m.data ? formatDataIT(m.data) : ''} · ${m.metodo_pagamento || ''}</div>
            </div>
            <span style="font-weight:600;color:${color};white-space:nowrap;">${segno} € ${parseFloat(m.importo).toFixed(2)}</span>
            <button class="btn btn-sm" onclick='openModalCassa(${JSON.stringify(m).replace(/"/g,"&quot;")})'><i class="ti ti-edit"></i></button>
            <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaMovimentoCassa('${m.id}')"><i class="ti ti-trash"></i></button>
          </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function aggiornaBilancioCassa() {
  const tutti = tuttiMovimentiCassa;
  const entrate = tutti.filter(m => m.tipo === 'entrata').reduce((s,m) => s + parseFloat(m.importo||0), 0);
  const uscite = tutti.filter(m => m.tipo === 'uscita').reduce((s,m) => s + parseFloat(m.importo||0), 0);
  const saldo = entrate - uscite;

  // Solo movimenti NON collegati alla sagra per bilancio netto
  const entrateNette = tutti.filter(m => m.tipo === 'entrata' && !m.collegato_sagra).reduce((s,m) => s + parseFloat(m.importo||0), 0);
  const usciteNette = tutti.filter(m => m.tipo === 'uscita' && !m.collegato_sagra).reduce((s,m) => s + parseFloat(m.importo||0), 0);
  const saldoNetto = entrateNette - usciteNette;

  if (document.getElementById('c-tot-entrate')) document.getElementById('c-tot-entrate').textContent = '€ ' + entrate.toFixed(2);
  if (document.getElementById('c-tot-uscite')) document.getElementById('c-tot-uscite').textContent = '€ ' + uscite.toFixed(2);
  if (document.getElementById('c-saldo')) {
    document.getElementById('c-saldo').textContent = '€ ' + saldo.toFixed(2);
    document.getElementById('c-saldo').style.color = saldo >= 0 ? 'var(--verde)' : '#991B1B';
  }
  if (document.getElementById('c-saldo-netto')) {
    document.getElementById('c-saldo-netto').textContent = '€ ' + saldoNetto.toFixed(2);
    document.getElementById('c-saldo-netto').style.color = saldoNetto >= 0 ? 'var(--verde)' : '#991B1B';
  }
}

function openModalCassa(m = null) {
  document.getElementById('modal-cassa').style.display = 'flex';
  document.getElementById('modal-cassa').style.pointerEvents = 'auto';
  buildCategorieSelect('m-cassa-categoria', 'cassa');
  document.getElementById('m-cassa-id').value = m?.id || '';
  document.getElementById('m-cassa-tipo').value = m?.tipo || 'entrata';
  document.getElementById('m-cassa-categoria').value = m?.categoria || '';
  document.getElementById('m-cassa-descrizione').value = m?.descrizione || '';
  document.getElementById('m-cassa-importo').value = m?.importo || '';
  document.getElementById('m-cassa-data').value = m?.data || new Date().toISOString().split('T')[0];
  document.getElementById('m-cassa-metodo').value = m?.metodo_pagamento || 'contanti';
  document.getElementById('m-cassa-sagra').checked = m?.collegato_sagra || false;
  document.getElementById('m-cassa-note').value = m?.note || '';
}

function closeModalCassa() {
  const m = document.getElementById('modal-cassa');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveMovimentoCassa() {
  const descrizione = document.getElementById('m-cassa-descrizione').value.trim();
  const importo = parseFloat(document.getElementById('m-cassa-importo').value);
  if (!descrizione || isNaN(importo)) { showToast('Descrizione e importo obbligatori', 'error'); return; }

  const payload = {
    tipo: document.getElementById('m-cassa-tipo').value,
    categoria: document.getElementById('m-cassa-categoria').value.trim() || null,
    descrizione,
    importo,
    data: document.getElementById('m-cassa-data').value,
    metodo_pagamento: document.getElementById('m-cassa-metodo').value || null,
    collegato_sagra: document.getElementById('m-cassa-sagra').checked,
    note: document.getElementById('m-cassa-note').value.trim() || null
  };

  const id = document.getElementById('m-cassa-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('movimenti_cassa').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('movimenti_cassa').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Salvato!', 'success');
  closeModalCassa();
  loadCassa();
}

async function eliminaMovimentoCassa(id) {
  if (!confirm('Eliminare questo movimento?')) return;
  await db.from('movimenti_cassa').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadCassa();
}


// ===== CATEGORIE + IMPOSTAZIONI =====
let categorieCassa = [];
let categorieSagra = [];

async function loadCategorie() {
  const { data } = await db.from('categorie').select('*').order('nome');
  categorieCassa = (data || []).filter(c => c.tipo === 'cassa');
  categorieSagra = (data || []).filter(c => c.tipo === 'sagra');
  await loadFornitori();
}

function buildCategorieSelect(selectId, tipo) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const curr = sel.value;
  const cats = tipo === 'cassa' ? categorieCassa : categorieSagra;
  sel.innerHTML = '<option value="">—</option>' +
    cats.map(c => `<option value="${c.nome}" ${c.nome===curr?'selected':''}>${c.nome}</option>`).join('');
}

async function loadImpostazioni() {
  await loadCategorie();
  renderImpostazioni();
  await loadFornitori();
  await loadCatalogoCompleto();
}

function toggleSezioneImp(id) {
  const el = document.getElementById(id);
  const ico = document.getElementById('ico-' + id);
  if (!el) return;
  const aperta = el.style.display !== 'none';
  el.style.display = aperta ? 'none' : 'block';
  if (ico) ico.style.transform = aperta ? 'rotate(-90deg)' : 'rotate(0deg)';
}

function renderImpostazioni() {
  renderCategorieTabella('cassa');
  renderCategorieTabella('sagra');
}

function renderCategorieTabella(tipo) {
  const cats = tipo === 'cassa' ? categorieCassa : categorieSagra;
  const tbody = document.getElementById(`cat-tbody-${tipo}`);
  if (!tbody) return;
  tbody.innerHTML = cats.map(c => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 14px;font-weight:500;">${c.nome}</td>
      <td style="padding:8px 14px;text-align:center;">
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaCategoria('${c.id}','${tipo}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="padding:16px;text-align:center;color:var(--testo-muted);">Nessuna categoria</td></tr>';
}

async function aggiungiCategoria(tipo) {
  const input = document.getElementById(`cat-input-${tipo}`);
  const nome = input?.value.trim();
  if (!nome) { showToast('Inserisci un nome', 'error'); return; }
  const { error } = await db.from('categorie').insert({ tipo, nome });
  if (error) { showToast('Errore: ' + (error.message.includes('unique') ? 'Categoria già esistente' : error.message), 'error'); return; }
  input.value = '';
  showToast('Categoria aggiunta!', 'success');
  await loadCategorie();
  renderImpostazioni();
}

async function eliminaCategoria(id, tipo) {
  if (!confirm('Eliminare questa categoria?')) return;
  await db.from('categorie').delete().eq('id', id);
  showToast('Eliminata', 'success');
  await loadCategorie();
  renderImpostazioni();
}

// categorie cassa integrate direttamente

// categorie sagra integrate direttamente

// Carica categorie all'avvio app
// categorie caricate in initApp


// ===== FORNITORI =====
let tuttiFornitori = [];

async function loadFornitori() {
  const { data } = await db.from('fornitori').select('*').order('nome');
  tuttiFornitori = data || [];
  renderFornitoriTabella();
  // Aggiorna datalist fornitori nel modale spesa
  const dl = document.getElementById('fornitori-list');
  if (dl) dl.innerHTML = tuttiFornitori.map(f => `<option value="${f.nome}">`).join('');
}

function renderFornitoriTabella() {
  const tbody = document.getElementById('fornitori-tbody');
  if (!tbody) return;
  tbody.innerHTML = tuttiFornitori.map(f => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 14px;font-weight:500;">${f.nome}</td>
      <td style="padding:8px 14px;color:var(--testo-muted);">${f.categoria || '—'}</td>
      <td style="padding:8px 14px;color:var(--testo-muted);font-size:12px;">${f.note || ''}</td>
      <td style="padding:8px 14px;text-align:center;">
        <button class="btn btn-sm" onclick="openModalFornitore(${JSON.stringify(f).replace(/"/g,'&quot;')})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaFornitore('${f.id}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--testo-muted);">Nessun fornitore</td></tr>';
}

function openModalFornitore(f = null) {
  document.getElementById('modal-fornitore').style.display = 'flex';
  document.getElementById('modal-fornitore').style.pointerEvents = 'auto';
  document.getElementById('m-forn-id').value = f?.id || '';
  document.getElementById('m-forn-nome').value = f?.nome || '';
  document.getElementById('m-forn-categoria').value = f?.categoria || '';
  document.getElementById('m-forn-note').value = f?.note || '';
}

function closeModalFornitore() {
  const m = document.getElementById('modal-fornitore');
  m.style.display = 'none';
  m.style.pointerEvents = 'none';
}

async function saveFornitore() {
  const nome = document.getElementById('m-forn-nome').value.trim();
  if (!nome) { showToast('Nome obbligatorio', 'error'); return; }
  const payload = {
    nome,
    categoria: document.getElementById('m-forn-categoria').value.trim() || null,
    note: document.getElementById('m-forn-note').value.trim() || null
  };
  const id = document.getElementById('m-forn-id').value;
  let error;
  if (id) {
    ({ error } = await db.from('fornitori').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('fornitori').insert(payload));
  }
  if (error) { showToast('Errore: ' + error.message, 'error'); return; }
  showToast('Fornitore salvato!', 'success');
  closeModalFornitore();
  loadFornitori();
}

async function eliminaFornitore(id) {
  if (!confirm('Eliminare questo fornitore?')) return;
  await db.from('fornitori').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadFornitori();
}

// ===== CATALOGO ARTICOLI SPESA =====
let tuttoCatalogo = [];

async function loadCatalogoCompleto() {
  const { data } = await db.from('catalogo_spesa').select('*').order('categoria').order('articolo');
  tuttoCatalogo = data || [];
  renderCatalogoTabella();
}

function renderCatalogoTabella() {
  const search = (document.getElementById('cat-articoli-search')?.value || '').toLowerCase();
  const tbody = document.getElementById('cat-articoli-tbody');
  if (!tbody) return;

  let lista = tuttoCatalogo;
  if (search) lista = lista.filter(a => JSON.stringify(a).toLowerCase().includes(search));

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--testo-muted);">Nessun articolo</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(a => `
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:7px 12px;font-weight:500;font-size:12px;">${a.articolo}</td>
      <td style="padding:7px 12px;font-size:12px;color:var(--testo-muted);">${a.fornitore || '—'}</td>
      <td style="padding:7px 12px;font-size:12px;color:var(--testo-muted);">${a.categoria || '—'}</td>
      <td style="padding:7px 12px;font-size:12px;">${a.prezzo_unitario ? '€ '+parseFloat(a.prezzo_unitario).toFixed(2) : '—'}</td>
      <td style="padding:7px 12px;text-align:center;">
        <button class="btn btn-sm" style="color:#991B1B" onclick="eliminaArticoloCatalogo('${a.id}')"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

async function eliminaArticoloCatalogo(id) {
  if (!confirm('Eliminare dal catalogo?')) return;
  await db.from('catalogo_spesa').delete().eq('id', id);
  showToast('Eliminato', 'success');
  loadCatalogoCompleto();
}

// fornitori e catalogo integrati in loadImpostazioni

// fornitori caricati in initApp
