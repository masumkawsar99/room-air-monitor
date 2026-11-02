# Room Air Monitor — web app

Live dashboard for the low-cost ESP32 + MP-135 + DHT22 indoor air quality monitor with an on-device TinyML forecast.

```
ESP32 ──(every 30 s)──► Google Apps Script ──► Google Sheet "Data"
                                                     │
   Web app (phone / PC) ◄──(reads every 30 s)── Apps Script ?action=read
```

The ESP32 firmware does not change. The website only reads data.

---

## Step 1 — Update the Apps Script (5 min)

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Delete everything in `Code.gs` and paste the contents of **`Code.gs`** from this folder. Press **Save** (💾).
3. Click **Deploy → Manage deployments**.
4. Click the **pencil (Edit)** icon of your existing deployment.
5. Under **Version**, choose **New version**, then click **Deploy**.
   - Keep *Execute as: Me* and *Who has access: Anyone*.
   - **Do not create a new deployment.** Editing the existing one keeps the same `/exec` URL, so the ESP32 keeps working.
6. Test in your browser: open `YOUR_EXEC_URL?action=read&hours=1`
   You should see text starting with `{"ok":true,...`.

What changed in the script:
- columns **Y `forecast_index`** and **Z `forecast_class`** are now saved (the ESP32 already sends them);
- a read-only `?action=read` mode for the website;
- opening the URL without data no longer adds empty rows.

## Step 2 — Set your URL

Open **`config.js`** and paste your `/exec` URL:

```js
API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

Leave it empty to see the app with demo data.

## Step 3 — Publish free on GitHub Pages (10 min)

1. Create a free account at <https://github.com> (if you don't have one).
2. Click **+ → New repository**, name it e.g. `air-monitor`, choose **Public**, click **Create repository**.
3. Click **uploading an existing file**, drag in **all files and the `icons` folder** from this folder
   (`index.html`, `app.js`, `styles.css`, `config.js`, `manifest.json`, `sw.js`, `icons/…`). Click **Commit changes**.
   (`Code.gs` and `README.md` are optional on GitHub.)
4. Go to **Settings → Pages**. Under *Branch*, choose **main** and **/(root)**, click **Save**.
5. After about 1 minute your site is live at
   `https://YOUR-USERNAME.github.io/air-monitor/`

> Privacy: anyone who has the website link can see your room's readings. The Apps Script `?action=read` only reads data; it cannot change your sheet.

## Step 4 — Install on your phone

- **Android (Chrome):** open the site → ⋮ menu → **Add to Home screen / Install app**.
- **iPhone (Safari):** open the site → Share ↑ → **Add to Home Screen**.

It then opens like an app with its own icon.

---

## Features

| Page | What it shows |
|---|---|
| **Overview** | air level with the Pollution Index orb, the 10-minute TinyML forecast with a 2-hour trend, temperature / humidity / feels-like / dew point with 6-hour sparklines, today's colour bar and stats, advice, room score, mold risk, thermal comfort, night air report, indoor vs outdoor weather, today's spray events |
| **Trends** | range summary (average, peak, time in Normal, live forecast error), Pollution Index with level bands and forecast vs actual, temperature & humidity, index by time of day, 7-day hour × day heatmap, today vs yesterday vs 7-day average, optional raw gas_adc / Rs / ratio; 1 h · 6 h · 24 h · 7 d |
| **About** | what the levels mean, why it is a relative index (not an AQI), how the forecast works, room-score formula, hardware, notifications |

Also: dark / light / auto theme, browser notifications for spikes and "air is clear again", works offline with the last loaded data.

## Notes

- The current level and forecast are computed **on the ESP32** and simply displayed here, so the website always matches the OLED (it is 15–60 s behind).
- After the ESP32 restarts it needs ~1 h before the level appears and ~2 h before the forecast — the website shows "Warming up" during that time.
- Settings such as refresh time and level thresholds are in `config.js`. The thresholds must match the ESP32 firmware.
