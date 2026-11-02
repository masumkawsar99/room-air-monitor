/* Room Air Monitor - live dashboard for the ESP32 + MP-135 + DHT22 + TinyML monitor */
(() => {
  'use strict';
  const CFG = window.AQ_CONFIG || {};
  const DEMO = !CFG.API_URL || new URLSearchParams(location.search).has('demo');
  const TH = CFG.THRESHOLDS || [105.33, 123.47, 139.71];
  const REFRESH = (CFG.REFRESH_SECONDS || 30) * 1000;
  const OFFLINE_MS = (CFG.OFFLINE_AFTER_SECONDS || 120) * 1000;
  const MEDIAN_REC = CFG.MEDIAN_RECOVERY_MIN || 29;
  const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3, TZ = 6 * HOUR;   // Asia/Dhaka = UTC+6, no DST
  const LV_COL = ['#22c55e', '#eab308', '#f97316', '#dc2626'];
  const NAMES_EN = ['Normal', 'Slightly Elevated', 'Elevated', 'Spike'];

  // ------------------------------------------------------------ storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };

  // ------------------------------------------------------------ i18n
  const I18N = {
    en: {
      appTitle: 'Room Air Monitor', appSub: 'ESP32 with MP-135 and DHT22',
      demoBanner: 'Demo mode — showing simulated data. Add your Apps Script URL in config.js to see your device.',
      airNow: 'Air in the room now', relativeNote: "Relative index: 100 = this room's usual level. Not an official AQI.",
      forecast10: 'Forecast (10 min)', forecastNote: 'Estimated by the TinyML model running on the ESP32.',
      temperature: 'Temperature', humidity: 'Humidity', feelsLike: 'Feels like', dewPoint: 'Dew point', heatIndex: 'heat index',
      advice: 'What to do', todaySummary: 'Today', eventLog: 'Sprays and pollution events today',
      lead: ['Usual for this room.', 'A little above usual. Fine for now.', 'Clearly above usual. Something is releasing gas.', 'Sudden strong rise, usually a spray.'],
      leadIdx: 'Index <b>{i}</b>, where 100 is this room\'s usual level. Not an official AQI.',
      now: 'Now', next10: 'In 10 min', fcWhy: 'Forecast by the TinyML model running on the ESP32.', over10: 'over 10 min',
      roomScoreHead: 'Room score {s} ({l})', indexWord: 'index', noForecastShort: 'forecast starts ~2 h after power-on',
      indexChart: 'Pollution Index · forecast vs actual', actual: 'Actual', forecastShifted: 'Forecast (plotted at the time it predicts)',
      thChart: 'Temperature & humidity', showRaw: 'Show raw sensor data (gas_adc, Rs, ratio)',
      comfort: 'Thermal comfort', moldRisk: 'Mold / dampness risk', roomScore: 'Daily room score', scoreNote: 'Heuristic score (see Info).',
      nightReport: 'Night air report (23:00–07:00)', outdoor: 'Indoor vs outdoor (Dhaka)', weatherSrc: 'Outdoor weather:',
      heatmap: 'When does pollution happen? (last 7 days, hourly average)', compare: 'Today vs yesterday vs 7-day average',
      overlay: 'Pollution Index by time of day', notifications: 'Notifications',
      notifNote: 'Get a browser notification when a spray/spike starts and when the air is clear again (while the app is open).',
      enableNotif: 'Enable notifications', notifOn: 'Notifications are on', notifBlocked: 'Notifications are blocked in this browser',
      tabLive: 'Live', tabCharts: 'Charts', tabHealth: 'Health', tabAnalysis: 'Analysis', tabInfo: 'Info',
      lv: ['Normal', 'Slightly Elevated', 'Elevated', 'Spike'], lvShort: ['Normal', 'Slight', 'Elevated', 'Spike'],
      online: 'Online', offline: 'Offline', lastData: 'last data', connError: 'Connection error', loading: 'Loading…',
      updated: 'Updated', ago: 'ago', sec: 's', min: 'min', justNow: 'just now', noData: 'No data yet',
      warming: 'Warming up — the level appears ~1 h after the device starts',
      inTen: 'In 10 min', rising: 'rising', falling: 'falling', steady: 'steady',
      noForecast: 'Forecast appears ~2 h after the device starts',
      sprayNow: 'Spray / pollution spike detected at {t} — peak {p}',
      recovering: 'Recovering after the spike at {t} (peak {p}) · back to Normal in ~{m} min',
      recoveringSoon: 'Recovering after the spike at {t} (peak {p}) · back to Normal within ~10 min',
      clearTitle: 'Air is clear again', clearBody: 'Back to Normal after the spike at {t}.',
      spikeTitle: 'Spray / pollution spike', spikeBody: 'Pollution Index {p} at {t}.',
      advNormal: 'Air is normal — no action needed.',
      advElevated: 'Air has been elevated for {m} min — open a window or switch on a fan.',
      advSlow: 'Still above normal {m} min after the spray — ventilate the room.',
      advSpike: 'Spike in progress — avoid spraying more; ventilate if you can.',
      advOutGood: 'Outdoor air is cooler and drier — good time to open windows.',
      advOutHumid: 'Outdoor air is more humid — ventilate briefly.',
      advHot: 'Very hot & humid indoors (feels like {f}°C) — use a fan and drink water.',
      advMold: 'Humidity has stayed high for many hours — ventilate or dehumidify to prevent mold.',
      sprays: 'Spray events', peak: 'Peak index', avgTemp: 'Avg temperature', avgHum: 'Avg humidity',
      bestHour: 'Best hour', worstHour: 'Worst hour', normalPct: '% Normal', avgIndex: 'Avg index',
      noEvents: 'No spray or pollution events today 🎉', recov: 'back to Normal in', ongoing: 'ongoing',
      score: 'Score', excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor',
      comfortL: ['Comfortable', 'Warm', 'Hot', 'Very hot & humid', 'Dangerous heat'],
      dewL: ['Comfortable', 'Slightly humid', 'Humid', 'Oppressive'],
      moldL: ['Low', 'Moderate', 'High'], moldDetail: '{a} h above 70% · {b} h above 80% (last 24 h)',
      nightGood: 'Good night', nightMixed: 'Mixed night', nightPoor: 'Poor night', noSprays: 'no sprays',
      nightNoData: 'No data for last night yet.', avgFeels: 'Avg feels like',
      indoor: 'Indoor', outdoorCol: 'Outdoor', tempRow: 'Temperature', humRow: 'Humidity', dewRow: 'Dew point',
      winGood: '✅ Good time to open the windows — outside is cooler and drier.',
      winBad: '⏸ Not ideal to open windows now: {r}.', rWarmer: 'outside is warmer', rHumid: 'outside is more humid', rRain: 'it is raining',
      outUnavailable: 'Outdoor weather unavailable right now.',
      today: 'Today', yesterday: 'Yesterday', week: '7-day avg', approx: '≈ estimated from 5-min data',
      noDataCell: 'no data', range: { 1: '1 h', 6: '6 h', 24: '24 h', 168: '7 d' },
      offlineToast: 'Showing saved data — cannot reach the server.'
    }
  };
  const lang = 'en';
  let theme = store.get('aq_theme', 'auto');
  const T = k => (I18N[lang][k] !== undefined ? I18N[lang][k] : I18N.en[k]);
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o[k] !== undefined ? o[k] : ''));

  // ------------------------------------------------------------ helpers
  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(d));
  const dk = t => new Date(t + TZ);                                 // Dhaka wall-clock as UTC fields
  const hourOf = t => dk(t).getUTCHours();
  const dayKey = t => dk(t).toISOString().slice(0, 10);
  const midnight = t => { const d = dk(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ; };
  const hhmm = t => { const d = dk(t); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const dayLabel = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'Asia/Dhaka' });
  const levelOfIndex = x => (x === null || x === undefined || !Number.isFinite(x) ? null : x > TH[2] ? 3 : x > TH[1] ? 2 : x > TH[0] ? 1 : 0);
  const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); }

  function normRow(r) {
    const o = { t: +r.t, temp: num(r.temp), hum: num(r.hum), index: num(r.index), gas: num(r.gas), rs: num(r.rs), ratio: num(r.ratio), fi: num(r.fi), fc: num(r.fc), air: r.air || null };
    let lv = levelOfIndex(o.index);
    if (lv === null && o.air) { const i = NAMES_EN.indexOf(o.air); lv = i >= 0 ? i : null; }
    o.lv = lv;
    return o;
  }
  function num(x) { if (x === null || x === undefined || x === '') return null; const v = +x; return Number.isFinite(v) ? v : null; }

  // ------------------------------------------------------------ comfort maths
  function heatIndexC(Tc, RH) {
    const F = Tc * 9 / 5 + 32;
    let HI = 0.5 * (F + 61 + (F - 68) * 1.2 + RH * 0.094);
    if ((HI + F) / 2 >= 80) {
      HI = -42.379 + 2.04901523 * F + 10.14333127 * RH - 0.22475541 * F * RH - 0.00683783 * F * F - 0.05481717 * RH * RH
        + 0.00122874 * F * F * RH + 0.00085282 * F * RH * RH - 0.00000199 * F * F * RH * RH;
      if (RH < 13 && F >= 80 && F <= 112) HI -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(F - 95)) / 17);
      else if (RH > 85 && F >= 80 && F <= 87) HI += ((RH - 85) / 10) * ((87 - F) / 5);
    }
    return (HI - 32) * 5 / 9;
  }
  const feelsLike = (Tc, RH) => { if (Tc === null || RH === null) return null; const h = heatIndexC(Tc, RH); return h < 27 ? Tc : h; };
  function dewPoint(Tc, RH) { if (Tc === null || RH === null || RH <= 0) return null; const a = 17.62, b = 243.12; const g = Math.log(RH / 100) + a * Tc / (b + Tc); return b * g / (a - g); }
  const comfortIdx = h => (h < 27 ? 0 : h < 32 ? 1 : h < 41 ? 2 : h < 54 ? 3 : 4);
  const dewIdx = d => (d < 16 ? 0 : d < 21 ? 1 : d < 24 ? 2 : 3);

  // ------------------------------------------------------------ state
  const S = { rows: [], rows7: [], outdoor: null, outdoorErr: false, range: 24, charts: {}, tab: 'live', loaded: false, error: false };

  // ------------------------------------------------------------ DEMO data
  const Demo = (() => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    let all = null;
    function build() {
      const now = Date.now(), step = 30e3, start = Math.floor((now - 7 * DAY) / step) * step, end = now + 2 * DAY;
      const n = Math.floor((end - start) / step);
      // spray events: 2-3 a day, mostly 6-8 am and 6-9 pm
      const sprays = [];
      for (let d = midnight(start); d < end; d += DAY) {
        const k = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < k; i++) {
          const h = rnd() < 0.45 ? 6 + rnd() * 2 : rnd() < 0.6 ? 18 + rnd() * 3 : 10 + rnd() * 6;
          sprays.push({ t: d + h * HOUR, peak: 45 + Math.pow(rnd(), 2) * 220, tau: (6 + rnd() * 8) * MIN });
        }
      }
      // last spray ~25 min ago so the demo shows a recovery in progress
      sprays.push({ t: now - 25 * MIN, peak: 95, tau: 9 * MIN });
      const idx = new Float64Array(n); let drift = 0;
      for (let i = 0; i < n; i++) {
        const t = start + i * step; drift = 0.995 * drift + 0.25 * gauss();
        let v = 100 + drift + 1.2 * gauss();
        for (const s of sprays) {
          const dt = t - s.t; if (dt < -2 * MIN || dt > 3 * HOUR) continue;
          v += dt < 0 ? s.peak * Math.max(0, 1 + dt / (2 * MIN)) * 0.3 : s.peak * Math.exp(-dt / s.tau) * (dt < 90e3 ? dt / 90e3 : 1);
        }
        idx[i] = v;
      }
      all = [];
      for (let i = 0; i < n; i++) {
        const t = start + i * step, h = hourOf(t) + dk(t).getUTCMinutes() / 60;
        const hum = 66 + 8 * Math.cos(2 * Math.PI * (h - 4) / 24) + 0.6 * gauss();
        const temp = 31.4 + 1.1 * Math.sin(2 * Math.PI * (h - 10) / 24) + 0.15 * gauss();
        const index = idx[i], j = Math.min(n - 1, i + 20);
        const fi = 0.65 * idx[j] + 0.35 * index + 2.5 * gauss();
        const gas = Math.round(560 * index / 100 * (1 + (hum - 66) * 0.012));
        const v = gas / 4095 * 3.3, rs = (5 / v - 1);
        all.push({ t, temp: +temp.toFixed(1), hum: +hum.toFixed(1), index: +index.toFixed(2), air: null, gas, rs: +rs.toFixed(3), ratio: +(rs / 11.819).toFixed(4), fi: +fi.toFixed(2), fc: levelOfIndex(fi) });
      }
    }
    return {
      read(hours, step = 1, since = 0) {
        if (!all) build();
        const now = Date.now(), from = since || now - hours * HOUR;
        const rows = all.filter(r => r.t > from && r.t <= now);
        return step > 1 ? rows.filter((_, i) => i % step === 0 || i === rows.length - 1) : rows;
      }
    };
  })();

  // ------------------------------------------------------------ data layer
  async function api(params) {
    if (DEMO) return { ok: true, rows: Demo.read(params.hours || 48, params.step || 1, params.since || 0) };
    const url = CFG.API_URL + (CFG.API_URL.includes('?') ? '&' : '?') + new URLSearchParams(Object.assign({ action: 'read' }, params));
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'API error');
      return j;
    } finally { clearTimeout(to); }
  }
  function saveCache() { if (!DEMO) store.set('aq_cache', { rows: S.rows.slice(-6000), rows7: S.rows7 }); }
  function loadCache() { const c = store.get('aq_cache', null); if (c && c.rows) { S.rows = c.rows.map(normRow); S.rows7 = (c.rows7 || []).map(normRow); return true; } return false; }

  async function loadMain() {
    try {
      const j = await api({ hours: 48 });
      S.rows = j.rows.map(normRow).sort((a, b) => a.t - b.t); S.error = false; saveCache();
    } catch (e) {
      S.error = true; if (loadCache()) toast(T('offlineToast')); console.warn('loadMain failed', e);
    }
    S.loaded = true;
  }
  async function poll() {
    if (!S.rows.length) { await loadMain(); return renderAll(); }
    try {
      const last = S.rows[S.rows.length - 1].t;
      const j = await api({ since: last });
      const fresh = j.rows.map(normRow).filter(r => r.t > last).sort((a, b) => a.t - b.t);
      if (fresh.length) {
        S.rows.push(...fresh);
        const cut = Date.now() - 48 * HOUR; while (S.rows.length && S.rows[0].t < cut) S.rows.shift();
        saveCache();
      }
      S.error = false;
    } catch (e) { S.error = true; console.warn('poll failed', e); }
    renderAll();
  }
  async function load7() {
    try { const j = await api({ hours: 168, step: 10 }); S.rows7 = j.rows.map(normRow).sort((a, b) => a.t - b.t); saveCache(); }
    catch (e) { console.warn('load7 failed', e); }
    if (S.tab === 'analysis') renderAnalysis();
    if (S.tab === 'charts' && S.range === 168) renderCharts(true);
  }
  let outdoorTimer = null;
  async function loadOutdoor(attempt = 0) {
    clearTimeout(outdoorTimer);
    const base = `latitude=${CFG.LAT}&longitude=${CFG.LON}&timezone=Asia%2FDhaka`;
    const urls = [
      `https://api.open-meteo.com/v1/forecast?${base}&current=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m`,
      `https://api.open-meteo.com/v1/forecast?${base}&current_weather=true&hourly=relative_humidity_2m,dew_point_2m,precipitation&forecast_days=1`
    ];
    let ok = false;
    for (const u of urls) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch(u, { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.current && j.current.temperature_2m != null) { S.outdoor = j.current; }
        else if (j.current_weather) {
          const h = j.hourly || {}, times = h.time || [], now = Date.now();
          let k = 0; times.forEach((t, i) => { if (new Date(t + ':00+06:00').getTime() <= now) k = i; });
          S.outdoor = { temperature_2m: j.current_weather.temperature, wind_speed_10m: j.current_weather.windspeed,
            relative_humidity_2m: (h.relative_humidity_2m || [])[k], dew_point_2m: (h.dew_point_2m || [])[k], precipitation: (h.precipitation || [])[k] };
        } else throw new Error('unexpected response');
        ok = true; break;
      } catch (e) { console.warn('outdoor weather failed', u, e); }
    }
    S.outdoorErr = !ok;
    renderHealth(); renderAdvice();
    // refresh every 15 min; after a failure retry sooner (30 s, 1 min, 2 min … up to 15 min)
    const wait = ok ? 15 * 60000 : Math.min(15 * 60000, 30000 * Math.pow(2, attempt));
    outdoorTimer = setTimeout(() => loadOutdoor(ok ? 0 : attempt + 1), wait);
  }
  window.addEventListener('online', () => loadOutdoor());

  // ------------------------------------------------------------ analysis helpers
  const latest = () => (S.rows.length ? S.rows[S.rows.length - 1] : null);
  const latestValid = () => { for (let i = S.rows.length - 1; i >= 0; i--) if (S.rows[i].lv !== null) return S.rows[i]; return null; };

  function detectEvents(rows) {
    const ev = []; let cur = null;
    for (const r of rows) {
      if (r.lv !== 3) continue;
      if (cur && r.t - cur.lastSpike <= 10 * MIN) { cur.lastSpike = r.t; if (r.index > cur.peak) { cur.peak = r.index; cur.peakT = r.t; } }
      else { if (cur) ev.push(cur); cur = { start: r.t, lastSpike: r.t, peak: r.index, peakT: r.t, normalT: null }; }
    }
    if (cur) ev.push(cur);
    // time back to Normal: first of two consecutive Normal readings after the last Spike reading
    let j = 0;
    for (const e of ev) {
      while (j < rows.length && rows[j].t <= e.lastSpike) j++;
      for (let k = j; k < rows.length - 1; k++) {
        if (rows[k].lv === 3) break;
        if (rows[k].lv === 0 && rows[k + 1].lv === 0) { e.normalT = rows[k].t; break; }
      }
      e.recMin = e.normalT ? (e.normalT - e.peakT) / MIN : null;
    }
    return ev;
  }

  function dayStats(rows, start, end) {
    const r = rows.filter(x => x.t >= start && x.t < end && x.lv !== null);
    if (!r.length) return null;
    const cnt = [0, 0, 0, 0]; r.forEach(x => cnt[x.lv]++);
    const pct = cnt.map(c => 100 * c / r.length);
    const ev = detectEvents(rows.filter(x => x.t >= start - HOUR && x.t < end)).filter(e => e.start >= start && e.start < end);
    let peak = null; r.forEach(x => { if (!peak || x.index > peak.index) peak = x; });
    const hours = {}; r.forEach(x => { const h = hourOf(x.t); (hours[h] = hours[h] || []).push(x.index); });
    const hm = Object.entries(hours).filter(([, v]) => v.length >= 10).map(([h, v]) => [+h, mean(v)]);
    hm.sort((a, b) => a[1] - b[1]);
    const temps = r.map(x => x.temp).filter(v => v !== null), hums = r.map(x => x.hum).filter(v => v !== null);
    const hot = r.filter(x => x.temp !== null && x.hum !== null && feelsLike(x.temp, x.hum) > 41).length;
    return { n: r.length, cnt, pct, events: ev, peak, avgIdx: mean(r.map(x => x.index)), avgT: mean(temps), avgH: mean(hums),
      best: hm.length ? hm[0] : null, worst: hm.length ? hm[hm.length - 1] : null, hotPct: 100 * hot / r.length };
  }
  function roomScore(st) {
    if (!st) return null;
    const s = 100 - (0.2 * st.pct[1] + 0.6 * st.pct[2] + 1.0 * st.pct[3]) - 3 * st.events.length - 0.1 * st.hotPct;
    return Math.max(0, Math.min(100, Math.round(s)));
  }
  const scoreLabel = s => (s >= 85 ? T('excellent') : s >= 70 ? T('good') : s >= 50 ? T('fair') : T('poor'));

  // ------------------------------------------------------------ rendering: live
  function badge(el, lv, text) {
    el.className = el.className.replace(/\blv[0-3n]\b/g, '').trim() + ' ' + (lv === null ? 'lvn' : 'lv' + lv);
    el.textContent = text;
  }
  function renderStatus() {
    const pill = $('statusPill'), L = latest();
    if (!S.loaded) { pill.className = 'pill pill-wait'; pill.textContent = T('loading'); return; }
    if (!L) { pill.className = 'pill pill-off'; pill.textContent = S.error ? T('connError') : T('noData'); return; }
    const age = Date.now() - L.t;
    if (age > OFFLINE_MS) { pill.className = 'pill pill-off'; pill.textContent = `${T('offline')} · ${T('lastData')} ${hhmm(L.t)}`; }
    else { pill.className = 'pill pill-on'; pill.textContent = `${T('online')}`; }
  }
  function renderAgo() {
    const L = latest(); if (!L) { $('updatedAgo').textContent = T('noData'); return; }
    const s = Math.max(0, Math.round((Date.now() - L.t) / 1000));
    $('updatedAgo').textContent = s < 5 ? `${T('updated')} ${T('justNow')}` : s < 120 ? `${T('updated')} ${s} ${T('sec')} ${T('ago')}` : `${T('updated')} ${Math.round(s / 60)} ${T('min')} ${T('ago')} · ${hhmm(L.t)}`;
    renderStatus();
  }
  function orbSVG(value, lv) {
    const lo = 60, hi = 240, R = 86, C = 2 * Math.PI * R, col = lv === null || lv === undefined ? css('--lnone') : LV_COL[lv];
    const frac = v => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    const pos = v => { const a = -Math.PI / 2 + 2 * Math.PI * frac(v) * 0.75 - Math.PI * 0.75; return [100 + R * Math.cos(a), 100 + R * Math.sin(a)]; };
    // track = 270 degree arc, starting bottom-left
    const arcLen = C * 0.75;
    let s = `<circle class="breath" cx="100" cy="100" r="58" fill="${col}" opacity=".6"/>`;
    s += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${css('--rule')}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${arcLen} ${C}" transform="rotate(135 100 100)"/>`;
    if (value !== null && value !== undefined) s += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${arcLen * frac(value)} ${C}" transform="rotate(135 100 100)"/>`;
    for (const t of [100, TH[0], TH[1], TH[2]]) { const [x, y] = pos(t); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${t === 100 ? 3.2 : 2.2}" fill="${css('--ink')}" opacity="${t === 100 ? .9 : .45}"/>`; }
    s += `<text x="100" y="108" text-anchor="middle" font-family="Bricolage Grotesque, system-ui, sans-serif" font-weight="800" font-size="50" fill="${css('--ink')}" letter-spacing="-1.5">${value === null || value === undefined ? '—' : Math.round(value)}</text>`;
    s += `<text x="100" y="130" text-anchor="middle" font-size="12" fill="${css('--slate')}">${T('indexWord')}</text>`;
    return s;
  }
  function trendSym(d, tol) { return d === null ? '' : d > tol ? '↑' : d < -tol ? '↓' : '→'; }
  function ago(minutes) { const i = S.rows.length - 1 - minutes * 2; return i >= 0 ? S.rows[i] : null; }

  function chipHTML(lv, text) { return `<span class="chip" style="--c:${lv === null || lv === undefined ? 'var(--lnone)' : LV_COL[lv]}">${text}</span>`; }
  function trendText(d, tol) { if (d === null) return ''; return d > tol ? `↑ ${T('rising')} ${T('over10')}` : d < -tol ? `↓ ${T('falling')} ${T('over10')}` : `→ ${T('steady')}`; }
  function renderLive() {
    const L = latest(), V = latestValid();
    const word = $('airWord');
    const showLv = V && L && (V === L || L.t - V.t < 10 * MIN) ? V.lv : null;
    document.body.dataset.level = showLv === null ? '' : String(showLv);
    if (!L) { word.textContent = T('noData'); word.classList.remove('long'); $('airLead').textContent = ''; $('orb').innerHTML = orbSVG(null, null); $('nextStrip').innerHTML = ''; renderAgo(); return; }
    if (showLv === null) { word.textContent = T('warming').split(' — ')[0]; word.classList.add('long'); $('airLead').textContent = T('warming'); }
    else {
      word.textContent = T('lv')[showLv]; word.classList.toggle('long', T('lv')[showLv].length > 10);
      $('airLead').innerHTML = `${T('lead')[showLv]} <span class="muted">${fill(T('leadIdx'), { i: fmt(V.index, 0) })}</span>`;
    }
    $('orb').innerHTML = orbSVG(V ? V.index : null, showLv);
    // now -> in 10 min
    let nx = `<div class="step"><span class="muted">${T('now')}</span><span class="num">${V ? fmt(V.index, 0) : '—'}</span>${chipHTML(showLv, showLv === null ? '—' : T('lvShort')[showLv])}</div>`;
    if (L.fi !== null) {
      const flv = L.fc !== null ? L.fc : levelOfIndex(L.fi), d = L.index !== null ? L.fi - L.index : null;
      nx += `<span class="arrow" aria-hidden="true">${d === null ? '→' : d > 3 ? '↗' : d < -3 ? '↘' : '→'}</span>`;
      nx += `<div class="step"><span class="muted">${T('next10')}</span><span class="num">${fmt(L.fi, 0)}</span>${chipHTML(flv, T('lvShort')[flv])}</div>`;
      nx += `<span class="why">${T('fcWhy')}</span>`;
    } else nx += `<span class="why">${T('noForecastShort')}</span>`;
    $('nextStrip').innerHTML = nx;
    // readings
    $('tempVal').textContent = fmt(L.temp, 1); $('humVal').textContent = fmt(L.hum, 0);
    const p = ago(10);
    $('tempTrend').textContent = p && L.temp !== null && p.temp !== null ? trendText(L.temp - p.temp, 0.2) : '';
    $('humTrend').textContent = p && L.hum !== null && p.hum !== null ? trendText(L.hum - p.hum, 0.5) : '';
    const fl2 = feelsLike(L.temp, L.hum), dp = dewPoint(L.temp, L.hum);
    $('feelsVal').textContent = fmt(fl2, 1); $('dewVal').textContent = fmt(dp, 1);
    $('comfortSmall').textContent = fl2 === null ? '' : T('comfortL')[comfortIdx(fl2)];
    $('dewSmall').textContent = dp === null ? '' : T('dewL')[dewIdx(dp)];
    renderAgo();
  }

  function activeEvent() {
    const ev = detectEvents(S.rows.filter(r => r.t > Date.now() - 6 * HOUR));
    const e = ev[ev.length - 1];
    if (!e || e.normalT) return null;
    if (Date.now() - e.lastSpike > 3 * HOUR) return null;
    return e;
  }
  function renderBanner() {
    const el = $('sprayBanner'), e = activeEvent(), L = latestValid();
    if (!e || !L) { el.hidden = true; return; }
    const o = { t: hhmm(e.start), p: Math.round(e.peak) };
    if (L.lv === 3) { el.className = 'spray-banner'; el.textContent = '🔴 ' + fill(T('sprayNow'), o); }
    else {
      const since = (Date.now() - e.peakT) / MIN;
      const m = Math.max(1, Math.round(MEDIAN_REC - since));
      el.className = 'spray-banner recovering';
      el.textContent = '🟠 ' + (L.fc === 0 || m <= 10 ? fill(T('recoveringSoon'), o) : fill(T('recovering'), Object.assign(o, { m })));
    }
    el.hidden = false;
  }

  function renderAdvice() {
    const box = $('adviceList'); if (!box) return;
    const items = [], L = latestValid(), R = latest();
    if (!L) { box.innerHTML = `<div class="empty">${T('noData')}</div>`; return; }
    const e = activeEvent();
    let needVent = false;
    // how long elevated (>= level 2)?
    let k = S.rows.length - 1, since = null;
    while (k >= 0 && S.rows[k].lv !== null && S.rows[k].lv >= 2) { since = S.rows[k].t; k--; }
    const elevMin = since ? (L.t - since) / MIN : 0;
    if (L.lv === 3) { items.push(['🔴', T('advSpike')]); needVent = true; }
    else if (L.lv >= 2 && elevMin > 15) { items.push(['🪟', fill(T('advElevated'), { m: Math.round(elevMin) })]); needVent = true; }
    else if (e && L.lv >= 1 && (Date.now() - e.peakT) / MIN > 20) { items.push(['🪟', fill(T('advSlow'), { m: Math.round((Date.now() - e.peakT) / MIN) })]); needVent = true; }
    else if (L.lv === 0) items.push(['✅', T('advNormal')]);
    if (needVent && S.outdoor && R && R.temp !== null) {
      const din = dewPoint(R.temp, R.hum);
      if (S.outdoor.temperature_2m < R.temp - 1 && S.outdoor.dew_point_2m < din) items.push(['🌬️', T('advOutGood')]);
      else if (S.outdoor.dew_point_2m >= din) items.push(['💧', T('advOutHumid')]);
    }
    if (R && R.temp !== null && R.hum !== null) { const f = feelsLike(R.temp, R.hum); if (f > 41) items.push(['🥵', fill(T('advHot'), { f: fmt(f, 0) })]); }
    if (moldInfo().level === 2) items.push(['🍄', T('advMold')]);
    box.innerHTML = items.map(([ic, tx]) => `<div class="advice"><span class="ic">${ic}</span><span>${tx}</span></div>`).join('');
  }

  function renderSummary() {
    const now = Date.now(), d0 = midnight(now);
    const st = dayStats(S.rows, d0, now + MIN);
    const sc = roomScore(st);
    $('roomScore').textContent = sc === null ? '' : fill(T('roomScoreHead'), { s: sc, l: scoreLabel(sc) });
    $('scoreBig').textContent = sc === null ? '—' : `${sc} / 100 · ${scoreLabel(sc)}`;
    // ribbon: 288 five-minute bins, coloured by the worst level in each bin
    const bins = new Array(288).fill(null);
    S.rows.forEach(r => { if (r.t < d0 || r.lv === null) return; const k = Math.floor((r.t - d0) / (5 * MIN)); if (k >= 0 && k < 288) bins[k] = bins[k] === null ? r.lv : Math.max(bins[k], r.lv); });
    $('ribbon').innerHTML = bins.map(b => `<i style="background:${b === null ? 'transparent' : LV_COL[b]}"></i>`).join('');
    const pos = t => `${(100 * (t - d0) / DAY).toFixed(2)}%`;
    const evs = st ? st.events : [];
    $('ribbonMarks').innerHTML = evs.map(e => `<span style="left:${pos(e.start)}" title="${hhmm(e.start)}">▼</span>`).join('');
    let nl = $('ribbonWrap').querySelector('.now-line'); if (!nl) { nl = document.createElement('div'); nl.className = 'now-line'; $('ribbonWrap').appendChild(nl); }
    nl.style.left = `calc(${pos(now)} - 1px)`;
    $('summaryStats').innerHTML = !st ? `<span class="empty">${T('noData')}</span>` :
      T('lv').map((n, i) => `<span><span class="sw" style="background:${LV_COL[i]}"></span><b>${fmt(st.pct[i], 0)}%</b>${n}</span>`).join('') +
      `<span><b>${st.events.length}</b>${T('sprays').toLowerCase()}</span>` +
      `<span><b>${fmt(st.peak.index, 0)}</b>${T('peak').toLowerCase()} (${hhmm(st.peak.t)})</span>` +
      (st.best ? `<span><b>${String(st.best[0]).padStart(2, '0')}:00</b>${T('bestHour').toLowerCase()}</span><span><b>${String(st.worst[0]).padStart(2, '0')}:00</b>${T('worstHour').toLowerCase()}</span>` : '');
    $('eventLog').innerHTML = !evs.length ? `<div class="empty" style="padding-left:18px">${T('noEvents')}</div>` :
      evs.slice().reverse().map(e => `<div class="event"><span class="t">${hhmm(e.start)}</span><span>${T('peak')} <b>${Math.round(e.peak)}</b></span>` +
        `<span class="muted small">${e.recMin !== null ? `${T('recov')} ${Math.round(e.recMin)} ${T('min')}` : T('ongoing')}</span></div>`).join('');
  }

  // ------------------------------------------------------------ notifications
  function notify(title, body) {
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'aq' }); } catch { /* unsupported */ }
  }
  function checkNotifications() {
    const ev = detectEvents(S.rows.filter(r => r.t > Date.now() - 6 * HOUR)); const e = ev[ev.length - 1]; if (!e) return;
    const ns = store.get('aq_n_start', 0), nc = store.get('aq_n_clear', 0);
    if (e.start > ns && Date.now() - e.start < 15 * MIN) { notify(T('spikeTitle'), fill(T('spikeBody'), { t: hhmm(e.start), p: Math.round(e.peak) })); store.set('aq_n_start', e.start); }
    if (e.normalT && nc !== e.start && store.get('aq_n_start', 0) === e.start && Date.now() - e.normalT < 15 * MIN) {
      notify(T('clearTitle'), fill(T('clearBody'), { t: hhmm(e.start) })); store.set('aq_n_clear', e.start);
    }
  }
  function renderNotifBtn() {
    const b = $('notifBtn'); if (!('Notification' in window)) { b.disabled = true; b.textContent = T('notifBlocked'); return; }
    if (Notification.permission === 'granted') { b.disabled = true; b.textContent = T('notifOn'); }
    else if (Notification.permission === 'denied') { b.disabled = true; b.textContent = T('notifBlocked'); }
    else { b.disabled = false; b.textContent = T('enableNotif'); }
  }

  // ------------------------------------------------------------ charts
  const bandsPlugin = { id: 'bands', beforeDraw(ch) {
    const y = ch.scales.y, a = ch.chartArea; if (!y || !a || !ch.options.plugins.bands) return;
    const g = ch.ctx; g.save();
    const edges = [-1e9, TH[0], TH[1], TH[2], 1e9];
    for (let i = 0; i < 4; i++) {
      const top = Math.max(a.top, y.getPixelForValue(edges[i + 1])), bot = Math.min(a.bottom, y.getPixelForValue(edges[i]));
      if (bot <= top) continue; g.fillStyle = LV_COL[i] + '1f'; g.fillRect(a.left, top, a.right - a.left, bot - top);
    }
    g.restore();
  } };
  function baseOpts(rangeH) {
    const grid = css('--rule'), tick = css('--slate');
    return {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: { legend: { labels: { color: css('--ink'), boxWidth: 12 } }, decimation: { enabled: true, algorithm: 'lttb', samples: 500 },
        tooltip: { callbacks: { title: it => (it.length ? (rangeH > 24 ? dayLabel(it[0].parsed.x) + ' ' : '') + hhmm(it[0].parsed.x) : '') } } },
      scales: { x: { type: 'linear', grid: { color: grid }, ticks: { color: tick, maxTicksLimit: 7, callback: v => (rangeH > 24 ? dayLabel(v) : hhmm(v)) } } },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.8, tension: 0.15 } }
    };
  }
  function rangeRows() {
    if (S.range > 48) return S.rows7.length ? S.rows7 : S.rows;
    const from = Date.now() - S.range * HOUR; return S.rows.filter(r => r.t >= from);
  }
  function renderCharts(rebuild) {
    if (!window.Chart) return;
    const rows = rangeRows(), o = baseOpts(S.range);
    const idx = rows.filter(r => r.index !== null).map(r => ({ x: r.t, y: r.index }));
    const fc = rows.filter(r => r.fi !== null).map(r => ({ x: r.t + 10 * MIN, y: r.fi }));
    const ds1 = [{ label: T('actual'), data: idx, borderColor: css('--ink'), backgroundColor: 'transparent' },
                 { label: T('forecast10'), data: fc, borderColor: '#7c5cff', borderDash: [5, 4], borderWidth: 1.4, backgroundColor: 'transparent' }];
    const temp = rows.filter(r => r.temp !== null).map(r => ({ x: r.t, y: r.temp })), hum = rows.filter(r => r.hum !== null).map(r => ({ x: r.t, y: r.hum }));
    const ds2 = [{ label: T('temperature') + ' (°C)', data: temp, borderColor: '#ef4444', yAxisID: 'y' }, { label: T('humidity') + ' (%)', data: hum, borderColor: '#3b82f6', yAxisID: 'y1' }];
    const gas = rows.filter(r => r.gas !== null).map(r => ({ x: r.t, y: r.gas })), rs = rows.filter(r => r.rs !== null).map(r => ({ x: r.t, y: r.rs })), ra = rows.filter(r => r.ratio !== null).map(r => ({ x: r.t, y: r.ratio }));
    const ds3 = [{ label: 'gas_adc', data: gas, borderColor: '#a855f7', yAxisID: 'y' }, { label: 'Rs (kΩ)', data: rs, borderColor: '#14b8a6', yAxisID: 'y1' }, { label: 'Rs/R0', data: ra, borderColor: '#f59e0b', yAxisID: 'y2' }];
    const xmin = S.range > 48 ? (rows[0] ? rows[0].t : undefined) : Date.now() - S.range * HOUR, xmax = Date.now() + 10 * MIN;
    const grid = css('--rule'), tick = css('--slate');
    const mk = (key, canvas, ds, scales, extra) => {
      if (rebuild && S.charts[key]) { S.charts[key].destroy(); S.charts[key] = null; }
      if (!S.charts[key]) {
        const opt = baseOpts(S.range); Object.assign(opt.scales, scales); opt.scales.x.min = xmin; opt.scales.x.max = xmax; Object.assign(opt.plugins, extra || {});
        S.charts[key] = new Chart($(canvas), { type: 'line', data: { datasets: ds }, options: opt, plugins: [bandsPlugin] });
      } else {
        const ch = S.charts[key]; ch.data.datasets.forEach((d, i) => { d.data = ds[i].data; d.label = ds[i].label; });
        ch.options.scales.x.min = xmin; ch.options.scales.x.max = xmax; ch.update('none');
      }
    };
    mk('idx', 'indexChart', ds1, { y: { grid: { color: grid }, ticks: { color: tick }, suggestedMin: 85, suggestedMax: 150 } }, { bands: true });
    mk('th', 'thChart', ds2, { y: { position: 'left', grid: { color: grid }, ticks: { color: tick } }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tick } } });
    if (!$('rawBox').hidden) mk('raw', 'rawChart', ds3, { y: { position: 'left', grid: { color: grid }, ticks: { color: tick } }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tick } }, y2: { display: false } });
  }

  // ------------------------------------------------------------ health
  function moldInfo() {
    const r = S.rows.filter(x => x.t > Date.now() - DAY && x.hum !== null);
    const a = r.filter(x => x.hum >= 70).length * 30 / 3600, b = r.filter(x => x.hum >= 80).length * 30 / 3600;
    return { a, b, level: b >= 6 ? 2 : a >= 6 ? 1 : 0, n: r.length };
  }
  function nightWindow() {
    const now = Date.now(), m = midnight(now), h = hourOf(now);
    return h < 7 ? [m - HOUR, now] : [m - HOUR, m + 7 * HOUR];
  }
  function renderHealth() {
    const R = latest();
    if (R && R.temp !== null && R.hum !== null) {
      const hi = heatIndexC(R.temp, R.hum), fl = feelsLike(R.temp, R.hum), dp = dewPoint(R.temp, R.hum);
      $('comfortLabel').textContent = T('comfortL')[comfortIdx(fl)]; $('feels2').textContent = fmt(fl, 1) + '°C';
      $('dewLabel').textContent = T('dewL')[dewIdx(dp)]; $('dew2').textContent = `${fmt(dp, 1)}°C`;
      void hi;
    }
    const m = moldInfo();
    $('moldLabel').textContent = m.n ? T('moldL')[m.level] : '—';
    $('moldDetail').textContent = m.n ? fill(T('moldDetail'), { a: fmt(m.a, 1), b: fmt(m.b, 1) }) : '';
    // night report
    const [ns, ne] = nightWindow(), st = dayStats(S.rows, ns, ne);
    if (!st || st.n < 60) $('nightReport').innerHTML = `<div class="empty">${T('nightNoData')}</div>`;
    else {
      const r = S.rows.filter(x => x.t >= ns && x.t < ne && x.temp !== null && x.hum !== null);
      const af = mean(r.map(x => feelsLike(x.temp, x.hum)));
      const verdict = st.pct[0] >= 85 && st.events.length === 0 ? T('nightGood') : st.pct[0] >= 65 ? T('nightMixed') : T('nightPoor');
      const s = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
      $('nightReport').innerHTML = `<div class="stat" style="grid-column:1/-1"><div class="v">${verdict}</div><div class="k">${fmt(st.pct[0], 0)}% ${T('lv')[0]} · ${st.events.length ? st.events.length + ' ' + T('sprays') : T('noSprays')}</div></div>` +
        s(fmt(st.avgIdx, 0), T('avgIndex')) + s(`${fmt(st.pct[1] + st.pct[2] + st.pct[3], 0)}%`, `${T('lv')[1]}+`) + s(st.events.length, T('sprays')) +
        s(`${fmt(af, 1)}°C`, T('avgFeels')) + s(`${fmt(st.avgH, 0)}%`, T('avgHum'));
    }
    // indoor vs outdoor
    const O = S.outdoor;
    const din = R ? dewPoint(R.temp, R.hum) : null;
    $('ioGrid').innerHTML = `<div></div><div class="h">${T('indoor')}</div><div class="h">${T('outdoorCol')}</div>` +
      `<div>${T('tempRow')}</div><div class="v">${R ? fmt(R.temp, 1) : '—'}°C</div><div class="v">${O ? fmt(O.temperature_2m, 1) : '—'}°C</div>` +
      `<div>${T('humRow')}</div><div class="v">${R ? fmt(R.hum, 0) : '—'}%</div><div class="v">${O ? fmt(O.relative_humidity_2m, 0) : '—'}%</div>` +
      `<div>${T('dewRow')}</div><div class="v">${fmt(din, 1)}°C</div><div class="v">${O ? fmt(O.dew_point_2m, 1) : '—'}°C</div>`;
    if (!O || !R) { $('windowAdvice').textContent = S.outdoorErr ? T('outUnavailable') : T('loading'); }
    else {
      const reasons = [];
      if (!(O.temperature_2m < R.temp - 1)) reasons.push(T('rWarmer'));
      if (!(O.dew_point_2m < din)) reasons.push(T('rHumid'));
      if (O.precipitation > 0) reasons.push(T('rRain'));
      $('windowAdvice').textContent = reasons.length ? fill(T('winBad'), { r: reasons.join(', ') }) : T('winGood');
    }
  }

  // ------------------------------------------------------------ analysis
  function renderAnalysis() {
    const rows = S.rows7.length ? S.rows7 : S.rows;
    // heatmap: 7 days x 24 hours
    const today0 = midnight(Date.now()); const days = [];
    for (let i = 6; i >= 0; i--) days.push(today0 - i * DAY);
    const cell = {}; rows.forEach(r => { if (r.index === null) return; const k = dayKey(r.t) + '|' + hourOf(r.t); (cell[k] = cell[k] || []).push(r.index); });
    let html = '<div></div>' + Array.from({ length: 24 }, (_, h) => `<div class="hh">${h % 3 === 0 ? h : ''}</div>`).join('');
    for (const d of days) {
      html += `<div class="hl">${dayLabel(d + 12 * HOUR)}</div>`;
      for (let h = 0; h < 24; h++) {
        const v = cell[dayKey(d + 12 * HOUR) + '|' + h];
        if (!v) { html += `<div class="hc" style="background:transparent;outline:1px dashed ${css('--rule')}"></div>`; continue; }
        const m = mean(v), lv = levelOfIndex(m), alpha = lv === 0 ? 0.35 + Math.min(0.5, Math.max(0, (m - 90) / 30)) : 0.95;
        html += `<div class="hc" title="${hhmm(d + h * HOUR)} · ${m.toFixed(0)}" style="background:${LV_COL[lv]};opacity:${alpha.toFixed(2)}"></div>`;
      }
    }
    $('heatmap').innerHTML = html;
    $('heatLegend').innerHTML = T('lv').map((n, i) => `<span><span class="sw" style="background:${LV_COL[i]}"></span>${n}</span>`).join('') +
      `<span><span class="sw" style="outline:1px dashed ${css('--rule')}"></span>${T('noDataCell')}</span>`;
    // compare table
    const now = Date.now();
    const tS = dayStats(S.rows, today0, now + MIN), yS = dayStats(S.rows, today0 - DAY, today0);
    const wk = [];
    for (let i = 0; i < 7; i++) { const s = dayStats(rows, today0 - i * DAY, today0 - (i - 1) * DAY); if (s && s.n > 20) wk.push(s); }
    const wAvg = f => (wk.length ? mean(wk.map(f)) : null);
    const line = (name, a, b, c, d = 0, suf = '', dc = d) => `<div>${name}</div><div class="num">${a === null ? '—' : fmt(a, d) + suf}</div><div class="num">${b === null ? '—' : fmt(b, d) + suf}</div><div class="num">${c === null ? '—' : fmt(c, dc) + suf}</div>`;
    $('compareTable').innerHTML = `<div class="ch"></div><div class="ch num">${T('today')}</div><div class="ch num">${T('yesterday')}</div><div class="ch num">${T('week')}</div>` +
      line(T('avgIndex'), tS && tS.avgIdx, yS && yS.avgIdx, wAvg(s => s.avgIdx)) +
      line(T('normalPct'), tS && tS.pct[0], yS && yS.pct[0], wAvg(s => s.pct[0]), 0, '%') +
      line(T('sprays'), tS && tS.events.length, yS && yS.events.length, wAvg(s => s.events.length), 0, '', 1) +
      line(T('peak'), tS && tS.peak.index, yS && yS.peak.index, wAvg(s => s.peak.index)) +
      `<div class="small muted" style="grid-column:1/-1;border:0">${T('week')}: ${T('approx')}</div>`;
    // overlay chart: 15-min profile, today vs yesterday vs 7-day
    const prof = (rr, s0, s1) => { const b = {}; rr.forEach(r => { if (r.index === null || r.t < s0 || r.t >= s1) return; const k = Math.floor((r.t - midnight(r.t)) / (15 * MIN)); (b[k] = b[k] || []).push(r.index); });
      return Object.keys(b).map(Number).sort((a, c) => a - c).map(k => ({ x: k * 15 * MIN, y: mean(b[k]) })); };
    const wkB = {}; rows.forEach(r => { if (r.index === null || r.t < today0 - 7 * DAY) return; const k = Math.floor((r.t - midnight(r.t)) / (15 * MIN)); (wkB[k] = wkB[k] || []).push(r.index); });
    const wkP = Object.keys(wkB).map(Number).sort((a, c) => a - c).map(k => ({ x: k * 15 * MIN, y: mean(wkB[k]) }));
    const ds = [{ label: T('today'), data: prof(S.rows, today0, now + MIN), borderColor: css('--ink'), borderWidth: 2 },
      { label: T('yesterday'), data: prof(S.rows, today0 - DAY, today0), borderColor: '#94a3b8', borderWidth: 1.5 },
      { label: T('week'), data: wkP, borderColor: '#7c5cff', borderDash: [5, 4], borderWidth: 1.5 }];
    const grid = css('--rule'), tick = css('--slate');
    if (!window.Chart) return;
    if (S.charts.ov) S.charts.ov.destroy();
    S.charts.ov = new Chart($('overlayChart'), { type: 'line', data: { datasets: ds }, plugins: [bandsPlugin], options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false }, elements: { point: { radius: 0 }, line: { tension: 0.2 } },
      plugins: { bands: true, legend: { labels: { color: css('--ink'), boxWidth: 12 } }, tooltip: { callbacks: { title: it => (it.length ? hhmm(it[0].parsed.x - TZ) : '') } } },
      scales: { x: { type: 'linear', min: 0, max: DAY, grid: { color: grid }, ticks: { color: tick, stepSize: 3 * HOUR, callback: v => String(Math.round(v / HOUR)).padStart(2, '0') + ':00' } },
                y: { grid: { color: grid }, ticks: { color: tick }, suggestedMin: 90, suggestedMax: 130 } } } });
  }

  // ------------------------------------------------------------ info
  function renderInfo() {
    const r = n => n.toFixed(1);
    const en = `
<h3>What the levels mean</h3>
<table><tr><th>Level</th><th>Pollution Index</th><th>Typical cause</th></tr>
<tr><td><span class="sw" style="background:${LV_COL[0]}"></span>Normal</td><td>≤ ${r(TH[0])}</td><td>usual room air</td></tr>
<tr><td><span class="sw" style="background:${LV_COL[1]}"></span>Slightly Elevated</td><td>${r(TH[0])} – ${r(TH[1])}</td><td>small rise in gases/VOCs (people, closed windows)</td></tr>
<tr><td><span class="sw" style="background:${LV_COL[2]}"></span>Elevated</td><td>${r(TH[1])} – ${r(TH[2])}</td><td>clear pollution event (cooking, incense, spray)</td></tr>
<tr><td><span class="sw" style="background:${LV_COL[3]}"></span>Spike</td><td>&gt; ${r(TH[2])}</td><td>sudden strong rise — in this room usually an air-freshener spray</td></tr></table>
<h3>A relative index, not an AQI</h3>
<p>The MP-135 metal-oxide sensor reacts to many gases at once (alcohol, hydrogen, CO, VOCs) and cannot measure any single gas in ppm. The ESP32 therefore converts the raw signal into a resistance ratio, corrects it for humidity and temperature (DHT22), and compares it with the median of the previous 3 hours. <b>100 = this room's usual level</b>; 130 means 30 % above it. These levels are not health categories and this is not an official Air Quality Index. Dust (PM2.5) is not measured.</p>
<h3>How the forecast works</h3>
<p>A small LightGBM model (60 trees, about 60 KB of C code) runs on the ESP32 itself and predicts how the index will change in the next 10 minutes (about 86 µs per prediction). On unseen test days it reduced forecast error by 13–16 % compared with assuming "no change". It forecasts recovery after a spray well, but cannot know in advance when someone will spray.</p>
<h3>Daily room score</h3>
<p>A simple heuristic: 100 − (0.2 × % Slightly Elevated + 0.6 × % Elevated + 1.0 × % Spike) − 3 × spray events − 0.1 × % time with feels-like temperature above 41 °C, limited to 0–100. 85+ Excellent · 70–84 Good · 50–69 Fair · below 50 Poor.</p>
<h3>Comfort calculations</h3>
<p>Feels-like temperature uses the NOAA heat index; dew point uses the Magnus formula. Mold risk: humidity ≥ 70 % for 6 h or more in the last 24 h = Moderate, ≥ 80 % for 6 h or more = High.</p>
<h3>Hardware</h3>
<p>ESP32 DevKit · Winsen MP-135 MOS gas sensor (AO → GPIO 33) · DHT22 (GPIO 25) · SSD1306 OLED (I²C). One reading every 30 s, uploaded to Google Sheets. The website reads the newest rows every 30 s.</p>`;
    $('infoContent').innerHTML = en;
  }

  // ------------------------------------------------------------ app shell
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { const v = T(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
    document.querySelectorAll('#rangeSeg button').forEach(b => (b.textContent = T('range')[b.dataset.range]));
    renderNotifBtn();
  }
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    const ic = { auto: '<path d="M12 3a9 9 0 1 0 0 18z" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>', dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>', light: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' };
    $('themeBtn').innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">${ic[theme]}</svg>`;
    $('themeBtn').title = theme;
  }
  function setTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    try { sessionStorage.setItem('aq_tab', tab); } catch { /* ignore */ }
    if (tab === 'charts') renderCharts(true);
    if (tab === 'health') renderHealth();
    if (tab === 'analysis') renderAnalysis();
    if (tab === 'info') renderInfo();
    window.scrollTo({ top: 0 });
  }
  function renderAll() {
    renderStatus(); renderLive(); renderBanner(); renderAdvice(); renderSummary(); checkNotifications();
    if (S.tab === 'charts') renderCharts(false);
    if (S.tab === 'health') renderHealth();
    if (S.tab === 'analysis') renderAnalysis();
  }
  function rebuildAll() { Object.keys(S.charts).forEach(k => { if (S.charts[k]) S.charts[k].destroy(); delete S.charts[k]; }); renderAll(); if (S.tab === 'charts') renderCharts(true); if (S.tab === 'info') renderInfo(); }

  function bind() {
    document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelectorAll('#rangeSeg button').forEach(b => b.addEventListener('click', () => {
      S.range = +b.dataset.range; document.querySelectorAll('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b)); renderCharts(true);
    }));
    $('rawToggle').addEventListener('change', e => { $('rawBox').hidden = !e.target.checked; renderCharts(true); });
    $('themeBtn').addEventListener('click', () => { theme = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto'; store.set('aq_theme', theme); applyTheme(); rebuildAll(); });
    $('notifBtn').addEventListener('click', async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } renderNotifBtn(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme === 'auto') rebuildAll(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  }

  async function start() {
    applyTheme(); applyLang(); bind();
    $('demoBanner').hidden = !DEMO;
    if (!window.Chart) { toast('Chart library failed to load — check your internet connection.'); }
    renderStatus();
    await loadMain();
    renderAll();
    let saved = null; try { saved = sessionStorage.getItem('aq_tab'); } catch { /* ignore */ }
    if (saved && saved !== 'live') setTab(saved);
    load7(); loadOutdoor();
    setInterval(poll, REFRESH);
    setInterval(renderAgo, 1000);
    setInterval(load7, 15 * MIN);
    setInterval(loadOutdoor, 15 * MIN);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
