/**
 * IPTrace — app.js
 * ─────────────────────────────────────────────────────────────
 * IP Geolocation Tracker using:
 *   • ipify.org     → fetch the user's own public IP
 *   • ipapi.co      → geolocation lookup (no API key required for basic use)
 *   • Leaflet.js    → interactive map via OpenStreetMap tiles
 *
 * For higher rate limits / advanced fields, swap the API below
 * and insert your API key where indicated.
 * ─────────────────────────────────────────────────────────────
 */

// ─── CONFIGURATION ────────────────────────────────────────────
const CONFIG = {
  /**
   * ⬇ API ENDPOINTS
   *
   * ipapi.co is free with 1,000 req/day (no key needed).
   * To use a keyed provider such as ipgeolocation.io, replace
   * the buildApiUrl() function below and add:
   *   apiKey: 'YOUR_API_KEY_HERE'
   */
  ipifyUrl:  'https://api.ipify.org?format=json',
  ipapiBase: 'https://ipapi.co',          // ← swap base URL here if changing provider

  mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttrib:  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  defaultZoom: 12,
};

// ─── BUILD GEOLOCATION API URL ────────────────────────────────
/**
 * Returns the URL for ipapi.co.
 * If you switch to ipgeolocation.io, change this to:
 *   `https://api.ipgeolocation.io/ipgeo?apiKey=${CONFIG.apiKey}&ip=${ip}`
 *
 * @param {string} ip – IP address to look up (empty string = caller's IP)
 * @returns {string}
 */
function buildApiUrl(ip) {
  const endpoint = ip ? `/${ip}/json/` : '/json/';
  return `${CONFIG.ipapiBase}${endpoint}`;
}

// ─── DOM REFERENCES ───────────────────────────────────────────
const ipInput    = document.getElementById('ipInput');
const searchBtn  = document.getElementById('searchBtn');
const loaderWrap = document.getElementById('loaderWrap');
const errorCard  = document.getElementById('errorCard');
const errorMsg   = document.getElementById('errorMsg');
const errorClose = document.getElementById('errorClose');
const results    = document.getElementById('results');
const themeToggle= document.getElementById('themeToggle');
const toggleIcon = document.getElementById('toggleIcon');
const toggleLabel= document.getElementById('toggleLabel');
const copyBtn    = document.getElementById('copyBtn');

// Result value elements
const els = {
  ip:        document.getElementById('displayIp'),
  country:   document.getElementById('valCountry'),
  continent: document.getElementById('valContinent'),
  city:      document.getElementById('valCity'),
  region:    document.getElementById('valRegion'),
  isp:       document.getElementById('valIsp'),
  asn:       document.getElementById('valAsn'),
  timezone:  document.getElementById('valTimezone'),
  localTime: document.getElementById('valLocalTime'),
  lat:       document.getElementById('valLat'),
  lon:       document.getElementById('valLon'),
  mapCoords: document.getElementById('mapCoords'),
};

// ─── MAP STATE ────────────────────────────────────────────────
let leafletMap    = null;   // Leaflet map instance
let mapMarker     = null;   // Current marker on the map

// ─── THEME MANAGEMENT ─────────────────────────────────────────
let isDark = true;

themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  toggleIcon.textContent  = isDark ? '☀' : '◑';
  toggleLabel.textContent = isDark ? 'Light' : 'Dark';

  // Refresh tile layer so map colours update with theme
  if (leafletMap) refreshMapTheme();
});

// ─── UTILITY — show / hide states ────────────────────────────
function showLoader()  { loaderWrap.hidden = false; results.hidden = true; hideError(); }
function hideLoader()  { loaderWrap.hidden = true; }
function showResults() { results.hidden = false; }
function showError(msg){
  errorMsg.textContent = msg;
  errorCard.hidden = false;
  // Scroll error into view on mobile
  errorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError()   { errorCard.hidden = true; }

errorClose.addEventListener('click', hideError);

// ─── UTILITY — format coordinate ─────────────────────────────
function formatCoord(val, posLabel, negLabel) {
  if (val == null) return '—';
  const abs = Math.abs(val).toFixed(6);
  const dir = val >= 0 ? posLabel : negLabel;
  return `${abs}° ${dir}`;
}

// ─── UTILITY — get local time in a timezone ──────────────────
function getLocalTime(tz) {
  try {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '—';
  }
}

// ─── COPY IP TO CLIPBOARD ────────────────────────────────────
copyBtn.addEventListener('click', () => {
  const ip = els.ip.textContent;
  if (!ip || ip === '—') return;
  navigator.clipboard.writeText(ip).then(() => {
    copyBtn.textContent = '✓';
    copyBtn.style.color = 'var(--accent)';
    setTimeout(() => {
      copyBtn.textContent = '⧉';
      copyBtn.style.color = '';
    }, 1800);
  });
});

// ─── FETCH USER's OWN IP ─────────────────────────────────────
/**
 * Uses ipify.org to resolve the caller's public IP address.
 * @returns {Promise<string>}
 */
async function fetchMyIp() {
  const response = await fetch(CONFIG.ipifyUrl);
  if (!response.ok) throw new Error('Could not detect your public IP.');
  const data = await response.json();
  return data.ip;
}

// ─── FETCH GEOLOCATION DATA ───────────────────────────────────
/**
 * Calls ipapi.co to get location data for a given IP.
 * If ip is empty, ipapi returns the caller's own data.
 *
 * @param {string} ip – IP address or empty string
 * @returns {Promise<Object>}
 */
async function fetchGeoData(ip) {
  const url = buildApiUrl(ip);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // ipapi.co returns an "error" field for invalid IPs
  if (data.error) {
    throw new Error(data.reason || 'Invalid IP address or location not found.');
  }

  return data;
}

// ─── POPULATE RESULT CARDS ───────────────────────────────────
/**
 * Fills all visible result fields with the returned geo data.
 * @param {Object} d – ipapi.co response object
 */
function populateResults(d) {
  els.ip.textContent        = d.ip        || '—';
  els.country.textContent   = d.country_name
    ? `${d.country_name} ${d.country_code ? `(${d.country_code})` : ''}`
    : '—';
  els.continent.textContent = d.continent_code || '—';
  els.city.textContent      = d.city     || '—';
  els.region.textContent    = d.region   || '—';
  els.isp.textContent       = d.org      || d.asn || '—';
  els.asn.textContent       = d.asn      || '—';
  els.timezone.textContent  = d.timezone || '—';
  els.localTime.textContent = d.timezone ? getLocalTime(d.timezone) : '—';
  els.lat.textContent       = formatCoord(d.latitude,  'N', 'S');
  els.lon.textContent       = formatCoord(d.longitude, 'E', 'W');
  els.mapCoords.textContent = (d.latitude != null && d.longitude != null)
    ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`
    : '—';
}

// ─── MAP MANAGEMENT ───────────────────────────────────────────
/** Custom pulsing SVG icon for Leaflet marker */
function createPulseIcon() {
  return L.divIcon({
    className: '',
    iconSize:  [16, 16],
    iconAnchor:[8, 8],
    popupAnchor:[0, -12],
    html: '<div class="pulse-marker"></div>',
  });
}

/** Creates or re-initialises the Leaflet map */
function initMap(lat, lon) {
  if (!leafletMap) {
    leafletMap = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
    }).setView([lat, lon], CONFIG.defaultZoom);

    L.tileLayer(CONFIG.mapTileUrl, {
      attribution: CONFIG.mapAttrib,
      maxZoom: 19,
    }).addTo(leafletMap);

    // Custom minimal attribution in footer — native control hidden
    leafletMap.attributionControl?.setPrefix('');
  } else {
    leafletMap.setView([lat, lon], CONFIG.defaultZoom, { animate: true, duration: 0.8 });
  }
}

/** Places / moves the marker and opens a popup */
function placeMarker(lat, lon, label) {
  if (mapMarker) {
    mapMarker.setLatLng([lat, lon]);
  } else {
    mapMarker = L.marker([lat, lon], { icon: createPulseIcon() }).addTo(leafletMap);
  }

  mapMarker.bindPopup(
    `<strong style="color:var(--accent)">${label}</strong><br/>
     ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    { closeButton: false }
  ).openPopup();
}

/** Swap tile layer when theme changes (optional visual tweak) */
function refreshMapTheme() {
  // OpenStreetMap looks fine in both themes; no tile swap needed.
  // If you want Carto dark tiles, uncomment below:
  // const tileUrl = isDark
  //   ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  //   : CONFIG.mapTileUrl;
  // leafletMap.eachLayer(l => { if (l._url) leafletMap.removeLayer(l); });
  // L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(leafletMap);
}

// ─── MAIN TRACE FUNCTION ──────────────────────────────────────
/**
 * Orchestrates the full lookup pipeline:
 *  1. Validate / resolve input
 *  2. Fetch geolocation data
 *  3. Update UI (cards + map)
 *
 * @param {string} rawInput – value from search box (may be empty)
 */
async function traceIp(rawInput) {
  const query = rawInput.trim();

  showLoader();

  try {
    let ip = query;

    // If no input, auto-detect with ipify
    if (!ip) {
      ip = await fetchMyIp();
    }

    // Basic client-side validation (accepts IPv4, IPv6, domains)
    validateInput(ip);

    // Fetch geo data
    const data = await fetchGeoData(ip);

    // Populate the UI
    populateResults(data);

    // Map
    const lat = data.latitude;
    const lon = data.longitude;
    if (lat != null && lon != null) {
      initMap(lat, lon);
      placeMarker(lat, lon, data.city || data.country_name || ip);
      // Force map to resize in case container just became visible
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }

    hideLoader();
    showResults();

  } catch (err) {
    hideLoader();
    showError(err.message || 'Unexpected error. Please try again.');
    console.error('[IPTrace]', err);
  }
}

// ─── INPUT VALIDATION ─────────────────────────────────────────
/**
 * Throws if the input looks obviously invalid.
 * (The API will catch edge-cases anyway.)
 * @param {string} val
 */
function validateInput(val) {
  if (!val) throw new Error('Please enter an IP address or domain name.');

  // Allow IPv4, IPv6, or domain patterns
  const ipv4    = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6    = /^[0-9a-fA-F:]+$/;
  const domain  = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

  if (!ipv4.test(val) && !ipv6.test(val) && !domain.test(val)) {
    throw new Error(`"${val}" doesn't look like a valid IP or domain.`);
  }

  // Reject private / loopback addresses
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(val)) {
    throw new Error('Private/loopback IPs cannot be geolocated.');
  }
}

// ─── EVENT LISTENERS ─────────────────────────────────────────
// Search button click
searchBtn.addEventListener('click', () => traceIp(ipInput.value));

// Enter key in input
ipInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') traceIp(ipInput.value);
});

// ─── ON PAGE LOAD ─────────────────────────────────────────────
// Auto-detect the user's IP on first load
window.addEventListener('DOMContentLoaded', () => {
  traceIp('');
});
