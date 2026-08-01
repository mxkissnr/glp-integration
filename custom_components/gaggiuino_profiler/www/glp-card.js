const GLP_CARD_VERSION = '2.17.5';

// ─── i18n ────────────────────────────────────────────────────────────────────
// DE wording is the original card text; language follows hass.language (DE/EN/IT/FR/ES/NL, falls back to EN).

const STRINGS = {
  de: {
    tab_orders: 'Bestellungen', tab_maint: 'Wartung',
    orders_none: 'Keine offenen Bestellungen',
    ord_decline_q: 'Ablehnen?', ord_done_in: 'Fertig in:', ord_yes: '✓ Ja',
    ord_accept: '✓ Annehmen', ord_decline: 'Ablehnen', ord_done: '✓ Fertig',
    ord_ready_in: n => `fertig in ~${n} min`, ord_preparing: 'in Zubereitung',
    just_now: 'gerade eben', mins_ago: n => `vor ${n} Min`, hours_ago: n => `vor ${n} Std`, days_ago: n => `vor ${n} Tagen`,
    maint_descaling: 'Entkalken', maint_backflush: 'Backflush', maint_grouphead: 'Gruppenkopf',
    maint_gaskets: 'Dichtungen & Siebe', maint_waterfilter: 'Wasserfilter', maint_grinders: 'Mühlen',
    pill_ok: '✓ OK', pill_soon: 'Bald fällig', pill_due: '⚠ Fällig', pill_never: 'Nie erledigt',
    maint_today: 'heute', maint_confirm_q: 'Als erledigt markieren?',
    maint_none: 'Keine Wartungsdaten verfügbar',
    power_on: 'Einschalten', power_off: 'Ausschalten', off_label: 'Aus',
    profile_label: 'Profil', profile_switching: 'wechselt …',
    lm_live: 'Maschine live',
    steam_mode: '☁️ Dampfmodus', water_low: p => `💧 Wasser fast leer (${p}%)`,
    preheat_ready: '☕ Brühbereit', preheat_heating: '🔥 Aufheizen …',
    ready_by_set_label: 'Brühbereit bis', ready_by_set: 'Setzen',
    ready_by_target: hhmm => `Brühbereit bis ${hhmm}`, ready_by_cancel: 'Abbrechen',
    ready_by_switching_in: n => `schaltet in ${n} Min ein`, ready_by_switching_now: 'schaltet jetzt ein',
    ready_by_scheduling: 'Wird geplant …',
    brewing: '⏳ Bezug läuft',
    no_shot_label: 'Noch kein Shot aufgezeichnet', no_shot_hint: 'Shots werden automatisch synchronisiert',
    m_duration: 'Dauer', m_yield: 'Ausbeute', m_pressure: 'Druck Ø', m_temp: 'Temp',
    leg_pressure: 'Druck', leg_flow: 'Flow', leg_temp: 'Temp', leg_weight: 'Gewicht',
    ph_pre: 'Vorinfusion', ph_ext: 'Extraktion',
    footer_today: n => `☕ ${n} heute`, uptime_title: 'Maschine an seit',
    bean_roasted_ago: d => `Geröstet vor ${d} Tagen`,
  },
  en: {
    tab_orders: 'Orders', tab_maint: 'Maintenance',
    orders_none: 'No open orders',
    ord_decline_q: 'Decline?', ord_done_in: 'Ready in:', ord_yes: '✓ Yes',
    ord_accept: '✓ Accept', ord_decline: 'Decline', ord_done: '✓ Done',
    ord_ready_in: n => `ready in ~${n} min`, ord_preparing: 'being prepared',
    just_now: 'just now', mins_ago: n => `${n} min ago`, hours_ago: n => `${n} h ago`, days_ago: n => `${n} days ago`,
    maint_descaling: 'Descaling', maint_backflush: 'Backflush', maint_grouphead: 'Group head',
    maint_gaskets: 'Gaskets & screens', maint_waterfilter: 'Water filter', maint_grinders: 'Grinders',
    pill_ok: '✓ OK', pill_soon: 'Due soon', pill_due: '⚠ Due', pill_never: 'Never done',
    maint_today: 'today', maint_confirm_q: 'Mark as done?',
    maint_none: 'No maintenance data available',
    power_on: 'Turn on', power_off: 'Turn off', off_label: 'Off',
    profile_label: 'Profile', profile_switching: 'switching …',
    lm_live: 'Machine live',
    steam_mode: '☁️ Steam mode', water_low: p => `💧 Water almost empty (${p}%)`,
    preheat_ready: '☕ Ready to brew', preheat_heating: '🔥 Warming up …',
    ready_by_set_label: 'Ready by', ready_by_set: 'Set',
    ready_by_target: hhmm => `Ready by ${hhmm}`, ready_by_cancel: 'Cancel',
    ready_by_switching_in: n => `switching on in ${n}m`, ready_by_switching_now: 'switching on now',
    ready_by_scheduling: 'Scheduling…',
    brewing: '⏳ Brewing',
    no_shot_label: 'No shot recorded yet', no_shot_hint: 'Shots sync automatically',
    m_duration: 'Duration', m_yield: 'Yield', m_pressure: 'Pressure Ø', m_temp: 'Temp',
    leg_pressure: 'Pressure', leg_flow: 'Flow', leg_temp: 'Temp', leg_weight: 'Weight',
    ph_pre: 'Preinfusion', ph_ext: 'Extraction',
    footer_today: n => `☕ ${n} today`, uptime_title: 'Machine on since',
    bean_roasted_ago: d => `Roasted ${d} days ago`,
  },
  it: {
    tab_orders: 'Ordini', tab_maint: 'Manutenzione',
    orders_none: 'Nessun ordine aperto',
    ord_decline_q: 'Rifiutare?', ord_done_in: 'Pronto tra:', ord_yes: '✓ Sì',
    ord_accept: '✓ Accetta', ord_decline: 'Rifiuta', ord_done: '✓ Fatto',
    ord_ready_in: n => `pronto tra ~${n} min`, ord_preparing: 'in preparazione',
    just_now: 'proprio ora', mins_ago: n => `${n} min fa`, hours_ago: n => `${n} h fa`, days_ago: n => `${n} giorni fa`,
    maint_descaling: 'Decalcificazione', maint_backflush: 'Backflush', maint_grouphead: 'Gruppo erogazione',
    maint_gaskets: 'Guarnizioni & filtri', maint_waterfilter: 'Filtro acqua', maint_grinders: 'Macinacaffè',
    pill_ok: '✓ OK', pill_soon: 'In scadenza', pill_due: '⚠ Scaduto', pill_never: 'Mai fatto',
    maint_today: 'oggi', maint_confirm_q: 'Segnare come fatto?',
    maint_none: 'Nessun dato di manutenzione disponibile',
    power_on: 'Accendi', power_off: 'Spegni', off_label: 'Spento',
    profile_label: 'Profilo', profile_switching: 'cambio in corso …',
    lm_live: 'Macchina in diretta',
    steam_mode: '☁️ Modalità vapore', water_low: p => `💧 Acqua quasi esaurita (${p}%)`,
    preheat_ready: '☕ Pronto per l\'estrazione', preheat_heating: '🔥 Riscaldamento …',
    ready_by_set_label: 'Pronto entro', ready_by_set: 'Imposta',
    ready_by_target: hhmm => `Pronto entro le ${hhmm}`, ready_by_cancel: 'Annulla',
    ready_by_switching_in: n => `si accende tra ${n} min`, ready_by_switching_now: 'si accende ora',
    ready_by_scheduling: 'Pianificazione …',
    brewing: '⏳ Estrazione in corso',
    no_shot_label: 'Nessuno shot ancora registrato', no_shot_hint: 'Gli shot si sincronizzano automaticamente',
    m_duration: 'Durata', m_yield: 'Resa', m_pressure: 'Pressione Ø', m_temp: 'Temp',
    leg_pressure: 'Pressione', leg_flow: 'Flusso', leg_temp: 'Temp', leg_weight: 'Peso',
    ph_pre: 'Preinfusione', ph_ext: 'Estrazione',
    footer_today: n => `☕ ${n} oggi`, uptime_title: 'Macchina accesa da',
    bean_roasted_ago: d => `Tostato ${d} giorni fa`,
  },
  fr: {
    tab_orders: 'Commandes', tab_maint: 'Entretien',
    orders_none: 'Aucune commande en cours',
    ord_decline_q: 'Refuser ?', ord_done_in: 'Prêt dans :', ord_yes: '✓ Oui',
    ord_accept: '✓ Accepter', ord_decline: 'Refuser', ord_done: '✓ Terminé',
    ord_ready_in: n => `prêt dans ~${n} min`, ord_preparing: 'en préparation',
    just_now: 'à l\'instant', mins_ago: n => `il y a ${n} min`, hours_ago: n => `il y a ${n} h`, days_ago: n => `il y a ${n} jours`,
    maint_descaling: 'Détartrage', maint_backflush: 'Backflush', maint_grouphead: 'Groupe de percolation',
    maint_gaskets: 'Joints & tamis', maint_waterfilter: 'Filtre à eau', maint_grinders: 'Moulins',
    pill_ok: '✓ OK', pill_soon: 'Bientôt requis', pill_due: '⚠ Requis', pill_never: 'Jamais fait',
    maint_today: 'aujourd\'hui', maint_confirm_q: 'Marquer comme fait ?',
    maint_none: 'Aucune donnée d\'entretien disponible',
    power_on: 'Allumer', power_off: 'Éteindre', off_label: 'Éteint',
    profile_label: 'Profil', profile_switching: 'changement …',
    lm_live: 'Machine en direct',
    steam_mode: '☁️ Mode vapeur', water_low: p => `💧 Eau presque vide (${p}%)`,
    preheat_ready: '☕ Prêt à infuser', preheat_heating: '🔥 Chauffage …',
    ready_by_set_label: 'Prêt avant', ready_by_set: 'Définir',
    ready_by_target: hhmm => `Prêt avant ${hhmm}`, ready_by_cancel: 'Annuler',
    ready_by_switching_in: n => `s'allume dans ${n} min`, ready_by_switching_now: "s'allume maintenant",
    ready_by_scheduling: 'Planification …',
    brewing: '⏳ Extraction en cours',
    no_shot_label: 'Aucun shot enregistré pour l\'instant', no_shot_hint: 'Les shots se synchronisent automatiquement',
    m_duration: 'Durée', m_yield: 'Rendement', m_pressure: 'Pression Ø', m_temp: 'Temp',
    leg_pressure: 'Pression', leg_flow: 'Débit', leg_temp: 'Temp', leg_weight: 'Poids',
    ph_pre: 'Préinfusion', ph_ext: 'Extraction',
    footer_today: n => `☕ ${n} aujourd'hui`, uptime_title: 'Machine allumée depuis',
    bean_roasted_ago: d => `Torréfié il y a ${d} jours`,
  },
  es: {
    tab_orders: 'Pedidos', tab_maint: 'Mantenimiento',
    orders_none: 'No hay pedidos abiertos',
    ord_decline_q: '¿Rechazar?', ord_done_in: 'Listo en:', ord_yes: '✓ Sí',
    ord_accept: '✓ Aceptar', ord_decline: 'Rechazar', ord_done: '✓ Listo',
    ord_ready_in: n => `listo en ~${n} min`, ord_preparing: 'en preparación',
    just_now: 'justo ahora', mins_ago: n => `hace ${n} min`, hours_ago: n => `hace ${n} h`, days_ago: n => `hace ${n} días`,
    maint_descaling: 'Descalcificación', maint_backflush: 'Backflush', maint_grouphead: 'Grupo de erogación',
    maint_gaskets: 'Juntas y filtros', maint_waterfilter: 'Filtro de agua', maint_grinders: 'Molinillos',
    pill_ok: '✓ OK', pill_soon: 'Próximo', pill_due: '⚠ Pendiente', pill_never: 'Nunca hecho',
    maint_today: 'hoy', maint_confirm_q: '¿Marcar como hecho?',
    maint_none: 'No hay datos de mantenimiento disponibles',
    power_on: 'Encender', power_off: 'Apagar', off_label: 'Apagado',
    profile_label: 'Perfil', profile_switching: 'cambiando …',
    lm_live: 'Máquina en directo',
    steam_mode: '☁️ Modo vapor', water_low: p => `💧 Agua casi vacía (${p}%)`,
    preheat_ready: '☕ Listo para extraer', preheat_heating: '🔥 Calentando …',
    ready_by_set_label: 'Listo antes de', ready_by_set: 'Fijar',
    ready_by_target: hhmm => `Listo antes de las ${hhmm}`, ready_by_cancel: 'Cancelar',
    ready_by_switching_in: n => `se enciende en ${n} min`, ready_by_switching_now: 'se enciende ahora',
    ready_by_scheduling: 'Programando …',
    brewing: '⏳ Extracción en curso',
    no_shot_label: 'Aún no se ha registrado ningún shot', no_shot_hint: 'Los shots se sincronizan automáticamente',
    m_duration: 'Duración', m_yield: 'Rendimiento', m_pressure: 'Presión Ø', m_temp: 'Temp',
    leg_pressure: 'Presión', leg_flow: 'Flujo', leg_temp: 'Temp', leg_weight: 'Peso',
    ph_pre: 'Preinfusión', ph_ext: 'Extracción',
    footer_today: n => `☕ ${n} hoy`, uptime_title: 'Máquina encendida desde',
    bean_roasted_ago: d => `Tostado hace ${d} días`,
  },
  nl: {
    tab_orders: 'Bestellingen', tab_maint: 'Onderhoud',
    orders_none: 'Geen openstaande bestellingen',
    ord_decline_q: 'Afwijzen?', ord_done_in: 'Klaar over:', ord_yes: '✓ Ja',
    ord_accept: '✓ Accepteren', ord_decline: 'Afwijzen', ord_done: '✓ Klaar',
    ord_ready_in: n => `klaar over ~${n} min`, ord_preparing: 'in bereiding',
    just_now: 'zojuist', mins_ago: n => `${n} min geleden`, hours_ago: n => `${n} u geleden`, days_ago: n => `${n} dagen geleden`,
    maint_descaling: 'Ontkalken', maint_backflush: 'Backflush', maint_grouphead: 'Groepkop',
    maint_gaskets: 'Afdichtingen & zeven', maint_waterfilter: 'Waterfilter', maint_grinders: 'Molens',
    pill_ok: '✓ OK', pill_soon: 'Binnenkort nodig', pill_due: '⚠ Nodig', pill_never: 'Nooit gedaan',
    maint_today: 'vandaag', maint_confirm_q: 'Als voltooid markeren?',
    maint_none: 'Geen onderhoudsgegevens beschikbaar',
    power_on: 'Inschakelen', power_off: 'Uitschakelen', off_label: 'Uit',
    profile_label: 'Profiel', profile_switching: 'wisselt …',
    lm_live: 'Machine live',
    steam_mode: '☁️ Stoommodus', water_low: p => `💧 Water bijna leeg (${p}%)`,
    preheat_ready: '☕ Klaar om te zetten', preheat_heating: '🔥 Opwarmen …',
    ready_by_set_label: 'Klaar voor', ready_by_set: 'Instellen',
    ready_by_target: hhmm => `Klaar voor ${hhmm}`, ready_by_cancel: 'Annuleren',
    ready_by_switching_in: n => `schakelt in over ${n} min`, ready_by_switching_now: 'schakelt nu in',
    ready_by_scheduling: 'Wordt gepland …',
    brewing: '⏳ Bereiden',
    no_shot_label: 'Nog geen shot geregistreerd', no_shot_hint: 'Shots synchroniseren automatisch',
    m_duration: 'Duur', m_yield: 'Opbrengst', m_pressure: 'Druk Ø', m_temp: 'Temp',
    leg_pressure: 'Druk', leg_flow: 'Flow', leg_temp: 'Temp', leg_weight: 'Gewicht',
    ph_pre: 'Voorinfusie', ph_ext: 'Extractie',
    footer_today: n => `☕ ${n} vandaag`, uptime_title: 'Machine aan sinds',
    bean_roasted_ago: d => `${d} dagen geleden gebrand`,
  },
};

const SUPPORTED_LANGS = ['de', 'en', 'it', 'fr', 'es', 'nl'];
let LANG = 'de';
function T(key, ...args) {
  const v = (STRINGS[LANG] ?? STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

// ─── bean helpers ────────────────────────────────────────────────────────────

// ISO 3166-1 alpha-2 → flag emoji (regional indicators); '' for non-codes
function flagEmoji(code) {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// Days since roast; accepts DD.MM.YYYY and YYYY-MM-DD (same as the GLP app)
function roastAgeDays(str) {
  if (!str || typeof str !== 'string') return null;
  let d = null;
  let m = str.trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    d = new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
  } else {
    m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  }
  if (!d || isNaN(d)) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days >= 0 && days <= 730 ? days : null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  // GLP-SHARED:esc v1 — body kept byte-identical with glp-order-card.js's _esc()
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // /GLP-SHARED:esc v1
}

function safeUrl(url) {
  // GLP-SHARED:safeUrl v1 — body kept byte-identical with glp-order-card.js's
  // _safeUrl() (#74 — that copy had drifted to returning the raw input,
  // losing this reasoning; re-sync it from here)
  if (!url) return null;
  // Returns u.href (the normalized/re-serialized URL), not the raw input —
  // the raw string could still contain quote/angle-bracket characters that
  // break out of an href="..." attribute even though the protocol is fine.
  try { const u = new URL(url); return (u.protocol==='http:'||u.protocol==='https:') ? u.href : null; }
  catch { return null; }
  // /GLP-SHARED:safeUrl v1
}

function parseTs(val) {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') return new Date(val > 1e10 ? val : val * 1000);
  return new Date(val);
}

function downsample(arr, maxPts) {
  if (!arr || arr.length <= maxPts) return arr || [];
  const step = Math.ceil(arr.length / maxPts);
  const out  = arr.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

// Card chart series colors — GLP-series palette, kept in sync with the GLP-TOKENS
// --glp-series-* fallback values in STYLES and with glp-order-card.js (see CLAUDE.md).
const CC = { pres: '#0072b2', flow: '#c77000', temp: '#c0392b', wt: '#009e73' };

function _scale(arr) { return (Array.isArray(arr) && arr.length) ? arr.map(v => v / 10) : []; }

function fmtClock(s) {
  if (s == null || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function fmtUptime(ms) {
  if (ms == null || ms < 0 || isNaN(ms)) return '';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

// Preinfusion/extraction split detected from the pressure curve (same heuristic as the app)
function detectPhases(times, pressures) {
  if (!times?.length || !pressures || pressures.length < 5) return null;
  const THRESH = 3.5;
  let endIdx = -1;
  for (let i = 0; i < pressures.length; i++) {
    if (times[i] >= 1 && pressures[i] >= THRESH) { endIdx = i; break; }
  }
  if (endIdx <= 0) return null;
  const preinfusion = times[endIdx];
  if (preinfusion < 1.5) return null;
  return { preinfusion, extraction: times[times.length - 1] - preinfusion };
}

// App-style labeled chart: pressure + flow on left (bar) axis, temperature + weight on
// right axis, real time axis (s), gridlines, axis labels and preinfusion/extraction shading.
function buildShotChart(pres, temp, wt, flow, durationSec) {
  const W = 320, H = 150, L = 30, R = 30, TOP = 12, BOT = 24;
  const plotW = W - L - R, plotH = H - TOP - BOT;
  const pr = _scale(downsample(pres || [], 150));
  const te = _scale(downsample(temp || [], 150));
  const we = _scale(downsample(wt   || [], 150));
  const fl = _scale(downsample(flow || [], 150));
  const n  = Math.max(pr.length, te.length, we.length, fl.length);
  if (n < 2) return '';
  const dur   = durationSec && durationSec > 0 ? durationSec : (n - 1);
  const times = Array.from({ length: n }, (_, i) => (i / (n - 1)) * dur);
  const PMAX  = 12;
  const rMax  = Math.max(110, Math.ceil(((te.length ? Math.max(...te) : 0) + 5) / 10) * 10);

  const xAt = i => L + (i / (n - 1)) * plotW;
  const xT  = s => L + (Math.max(0, Math.min(dur, s)) / dur) * plotW;
  const yL  = v => TOP + plotH - (Math.max(0, Math.min(PMAX, v)) / PMAX) * plotH;
  const yR  = v => TOP + plotH - (Math.max(0, Math.min(rMax, v)) / rMax) * plotH;
  const line = (arr, map, color, sw) => arr.length < 2 ? '' :
    `<polyline points="${arr.map((v, i) => `${xAt(i).toFixed(1)},${map(v).toFixed(1)}`).join(' ')}"
      fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;

  const ph = detectPhases(times, pr);
  let phases = '';
  if (ph) {
    const xp = xT(ph.preinfusion);
    phases = `<rect x="${L}" y="${TOP}" width="${(xp - L).toFixed(1)}" height="${plotH}" fill="color-mix(in srgb, var(--glp-series-pres, ${CC.pres}) 13%, transparent)"/>`
           + `<rect x="${xp.toFixed(1)}" y="${TOP}" width="${(L + plotW - xp).toFixed(1)}" height="${plotH}" fill="color-mix(in srgb, var(--glp-series-flow, ${CC.flow}) 10%, transparent)"/>`;
  }

  let grid = '', leftLbl = '';
  [0, 3, 6, 9, 12].forEach(b => {
    const y = yL(b);
    grid    += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${L + plotW}" y2="${y.toFixed(1)}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 6%, transparent)" stroke-width="0.5"/>`;
    leftLbl += `<text x="${L - 4}" y="${(y + 2.5).toFixed(1)}" text-anchor="end" font-size="7" fill="var(--glp-sub, #a1a1aa)">${b}</text>`;
  });
  let rightLbl = '';
  [0, 0.5, 1].forEach(fr => {
    const val = Math.round(rMax * fr), y = yR(val);
    rightLbl += `<text x="${L + plotW + 4}" y="${(y + 2.5).toFixed(1)}" text-anchor="start" font-size="7" fill="var(--glp-sub, #a1a1aa)">${val}</text>`;
  });
  const step = dur <= 15 ? 3 : dur <= 30 ? 5 : dur <= 60 ? 10 : 15;
  let ticks = '';
  for (let s = 0; s <= dur + 0.001; s += step) {
    const x = xT(s);
    ticks += `<line x1="${x.toFixed(1)}" y1="${TOP + plotH}" x2="${x.toFixed(1)}" y2="${(TOP + plotH + 3).toFixed(1)}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 18%, transparent)" stroke-width="0.5"/>`
           + `<text x="${x.toFixed(1)}" y="${(TOP + plotH + 13).toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--glp-sub, #a1a1aa)">${Math.round(s)}s</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
    <rect x="${L}" y="${TOP}" width="${plotW}" height="${plotH}" fill="color-mix(in srgb, var(--glp-text, #e4e4e7) 3%, transparent)"/>
    ${phases}${grid}
    <line x1="${L}" y1="${TOP + plotH}" x2="${L + plotW}" y2="${TOP + plotH}" stroke="color-mix(in srgb, var(--glp-text, #e4e4e7) 22%, transparent)" stroke-width="0.6"/>
    ${line(we, yR, CC.wt, 1.6)}
    ${line(fl, yL, CC.flow, 1.8)}
    ${line(pr, yL, CC.pres, 2.2)}
    ${line(te, yR, CC.temp, 2)}
    ${leftLbl}${rightLbl}${ticks}
    <text x="${L - 2}" y="${TOP - 3}" text-anchor="start" font-size="6.5" fill="var(--glp-sub, #a1a1aa)">bar</text>
    <text x="${L + plotW + 2}" y="${TOP - 3}" text-anchor="end" font-size="6.5" fill="var(--glp-sub, #a1a1aa)">°C · g</text>
  </svg>`;
}

function buildLiveChart(dp) {
  const ti  = dp.timeInShot;
  const dur = Array.isArray(ti) && ti.length ? ti[ti.length - 1] / 10 : null;
  return buildShotChart(dp.pressure || [], dp.temperature || [],
    dp.shotWeight || dp.weight || [], dp.pumpFlow || dp.weightFlow || [], dur);
}

// Legend with peak/final values + units and phase tags
function chartLegendHtml(dp, durationSec) {
  const p = _scale(dp.p || dp.pressure), t = _scale(dp.t || dp.temperature),
        w = _scale(dp.w || dp.shotWeight || dp.weight), f = _scale(dp.f || dp.pumpFlow || dp.weightFlow);
  const mx = a => a.length ? Math.max(...a) : null;
  const last = a => a.length ? a[a.length - 1] : null;
  const items = [
    p.length ? { c: CC.pres, l: T('leg_pressure'), v: `${mx(p).toFixed(1)} bar` }  : null,
    f.length ? { c: CC.flow, l: T('leg_flow'),     v: `${mx(f).toFixed(1)} ml/s` } : null,
    t.length ? { c: CC.temp, l: T('leg_temp'),     v: `${mx(t).toFixed(0)}°` }     : null,
    w.length ? { c: CC.wt,   l: T('leg_weight'),   v: `${last(w).toFixed(1)} g` }  : null,
  ].filter(Boolean);
  let phaseTags = '';
  if (p.length > 1) {
    const dur = durationSec && durationSec > 0 ? durationSec : (p.length - 1);
    const times = Array.from({ length: p.length }, (_, i) => (i / (p.length - 1)) * dur);
    const ph = detectPhases(times, p);
    if (ph) phaseTags = `<div class="chart-phases">
      <span class="ph-tag ph-pre">${T('ph_pre')} ${fmtClock(ph.preinfusion)}</span>
      <span class="ph-tag ph-ext">${T('ph_ext')} ${fmtClock(ph.extraction)}</span></div>`;
  }
  return `<div class="chart-legend2">${items.map(i =>
    `<span class="cl-item"><span class="cl-dot" style="background:${i.c}"></span>${i.l} <b>${esc(i.v)}</b></span>`
  ).join('')}</div>${phaseTags}`;
}

// ─── styles ───────────────────────────────────────────────────────────────────

const STYLES = `
  /* GLP-TOKENS v1 — shared contract between glp-card.js and glp-order-card.js, keep byte-identical */
  :host {
    --glp-radius:    var(--ha-card-border-radius, 12px);
    --glp-radius-sm: 8px;
    --glp-bg:      var(--ha-card-background, var(--card-background-color, #18181b));
    --glp-surface: var(--secondary-background-color, #27272a);
    --glp-border:  var(--divider-color, #3f3f46);
    --glp-text:    var(--primary-text-color, #e4e4e7);
    --glp-sub:     var(--secondary-text-color, #a1a1aa);
    --glp-accent:  var(--primary-color, #f59e0b);
    /* --glp-accent-text: the readable-on-accent text/icon color, for
       anything rendering directly on a full-strength --glp-accent fill (e.g.
       glp-order-card.js's .order-btn). --glp-accent can be ANY HA theme's
       --primary-color — GLP's own defaults are light/medium amber, but a
       common theme primary like Material "Indigo 900" #1a237e is dark
       (luminance .029), and black text on it measures ~1.1:1 (unreadable) —
       this card previously hardcoded dark text unconditionally, safe only by
       coincidence with GLP's own amber defaults. --glp-accent-text is instead
       picked at runtime by _applySemanticColorContrast() from the LUMINANCE
       OF THE RESOLVED --glp-accent itself (a separate, independent input
       from --glp-bg's luminance, which drives --glp-ok/--glp-warn/--glp-err
       above — theme darkness and accent darkness are orthogonal). Uses pure
       #000/#fff with the same 0.179 WCAG flip-point threshold: at that exact
       crossover luminance, black and white text both measure ~4.58:1 against
       it, and either color's contrast only increases moving away from that
       point — so, unlike --glp-ok/--glp-warn/--glp-err (which had to be
       checked against specific known theme values), #000/#fff at the 0.179
       split is a mathematical guarantee of >=4.58:1 against ANY possible
       accent color. Verified against real-world values: GLP Dark #f59e0b
       (black text 9.78:1), GLP Light #d97706 (6.59:1), HA frontend default
       #03a9f4 (7.99:1) all correctly pick black; Material Indigo 900
       #1a237e correctly picks white (13.24:1) instead of the old hardcoded
       dark text's 1.13:1. glp-card.js has no full-strength accent fill with
       text on it today (--glp-accent is only a progress-bar fill), so this
       token is unused here — kept in sync anyway so the shared block doesn't
       drift, and so _applySemanticColorContrast() stays identical in both
       files. */
    --glp-accent-text: #000;
    /* --glp-ok/--glp-warn/--glp-err deliberately do NOT chain through HA's
       own --success-color/--warning-color/--error-color. Checked both HA
       frontend's own out-of-the-box defaults (same for light AND dark mode —
       home-assistant/frontend src/resources/theme/color/color.globals.ts)
       and glp-ha-theme.yaml's "GLP Light" theme; neither reliably clears the
       4.5:1 WCAG AA floor this card's small/bold badge, banner and
       star-rating text needs against a light background. Measured (relative
       luminance contrast) vs white:
         HA frontend default success-color #43a047: 3.30:1 (fails)
         HA frontend default warning-color #ffa600: 1.96:1 (fails badly)
         HA frontend default error-color   #db4437: 4.29:1 (fails, barely)
         glp-ha-theme.yaml "GLP Light" success-color #16a34a: 3.30:1 (fails)
         glp-ha-theme.yaml "GLP Light" warning-color #d97706: 3.19:1 (fails)
         glp-ha-theme.yaml "GLP Light" error-color   #dc2626: 4.83:1 (passes,
           but the point stands — the fallback chain isn't the guarantee)
       Trusting an arbitrary theme's value would still ship a contrast
       failure under HA's own vanilla defaults, so all three are fixed,
       self-controlled constants, applied by JS based on the LUMINANCE OF
       THE CARD'S OWN RESOLVED --glp-bg (_applySemanticColorContrast(),
       called from _render() right after the shadow DOM is (re)built) —
       not by prefers-color-scheme/OS preference and not by a data-theme
       attribute. Neither exists reliably for a Lovelace custom element, and
       OS preference can flatly mismatch the active HA theme (dark OS +
       light HA theme, or vice versa) — exactly the case this needs to get
       right, since that's the actual bug being fixed here. The dark values
       below are the pre-JS declared defaults; _applySemanticColorContrast()
       overwrites them as an inline style on the host, which always wins
       over these stylesheet declarations regardless of media query state.
       Measured:
         --glp-ok   dark  #22c55e vs dark bg (#18181b): 7.78:1
         --glp-warn dark  #eab308 vs dark bg (#18181b): 9.24:1
         --glp-err  dark  #ef4444 vs dark bg (#18181b): 4.71:1
         --glp-ok   light #15803d vs white:             5.02:1
         --glp-warn light #a16207 vs white:             4.92:1
         --glp-err  light #dc2626 vs white:             4.83:1
       --glp-sub (var(--secondary-text-color)) needed no such handling — it's
       already HA's own theme var and measured fine both ways: dark fallback
       #a1a1aa vs dark bg 6.91:1; GLP Light's secondary-text-color #52525b
       vs white 7.73:1. */
    --glp-ok:      #22c55e;
    --glp-warn:    #eab308;
    --glp-err:     #ef4444;
    --glp-series-pres:   #0072b2;
    --glp-series-flow:   #c77000;
    --glp-series-temp:   #c0392b;
    --glp-series-weight: #009e73;
  }
  /* /GLP-TOKENS v1 */

  /* legacy internal aliases — rest of this file still reads these names;
     hybrid theming happens one level up, in the GLP-TOKENS block above */
  :host {
    --bg:      var(--glp-bg);
    --surface: var(--glp-surface);
    --s2:      color-mix(in srgb, var(--glp-surface) 85%, var(--glp-text) 15%);
    --border:  var(--glp-border);
    --text:    var(--glp-text);
    --sub:     var(--glp-sub);
    --accent:  var(--glp-err);
    --green:   var(--glp-ok);
    --amber:   var(--glp-warn);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  ha-card {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .card {
    background: var(--bg);
    border-radius: var(--glp-radius);
    padding: 18px 16px 14px;
    font-family: var(--paper-font-body1_-_font-family, -apple-system, sans-serif);
    color: var(--text);
    overflow: hidden;
    user-select: none;
    border: 1px solid var(--border);
    box-shadow: var(--ha-card-box-shadow, none);
  }

  /* ── header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: .78rem;
    font-weight: 600;
    color: var(--sub);
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .title svg { opacity: .5; flex-shrink: 0; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .machine-uptime {
    font-size: .62rem; font-weight: 600; color: var(--sub);
    font-variant-numeric: tabular-nums; letter-spacing: .02em;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm); padding: 2px 7px;
  }

  /* status dot */
  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: color-mix(in srgb, var(--text) 15%, transparent); flex-shrink: 0;
  }
  .status-dot.online  {
    background: var(--green);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 30%, transparent);
  }
  .status-dot.brewing {
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .status-dot.error { background: var(--accent); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }

  /* power button */
  .power-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm);
    padding: 7px 12px;
    min-height: 38px;
    cursor: pointer;
    color: var(--sub);
    display: flex; align-items: center;
    transition: all .15s;
    touch-action: manipulation;
  }
  .power-btn:active { background: var(--s2); }
  .power-btn.is-on  { color: var(--green); border-color: color-mix(in srgb, var(--green) 30%, transparent); }
  .off-label { font-size: .72rem; color: var(--sub); letter-spacing: .04em; }
  .card.collapsed .header { margin-bottom: 0; }

  /* ── tab bar ── */
  .tab-bar {
    display: flex; gap: 3px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border-radius: var(--glp-radius); padding: 3px;
    margin-bottom: 16px;
  }
  .tab-btn {
    flex: 1; background: none; border: none; border-radius: var(--glp-radius-sm);
    padding: 8px 0; min-height: 36px;
    color: var(--sub);
    font-family: inherit; font-size: .76rem; font-weight: 600;
    cursor: pointer; transition: all .2s;
    touch-action: manipulation; letter-spacing: .01em;
  }
  .tab-btn.active {
    background: color-mix(in srgb, var(--text) 10%, transparent);
    color: var(--text);
  }

  /* ── swipe target ── */
  .swipe-target { touch-action: pan-y; position: relative; overflow: hidden; }
  .swipe-content { /* animation target — see _navShotAnimated() */ }

  /* ── shot hero ── */
  .shot-hero {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 14px;
  }
  .shot-hero-main { flex: 1; min-width: 0; }
  .shot-score {
    flex-shrink: 0; width: 54px; height: 54px; border-radius: 50%;
    border: 2px solid var(--border); display: flex; flex-direction: column;
    align-items: center; justify-content: center;
  }
  .shot-score-num { font-size: 1.2rem; font-weight: 800; line-height: 1; color: var(--text); }
  .shot-score-lbl { font-size: .5rem; letter-spacing: .08em; text-transform: uppercase; color: var(--sub); margin-top: 2px; }
  .shot-score.high { border-color: var(--green); }
  .shot-score.high .shot-score-num { color: var(--green); }
  .shot-score.mid  { border-color: var(--amber); }
  .shot-score.mid  .shot-score-num { color: var(--amber); }
  .shot-score.low  { border-color: var(--accent); }
  .shot-score.low  .shot-score-num { color: var(--accent); }
  .shot-profile {
    font-size: 1.45rem;
    font-weight: 800;
    letter-spacing: -.02em;
    line-height: 1.15;
    margin-bottom: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .shot-meta {
    display: flex; align-items: center; gap: 8px;
    font-size: .76rem; color: var(--sub);
    overflow: hidden;
  }
  .shot-drink {
    background: color-mix(in srgb, var(--text) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
    border-radius: 6px;
    padding: 1px 7px;
    font-size: .65rem; font-weight: 600;
    letter-spacing: .04em;
    white-space: nowrap; flex-shrink: 0;
  }
  .shot-coffee {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .shot-bean-extra {
    color: var(--sub); font-size: .68rem;
    white-space: nowrap; flex-shrink: 0;
  }
  .shot-grind {
    margin-top: 5px; font-size: .72rem; color: var(--sub);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── nav ── */
  .nav-row {
    display: flex; align-items: center;
    gap: 8px; margin-bottom: 12px;
  }
  .nav-arrow {
    background: none; border: none;
    padding: 0; width: 32px; height: 32px;
    cursor: pointer; color: color-mix(in srgb, var(--text) 35%, transparent);
    font-size: 1.35rem; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: color .15s; touch-action: manipulation; flex-shrink: 0;
  }
  .nav-arrow:active:not([disabled]) { color: var(--text); }
  .nav-arrow[disabled] { opacity: .12; cursor: default; pointer-events: none; }
  .nav-dots {
    flex: 1; display: flex; gap: 5px;
    align-items: center; justify-content: center;
  }
  .nav-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: color-mix(in srgb, var(--text) 18%, transparent);
    flex-shrink: 0;
  }
  .nav-dot.active {
    width: 18px; border-radius: 3px;
    background: var(--text);
  }
  .nav-dot.active.changed {
    animation: dot-grow .22s cubic-bezier(.34,1.56,.64,1) both;
  }
  @keyframes dot-grow {
    from { width: 5px; border-radius: 50%; opacity: .4; }
    to   { width: 18px; border-radius: 3px; opacity: 1; }
  }
  .nav-ts {
    font-size: .67rem; color: var(--sub);
    text-align: center; margin-top: -6px; margin-bottom: 10px; opacity: .7;
  }

  /* ── hero metric trio ── */
  .metric-trio {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }
  .metric-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius);
    padding: 12px 10px 10px;
    text-align: center;
  }
  .metric-num {
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -.04em;
    line-height: 1;
    margin-bottom: 2px;
  }
  .metric-unit {
    font-size: .58rem;
    font-weight: 600;
    color: var(--sub);
    letter-spacing: .08em;
    text-transform: uppercase;
    display: inline;
    vertical-align: super;
    margin-left: 1px;
  }
  .metric-label {
    font-size: .6rem;
    color: var(--sub);
    letter-spacing: .06em;
    text-transform: uppercase;
    margin-top: 4px;
    font-weight: 500;
  }
  /* no semantic color on metric numbers — all neutral white */

  /* secondary stats */
  .stats-secondary {
    display: flex; gap: 8px; margin-bottom: 12px;
  }
  .stat-pill {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius-sm);
    padding: 8px 10px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px;
  }
  .stat-pill-label {
    font-size: .62rem; color: var(--sub);
    letter-spacing: .05em; text-transform: uppercase; font-weight: 500;
  }
  .stat-pill-value {
    font-size: .92rem; font-weight: 700; letter-spacing: -.02em;
  }

  /* rating stars */
  .rating-row {
    display: flex; justify-content: center; align-items: center; gap: 3px;
    margin-bottom: 12px;
  }
  .star { font-size: 1rem; opacity: .2; }
  .star.on { opacity: 1; }
  .star.on.high  { color: var(--green); }
  .star.on.mid   { color: var(--amber); }
  .star.on.low   { color: var(--accent); }

  /* ── chart ── */
  .chart-wrap {
    margin-bottom: 6px;
    border-radius: var(--glp-radius-sm);
    overflow: hidden;
  }
  .chart-legend2 {
    display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center;
    margin-top: 8px;
  }
  .cl-item { font-size: .62rem; color: var(--sub); display: flex; align-items: center; gap: 5px; }
  .cl-item b { color: var(--text); font-weight: 700; }
  .cl-dot { width: 9px; height: 3px; border-radius: 2px; display: inline-block; }
  .chart-phases { display: flex; gap: 8px; justify-content: center; margin-top: 6px; margin-bottom: 10px; }
  .ph-tag { font-size: .58rem; font-weight: 600; padding: 2px 8px; border-radius: var(--glp-radius-sm); letter-spacing: .02em; }
  .ph-pre { color: var(--glp-series-pres); background: color-mix(in srgb, var(--glp-series-pres) 14%, transparent); }
  .ph-ext { color: var(--glp-series-flow); background: color-mix(in srgb, var(--glp-series-flow) 13%, transparent); }

  /* ── profile picker ── */
  /* live machine panel */
  .live-machine { margin-bottom: 14px; }
  .lm-head {
    display: flex; align-items: center; gap: 6px;
    font-size: .6rem; letter-spacing: .06em; text-transform: uppercase;
    color: var(--sub); margin-bottom: 6px;
  }
  .lm-live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--green) 45%, transparent);
    animation: lm-pulse 2s ease-in-out infinite;
  }
  @keyframes lm-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: .35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .lm-live-dot { animation: none; }
  }
  .lm-tiles { display: flex; gap: 8px; }
  .lm-tile {
    flex: 1; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--glp-radius); padding: 9px 6px; text-align: center;
  }
  .lm-tile.warming { border-color: color-mix(in srgb, var(--amber) 35%, transparent); }
  .lm-val { font-size: 1.4rem; font-weight: 700; color: var(--text); letter-spacing: -.02em; line-height: 1.1; }
  .lm-tile.warming .lm-val { color: var(--amber); }
  .lm-unit { font-size: .58rem; color: var(--sub); margin-left: 1px; font-weight: 500; }
  .lm-lbl { font-size: .58rem; color: var(--sub); margin-top: 2px; letter-spacing: .02em; }

  .profile-picker { margin-bottom: 14px; }
  .profile-current-btn {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--glp-radius);
    padding: 11px 14px;
    min-height: 46px;
    cursor: pointer; color: var(--text);
    font-family: inherit; font-size: .88rem; font-weight: 600;
    display: flex; align-items: center; justify-content: space-between;
    touch-action: manipulation; transition: all .15s;
  }
  .profile-current-btn:active { background: var(--s2); }
  .profile-current-btn.open {
    border-color: color-mix(in srgb, var(--text) 18%, transparent);
    border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;
  }
  .profile-label-small { font-size: .58rem; color: var(--sub); font-weight: 500; letter-spacing: .06em; text-transform: uppercase; }
  .profile-current-name { flex: 1; text-align: left; }
  .profile-chevron {
    color: var(--sub); font-size: .8rem; margin-left: 8px;
    transition: transform .2s; opacity: .6;
  }
  .profile-chevron.open { transform: rotate(180deg); }
  .profile-opts {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 10px 12px 12px;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--text) 15%, transparent);
    border-top: none;
    border-bottom-left-radius: var(--glp-radius); border-bottom-right-radius: var(--glp-radius);
  }
  .profile-opt {
    background: color-mix(in srgb, var(--text) 6%, transparent); border: 1px solid var(--border);
    border-radius: 20px; padding: 7px 16px; min-height: 34px;
    cursor: pointer; color: var(--text);
    font-family: inherit; font-size: .8rem; font-weight: 500;
    touch-action: manipulation; transition: all .15s; white-space: nowrap;
  }
  .profile-opt:active { background: color-mix(in srgb, var(--text) 12%, transparent); }
  .profile-opt.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); font-weight: 700;
  }

  /* ── banners ── */
  .brewing-banner {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: var(--glp-radius); padding: 10px 16px;
    font-size: .85rem; font-weight: 700; color: var(--accent);
    text-align: center; margin-bottom: 12px; letter-spacing: .04em;
  }
  .steam-banner {
    background: color-mix(in srgb, var(--amber) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--amber) 20%, transparent);
    border-radius: var(--glp-radius); padding: 8px 14px;
    font-size: .82rem; font-weight: 600; color: var(--amber);
    text-align: center; margin-bottom: 12px;
  }
  .water-low {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
    border-radius: var(--glp-radius); padding: 7px 14px;
    font-size: .78rem; font-weight: 600; color: var(--accent);
    text-align: center; margin-bottom: 12px;
  }

  /* live brewing stats */
  .live-stats {
    display: grid; grid-template-columns: repeat(3,1fr); gap: 8px;
    margin-bottom: 12px;
  }
  .live-stat {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent);
    border-radius: var(--glp-radius); padding: 10px 8px; text-align: center;
  }
  .live-stat .metric-num { font-size: 1.3rem; }

  /* ── preheat ── */
  .preheat-ready {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: color-mix(in srgb, var(--green) 8%, transparent); border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
    color: var(--green); border-radius: var(--glp-radius); padding: 11px 16px;
    font-size: .88rem; font-weight: 700; letter-spacing: .04em; margin-bottom: 14px;
  }
  .preheat-warming { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .preheat-warming-label {
    display: flex; justify-content: space-between;
    font-size: .72rem; color: var(--sub);
  }
  .preheat-bar-bg { height: 3px; background: color-mix(in srgb, var(--text) 7%, transparent); border-radius: 2px; overflow: hidden; }
  .preheat-bar-fill {
    height: 100%; border-radius: 2px;
    background: var(--glp-accent);
    transition: width .8s ease;
  }

  /* ── ready-by preheat scheduler (#61) ── */
  .ready-by {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--glp-radius); padding: 10px 14px; margin-top: 12px; margin-bottom: 14px;
  }
  .ready-by-picker { flex-direction: column; align-items: stretch; gap: 8px; }
  .ready-by-picker-row { display: flex; align-items: center; gap: 8px; }
  .ready-by-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ready-by-label { font-size: .72rem; color: var(--sub); font-weight: 500; }
  .ready-by-set .ready-by-label { color: var(--text); font-size: .82rem; font-weight: 700; }
  .ready-by-countdown { font-size: .68rem; color: var(--sub); }
  .ready-by-time-input {
    background: var(--s2); border: 1px solid var(--border); border-radius: var(--glp-radius-sm);
    color: var(--text); font-family: inherit; font-size: .82rem; padding: 6px 8px;
    min-height: 34px; flex: 1; min-width: 0;
  }
  .ready-by-btn {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: .74rem; padding: 7px 12px; cursor: pointer; min-height: 34px;
    touch-action: manipulation; white-space: nowrap;
  }
  .ready-by-btn.primary { background: var(--green); color: #06210f; }
  .ready-by-btn.ghost   { background: transparent; border: 1px solid var(--border); color: var(--sub); }

  /* ── maintenance ── */
  .maint-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .maint-row {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--glp-radius); padding: 10px 12px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .maint-row-top { display: flex; align-items: center; gap: 8px; }
  .maint-name { flex: 1; font-size: .82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .maint-pill { font-size: .62rem; font-weight: 700; padding: 2px 9px; border-radius: var(--glp-radius-sm); white-space: nowrap; }
  .maint-pill.ok    { color: var(--green); background: color-mix(in srgb, var(--green) 12%, transparent); }
  .maint-pill.soon  { color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }
  .maint-pill.due   { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .maint-pill.never { color: var(--sub); background: color-mix(in srgb, var(--text) 7%, transparent); }
  .maint-sub { font-size: .67rem; color: var(--sub); }
  .maint-bar-bg { height: 2px; background: color-mix(in srgb, var(--text) 7%, transparent); border-radius: 1px; overflow: hidden; }
  .maint-bar { height: 100%; border-radius: 1px; }
  .maint-bar.ok    { background: var(--green); }
  .maint-bar.soon  { background: var(--amber); }
  .maint-bar.due   { background: var(--accent); }
  .maint-bar.never { background: color-mix(in srgb, var(--text) 12%, transparent); }
  .section-label, .maint-section-label { font-size: .62rem; color: var(--sub); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; margin-top: 4px; }
  .maint-row[role="button"] { cursor: pointer; transition: border-color .15s, background .15s; }
  .maint-row[role="button"]:hover { border-color: color-mix(in srgb, var(--text) 16%, transparent); }
  .maint-row.confirming { border-color: color-mix(in srgb, var(--amber) 40%, transparent); background: color-mix(in srgb, var(--amber) 6%, transparent); }
  .maint-confirm { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .maint-confirm-q { flex: 1; font-size: .7rem; color: var(--sub); }
  .maint-confirm-yes, .maint-confirm-no {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: .72rem; padding: 5px 11px; cursor: pointer;
  }
  .maint-confirm-yes { background: var(--green); color: #06210f; }
  .maint-confirm-no  { background: var(--surface); color: var(--sub); }

  /* ── orders tab ── */
  .tab-badge {
    display: inline-block; min-width: 16px; padding: 0 5px; margin-left: 3px;
    font-size: .6rem; font-weight: 800; line-height: 16px; text-align: center;
    border-radius: var(--glp-radius-sm); background: var(--accent); color: #fff;
  }
  .ord-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .ord-row {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--glp-radius); padding: 11px 12px; display: flex; flex-direction: column; gap: 7px;
  }
  .ord-row.pending  { border-color: color-mix(in srgb, var(--amber) 30%, transparent); }
  .ord-top { display: flex; align-items: baseline; gap: 8px; }
  .ord-item { flex: 1; font-size: .9rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord-who  { font-size: .72rem; color: var(--sub); white-space: nowrap; flex-shrink: 0; }
  .ord-note { font-size: .72rem; color: var(--sub); font-style: italic; }
  .ord-sub  { font-size: .72rem; color: var(--green); font-weight: 600; }
  .ord-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .ord-q { font-size: .72rem; color: var(--sub); margin-right: 2px; }
  .ord-btn {
    border: none; border-radius: var(--glp-radius-sm); font-family: inherit; font-weight: 700;
    font-size: .74rem; padding: 6px 11px; cursor: pointer; min-height: 32px;
  }
  .ord-btn.primary { background: var(--green); color: #06210f; }
  .ord-btn.eta     { background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); }
  .ord-btn.danger  { background: var(--accent); color: #fff; }
  .ord-btn.ghost   { background: transparent; border: 1px solid var(--border); color: var(--sub); }

  /* ── footer ── */
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    font-size: .68rem; color: var(--sub);
    border-top: 1px solid color-mix(in srgb, var(--text) 5%, transparent);
    padding-top: 10px; margin-top: 6px; gap: 8px;
  }
  .footer-item { display: flex; align-items: center; gap: 4px; }
  .footer a { color: var(--sub); text-decoration: none; }
  .footer a:hover { color: var(--text); }

  /* ── misc ── */
  .unavailable {
    color: var(--sub); font-size: .85rem;
    text-align: center; padding: 20px 0; opacity: .6;
  }
  .no-shot { text-align: center; padding: 20px 0; }
  .no-shot-label { font-size: .82rem; color: var(--sub); margin-bottom: 4px; }
  .no-shot-hint  { font-size: .68rem; color: color-mix(in srgb, var(--text) 20%, transparent); }

  /* ── touch targets ── */
  @media (pointer: coarse) {
    .card { padding: 16px 14px 12px; }
    .nav-arrow { width: 40px; height: 40px; font-size: 1.5rem; }
    .tab-btn   { min-height: 44px; }
    .profile-current-btn { min-height: 50px; }
    .profile-opt { min-height: 40px; padding: 9px 18px; }
    .power-btn { min-height: 42px; }
    .metric-num { font-size: 1.9rem; }
  }
`;

// ─── card ──────────────────────────────────────────────────────────────────────

class GlpCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._profileInteracting = false;
    this._readyByInteracting = false;
    this._profileOpen  = false;
    this._animating     = false;
    // set when a render was requested while _renderBlocked() (#72) — replayed
    // once by _requestRender() as soon as the blocking interaction ends,
    // instead of being discarded like it was before.
    this._pendingRender = false;
    this._shotIndex     = 0;
    this._prevShotIndex = -1;
    this._recentShots   = [];
    this._lastLatestId  = null;
    this._activeTab    = 'shot';
    this._pendingProfile = null;
    this._maintConfirm = null;
    this._machineOnSince = null;
    this._uptimeTimer = null;
    this._orders = [];
    this._ordersSig = null;
    this._ordersPoll = null;
    this._beansInfo = null;
    this._beansInfoById = null;
    this._beansInfoAt = 0;
    this._beansInfoUnavailable = false;
    this._orderEtaFor = null;
    this._orderDeclineFor = null;
    this._switchEntity = localStorage.getItem('glp_switch_entity') || null;
    this._readyByTimer = null;
    this._readyByPlannedAt = null;
    this._readyByTargetAt = null;
    // optimistic ready-by state (#66): a Date while a "Set" is pending
    // confirmation, `false` while a "Cancel" is pending confirmation, `null`
    // when nothing is pending — see _readReadyBy().
    this._pendingReadyByTargetAt = null;
    this._pendingReadyByTimer = null;
    // last-known-good cache (#68): 'unavailable' is a transient connectivity
    // blip, not a real "nothing scheduled" signal — see _readReadyBy().
    this._lastKnownReadyByTargetAt = null;
    this._lastKnownReadyByPlannedAt = null;

    // Delegated power-button/ready-by handlers on shadowRoot — survive every innerHTML replacement
    this.shadowRoot.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-action="toggle-switch"]')) {
        e.preventDefault();
        e.stopPropagation();
        if (this._hass && this._switchEntity)
          this._hass.callService('switch', 'toggle', { entity_id: this._switchEntity });
        return;
      }
      if (e.target.closest('[data-action="set-ready-by"]')) {
        e.preventDefault();
        e.stopPropagation();
        const input = this.shadowRoot.getElementById('glp-readyby-input');
        const target = this._resolveReadyByTarget(input?.value, new Date());
        if (this._hass && target) {
          this._hass.callService('gaggiuino_profiler', 'set_ready_by', {
            target_time: target.toISOString(),
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          });
          this._pendingReadyByTargetAt = target;   // optimistic: show immediately until the sensor confirms
          clearTimeout(this._pendingReadyByTimer);
          this._pendingReadyByTimer = setTimeout(() => { this._pendingReadyByTargetAt = null; this._render(); }, 8000);
          this._render();
        }
        return;
      }
      if (e.target.closest('[data-action="cancel-ready-by"]')) {
        e.preventDefault();
        e.stopPropagation();
        if (this._hass) {
          this._hass.callService('gaggiuino_profiler', 'set_ready_by', {
            ...(this._config?.machine != null ? { machine: this._config.machine } : {}),
          });
          this._pendingReadyByTargetAt = false;   // optimistic: show the picker immediately until the sensor confirms
          clearTimeout(this._pendingReadyByTimer);
          this._pendingReadyByTimer = setTimeout(() => { this._pendingReadyByTargetAt = null; this._render(); }, 8000);
          this._render();
        }
      }
    });
  }

  _bindPowerBtn() { /* no-op — handler is delegated on shadowRoot in constructor */ }

  _bindProfilePicker() {
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-profile"]');
    if (toggle) {
      toggle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        this._profileOpen = !this._profileOpen;
        this._profileInteracting = this._profileOpen;
        this._render();
      });
    }
    this.shadowRoot.querySelectorAll('[data-profile-opt]').forEach(opt => {
      opt.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const val = e.currentTarget.dataset.profileOpt;
        if (this._hass) {
          const entityId = this._resolvePrefix().replace(/^sensor\./, 'select.') + 'profile';
          this._hass.callService('select', 'select_option', { entity_id: entityId, option: val });
          this._pendingProfile = val;   // optimistic: show immediately until the machine confirms
          clearTimeout(this._pendingProfileTimer);
          this._pendingProfileTimer = setTimeout(() => { this._pendingProfile = null; this._render(); }, 8000);
        }
        this._profileOpen = false;
        this._profileInteracting = false;
        this._render();
      });
    });
  }

  _bindReadyByPicker() {
    const input = this.shadowRoot.getElementById('glp-readyby-input');
    if (!input) return;
    input.addEventListener('focus', () => { this._readyByInteracting = true; });
    input.addEventListener('blur', () => {
      this._readyByInteracting = false;
      if (this._pendingRender) this._requestRender();
    });
  }

  _bindTabBtns() {
    this.shadowRoot.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const tab = e.currentTarget.dataset.tab;
        if (tab !== this._activeTab) { this._activeTab = tab; this._maintConfirm = null; this._render(); }
      });
    });
  }

  _startUptimeTicker() {
    if (this._uptimeTimer) return;
    this._uptimeTimer = setInterval(() => {
      const el = this.shadowRoot.getElementById('glp-uptime');
      if (el && this._machineOnSince) el.textContent = `🔌 ${fmtUptime(Date.now() - this._machineOnSince)}`;
    }, 1000);
  }

  _startReadyByTicker() {
    if (this._readyByTimer) return;
    this._readyByTimer = setInterval(() => {
      const el = this.shadowRoot.getElementById('glp-readyby-countdown');
      if (el) el.textContent = this._readyByCountdownText(this._readyByPlannedAt, this._readyByTargetAt);
    }, 1000);
  }

  connectedCallback() { this._startOrdersPoll(); }

  disconnectedCallback() {
    if (this._uptimeTimer) { clearInterval(this._uptimeTimer); this._uptimeTimer = null; }
    if (this._ordersPoll) { clearInterval(this._ordersPoll); this._ordersPoll = null; }
    if (this._readyByTimer) { clearInterval(this._readyByTimer); this._readyByTimer = null; }
  }

  // ── ready-by preheat scheduler (#61) ───────────────────────────────────────
  // Reads sensor.<prefix>preheat_ready_by_target_at / _planned_switch_on_at
  // (integration >= 1.22.0 — see README); both are ISO-datetime-string
  // sensors, 'unknown' when nothing is scheduled.
  //
  // 'unknown' vs 'unavailable' (#68): 'unknown' is a real signal — the
  // backend genuinely has nothing scheduled (or the schedule just fired/was
  // cancelled) — and clears the display. 'unavailable' means the entity is
  // transiently unreachable (a coordinator poll blip, integration reload,
  // etc.) and must NOT be read as "nothing scheduled"; it falls back to the
  // last successfully-parsed value, cached per-sensor on the instance.
  _readReadyBy() {
    const read = suffix => {
      const s = this._s(suffix);
      if (s && s.state !== 'unknown' && s.state !== 'unavailable') {
        const d = new Date(s.state);
        if (!isNaN(d.getTime())) return { kind: 'value', date: d };
      }
      if (s && s.state === 'unavailable') return { kind: 'unavailable' };
      return { kind: 'unknown' };
    };

    const targetRead = read('preheat_ready_by_target_at');
    if (targetRead.kind === 'value') this._lastKnownReadyByTargetAt = targetRead.date;
    else if (targetRead.kind === 'unknown') this._lastKnownReadyByTargetAt = null;
    const realTargetAt = targetRead.kind === 'value' ? targetRead.date
      : targetRead.kind === 'unavailable' ? (this._lastKnownReadyByTargetAt || null)
      : null;

    const plannedRead = read('preheat_planned_switch_on_at');
    if (plannedRead.kind === 'value') this._lastKnownReadyByPlannedAt = plannedRead.date;
    else if (plannedRead.kind === 'unknown') this._lastKnownReadyByPlannedAt = null;
    const realPlannedAt = plannedRead.kind === 'value' ? plannedRead.date
      : plannedRead.kind === 'unavailable' ? (this._lastKnownReadyByPlannedAt || null)
      : null;

    // Optimistic override (#66): prefer the just-picked/just-cancelled value
    // over the live sensor read until the sensor confirms it (or a timeout
    // gives up) — same pattern as _pendingProfile. `_pendingReadyByTargetAt`
    // is a Date while "Set" is pending, `false` while "Cancel" is pending.
    if (this._pendingReadyByTargetAt === false) {
      if (!realTargetAt) { clearTimeout(this._pendingReadyByTimer); this._pendingReadyByTargetAt = null; }
      else return { targetAt: null, plannedAt: null };
    } else if (this._pendingReadyByTargetAt) {
      // Compare by value, not truthiness (#70): a stale realTargetAt (old
      // target still live, or the #68 unavailable-fallback cache holding the
      // pre-reschedule value) must not clear a pending re-schedule to a
      // *different* new target — only the matching value counts as confirmed.
      if (realTargetAt && realTargetAt.getTime() === this._pendingReadyByTargetAt.getTime()) {
        clearTimeout(this._pendingReadyByTimer); this._pendingReadyByTargetAt = null;
      } else return { targetAt: this._pendingReadyByTargetAt, plannedAt: null };
    }
    return { targetAt: realTargetAt, plannedAt: realPlannedAt };
  }

  // Combines a picked "HH:MM" time-of-day with a reference `now` into a
  // concrete Date: today if that time hasn't passed yet, tomorrow if it has
  // (a "ready by 07:00" picked at 22:00 means tomorrow 07:00). Pure/testable
  // on purpose — no DOM/hass access.
  _resolveReadyByTarget(timeString, now = new Date()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeString || '').trim());
    if (!m) return null;
    const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (hh > 23 || mm > 59) return null;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target;
  }

  // `targetAt` is only needed to distinguish "nothing scheduled" (blank) from
  // "target set but the server hasn't reported plannedAt yet" (e.g. right
  // after an optimistic Set click, #66) — shown as a neutral "scheduling…".
  _readyByCountdownText(plannedAt, targetAt) {
    if (!plannedAt) return targetAt ? T('ready_by_scheduling') : '';
    const diffMs = plannedAt.getTime() - Date.now();
    if (diffMs <= 0) return T('ready_by_switching_now');
    return T('ready_by_switching_in', Math.ceil(diffMs / 60000));
  }

  _buildReadyByHtml(targetAt, plannedAt) {
    if (targetAt) {
      const hhmm = targetAt.toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
      return `<div class="ready-by ready-by-set">
        <div class="ready-by-info">
          <span class="ready-by-label">${T('ready_by_target', esc(hhmm))}</span>
          <span class="ready-by-countdown" id="glp-readyby-countdown">${esc(this._readyByCountdownText(plannedAt, targetAt))}</span>
        </div>
        <button class="ready-by-btn ghost" data-action="cancel-ready-by">${T('ready_by_cancel')}</button>
      </div>`;
    }
    return `<div class="ready-by ready-by-picker">
      <span class="ready-by-label">${T('ready_by_set_label')}</span>
      <div class="ready-by-picker-row">
        <input type="time" class="ready-by-time-input" id="glp-readyby-input"/>
        <button class="ready-by-btn primary" data-action="set-ready-by">${T('ready_by_set')}</button>
      </div>
    </div>`;
  }

  // ── Barista orders (via the integration REST proxy) ───────────────────────
  _startOrdersPoll() {
    if (this._ordersPoll || !this._hass?.fetchWithAuth) { if (!this._ordersPoll) setTimeout(() => this._startOrdersPoll(), 1500); return; }
    this._fetchOrders(true);
    this._ordersPoll = setInterval(() => this._fetchOrders(false), 6000);
  }

  async _fetchOrders(force) {
    if (!this._hass?.fetchWithAuth) return;
    let list;
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/orders');
      if (!r.ok) return;
      list = await r.json();
    } catch { return; }
    const active = (Array.isArray(list) ? list : [])
      .filter(o => o.status === 'pending' || o.status === 'accepted')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const sig = JSON.stringify(active.map(o => [o.id, o.status, o.eta, o.acceptedAt]));
    if (!force && sig === this._ordersSig) return;
    this._ordersSig = sig;
    this._orders = active;
    this._requestRender();
  }

  async _orderAction(id, action, body) {
    if (!this._hass?.fetchWithAuth || !id) return;
    this._orderEtaFor = null;
    this._orderDeclineFor = null;
    try {
      await this._hass.fetchWithAuth(`/api/glp/orders/${encodeURIComponent(id)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
    } catch { /* ignore — next poll reconciles */ }
    await this._fetchOrders(true);
  }

  _buildOrdersHtml() {
    if (!this._orders.length) return `<div class="unavailable">${T('orders_none')}</div>`;
    const declineRow = id => `<div class="ord-actions"><span class="ord-q">${T('ord_decline_q')}</span>
      <button class="ord-btn danger" data-ord-decline-yes="${esc(id)}">${T('ord_yes')}</button>
      <button class="ord-btn ghost" data-ord-cancel="1">✕</button></div>`;
    return `<div class="ord-list">${this._orders.map(o => {
      const label = o.variant ? `${o.item} · ${o.variant}` : o.item;
      const head = `<div class="ord-top"><span class="ord-item">☕ ${esc(label)}</span>${o.customer ? `<span class="ord-who">${esc(o.customer)}</span>` : ''}</div>
        ${o.note ? `<div class="ord-note">„${esc(o.note)}"</div>` : ''}`;
      if (o.status === 'pending') {
        const actions = this._orderDeclineFor === o.id ? declineRow(o.id)
          : this._orderEtaFor === o.id
            ? `<div class="ord-actions"><span class="ord-q">${T('ord_done_in')}</span>${[3,5,8,10].map(m => `<button class="ord-btn eta" data-ord-accept="${esc(o.id)}" data-eta="${m}">${m} min</button>`).join('')}<button class="ord-btn ghost" data-ord-cancel="1">✕</button></div>`
            : `<div class="ord-actions"><button class="ord-btn primary" data-ord-eta="${esc(o.id)}">${T('ord_accept')}</button><button class="ord-btn ghost" data-ord-decline="${esc(o.id)}">${T('ord_decline')}</button></div>`;
        return `<div class="ord-row pending">${head}${actions}</div>`;
      }
      const minsLeft = (o.acceptedAt && o.eta) ? Math.max(0, Math.ceil((o.acceptedAt + o.eta * 60000 - Date.now()) / 60000)) : null;
      const actions = this._orderDeclineFor === o.id ? declineRow(o.id)
        : `<div class="ord-actions"><button class="ord-btn primary" data-ord-done="${esc(o.id)}">${T('ord_done')}</button><button class="ord-btn ghost" data-ord-decline="${esc(o.id)}">${T('ord_decline')}</button></div>`;
      return `<div class="ord-row accepted">${head}
        <div class="ord-sub">${minsLeft != null ? T('ord_ready_in', minsLeft) : T('ord_preparing')}</div>${actions}</div>`;
    }).join('')}</div>`;
  }

  _bindOrderBtns() {
    const tap = (sel, fn) => this.shadowRoot.querySelectorAll(sel).forEach(b =>
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(b); }));
    tap('[data-ord-eta]',         b => { this._orderEtaFor = b.dataset.ordEta; this._render(); });
    tap('[data-ord-accept]',      b => this._orderAction(b.dataset.ordAccept, 'accept', { eta: parseInt(b.dataset.eta) }));
    tap('[data-ord-done]',        b => this._orderAction(b.dataset.ordDone, 'complete', {}));
    tap('[data-ord-decline]',     b => { this._orderDeclineFor = b.dataset.ordDecline; this._render(); });
    tap('[data-ord-decline-yes]', b => this._orderAction(b.dataset.ordDeclineYes, 'decline', {}));
    tap('[data-ord-cancel]',      ()  => { this._orderEtaFor = null; this._orderDeclineFor = null; this._render(); });
  }

  _bindMaintRows() {
    this.shadowRoot.querySelectorAll('[data-maint-task]').forEach(el => {
      el.addEventListener('pointerdown', e => {
        if (e.target.closest('[data-maint-done],[data-maint-cancel]')) return;
        e.preventDefault();
        const task = el.dataset.maintTask;
        this._maintConfirm = this._maintConfirm === task ? null : task;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll('[data-maint-done]').forEach(b => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const task = b.dataset.maintDone;
        if (this._hass && task)
          this._hass.callService('gaggiuino_profiler', 'maintenance_done', { task });
        this._maintConfirm = null;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll('[data-maint-cancel]').forEach(b => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        this._maintConfirm = null;
        this._render();
      });
    });
  }

  _bindNavBtns() {
    this.shadowRoot.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        if (btn.hasAttribute('disabled')) return;
        e.preventDefault();
        this._navShot(btn.dataset.nav);
      });
    });
  }

  _bindSwipe() {
    const el = this.shadowRoot.querySelector('.swipe-target');
    if (!el) return;
    let sx = 0, sy = 0;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (this._profileOpen) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      this._navShot(dx > 0 ? 'next' : 'prev');
    }, { passive: true });
  }

  _navShot(dir) {
    if (this._animating) return;               // ignore nav while an animation is in flight
    if (this._activeTab !== 'shot') return;    // don't swipe-navigate shots on maint/orders tabs
    const max = this._recentShots.length - 1;
    if (dir === 'prev' && this._shotIndex < max) this._navShotAnimated(dir, this._shotIndex + 1);
    if (dir === 'next' && this._shotIndex > 0)   this._navShotAnimated(dir, this._shotIndex - 1);
  }

  _navShotAnimated(dir, newIndex) {
    const oldContent = this.shadowRoot.querySelector('.swipe-content');
    const oldClone   = oldContent ? oldContent.cloneNode(true) : null;

    // Guard set hass() from re-rendering (and wiping the animation) until it finishes
    this._animating = true;
    this._shotIndex = newIndex;
    this._render();

    const newSwipe   = this.shadowRoot.querySelector('.swipe-target');
    const newContent = this.shadowRoot.querySelector('.swipe-content');
    if (!oldClone || !newSwipe || !newContent) {
      this._animating = false;
      if (this._pendingRender) this._requestRender();
      return;
    }

    // prev = going to older shot → new content enters from right, old exits left
    const enterX = dir === 'prev' ? '36px' : '-36px';
    const exitX  = dir === 'prev' ? '-36px' : '36px';

    // Old clone: absolute overlay on top of new content, aligned to top
    oldClone.style.cssText = 'position:absolute;top:0;left:0;right:0;pointer-events:none;z-index:2;';
    newSwipe.appendChild(oldClone);

    // New content starts slightly offset and faded
    newContent.style.transform = `translateX(${enterX})`;
    newContent.style.opacity   = '0';

    const T = 'transform .22s cubic-bezier(.25,.46,.45,.94), opacity .18s ease-out';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      newContent.style.transition = T;
      newContent.style.transform  = 'translateX(0)';
      newContent.style.opacity    = '1';
      oldClone.style.transition   = T;
      oldClone.style.transform    = `translateX(${exitX})`;
      oldClone.style.opacity      = '0';
      setTimeout(() => {
        if (oldClone.parentNode) oldClone.remove();
        ['transform', 'transition', 'opacity'].forEach(p => newContent.style.removeProperty(p));
        this._animating = false;
        if (this._pendingRender) this._requestRender();
      }, 250);
    }));
  }

  setConfig(config) {
    this._config = { title: 'Gaggiuino', ...config };
    // Re-resolve the switch entity from the machine-scoped storage key now
    // that `machine` (if any) is known — the constructor ran before
    // setConfig() and could only read the unscoped global key.
    this._switchEntity = localStorage.getItem(this._switchStorageKey())
      || localStorage.getItem('glp_switch_entity') || null;
  }

  set hass(hass) {
    this._hass = hass;
    { const l = String(hass?.language || hass?.locale?.language || 'de').slice(0, 2).toLowerCase(); LANG = SUPPORTED_LANGS.includes(l) ? l : 'en'; }
    if (!this._ordersPoll) this._startOrdersPoll();
    this._loadBeansInfo();
    this._requestRender();
  }

  // ── Bean metadata (via the integration REST proxy, app >= 1.96) ───────────
  async _loadBeansInfo() {
    if (!this._hass?.fetchWithAuth) return;
    if (this._beansInfoUnavailable) return;                       // proxy/app too old — feature off
    if (this._beansInfoAt && Date.now() - this._beansInfoAt < 300000) return;
    this._beansInfoAt = Date.now();
    try {
      const r = await this._hass.fetchWithAuth('/api/glp/library/beans-info');
      if (!r.ok) { this._beansInfoUnavailable = true; return; }
      const list = await r.json();
      const beans = Array.isArray(list) ? list : [];
      this._beansInfoById = new Map(beans.filter(b => b.id != null).map(b => [b.id, b]));
      this._beansInfo = new Map(beans.map(b => [String(b.name || '').toLowerCase(), b]));
    } catch { /* transient — retry after the cache window */ }
  }

  // #55 (follow-up to gaggiuino-local-profiler#456): prefers the stable
  // beanId link over the free-text coffee name — mirrors the app's
  // resolveBeanForAnnotation, since a delete+reimport under the same name
  // gets a new id but keeps stale references matching by name alone. Falls
  // back to name matching when beanId isn't available (shots that predate
  // beanId on the annotation, or an integration too old to expose it).
  _beanExtraHtml(coffee, beanId) {
    const bean = (beanId != null && this._beansInfoById?.get(beanId))
      || this._beansInfo?.get(String(coffee || '').toLowerCase());
    if (!bean) return '';
    const parts = [];
    const fl = flagEmoji(bean.origin);
    if (fl) parts.push(fl);
    if (bean.variety) parts.push(esc(bean.variety));
    const age = roastAgeDays(bean.roastDate);
    if (age != null) parts.push(`${age}d`);
    if (!parts.length) return '';
    const title = age != null ? T('bean_roasted_ago', age) : '';
    return `<span class="shot-bean-extra"${title ? ` title="${esc(title)}"` : ''}>${parts.join(' · ')}</span>`;
  }

  // machine (#50): optional config option naming/slugging a specific
  // machine, for setups with more than one GLP machine device (see the app's
  // multi-machine mode, GLP #317, and glp-integration #47's forthcoming
  // per-machine devices). When set, matches a *_machine_status entity whose
  // friendly_name or entity_id references it, before falling back to the
  // existing "first Gaggiuino-named entity, else any" heuristic — so cards
  // without this option (the vast majority today, single-machine setups)
  // behave exactly as before.
  _resolvePrefix() {
    if (this._config.entity_prefix) return this._config.entity_prefix;
    const candidates = Object.keys(this._hass.states).filter(id => id.endsWith('_machine_status'));
    if (this._config?.machine) {
      // GLP-SHARED:machine-match v1 — needle/needleSlug + find() predicate
      // kept byte-identical with glp-order-card.js's
      // _findMachineStatusEntity(); what each side does with `matched`
      // afterward differs (a prefix here vs the raw entity id there), so
      // only the predicate itself is shared.
      const needle = String(this._config.machine).toLowerCase();
      const needleSlug = needle.replace(/\s+/g, '_');
      const matched = candidates.find(id =>
        this._hass.states[id]?.attributes?.friendly_name?.toLowerCase().includes(needle) ||
        id.toLowerCase().includes(needleSlug));
      // /GLP-SHARED:machine-match v1
      if (matched) return matched.replace(/machine_status$/, '');
    }
    const found = candidates.find(id =>
      this._hass.states[id]?.attributes?.friendly_name?.toLowerCase().includes('gaggiuino'));
    if (found) return found.replace(/machine_status$/, '');
    const fallback = candidates[0];
    return fallback ? fallback.replace(/machine_status$/, '') : 'sensor.gaggiuino_local_profiler_';
  }

  // Machine-scoped localStorage key (#50) so the switch entity choice for
  // one machine's card doesn't collide with another's on the same
  // dashboard. Falls back to the original global key when `machine` isn't
  // configured — unchanged behavior for existing single-machine cards.
  _switchStorageKey() {
    const machine = this._config?.machine;
    if (!machine) return 'glp_switch_entity';
    return `glp_switch_entity_${String(machine).toLowerCase().replace(/\s+/g, '_')}`;
  }

  _s(suffix) { return this._hass.states[this._resolvePrefix() + suffix]; }

  _val(suffix, fallback = '—') {
    const s = this._s(suffix);
    return s && s.state !== 'unknown' && s.state !== 'unavailable' ? s.state : fallback;
  }

  _num(suffix, decimals = 1, fallback = null) {
    const v = this._val(suffix, null);
    if (v === null) return fallback;
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n.toFixed(decimals);
  }

  _reltime(suffix) {
    const s = this._s(suffix);
    if (!s || s.state === 'unknown' || s.state === 'unavailable') return null;
    const diff = Math.round((Date.now() - new Date(s.state).getTime()) / 60000);
    if (diff < 1) return T('just_now');
    if (diff < 60) return T('mins_ago', diff);
    const h = Math.round(diff / 60);
    return h < 24 ? T('hours_ago', h) : T('days_ago', Math.round(h / 24));
  }

  static MAINT_TASKS = [
    ['maintenance_descaling',    'maint_descaling',   '🧪', 'descaling'],
    ['maintenance_backflush',    'maint_backflush',   '🔄', 'backflush'],
    ['maintenance_group_head',   'maint_grouphead',   '🚿', 'grouphead'],
    ['maintenance_gaskets',      'maint_gaskets',     '⭕', 'gaskets'],
    ['maintenance_water_filter', 'maint_waterfilter', '💧', 'waterfilter'],
  ];

  _maintAvailable() {
    return GlpCard.MAINT_TASKS.some(([s]) => this._s(s)) || !!this._s('maintenance_grinders');
  }
  _maintAnyDue() {
    return GlpCard.MAINT_TASKS.some(([s]) => this._s(s)?.state === 'due')
      || this._s('maintenance_grinders')?.state === 'due';
  }

  _buildMaintHtml() {
    const pills = { ok: T('pill_ok'), soon: T('pill_soon'), due: T('pill_due'), never: T('pill_never') };
    const row = (icon, name, status, pct, daysSince, shotsSince, task) => {
      const cls  = pills[status] ? status : 'never';
      const pctW = Math.max(0, Math.min(100, Math.round((parseFloat(pct) || 0) * 100)));
      const sub  = [
        daysSince != null ? (daysSince === 0 ? T('maint_today') : T('days_ago', daysSince)) : null,
        shotsSince != null && shotsSince > 0 ? `${shotsSince} Shots` : null,
      ].filter(Boolean).join(' · ');
      const confirming = task && this._maintConfirm === task;
      return `<div class="maint-row${confirming ? ' confirming' : ''}"${task ? ` data-maint-task="${esc(task)}" role="button"` : ''}>
        <div class="maint-row-top">
          <span>${icon}</span>
          <span class="maint-name">${esc(name)}</span>
          <span class="maint-pill ${cls}">${pills[status] || '—'}</span>
        </div>
        ${sub ? `<div class="maint-sub">${esc(sub)}</div>` : ''}
        <div class="maint-bar-bg"><div class="maint-bar ${cls}" style="width:${pctW}%"></div></div>
        ${confirming ? `<div class="maint-confirm">
          <span class="maint-confirm-q">${T('maint_confirm_q')}</span>
          <button class="maint-confirm-yes" data-maint-done="${esc(task)}">${T('ord_yes')}</button>
          <button class="maint-confirm-no" data-maint-cancel="1">✕</button>
        </div>` : ''}
      </div>`;
    };
    const rows = GlpCard.MAINT_TASKS.map(([suffix, nameKey, icon, task]) => {
      const s = this._s(suffix);
      if (!s || s.state === 'unavailable' || s.state === 'unknown') return '';
      const a = s.attributes || {};
      return row(icon, T(nameKey), s.state, a.pct, a.days_since, a.shots_since, task);
    }).filter(Boolean);
    const gAttrs = this._s('maintenance_grinders')?.attributes || {};
    const gRows  = Object.entries(gAttrs)
      .filter(([, v]) => v && typeof v === 'object' && 'status' in v)
      .map(([name, v]) => row('⚙️', name, v.status, v.pct, v.days_since, v.shots_since, v.task));
    if (!rows.length && !gRows.length)
      return `<div class="unavailable">${T('maint_none')}</div>`;
    return `<div class="maint-list">
      ${rows.join('')}
      ${gRows.length ? `<div class="maint-section-label">${T('maint_grinders')}</div>${gRows.join('')}` : ''}
    </div>`;
  }

  /* GLP-SHARED:contrast v1 — kept byte-identical with glp-order-card.js's
     _luminanceOf()/_applySemanticColorContrast() */
  // Resolves the relative luminance of a CSS color string by normalizing it
  // through a scratch element's computed style (handles hex/rgb/named/etc —
  // whatever the real cascade actually resolved a custom property to).
  // Returns null if it can't be determined (no DOM, unset value, ...).
  _luminanceOf(cssColor) {
    if (!cssColor) return null;
    let rgb;
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'display:none';
      probe.style.color = cssColor;
      this.shadowRoot.appendChild(probe);
      rgb = getComputedStyle(probe).color;
      probe.remove();
    } catch { return null; }
    const m = rgb && rgb.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const [r, g, b] = m.map(Number);
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Picks the contrast-safe --glp-ok/--glp-warn/--glp-err/--glp-accent-text
  // variants at runtime, each keyed off the LUMINANCE OF THE ACTUAL RESOLVED
  // COLOR they need to read against — not prefers-color-scheme. OS/browser
  // color scheme can mismatch the actual active HA theme (dark system +
  // light HA theme is common), and this card has no data-theme attribute to
  // key off instead. --glp-ok/--glp-warn/--glp-err key off --glp-bg's
  // luminance; --glp-accent-text keys off --glp-accent's luminance
  // separately (theme darkness and accent darkness are orthogonal — see the
  // long comments in the GLP-TOKENS block above for the measured contrast
  // ratios behind all four). Sets the winning values as an inline style on
  // the host, which always outranks the plain :host declarations in STYLES
  // regardless of any stylesheet/media-query state. Called from _render()
  // right after the shadow DOM (and its :host rules) are rebuilt.
  _applySemanticColorContrast() {
    const bgLuminance = this._luminanceOf(getComputedStyle(this).getPropertyValue('--glp-bg').trim());
    if (bgLuminance != null) {
      // 0.179 is the standard WCAG "flip point": the background luminance
      // above which a darker foreground becomes the higher-contrast choice.
      const light = bgLuminance > 0.179;
      this.style.setProperty('--glp-ok',   light ? '#15803d' : '#22c55e');
      this.style.setProperty('--glp-warn', light ? '#a16207' : '#eab308');
      this.style.setProperty('--glp-err',  light ? '#dc2626' : '#ef4444');
    }
    const accentLuminance = this._luminanceOf(getComputedStyle(this).getPropertyValue('--glp-accent').trim());
    if (accentLuminance != null) {
      // Pure #000/#fff at the same 0.179 split is a mathematical guarantee
      // of >=4.58:1 against ANY accent color (both text colors measure
      // exactly that at the crossover luminance, and only gain contrast
      // moving away from it) — no need to check specific theme values here.
      this.style.setProperty('--glp-accent-text', accentLuminance > 0.179 ? '#000' : '#fff');
    }
  }
  /* /GLP-SHARED:contrast v1 */

  // Single source of truth for "a full re-render would currently wipe out an
  // in-progress user interaction" (#72 — this used to be duplicated verbatim
  // at the orders-poll and `set hass` call sites, and any new interactive
  // flag had to be added to both by hand or a render would silently blow
  // away focus/open state, exactly as happened in #64/#66/#68).
  _renderBlocked() {
    return !!(this._profileInteracting || this._animating || this._maintConfirm || this._readyByInteracting);
  }

  // Renders now if nothing is blocking, otherwise defers via `_pendingRender`
  // (ported from glp-order-card.js's `_pendingRender` pattern) so the
  // deferred render is replayed once by whichever call flips the blocking
  // flag back off, instead of being discarded outright.
  _requestRender() {
    if (this._renderBlocked()) { this._pendingRender = true; return; }
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    this._pendingRender = false;

    const prefix    = this._resolvePrefix();
    const bsPrefix  = prefix.replace(/^sensor\./, 'binary_sensor.');
    const selPrefix = prefix.replace(/^sensor\./, 'select.');

    // switch entity
    const resolvedSwitch = this._config.switch_entity
      || this._s('machine_status')?.attributes?.switch_entity || null;
    if (resolvedSwitch && resolvedSwitch !== this._switchEntity) {
      this._switchEntity = resolvedSwitch;
      localStorage.setItem(this._switchStorageKey(), resolvedSwitch);
    }
    const switchState = this._switchEntity ? this._hass.states[this._switchEntity] : null;
    this._machineOnSince = (switchState?.state === 'on' && switchState.last_changed)
      ? Date.parse(switchState.last_changed) : null;
    const machineOff  = !!(this._switchEntity &&
      (switchState?.state === 'off' || switchState?.state === 'unavailable'));

    // ready-by preheat scheduler (#61) — only meaningful while the machine is
    // off; moot once it's on/warming/ready, so it's only rendered below in
    // the machineOff branch, but read here so both branches share one source.
    const { targetAt: readyByTargetAt, plannedAt: readyByPlannedAt } = this._readReadyBy();
    this._readyByPlannedAt = readyByPlannedAt;
    this._readyByTargetAt = readyByTargetAt;

    const _powerBtn = this._switchEntity ? `
      <button class="power-btn ${machineOff ? 'is-off' : 'is-on'}" data-action="toggle-switch"
              title="${machineOff ? T('power_on') : T('power_off')}">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.28 1.09-4.3 2.58-5.42L6.17 5.17A8.932 8.932 0 0 0 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9A8.932 8.932 0 0 0 17.83 5.17z"/>
        </svg>
      </button>` : '';

    // ── machine off ──────────────────────────────────────────────────────────
    if (machineOff) {
      this._profileOpen = false;
      const readyByHtml = this._buildReadyByHtml(readyByTargetAt, readyByPlannedAt);
      const offOrders = this._orders.length > 0 ? `
        <div style="padding:0 12px 12px">
          <div class="section-label" style="margin-bottom:8px">${T('tab_orders')}</div>
          ${this._buildOrdersHtml()}
        </div>` : '';
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <ha-card><div class="card collapsed">
          <div class="header">
            <div class="title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21v-2h2V3h14v2h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2v6h2v2H2zm4-2h8V5H6v14zm10-6h2V7h-2v6z"/>
              </svg>
              ${esc(this._config.title)}
            </div>
            <div class="header-right">
              <span class="off-label">${T('off_label')}</span>${_powerBtn}
            </div>
          </div>
          ${readyByHtml}
          ${offOrders}
        </div></ha-card>`;
      this._applySemanticColorContrast();
      this._bindPowerBtn();
      this._bindReadyByPicker();
      this._startReadyByTicker();
      if (this._orders.length > 0) this._bindOrderBtns();
      return;
    }

    // ── recent shots ─────────────────────────────────────────────────────────
    const machineStatusEnt = this._s('machine_status');
    const freshShots = machineStatusEnt?.attributes?.recent_shots;
    if (Array.isArray(freshShots) && freshShots.length > 0) {
      const latestId = freshShots[0]?.id;
      if (latestId !== undefined && latestId !== this._lastLatestId) {
        this._lastLatestId = latestId;
        this._shotIndex    = 0;
      }
      this._recentShots = freshShots;
    }
    if (this._shotIndex >= this._recentShots.length)
      this._shotIndex = Math.max(0, this._recentShots.length - 1);

    const totalShots = this._recentShots.length;
    const shotObj    = (this._shotIndex < totalShots) ? this._recentShots[this._shotIndex] : null;

    // ── brewing ──────────────────────────────────────────────────────────────
    const brewingEnt     = this._hass.states[bsPrefix + 'brewing'];
    const brewing        = brewingEnt?.state === 'on';
    const liveDatapoints = brewingEnt?.attributes?.datapoints || null;
    const liveProfile    = brewingEnt?.attributes?.profile_name || null;
    const steamOn        = this._hass.states[bsPrefix + 'steam_switch']?.state === 'on';
    const tArr           = liveDatapoints?.timeInShot;
    const elapsedSec     = tArr?.length ? Math.round(tArr[tArr.length - 1] / 10) : null;

    // ── shot values ───────────────────────────────────────────────────────────
    const profile    = shotObj?.profile    ?? this._val('last_shot_profile', null);
    const coffee     = shotObj?.coffee     ?? this._val('last_shot_coffee',  null);
    const drinkType  = shotObj?.drink_type ?? null;
    const grinder    = shotObj?.grinder ?? null;
    const grind      = shotObj?.grind   ?? null;
    const duration = shotObj != null
      ? (shotObj.duration != null ? shotObj.duration.toFixed(1) : null)
      : this._num('last_shot_duration', 1);
    const weight = shotObj != null
      ? (shotObj.yield_g  != null ? shotObj.yield_g.toFixed(1)  : null)
      : this._num('last_shot_yield', 1);
    const ratio = shotObj != null
      ? (shotObj.ratio    != null ? shotObj.ratio.toFixed(2)    : null)
      : this._num('last_shot_brew_ratio', 2);
    const pressure = shotObj != null
      ? (shotObj.pressure != null ? shotObj.pressure.toFixed(1) : null)
      : this._num('last_shot_avg_pressure', 1);
    const rating = shotObj != null
      ? (shotObj.rating || null)
      : (() => { const v = parseInt(this._val('last_shot_rating', null)); return (!isNaN(v) && v >= 1 && v <= 5) ? v : null; })();
    // brew temperature of the *displayed shot* (avg of its temperature curve) — not the live machine value
    const shotTemp = (() => {
      const t = shotObj?.dp?.t;
      if (!Array.isArray(t) || !t.length) return null;
      const avg = t.reduce((a, b) => a + b, 0) / t.length;
      return (avg > 200 ? avg / 10 : avg).toFixed(1);
    })();

    // ── live / machine ───────────────────────────────────────────────────────
    const temp        = this._num('machine_temperature', 1);
    const targetTemp  = this._num('machine_target_temperature', 1);
    const livePressure = this._num('machine_live_pressure', 1);
    const liveWeight   = this._num('machine_live_weight', 1);
    // "Boiler off" profiles report a near-zero target — show "Aus" instead of a meaningless 1°
    const boilerOff   = targetTemp !== null && parseFloat(targetTemp) < 30;
    const waterLevel   = (() => {
      const v = parseFloat(this._val('machine_water_level', null));
      return isNaN(v) ? null : Math.round(v);
    })();

    // ── preheat ───────────────────────────────────────────────────────────────
    const preheatReady   = this._hass.states[bsPrefix + 'preheat_ready']?.state === 'on';
    const preheatHasEnt  = !!this._hass.states[bsPrefix + 'preheat_ready'];
    const preheatRem     = parseFloat(this._val('preheat_remaining', null));
    const preheatEl      = parseFloat(this._val('preheat_elapsed',   null));
    const preheatTotal   = (!isNaN(preheatRem) && !isNaN(preheatEl)) ? preheatEl + preheatRem : null;
    const preheatPct     = preheatTotal ? Math.min(1, preheatEl / preheatTotal) : null;
    const preheatMinLeft = isNaN(preheatRem) ? null : Math.ceil(preheatRem / 60);

    // ── profile picker ────────────────────────────────────────────────────────
    const profileEntity  = this._hass.states[selPrefix + 'profile'];
    const profileOptions = profileEntity?.attributes?.options || null;
    const realProfile = (profileEntity?.state && profileEntity.state !== 'unavailable')
      ? profileEntity.state : null;
    // optimistic: keep showing the just-selected profile until the machine confirms it
    if (this._pendingProfile && realProfile === this._pendingProfile) this._pendingProfile = null;
    const currentProfile = this._pendingProfile || realProfile;
    const profileSwitching = !!this._pendingProfile;
    const profileAvailable = Array.isArray(profileOptions) && profileOptions.length > 0;

    // ── status ────────────────────────────────────────────────────────────────
    const status   = this._val('machine_status', null);
    const dotClass = brewing ? 'brewing' : status === 'online' ? 'online' : status === 'error' ? 'error' : '';
    const today    = this._val('shots_today', '—');
    const syncTime = this._reltime('last_sync');
    const glpUrl   = safeUrl(this._config.glp_url);

    // ── maintenance ───────────────────────────────────────────────────────────
    const maintAvailable = this._maintAvailable();
    const ordersTabAvail = this._orders.length > 0;
    if (brewing && this._activeTab === 'maint') this._activeTab = 'shot';
    if (this._activeTab === 'orders' && !ordersTabAvail) this._activeTab = 'shot';
    const showMaint  = maintAvailable && !brewing && this._activeTab === 'maint';
    const showOrders = ordersTabAvail && this._activeTab === 'orders';
    const pendingOrders = this._orders.filter(o => o.status === 'pending').length;

    const tabBarHtml = (maintAvailable || ordersTabAvail) ? `
      <div class="tab-bar">
        <button class="tab-btn${(!showMaint && !showOrders) ? ' active':''}" data-tab="shot">☕ Shot</button>
        ${ordersTabAvail ? `<button class="tab-btn${showOrders ? ' active':''}" data-tab="orders">🛒 ${T('tab_orders')}${pendingOrders ? ` <span class="tab-badge">${pendingOrders}</span>` : ''}</button>` : ''}
        ${maintAvailable ? `<button class="tab-btn${showMaint ? ' active':''}" data-tab="maint">🔧 ${T('tab_maint')}${this._maintAnyDue() ? ' ⚠':''}</button>` : ''}
      </div>` : '';

    // ── nav dots ──────────────────────────────────────────────────────────────
    const indexChanged = this._shotIndex !== this._prevShotIndex;
    this._prevShotIndex = this._shotIndex;
    const showNav = !brewing && !showMaint && !showOrders && totalShots > 1;
    let navHtml = '';
    if (showNav) {
      const dots = this._recentShots.slice(0, 10).map((_, i) => {
        const active = i === this._shotIndex;
        return `<span class="nav-dot${active ? ` active${indexChanged ? ' changed' : ''}` : ''}"></span>`;
      }).join('');
      const prevDis = this._shotIndex >= totalShots - 1 ? ' disabled' : '';
      const nextDis = this._shotIndex <= 0             ? ' disabled' : '';
      let tsLine = '';
      if (this._shotIndex > 0 && shotObj?.ts) {
        const d = parseTs(shotObj.ts);
        if (d && !isNaN(d))
          tsLine = `<div class="nav-ts">${d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})} ${d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>`;
      }
      navHtml = `
        <div class="nav-row">
          <button class="nav-arrow" data-nav="next"${nextDis}>‹</button>
          <div class="nav-dots">${dots}</div>
          <button class="nav-arrow" data-nav="prev"${prevDis}>›</button>
        </div>${tsLine}`;
    }

    // ── profile picker html ───────────────────────────────────────────────────
    const profilePickerHtml = !brewing && !showMaint && profileAvailable ? `
      <div class="profile-picker">
        <button class="profile-current-btn${this._profileOpen?' open':''}" data-action="toggle-profile">
          <div style="display:flex;flex-direction:column;align-items:flex-start;gap:1px">
            <span class="profile-label-small">${T('profile_label')}</span>
            <span class="profile-current-name">${esc(currentProfile || '—')}${profileSwitching ? `<span style="color:var(--amber);font-weight:500;font-size:.8em"> · ${T('profile_switching')}</span>` : ''}</span>
          </div>
          <span class="profile-chevron${this._profileOpen?' open':''}">▾</span>
        </button>
        ${this._profileOpen ? `<div class="profile-opts">
          ${profileOptions.map(p =>
            `<button class="profile-opt${p===currentProfile?' active':''}" data-profile-opt="${esc(p)}">${esc(p)}</button>`
          ).join('')}
        </div>` : ''}
      </div>` : '';

    // ── hero metrics ──────────────────────────────────────────────────────────
    const ratingHtml = (() => {
      if (!rating || rating < 1 || rating > 5) return '';
      const cls = rating >= 4 ? 'high' : rating >= 3 ? 'mid' : 'low';
      const stars = Array.from({length:5}, (_,i) =>
        `<span class="star${i < rating ? ` on ${cls}` : ''}">★</span>`).join('');
      return `<div class="rating-row">${stars}</div>`;
    })();

    const metricTrioHtml = (() => {
      const tiles = [
        duration ? { num: duration,      unit: 's', label: T('m_duration') } : null,
        weight   ? { num: weight,        unit: 'g', label: T('m_yield')    } : null,
        ratio    ? { num: `1:${ratio}`,  unit: '',  label: 'Ratio'   } : null,
      ].filter(Boolean);
      if (!tiles.length) return '';
      return `<div class="metric-trio">
        ${tiles.map(t => `
          <div class="metric-card">
            <div class="metric-num">${esc(t.num)}${t.unit ? `<span class="metric-unit">${t.unit}</span>` : ''}</div>
            <div class="metric-label">${t.label}</div>
          </div>`).join('')}
      </div>`;
    })();

    const secondaryHtml = (() => {
      const pills = [
        pressure   !== null ? { label: T('m_pressure'), val: `${pressure} bar` }  : null,
        shotTemp   !== null ? { label: T('m_temp'),     val: `${shotTemp}°` }     : null,
      ].filter(Boolean);
      if (!pills.length) return '';
      return `<div class="stats-secondary">
        ${pills.map(p => `
          <div class="stat-pill">
            <span class="stat-pill-label">${p.label}</span>
            <span class="stat-pill-value">${esc(p.val)}</span>
          </div>`).join('')}
      </div>`;
    })();

    // ── chart ──────────────────────────────────────────────────────────────────
    const liveDur = Array.isArray(liveDatapoints?.timeInShot) && liveDatapoints.timeInShot.length
      ? liveDatapoints.timeInShot[liveDatapoints.timeInShot.length - 1] / 10 : null;
    const liveSvgHtml = brewing && liveDatapoints
      ? `<div class="chart-wrap">${buildLiveChart(liveDatapoints)}</div>${chartLegendHtml(liveDatapoints, liveDur)}` : '';

    const histDp = !brewing && shotObj?.dp || null;
    const histSvgHtml = histDp
      ? `<div class="chart-wrap">${buildShotChart(histDp.p||[], histDp.t||[], histDp.w||[], histDp.f||[], shotObj?.duration)}</div>${chartLegendHtml(histDp, shotObj?.duration)}` : '';

    // ── live brewing stats ──────────────────────────────────────────────────
    const liveStatsHtml = brewing && (temp||livePressure||liveWeight)
      ? `<div class="live-stats">
          ${temp         !== null ? `<div class="live-stat"><div class="metric-num">${temp}°</div><div class="metric-label">Temp</div></div>` : ''}
          ${livePressure !== null ? `<div class="live-stat"><div class="metric-num">${livePressure}<span class="metric-unit">b</span></div><div class="metric-label">Druck</div></div>` : ''}
          ${liveWeight   !== null ? `<div class="live-stat"><div class="metric-num">${liveWeight}<span class="metric-unit">g</span></div><div class="metric-label">Gewicht</div></div>` : ''}
        </div>` : '';

    // ── live machine panel (static, shown when on & not brewing) ──────────────
    const lmTiles = [
      temp !== null ? {
        val: temp, unit: '°',
        lbl: boilerOff ? 'Temp · Boiler aus' : (targetTemp !== null ? `Temp · Ziel ${targetTemp}°` : 'Temp'),
        warm: !boilerOff && targetTemp !== null && parseFloat(temp) < parseFloat(targetTemp) - 1,
      } : null,
      livePressure !== null ? { val: livePressure, unit: ' bar', lbl: 'Druck' } : null,
      liveWeight   !== null ? { val: liveWeight,   unit: ' g',   lbl: 'Waage' } : null,
    ].filter(Boolean);
    const liveMachineHtml = (!brewing && !showMaint && lmTiles.length) ? `
      <div class="live-machine">
        <div class="lm-head"><span class="lm-live-dot"></span>${T('lm_live')}</div>
        <div class="lm-tiles">
          ${lmTiles.map(t => `
            <div class="lm-tile${t.warm ? ' warming' : ''}">
              <div class="lm-val">${esc(String(t.val))}<span class="lm-unit">${t.unit}</span></div>
              <div class="lm-lbl">${esc(t.lbl)}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    // ── preheat html ─────────────────────────────────────────────────────────
    const preheatHtml = !brewing && !showMaint && preheatHasEnt ? (
      preheatReady
        ? `<div class="preheat-ready">${T('preheat_ready')}</div>`
        : preheatPct !== null ? `
          <div class="preheat-warming">
            <div class="preheat-warming-label">
              <span>${T('preheat_heating')}</span>
              <span>${preheatMinLeft !== null ? `${preheatMinLeft} min` : ''}</span>
            </div>
            <div class="preheat-bar-bg">
              <div class="preheat-bar-fill" style="width:${Math.round(preheatPct*100)}%"></div>
            </div>
          </div>` : ''
    ) : '';

    // ── shot section ─────────────────────────────────────────────────────────
    const score = shotObj?.score ?? null;
    const scoreCls = score == null ? '' : score >= 80 ? 'high' : score >= 55 ? 'mid' : 'low';
    const scoreBadge = score != null
      ? `<div class="shot-score ${scoreCls}"><span class="shot-score-num">${score}</span><span class="shot-score-lbl">Score</span></div>`
      : '';

    const shotSectionHtml = !brewing && !showMaint ? `
      ${profile
        ? `<div class="shot-hero">
            <div class="shot-hero-main">
              <div class="shot-profile">${esc(profile)}</div>
              <div class="shot-meta">
                ${drinkType ? `<span class="shot-drink">${esc(drinkType)}</span>` : ''}
                ${coffee    ? `<span class="shot-coffee">☕ ${esc(coffee)}</span>${this._beanExtraHtml(coffee, shotObj?.beanId)}` : ''}
              </div>
              ${(grinder || grind) ? `<div class="shot-grind">⚙️ ${esc([grinder, grind].filter(Boolean).join(' · '))}</div>` : ''}
            </div>
            ${scoreBadge}
          </div>`
        : `<div class="no-shot">
            <div class="no-shot-label">${T('no_shot_label')}</div>
            <div class="no-shot-hint">${T('no_shot_hint')}</div>
          </div>`}
      ${ratingHtml}
      ${metricTrioHtml}
      ${secondaryHtml}
      ${histSvgHtml}
    ` : '';

    // ── footer ───────────────────────────────────────────────────────────────
    const footerHtml = `
      <div class="footer">
        <span class="footer-item">${T('footer_today', today)}</span>
        ${waterLevel !== null ? `<span class="footer-item">💧 ${waterLevel}%</span>` : '<span></span>'}
        <span class="footer-item">
          ${syncTime ? `${syncTime}` : ''}
          ${glpUrl ? `${syncTime ? ' · ' : ''}<a href="${esc(glpUrl)}" target="_blank">GLP ↗</a>` : ''}
        </span>
      </div>`;

    // ── assemble ──────────────────────────────────────────────────────────────
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card><div class="card">

        <div class="header">
          <div class="title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21v-2h2V3h14v2h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2v6h2v2H2zm4-2h8V5H6v14zm10-6h2V7h-2v6z"/>
            </svg>
            ${esc(this._config.title)}
          </div>
          <div class="header-right">
            ${this._machineOnSince ? `<span class="machine-uptime" id="glp-uptime" title="${T('uptime_title')}">🔌 ${fmtUptime(Date.now() - this._machineOnSince)}</span>` : ''}
            <div class="status-dot ${dotClass}"></div>
            ${_powerBtn}
          </div>
        </div>

        ${tabBarHtml}
        ${steamOn && !brewing ? `<div class="steam-banner">${T('steam_mode')}</div>` : ''}
        ${waterLevel !== null && waterLevel < 20 ? `<div class="water-low">${T('water_low', waterLevel)}</div>` : ''}
        ${preheatHtml}
        ${profilePickerHtml}
        ${liveMachineHtml}
        ${navHtml}

        <div class="swipe-target">
          <div class="swipe-content">
            ${brewing ? `
              <div class="brewing-banner">${T('brewing')}${elapsedSec !== null ? ` · ${elapsedSec}s` : ' …'}</div>
              ${liveProfile ? `<div class="shot-hero" style="margin-bottom:12px"><div class="shot-profile">${esc(liveProfile)}</div></div>` : ''}
              ${liveSvgHtml}
              ${liveStatsHtml}
            ` : showMaint ? this._buildMaintHtml() : showOrders ? this._buildOrdersHtml() : shotSectionHtml}
          </div>
        </div>

        ${footerHtml}

      </div></ha-card>`;

    this._applySemanticColorContrast();
    this._bindPowerBtn();
    this._bindProfilePicker();
    this._bindTabBtns();
    this._bindMaintRows();
    this._bindOrderBtns();
    this._bindNavBtns();
    this._bindSwipe();
    this._startUptimeTicker();
  }

  getCardSize() { return 3; }
  static getStubConfig() { return { entity_prefix: 'sensor.gaggiuino_local_profiler_' }; }
}

customElements.define('glp-card', GlpCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'glp-card', name: 'GLP Shot Card',
  description: 'Shows the last espresso shot from Gaggiuino Local Profiler',
  preview: false,
  documentationURL: 'https://github.com/mxkissnr/glp-lovelace-card',
});

console.info(
  `%c GLP-CARD %c v${GLP_CARD_VERSION} `,
  'background:#ff3b30;color:#fff;padding:2px 4px;border-radius:3px 0 0 3px',
  'background:#111113;color:#ff3b30;padding:2px 4px;border-radius:0 3px 3px 0'
);
