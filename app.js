
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
    note: document.getElementById('m-sagra-note').value.trim() || null
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
  return sagraSelezionata?.id || tutteSagre[0]?.id || null;
}

// ===== MOVIMENTI SAGRA =====
let tuttiMovimenti = [];

async function loadMovimentiSagra() {
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
  const sagraId = getSagraId();
  aggiornaHeaderSagra('sp-sagra-header');
  if (!sagraId) return;
  const { data } = await db.from('sponsor').select('*').eq('sagra_id', sagraId).order('ditta');
  tuttiSponsor = data || [];
  renderSponsor();
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
const _origSaveSpesa = saveSpesa;
async function saveSpesa() {
  const articolo = document.getElementById('m-spesa-articolo').value.trim();
  const fornitore = document.getElementById('m-spesa-fornitore').value.trim();
  const categoria = document.getElementById('m-spesa-categoria').value.trim();
  const stand = document.getElementById('m-spesa-stand').value.trim();
  const unita = document.getElementById('m-spesa-unita').value.trim();
  const prezzo = parseFloat(document.getElementById('m-spesa-prezzo').value) || null;
  const iva = parseFloat(document.getElementById('m-spesa-iva').value) || null;
  await _origSaveSpesa();
  await aggiungiACatalogo(articolo, fornitore, categoria, stand, unita, prezzo, iva);
  await loadCatalogoSpesa();
}

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
