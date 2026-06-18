
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
  if (pageId === 'impostazioni-anno') loadImpostazioniAnno();
  if (pageId === 'utenti') loadUtenti();
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
  const { error } = await db.from('soci').update({ anno_rinnovo: ANNO_CORRENTE, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { showToast('Errore', 'error'); return; }
  // Registra anche in tabella quote
  const { data: socio } = await db.from('soci').select('id').eq('id', id).single();
  await db.from('quote').upsert({ socio_id: id, anno: ANNO_CORRENTE, pagato: true, data_pagamento: new Date().toISOString().split('T')[0], importo: 0 }, { onConflict: 'socio_id,anno' });
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
    const { error: e1 } = await db.from('soci').update({ anno_rinnovo: ANNO_CORRENTE, updated_at: new Date().toISOString() }).eq('id', id);
    const { error: e2 } = await db.from('quote').insert({ socio_id: id, anno: ANNO_CORRENTE, importo: quota, pagato: true, data_pagamento: oggi });
    if (e1 || e2) err++; else ok++;
  }

  showToast(`Rinnovati: ${ok}${err ? ' | Errori: ' + err : ''}`, ok > 0 ? 'success' : 'error');
  document.getElementById('barra-rinnovo').style.display = 'none';
  loadSoci();
}

// ===== GESTIONE UTENTI =====
let tuttiUtenti = [];

async function loadUtenti() {
  const { data: profili, error: e1 } = await db.from('profiles').select('*').order('cognome');
  const { data: permessi, error: e2 } = await db.from('utenti_permessi').select('*');
  console.log('profili:', profili, 'error:', e1);
  console.log('permessi:', permessi, 'error:', e2);
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
