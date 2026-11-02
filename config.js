// ============================================================
//  Settings for the Air Quality web app
// ============================================================
window.AQ_CONFIG = {
  // Paste your Google Apps Script web-app URL here (it ends with /exec).
  // Leave it empty ("") to run the app with realistic DEMO data.
  API_URL: "",

  REFRESH_SECONDS: 30,          // how often new readings are fetched
  OFFLINE_AFTER_SECONDS: 120,   // device is shown as offline after this long without data

  // Location for the outdoor weather comparison (Dhaka)
  LAT: 23.8103,
  LON: 90.4125,

  // Class thresholds on the Pollution Index (from the final Colab run, same as the ESP32 firmware)
  THRESHOLDS: [105.33, 123.47, 139.71],   // Normal | Slightly Elevated | Elevated | Spike

  // Median time from a spray peak back to Normal, measured in the study (minutes)
  MEDIAN_RECOVERY_MIN: 29
};
