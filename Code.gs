/**
 * Low-Cost Indoor Air Quality Monitor - Google Apps Script
 *
 * WRITE (used by the ESP32, unchanged behaviour):
 *   GET <exec URL>?temp=..&hum=..&index=..&air=..&gas_adc=..&forecast_index=..&forecast_class=..
 *   -> appends one row to the "Data" sheet and returns "OK"
 *
 * READ (used by the website, read-only):
 *   GET <exec URL>?action=read&hours=24            last 24 h (max 168 = 7 days)
 *   GET <exec URL>?action=read&hours=168&step=10   every 10th row (for long ranges)
 *   GET <exec URL>?action=read&since=1730550000000 only rows newer than this time (ms)
 *   -> returns JSON, never changes the sheet
 */

const SHEET_NAME = "Data";
const MAX_HOURS = 168;            // 7 days
const ROWS_PER_HOUR = 120;        // one row every 30 s

// A-Z: 26 columns (Y and Z are new: forecast from the on-device TinyML model)
const HEADERS = [
  "Time", "Temp C", "Humidity %", "CO2 ppm", "NH3 ppm", "CO ppm", "Alcohol ppm",
  "Benzene ppm", "H2 ppm", "NOx", "Smoke", "VOC", "Pollution Index", "Air Quality",
  "gas_adc", "rs", "r0", "ratio", "gas_delta", "humidity_delta", "temp_delta",
  "rolling_mean", "rolling_std", "target_label", "forecast_index", "forecast_class"
];

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  if (p.action === "read") return handleRead(p);
  return handleWrite(p);
}

/* ------------------------------------------------------------------ WRITE */
function handleWrite(p) {
  // Ignore requests that carry no sensor data (e.g. someone opening the URL in a browser),
  // so no empty rows are created. The ESP32 always sends gas_adc.
  if (p.gas_adc === undefined || String(p.gas_adc).trim() === "") {
    return text("NO DATA - nothing written");
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSheet();
    ensureHeaders(sheet);

    function num(key) {
      if (p[key] === undefined || p[key] === null || String(p[key]).trim() === "") return "";
      const v = Number(p[key]);
      return Number.isFinite(v) ? v : "";
    }
    const airQuality = p.air && String(p.air).trim() !== "" ? String(p.air).trim() : "";

    const row = [
      new Date(),             // A Time
      num("temp"),            // B Temp C
      num("hum"),             // C Humidity %
      num("co2"),             // D CO2 ppm
      num("nh3"),             // E NH3 ppm
      num("co"),              // F CO ppm
      num("alcohol"),         // G Alcohol ppm
      num("benzene"),         // H Benzene ppm
      num("h2"),              // I H2 ppm
      num("nox"),             // J NOx
      num("smoke"),           // K Smoke
      num("voc"),             // L VOC
      num("index"),           // M Pollution Index
      airQuality,             // N Air Quality
      num("gas_adc"),         // O gas_adc
      num("rs"),              // P rs
      num("r0"),              // Q r0
      num("ratio"),           // R ratio
      num("gas_delta"),       // S gas_delta
      num("humidity_delta"),  // T humidity_delta
      num("temp_delta"),      // U temp_delta
      num("rolling_mean"),    // V rolling_mean
      num("rolling_std"),     // W rolling_std
      p.target_label || "",   // X target_label
      num("forecast_index"),  // Y forecast_index  (NEW)
      num("forecast_class")   // Z forecast_class  (NEW)
    ];
    if (row.length !== HEADERS.length) throw new Error("Expected " + HEADERS.length + " columns, got " + row.length);

    sheet.appendRow(row);
    return text("OK");
  } catch (error) {
    return text("ERROR: " + String(error));
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/* ------------------------------------------------------------------- READ */
function handleRead(p) {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    const out = { ok: true, updated: new Date().toISOString(), rows: [] };
    if (lastRow < 2) return json(out);

    let hours = Number(p.hours);
    if (!Number.isFinite(hours) || hours <= 0) hours = 24;
    hours = Math.min(hours, MAX_HOURS);
    let step = Math.max(1, Math.min(60, Math.floor(Number(p.step) || 1)));
    const since = Number(p.since);
    const useSince = Number.isFinite(since) && since > 0;

    // Read only the newest rows (plus a 10 % margin for gaps), not the whole sheet.
    const wanted = useSince ? 400 : Math.ceil(hours * ROWS_PER_HOUR * 1.1);
    const n = Math.min(wanted, lastRow - 1);
    const first = lastRow - n + 1;
    const values = sheet.getRange(first, 1, n, HEADERS.length).getValues();

    const nowMs = Date.now();
    const fromMs = useSince ? since : nowMs - hours * 3600 * 1000;
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      const t = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
      if (!Number.isFinite(t) || t <= fromMs) continue;
      rows.push({
        t: t,
        temp: val(r[1]), hum: val(r[2]),
        index: val(r[12]), air: r[13] === "" ? null : String(r[13]),
        gas: val(r[14]), rs: val(r[15]), ratio: val(r[17]),
        fi: val(r[24]), fc: val(r[25])
      });
    }
    // Down-sample long ranges, but always keep the newest row.
    if (step > 1 && rows.length > 0) {
      const thin = rows.filter(function (_, i) { return i % step === 0; });
      if (thin[thin.length - 1] !== rows[rows.length - 1]) thin.push(rows[rows.length - 1]);
      out.rows = thin;
    } else {
      out.rows = rows;
    }
    out.count = out.rows.length;
    return json(out);
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

/* ---------------------------------------------------------------- helpers */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  for (let i = 0; i < HEADERS.length; i++) {
    if (String(current[i]).trim() === "") sheet.getRange(1, i + 1).setValue(HEADERS[i]);
  }
}

function val(x) {
  if (x === "" || x === null || x === undefined) return null;
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function text(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
