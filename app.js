const ipInput = document.getElementById("ipInput");
const searchBtn = document.getElementById("searchBtn");

const loaderWrap = document.getElementById("loaderWrap");
const errorCard = document.getElementById("errorCard");
const errorMsg = document.getElementById("errorMsg");
const errorClose = document.getElementById("errorClose");
const results = document.getElementById("results");

const themeToggle = document.getElementById("themeToggle");
const toggleIcon = document.getElementById("toggleIcon");
const toggleLabel = document.getElementById("toggleLabel");

const els = {
  ip: document.getElementById("displayIp"),
  country: document.getElementById("valCountry"),
  continent: document.getElementById("valContinent"),
  city: document.getElementById("valCity"),
  region: document.getElementById("valRegion"),
  isp: document.getElementById("valIsp"),
  asn: document.getElementById("valAsn"),
  timezone: document.getElementById("valTimezone"),
  localTime: document.getElementById("valLocalTime"),
  lat: document.getElementById("valLat"),
  lon: document.getElementById("valLon"),
  mapCoords: document.getElementById("mapCoords"),
};

// ─── MAP ───
let map;
let marker;

// ─── THEME ───
let isDark = true;

// load saved theme
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  document.documentElement.setAttribute("data-theme", savedTheme);
  isDark = savedTheme === "dark";
}

// update button UI
toggleIcon.textContent = isDark ? "☀" : "🌙";
toggleLabel.textContent = isDark ? "Light" : "Dark";

// toggle theme
themeToggle.addEventListener("click", () => {
  isDark = !isDark;

  const theme = isDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);

  toggleIcon.textContent = isDark ? "☀" : "🌙";
  toggleLabel.textContent = isDark ? "Light" : "Dark";

  localStorage.setItem("theme", theme);
});

// ─── UI HELPERS ───
function showLoader() {
  loaderWrap.hidden = false;
  results.hidden = true;
  errorCard.hidden = true;
}

function hideLoader() {
  loaderWrap.hidden = true;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorCard.hidden = false;
}

errorClose.addEventListener("click", () => {
  errorCard.hidden = true;
});

// ─── SIMPLE INPUT CHECK ───
function validateInput(ip) {
  if (!ip) return true;

  const parts = ip.split(".");

  // check IP
  if (parts.length === 4) {
    for (let part of parts) {
      const num = Number(part);
      if (isNaN(num) || num < 0 || num > 255) {
        throw new Error("Invalid IP address");
      }
    }
    return true;
  }

  // simple domain check
  if (ip.includes(".") && ip.length > 3) {
    return true;
  }

  throw new Error("Enter valid IP or domain");
}

// ─── GET USER IP ───
async function getMyIP() {
  const res = await fetch("https://api.ipify.org?format=json");
  const data = await res.json();
  return data.ip;
}

// ─── GET LOCATION (CORS SAFE) ───
async function getLocation(ip) {
  const url = ip
    ? `https://api.ipapi.is/?q=${ip}`
    : `https://api.ipapi.is/`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.ip) {
    throw new Error("Invalid IP or API failed");
  }

  return {
    ip: data.ip,
    country: data.location?.country || "—",
    continent: data.location?.continent || "—",
    city: data.location?.city || "—",
    region: data.location?.region || "—",
    latitude: data.location?.latitude,
    longitude: data.location?.longitude,
    isp: data.connection?.isp || "—",
    asn: data.connection?.asn || "—",
    timezone: data.timezone?.id || "—",
    localTime: data.timezone?.current_time || "—"
  };
}

// ─── SHOW DATA ───
function showData(d) {
  els.ip.textContent = d.ip;
  els.country.textContent = d.country;
  els.continent.textContent = d.continent;
  els.city.textContent = d.city;
  els.region.textContent = d.region;
  els.isp.textContent = d.isp;
  els.asn.textContent = d.asn;
  els.timezone.textContent = d.timezone;
  els.localTime.textContent = d.localTime;

  const lat = d.latitude;
  const lon = d.longitude;

  els.lat.textContent = lat ? lat.toFixed(5) : "—";
  els.lon.textContent = lon ? lon.toFixed(5) : "—";
  els.mapCoords.textContent = lat && lon ? `${lat}, ${lon}` : "—";

  // map
  if (lat && lon) {
    if (!map) {
      map = L.map("map").setView([lat, lon], 10);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
        .addTo(map);
    } else {
      map.setView([lat, lon], 10);
    }

    if (marker) {
      marker.setLatLng([lat, lon]);
    } else {
      marker = L.marker([lat, lon]).addTo(map);
    }
  }

  results.hidden = false;
}

// ─── MAIN FUNCTION ───
async function traceIP(value) {
  showLoader();

  try {
    let ip = value.trim();

    validateInput(ip);

    if (!ip) {
      ip = await getMyIP();
    }

    const data = await getLocation(ip);
    showData(data);

    hideLoader();

  } catch (err) {
    hideLoader();
    showError(err.message);
    console.error(err);
  }
}

// ─── EVENTS ───
searchBtn.addEventListener("click", () => {
  traceIP(ipInput.value);
});

ipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    traceIP(ipInput.value);
  }
});

// ─── AUTO LOAD ───
window.addEventListener("DOMContentLoaded", () => {
  traceIP("");
});
