
"use strict";

/* ==========================================
   GREENROUTE AI — MAP PICKER + TRIP PLANNER
========================================== */

const $ = (id) => document.getElementById(id);

const KEYS = {
  profile: "greenrouteProfile",
  trips: "greenrouteTrips",
  points: "greenroutePoints"
};

const HOME = [12.9716, 77.5946]; // Bengaluru

const MODES = {
  car: {
    name: "Car", emoji: "🚗", description: "Private road travel",
    factor: 0.15, speed: 30, multiplier: 1, fare: 6.67, base: 0, extra: 0
  },
  bus: {
    name: "Bus", emoji: "🚌", description: "Estimated public bus",
    factor: 0.05, speed: 18, multiplier: 1.25, fare: 4, base: 15, extra: 10
  },
  metro: {
    name: "Metro", emoji: "🚇", description: "Estimated metro journey",
    factor: 0.03, speed: 32, multiplier: 1.15, fare: 3, base: 10, extra: 15
  },
  cycling: {
    name: "Cycling", emoji: "🚲", description: "Active, low-emission travel",
    factor: 0, speed: 15, multiplier: 1.12, fare: 0, base: 0, extra: 0
  },
  walking: {
    name: "Walking", emoji: "🚶", description: "A simple trip on foot",
    factor: 0, speed: 4.5, multiplier: 1.18, fare: 0, base: 0, extra: 0
  }
};

const PRIORITIES = {
  balanced: "The balanced explorer",
  eco: "The planet-first traveller",
  cost: "The budget explorer",
  time: "The time saver"
};

const pageOrder = [
  "pageTrip", "pagePreferences", "pageRoutes",
  "pageNavigation", "pageComplete", "profilePage"
];

const progressInfo = [
  ["STEP 01 / 05", "Plan your journey"],
  ["STEP 02 / 05", "Personalise your trip"],
  ["STEP 03 / 05", "Compare travel options"],
  ["STEP 04 / 05", "Track your journey"],
  ["STEP 05 / 05", "Journey completed"]
];

const state = {
  currentPage: "pageTrip",
  previousPage: "pageTrip",
  pickTarget: "start",
  start: null,
  destination: null,
  priority: "balanced",
  budget: 150,
  avoided: new Set(),
  routes: [],
  selectedMode: null,
  drivingKm: 0,
  drivingMinutes: 0,
  roadGeometry: null,
  routeNotice: "",
  carBaselineKg: 0,

  homeMap: null,
  routeMap: null,
  navigationMap: null,

  homeStartMarker: null,
  homeEndMarker: null,
  homeRouteLine: null,

  routeStartMarker: null,
  routeEndMarker: null,
  routeLine: null,

  navStartMarker: null,
  navEndMarker: null,
  navRouteLine: null,
  userMarker: null,

  watchId: null,
  tracking: false,
  completed: false,
  lastPosition: null,
  previousPosition: null,
  arrivalReadings: 0,
  travelledKm: 0,
  earnedPoints: 0
};

/* ---------- Storage ---------- */

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("Could not save local data", error);
    return false;
  }
}

function getTrips() {
  const trips = readJSON(KEYS.trips, []);
  return Array.isArray(trips) ? trips : [];
}

function getProfile() {
  const profile = readJSON(KEYS.profile, {});
  return profile && typeof profile === "object" ? profile : {};
}

function getPoints() {
  const value = Number(localStorage.getItem(KEYS.points) || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/* ---------- Helpers ---------- */

function setMessage(id, text, type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return "--";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatTime(minutes) {
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatMoney(amount) {
  return `₹${Math.round(Number(amount) || 0)}`;
}

function safeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function getInitial(name) {
  return String(name || "").trim().charAt(0).toUpperCase() || "U";
}

function haversineMetres(a, b) {
  const R = 6371000;
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(h),
    Math.sqrt(Math.max(0, 1 - h))
  );
}

function locationSummary(place) {
  return place ? `${place.name}` : "Not selected";
}

/* ---------- Page navigation ---------- */

function showPage(pageId, remember = true) {
  if (!$(pageId)) return;

  if (remember && state.currentPage !== "profilePage") {
    state.previousPage = state.currentPage;
  }

  state.currentPage = pageId;

  pageOrder.forEach((id) => {
    $(id).classList.toggle("active", id === pageId);
  });

  const profilePage = pageId === "profilePage";
  $("stepProgress").classList.toggle("hidden", profilePage);

  if (!profilePage) {
    const index = pageOrder.indexOf(pageId);
    if (index >= 0 && index < progressInfo.length) {
      $("stepLabel").textContent = progressInfo[index][0];
      $("stepDescription").textContent = progressInfo[index][1];
      $("progressBar").style.width = `${((index + 1) / 5) * 100}%`;
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });

  // Leaflet needs to recalculate its dimensions after a hidden page opens.
  requestAnimationFrame(() => {
    if (pageId === "pageTrip") {
      initHomeMap();
      state.homeMap?.invalidateSize();
      drawHomeMarkers();
    }

    if (pageId === "pageRoutes") {
      initRouteMap();
      state.routeMap?.invalidateSize();
      drawRouteMap();
    }

    if (pageId === "pageNavigation") {
      initNavigationMap();
      state.navigationMap?.invalidateSize();
      drawNavigationMap();
    }

    if (pageId === "profilePage") renderDashboard();
  });
}

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    // Going back doesn't clear locations, preferences, or route choices.
    showPage(button.dataset.back);
  });
});

/* ---------- Leaflet maps ---------- */

function createMap(id) {
  if (!window.L || !$(id)) return null;

  const map = L.map(id, {
    zoomControl: true,
    touchZoom: true,       // Pinch in/out on touchscreens
    doubleClickZoom: true,
    scrollWheelZoom: true,
    dragging: true,
    tap: true,
    boxZoom: false
  }).setView(HOME, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  return map;
}

function initHomeMap() {
  if (state.homeMap) return;

  state.homeMap = createMap("homeMap");
  if (!state.homeMap) {
    $("homeMapMessage").textContent =
      "Map library unavailable. Check your internet connection and refresh.";
    return;
  }

  // Tapping the map picks the currently active field.
  state.homeMap.on("click", async (event) => {
    const point = {
      lat: event.latlng.lat,
      lng: event.latlng.lng
    };

    const target = state.pickTarget;
    const targetLabel = target === "start" ? "starting point" : "destination";

    $("homeMapMessage").textContent =
      `Finding the place name for your ${targetLabel}…`;

    setMessage("tripMessage", "");

    try {
      const place = await reverseGeocode(point.lat, point.lng);

      // Keep the place name, coordinates, and source point together.
      const selectedPlace = {
        lat: point.lat,
        lng: point.lng,
        name: place.name,
        address: place.address || ""
      };

      setLocation(target, selectedPlace);

      if (target === "start") {
        setPickTarget("destination");
        $("homeMapMessage").textContent =
          `Start selected: ${selectedPlace.name}. Now tap your destination.`;
      } else {
        $("homeMapMessage").textContent =
          `Destination selected: ${selectedPlace.name}. You can continue when ready.`;
      }

      drawHomeMarkers();
    } catch (error) {
      console.error("Reverse geocoding failed", error);

      // Even if the naming service fails, retain a readable label,
      // not a bare coordinate string.
      const readable = {
        lat: point.lat,
        lng: point.lng,
        name: `Pinned location (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        address: ""
      };

      setLocation(target, readable);

      if (target === "start") setPickTarget("destination");

      $("homeMapMessage").textContent =
        `Location pinned. A place name could not be loaded. Check your connection and try tapping again.`;

      drawHomeMarkers();
    }
  });

  // The map is created on the homepage and remains interactive.
  setTimeout(() => state.homeMap?.invalidateSize(), 100);
}

function initRouteMap() {
  if (!state.routeMap) state.routeMap = createMap("routeMap");
}

function initNavigationMap() {
  if (!state.navigationMap) state.navigationMap = createMap("navigationMap");
}

function makeMarkerIcon(color) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 1px 7px #0003"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function removeMapLayer(map, layer) {
  if (map && layer) map.removeLayer(layer);
}

function makeOrUpdateMarker(map, existing, place, color) {
  if (!map || !place) {
    removeMapLayer(map, existing);
    return null;
  }

  const latlng = [place.lat, place.lng];

  if (existing) {
    existing.setLatLng(latlng);
    existing.setPopupContent(safeHTML(place.name));
    return existing;
  }

  return L.marker(latlng, { icon: makeMarkerIcon(color) })
    .bindPopup(safeHTML(place.name))
    .addTo(map);
}

function drawHomeMarkers() {
  if (!state.homeMap) return;

  state.homeStartMarker = makeOrUpdateMarker(
    state.homeMap, state.homeStartMarker, state.start, "#28ad60"
  );

  state.homeEndMarker = makeOrUpdateMarker(
    state.homeMap, state.homeEndMarker, state.destination, "#e87570"
  );

  const points = [];
  if (state.start) points.push([state.start.lat, state.start.lng]);
  if (state.destination) points.push([state.destination.lat, state.destination.lng]);

  if (state.homeRouteLine) {
    state.homeMap.removeLayer(state.homeRouteLine);
    state.homeRouteLine = null;
  }

  if (points.length === 2) {
    if (state.roadGeometry?.coordinates?.length) {
      const coords = state.roadGeometry.coordinates.map(([lng, lat]) => [lat, lng]);
      state.homeRouteLine = L.polyline(coords, {
        color: "#28ad60", weight: 5, opacity: .9
      }).addTo(state.homeMap);
    } else {
      state.homeRouteLine = L.polyline(points, {
        color: "#28ad60", weight: 4, dashArray: "7 7"
      }).addTo(state.homeMap);
    }

    state.homeMap.fitBounds(
      L.latLngBounds(points),
      { padding: [35, 35], maxZoom: 14 }
    );

    $("homeMapMessage").textContent =
      `${state.start.name} → ${state.destination.name}`;
  } else if (points.length === 1) {
    state.homeMap.setView(points[0], Math.max(state.homeMap.getZoom(), 14));
  } else {
    state.homeMap.setView(HOME, 12);
  }
}

function drawMapForPage(map, markerRefs, lineKey) {
  if (!map) return;

  markerRefs.start = makeOrUpdateMarker(
    map, markerRefs.start, state.start, "#28ad60"
  );

  markerRefs.end = makeOrUpdateMarker(
    map, markerRefs.end, state.destination, "#e87570"
  );

  const points = [];
  if (state.start) points.push([state.start.lat, state.start.lng]);
  if (state.destination) points.push([state.destination.lat, state.destination.lng]);

  if (state[lineKey]) {
    map.removeLayer(state[lineKey]);
    state[lineKey] = null;
  }

  if (points.length === 2) {
    if (state.roadGeometry?.coordinates?.length) {
      const coords = state.roadGeometry.coordinates.map(([lng, lat]) => [lat, lng]);
      state[lineKey] = L.polyline(coords, {
        color: "#28ad60", weight: 5
      }).addTo(map);
    } else {
      state[lineKey] = L.polyline(points, {
        color: "#28ad60", weight: 4, dashArray: "7 7"
      }).addTo(map);
    }

    map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  } else if (points.length === 1) {
    map.setView(points[0], 14);
  }
}

function drawRouteMap() {
  if (!state.routeMap) return;

  const refs = {
    start: state.routeStartMarker,
    end: state.routeEndMarker
  };

  drawMapForPage(state.routeMap, refs, "routeLine");
  state.routeStartMarker = refs.start;
  state.routeEndMarker = refs.end;
}

function drawNavigationMap() {
  if (!state.navigationMap) return;

  const refs = {
    start: state.navStartMarker,
    end: state.navEndMarker
  };

  drawMapForPage(state.navigationMap, refs, "navRouteLine");
  state.navStartMarker = refs.start;
  state.navEndMarker = refs.end;

  if (state.lastPosition) updateUserMarker(state.lastPosition);
}

function updateUserMarker(coords) {
  if (!state.navigationMap) return;

  const latlng = [coords.lat, coords.lng];

  if (!state.userMarker) {
    state.userMarker = L.circleMarker(latlng, {
      radius: 8, color: "#fff", weight: 3,
      fillColor: "#2994f0", fillOpacity: 1
    }).bindPopup("Your current location").addTo(state.navigationMap);
  } else {
    state.userMarker.setLatLng(latlng);
  }

  if (state.tracking) state.navigationMap.panTo(latlng);
}

/* ---------- Reverse geocoding: coordinates -> place name ---------- */

async function reverseGeocode(lat, lng) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) throw new Error("Reverse geocoding service failed");

  const data = await response.json();
  if (!data || !data.address) throw new Error("No address returned");

  const a = data.address;
  const preferred = [
    a.amenity,
    a.building,
    a.tourism,
    a.shop,
    a.leisure,
    a.road,
    a.neighbourhood,
    a.suburb,
    a.residential,
    a.village,
    a.town,
    a.city,
    a.county
  ].filter(Boolean);

  // Prefer a specific landmark/road and append a locality.
  const unique = [...new Set(preferred)];
  let name = unique.slice(0, 3).join(", ");

  if (!name && data.display_name) {
    name = data.display_name.split(",").slice(0, 3).join(", ");
  }

  if (!name) throw new Error("No readable place name");

  return {
    name,
    address: data.display_name || name
  };
}

/* ---------- Choosing start or destination ---------- */

function setLocation(target, place) {
  if (target === "start") {
    state.start = place;
    $("startPlace").value = place.name;
  } else {
    state.destination = place;
    $("destinationPlace").value = place.name;
  }

  drawHomeMarkers();
  updatePickInstruction();
}

function setPickTarget(target) {
  state.pickTarget = target;

  $("pickStartButton").classList.toggle("selected", target === "start");
  $("pickDestinationButton").classList.toggle("selected", target === "destination");

  $("mapInstruction").innerHTML = target === "start"
    ? "<span>①</span> Tap the map to choose your starting point"
    : "<span>②</span> Tap the map to choose your destination";
}

function updatePickInstruction() {
  if (state.start && !state.destination) {
    setPickTarget("destination");
  } else if (!state.start) {
    setPickTarget("start");
  } else {
    $("mapInstruction").innerHTML =
      "<span>✓</span> Both places selected. Tap a button to change a location.";
  }
}

$("pickStartButton").addEventListener("click", () => setPickTarget("start"));
$("pickDestinationButton").addEventListener("click", () => setPickTarget("destination"));

/* ---------- Search field geocoding ---------- */

async function geocodePlace(query) {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Enter a place name first.");

  // Allow coordinates as a fallback when the user explicitly types them.
  const match = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);

  if (match) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("Those coordinates are outside the valid range.");
    }

    try {
      const named = await reverseGeocode(lat, lng);
      return { lat, lng, name: named.name, address: named.address };
    } catch {
      return {
        lat, lng,
        name: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        address: ""
      };
    }
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Location search is temporarily unavailable.");

  const results = await response.json();
  if (!results.length) {
    throw new Error(`Couldn't find "${trimmed}". Try a more specific name.`);
  }

  const item = results[0];

  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    name: item.display_name.split(",").slice(0, 3).join(", "),
    address: item.display_name
  };
}

/* ---------- Homepage form ---------- */

$("tripForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const startText = $("startPlace").value.trim();
  const endText = $("destinationPlace").value.trim();

  if (!startText || !endText) {
    setMessage("tripMessage", "Choose both your starting point and destination.", "error");
    return;
  }

  const button = $("continueTripButton");
  button.disabled = true;
  button.textContent = "Checking locations…";

  try {
    // Resolve text fields to actual map coordinates and names.
    state.start = await geocodePlace(startText);
    state.destination = await geocodePlace(endText);

    if (haversineMetres(state.start, state.destination) < 10) {
      throw new Error("Your start and destination are too close together.");
    }

    $("startPlace").value = state.start.name;
    $("destinationPlace").value = state.destination.name;

    drawHomeMarkers();
    setMessage("tripMessage", "");
    showPage("pagePreferences");
  } catch (error) {
    setMessage("tripMessage", error.message || "Couldn't locate one of those places.", "error");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Continue to preferences <span>↗</span>';
  }
});

$("useCurrentLocation").addEventListener("click", () => {
  if (!navigator.geolocation) {
    setMessage("tripMessage", "This browser doesn't support location access.", "error");
    return;
  }

  setMessage("tripMessage", "Finding your current location…");

  navigator.geolocation.getCurrentPosition(async (position) => {
    const { latitude: lat, longitude: lng } = position.coords;

    let place;
    try {
      const named = await reverseGeocode(lat, lng);
      place = { lat, lng, name: named.name, address: named.address };
    } catch {
      place = {
        lat, lng,
        name: `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        address: ""
      };
    }

    setLocation("start", place);
    setPickTarget("destination");
    state.homeMap?.setView([lat, lng], 15);
    setMessage("tripMessage", "Starting point selected.", "success");
  }, (error) => {
    setMessage("tripMessage", gpsError(error), "error");
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

/* ---------- Preferences ---------- */

$("priorityOptions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-priority]");
  if (!button) return;

  state.priority = button.dataset.priority;

  document.querySelectorAll(".priority-option").forEach((item) => {
    item.classList.toggle("selected", item === button);
  });

  updatePreferenceSummary();
});

$("budgetSlider").addEventListener("input", (event) => {
  state.budget = Number(event.target.value);
  $("budgetValue").textContent = state.budget.toLocaleString("en-IN");
});

document.querySelectorAll(".avoid-option input").forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.avoided.add(checkbox.value);
    else state.avoided.delete(checkbox.value);

    $("avoidCounter").textContent =
      `${state.avoided.size} mode${state.avoided.size === 1 ? "" : "s"} excluded`;

    updatePreferenceSummary();
  });
});

function updatePreferenceSummary() {
  const descriptions = {
    balanced: "We'll compare estimated cost, time and emissions.",
    eco: "We'll prioritise lower estimated emissions.",
    cost: "We'll prioritise options that fit your budget.",
    time: "We'll prioritise shorter estimated journey times."
  };

  $("preferenceSummaryTitle").textContent = PRIORITIES[state.priority];
  $("preferenceSummaryText").textContent =
    `${descriptions[state.priority]} ${state.avoided.size} mode${state.avoided.size === 1 ? "" : "s"} excluded.`;
}

/* ---------- Route calculations ---------- */

$("findRoutesButton").addEventListener("click", calculateRoutes);

async function calculateRoutes() {
  if (!state.start || !state.destination) {
    showPage("pageTrip");
    setMessage("tripMessage", "Select both places first.", "error");
    return;
  }

  const button = $("findRoutesButton");
  button.disabled = true;
  button.textContent = "Calculating routes…";

  try {
    const straightKm = haversineMetres(state.start, state.destination) / 1000;
    let drivingKm = straightKm;
    let drivingMinutes = straightKm / MODES.car.speed * 60;

    state.roadGeometry = null;
    state.routeNotice = "";

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${state.start.lng},${state.start.lat};${state.destination.lng},${state.destination.lat}` +
        `?overview=full&geometries=geojson`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Routing unavailable");

      const data = await response.json();
      if (data.code !== "Ok" || !data.routes?.length) throw new Error("No route returned");

      drivingKm = data.routes[0].distance / 1000;
      drivingMinutes = data.routes[0].duration / 60;
      state.roadGeometry = data.routes[0].geometry;
    } catch (error) {
      console.warn("Using approximate route", error);
      state.routeNotice =
        "Road routing was unavailable, so straight-line distance is used as a fallback.";
    }

    state.drivingKm = drivingKm;
    state.drivingMinutes = drivingMinutes;
    state.carBaselineKg = drivingKm * MODES.car.factor;

    const allRoutes = Object.entries(MODES).map(([key, mode]) => {
      const distanceKm = drivingKm * mode.multiplier;
      const timeMin = key === "car"
        ? drivingMinutes
        : distanceKm / mode.speed * 60 + mode.extra;
      const cost = mode.base + distanceKm * mode.fare;
      const emissions = distanceKm * mode.factor;

      return {
        key, ...mode, distanceKm, timeMin, cost, emissions,
        savedKg: Math.max(0, state.carBaselineKg - emissions)
      };
    });

    let available = allRoutes.filter((route) => !state.avoided.has(route.key));

    if (!available.length) {
      throw new Error("All modes are excluded. Go back and allow at least one.");
    }

    const withinBudget = available.filter((route) => route.cost <= state.budget);

    if (withinBudget.length) {
      available = withinBudget;
    } else {
      available = [...available].sort((a, b) => a.cost - b.cost).slice(0, 3);
      state.routeNotice += " No option fits your budget; showing the least expensive choices.";
    }

    const maxTime = Math.max(1, ...allRoutes.map((r) => r.timeMin));
    const maxCost = Math.max(1, ...allRoutes.map((r) => r.cost));
    const maxEmissions = Math.max(.01, state.carBaselineKg);
    const maxDistance = Math.max(1, ...allRoutes.map((r) => r.distanceKm));

    state.routes = available.map((route) => {
      const eco = 1 - Math.min(1, route.emissions / maxEmissions);
      const cost = 1 - Math.min(1, route.cost / maxCost);
      const time = 1 - Math.min(1, route.timeMin / maxTime);
      const distance = 1 - Math.min(1, route.distanceKm / maxDistance);

      let score;
      if (state.priority === "eco") score = eco * .8 + cost * .1 + time * .1;
      else if (state.priority === "cost") score = cost * .8 + eco * .1 + time * .1;
      else if (state.priority === "time") score = time * .8 + cost * .1 + eco * .1;
      else score = eco * .4 + cost * .3 + time * .25 + distance * .05;

      return { ...route, score };
    }).sort((a, b) => b.score - a.score);

    renderRouteResults();
    showPage("pageRoutes");
  } catch (error) {
    setMessage("routeMessage", error.message || "Unable to calculate routes.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Find my routes ↗";
  }
}

function renderRouteResults() {
  $("routeSubheading").textContent = `${state.start.name} → ${state.destination.name}`;

  const best = state.routes[0];
  $("recommendationTitle").textContent = `${best.name} is your best match`;
  $("recommendationText").textContent =
    `Based on your ${state.priority} priority. Estimated cost ${formatMoney(best.cost)} and time ${formatTime(best.timeMin)}.`;
  $("recommendationBadge").textContent = state.priority;

  $("impactSaved").textContent = best.savedKg.toFixed(2);
  $("impactTrack").style.width =
    `${Math.max(0, Math.min(100, best.savedKg / Math.max(.01, state.carBaselineKg) * 100))}%`;

  const container = $("modeCards");
  container.innerHTML = "";

  state.routes.forEach((route, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mode-card ${index === 0 ? "recommended" : ""}`;
    card.innerHTML = `
      <span class="mode-emoji">${route.emoji}</span>
      <span class="mode-name">${route.name}</span>
      <span class="mode-desc">${route.description}${index === 0 ? " · Best fit" : ""}</span>
      <span class="mode-stats">
        <div><span>Estimated cost</span><strong>${formatMoney(route.cost)}</strong></div>
        <div><span>Travel time</span><strong>${formatTime(route.timeMin)}</strong></div>
        <div><span>Distance</span><strong>${formatDistance(route.distanceKm)}</strong></div>
        <div><span>CO₂e</span><strong>${route.emissions.toFixed(2)} kg</strong></div>
      </span>
      <span class="select-hint">Select this mode ↗</span>
    `;

    card.addEventListener("click", () => selectTravelMode(route.key));
    container.appendChild(card);
  });

  const notes = [
    state.routeNotice,
    "Bus and metro details are estimates, not live transit routes or confirmed fares."
  ].filter(Boolean);

  setMessage("routeMessage", notes.join(" "));
  drawRouteMap();
}

/* ---------- Select travel mode ---------- */

function selectTravelMode(key) {
  const route = state.routes.find((item) => item.key === key);
  if (!route) return;

  stopTracking();

  state.selectedMode = route;
  state.completed = false;
  state.lastPosition = null;
  state.previousPosition = null;
  state.arrivalReadings = 0;
  state.travelledKm = 0;
  state.earnedPoints = 0;

  $("navigationModeIcon").textContent = route.emoji;
  $("navigationModeTitle").textContent = route.name;
  $("navigationRouteText").textContent = `${state.start.name} → ${state.destination.name}`;
  $("distanceRemaining").textContent = formatDistance(
    haversineMetres(state.start, state.destination) / 1000
  );
  $("gpsAccuracy").textContent = "--";
  $("navigationProgress").style.width = "0%";

  $("startNavigationButton").classList.remove("hidden");
  $("stopNavigationButton").classList.add("hidden");
  setMessage("navigationMessage", "Press Start tracking when you're ready.");

  showPage("pageNavigation");
}

/* ---------- GPS tracking ---------- */

$("startNavigationButton").addEventListener("click", startTracking);
$("stopNavigationButton").addEventListener("click", () => {
  stopTracking();
  setMessage("navigationMessage", "Tracking stopped. This trip has not been marked complete.");
});

function startTracking() {
  if (!state.selectedMode) {
    setMessage("navigationMessage", "Choose a travel mode first.", "error");
    return;
  }

  if (!navigator.geolocation) {
    setMessage("navigationMessage", "This browser does not support GPS.", "error");
    return;
  }

  if (!window.isSecureContext) {
    setMessage("navigationMessage", "GPS requires localhost or HTTPS. Open this site using VS Code Live Server.", "error");
    return;
  }

  if (state.tracking) return;

  state.tracking = true;
  state.arrivalReadings = 0;
  state.lastPosition = null;
  state.previousPosition = null;
  state.travelledKm = 0;

  $("startNavigationButton").classList.add("hidden");
  $("stopNavigationButton").classList.remove("hidden");
  setMessage("navigationMessage", "Waiting for a GPS location fix…");

  state.watchId = navigator.geolocation.watchPosition(
    onGPSUpdate,
    (error) => setMessage("navigationMessage", gpsError(error), "error"),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
}

function onGPSUpdate(position) {
  if (!state.tracking || state.completed) return;

  const coords = {
    lat: position.coords.latitude,
    lng: position.coords.longitude
  };
  const accuracy = position.coords.accuracy;

  if (state.previousPosition) {
    const moved = haversineMetres(state.previousPosition, coords);
    if (moved > 3 && moved < 500) state.travelledKm += moved / 1000;
  }

  state.previousPosition = coords;
  state.lastPosition = coords;

  $("gpsAccuracy").textContent = `${Math.round(accuracy)} m`;
  updateUserMarker(coords);

  const remaining = haversineMetres(coords, state.destination);
  const total = Math.max(1, haversineMetres(state.start, state.destination));
  const progress = Math.max(0, Math.min(100, (1 - remaining / total) * 100));

  $("distanceRemaining").textContent = formatDistance(remaining / 1000);
  $("navigationProgress").style.width = `${progress}%`;

  if (accuracy > 100) {
    state.arrivalReadings = 0;
    setMessage("navigationMessage", "GPS accuracy is low. Move to an open area for a better location fix.");
    return;
  }

  state.arrivalReadings = remaining <= 60 ? state.arrivalReadings + 1 : 0;

  if (state.arrivalReadings >= 2) {
    completeJourney();
    return;
  }

  setMessage("navigationMessage", `Location updated. About ${formatDistance(remaining / 1000)} remaining.`);
}

function gpsError(error) {
  if (error.code === 1) return "Location permission denied. Allow location access in your browser settings.";
  if (error.code === 2) return "Your location is unavailable. Try again outdoors.";
  if (error.code === 3) return "GPS timed out. Check location services and retry.";
  return "Unable to access GPS.";
}

function stopTracking() {
  state.tracking = false;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  $("startNavigationButton")?.classList.remove("hidden");
  $("stopNavigationButton")?.classList.add("hidden");
}

/* ---------- Completion and trip history ---------- */

function completeJourney() {
  if (state.completed || !state.selectedMode) return;

  state.completed = true;
  stopTracking();

  const route = state.selectedMode;
  const savedKg = route.savedKg;

  // Demo-only rewards: one Green Point per estimated gram of CO₂e avoided.
  state.earnedPoints = Math.max(0, Math.min(100000, Math.round(savedKg * 1000)));

  $("completedMode").textContent = route.name;
  $("completedDistance").textContent = formatDistance(
    state.travelledKm > 0 ? state.travelledKm : route.distanceKm
  );
  $("completedSavings").textContent = `${savedKg.toFixed(2)} kg`;
  $("completedPoints").textContent = `+${state.earnedPoints.toLocaleString("en-IN")}`;
  $("completionText").textContent =
    `You completed your trip using ${route.name.toLowerCase()}. Estimated emissions avoided: ${savedKg.toFixed(2)} kg CO₂e.`;

  const trip = {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    start: state.start.name,
    destination: state.destination.name,
    mode: route.name,
    modeKey: route.key,
    distanceKm: route.distanceKm,
    savedKg,
    points: state.earnedPoints
  };

  const trips = getTrips();
  trips.unshift(trip);
  saveJSON(KEYS.trips, trips.slice(0, 100));

  try {
    localStorage.setItem(KEYS.points, String(getPoints() + state.earnedPoints));
  } catch (error) {
    console.warn("Unable to save points", error);
  }

  renderDashboard();
  showPage("pageComplete");
}

$("planAnotherButton").addEventListener("click", resetTrip);
$("viewSummaryButton").addEventListener("click", () => {
  const trip = getTrips()[0];
  if (!trip) return alert("No saved trip summary found.");

  alert(
    `GREENROUTE TRIP SUMMARY\n\nFrom: ${trip.start}\nTo: ${trip.destination}` +
    `\nMode: ${trip.mode}\nDistance: ${Number(trip.distanceKm).toFixed(1)} km` +
    `\nEstimated CO₂e avoided: ${Number(trip.savedKg).toFixed(2)} kg` +
    `\nGreen Points: ${trip.points}`
  );
});
$("completionDashboardButton").addEventListener("click", openProfile);

/* ---------- Profile dashboard ---------- */

$("profileButton").addEventListener("click", openProfile);
$("openDashboardFromHome").addEventListener("click", openProfile);
$("dashboardPlanTripButton").addEventListener("click", resetTrip);

function openProfile() {
  stopTracking();
  state.previousPage = state.currentPage === "profilePage" ? "pageTrip" : state.currentPage;
  showPage("profilePage", false);
}

$("backFromProfileButton").addEventListener("click", () => {
  const allowed = pageOrder.includes(state.previousPage) && state.previousPage !== "profilePage";
  showPage(allowed ? state.previousPage : "pageTrip", false);
});

$("editProfileButton").addEventListener("click", () => {
  const profile = getProfile();
  $("profileNameInput").value = profile.name || "";
  $("profileEmailInput").value = profile.email || "";
  $("profileEditForm").classList.remove("hidden");
  $("editProfileButton").classList.add("hidden");
});

$("cancelProfileEdit").addEventListener("click", () => {
  $("profileEditForm").classList.add("hidden");
  $("editProfileButton").classList.remove("hidden");
});

$("profileEditForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("profileNameInput").value.trim();
  const email = $("profileEmailInput").value.trim();

  if (!name) {
    setMessage("profileMessage", "Please enter your name.", "error");
    return;
  }

  saveJSON(KEYS.profile, { name, email });
  $("profileEditForm").classList.add("hidden");
  $("editProfileButton").classList.remove("hidden");

  renderDashboard();
  setMessage("profileMessage", "Profile saved on this device.", "success");
});

function updateProfileHeader() {
  const profile = getProfile();
  const name = profile.name || "";

  $("navProfileName").textContent = name || "My dashboard";
  $("navAvatar").textContent = getInitial(name);
  $("homeAvatar").textContent = getInitial(name);
  $("homeProfileName").textContent = name ? `Welcome, ${name}!` : "Welcome, traveller!";
  $("homePoints").textContent = getPoints().toLocaleString("en-IN");
  $("homeTrips").textContent = getTrips().length.toLocaleString("en-IN");
}

function renderDashboard() {
  const profile = getProfile();
  const trips = getTrips();
  const points = getPoints();
  const savedKg = trips.reduce((sum, trip) => sum + (Number(trip.savedKg) || 0), 0);

  $("profileDisplayName").textContent = profile.name || "Welcome, traveller!";
  $("profileEmailDisplay").textContent = profile.email || "Your local profile";
  $("profileAvatar").textContent = getInitial(profile.name);
  $("profilePoints").textContent = points.toLocaleString("en-IN");
  $("profileTrips").textContent = trips.length.toLocaleString("en-IN");
  $("profileSaved").textContent = `${savedKg.toFixed(2)} kg`;

  const progress = points % 100;
  const next = (Math.floor(points / 100) + 1) * 100;
  $("pointsProgressBar").style.width = `${progress}%`;
  $("pointsMilestone").textContent = `Next milestone: ${next.toLocaleString("en-IN")} points`;

  renderWeeklyChart(trips);
  renderAchievements(trips, points, savedKg);
  renderHistory(trips);
  updateProfileHeader();
}

function renderWeeklyChart(trips) {
  const container = $("profileWeeklyChart");
  container.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const count = trips.filter((trip) => {
      const d = new Date(trip.date);
      return !Number.isNaN(d.getTime()) && d.toDateString() === date.toDateString();
    }).length;

    days.push({
      label: date.toLocaleDateString("en-IN", { weekday: "short" }),
      count,
      today: i === 0
    });
  }

  const max = Math.max(1, ...days.map((d) => d.count));

  days.forEach((day) => {
    const wrapper = document.createElement("div");
    wrapper.className = "week-day";

    const track = document.createElement("div");
    track.className = "week-bar-track";

    const bar = document.createElement("div");
    bar.className = `week-bar ${day.today ? "today" : ""}`;
    bar.style.height = `${Math.max(4, day.count / max * 100)}%`;
    bar.title = `${day.count} trips`;
    track.appendChild(bar);

    const label = document.createElement("small");
    label.textContent = day.label;
    wrapper.append(track, label);
    container.appendChild(wrapper);
  });

  const total = days.reduce((sum, day) => sum + day.count, 0);
  $("profileWeeklyTotal").textContent = `${total} trip${total === 1 ? "" : "s"} this week`;
}

function renderAchievements(trips, points, savedKg) {
  const list = [
    { icon: "✳", title: "First journey", detail: "Complete your first trip", ok: trips.length >= 1 },
    { icon: "♧", title: "Planet-minded", detail: "Save an estimated 1 kg CO₂e", ok: savedKg >= 1 },
    { icon: "★", title: "Green collector", detail: "Earn 100 Green Points", ok: points >= 100 },
    { icon: "↗", title: "Frequent explorer", detail: "Complete 5 journeys", ok: trips.length >= 5 }
  ];

  $("profileAchievements").innerHTML = "";

  list.forEach((item) => {
    const row = document.createElement("div");
    row.className = `achievement-item ${item.ok ? "unlocked" : ""}`;
    row.innerHTML = `
      <span class="achievement-icon">${item.icon}</span>
      <div><strong>${item.title}${item.ok ? " ✓" : ""}</strong><small>${item.detail}</small></div>
    `;
    $("profileAchievements").appendChild(row);
  });
}

function renderHistory(trips) {
  const container = $("profileTripHistory");
  container.innerHTML = "";

  if (!trips.length) {
    const empty = document.createElement("div");
    empty.className = "empty-history";
    empty.textContent = "No completed trips yet. Your trip history will appear here after your first completed journey.";
    container.appendChild(empty);
    return;
  }

  trips.slice(0, 10).forEach((trip) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const date = new Date(trip.date);
    const dateLabel = Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    row.innerHTML = `
      <span class="history-icon">${MODES[trip.modeKey]?.emoji || "♧"}</span>
      <div class="history-route">
        <strong>${safeHTML(trip.start)} → ${safeHTML(trip.destination)}</strong>
        <small>${safeHTML(trip.mode)} · ${dateLabel} · ${formatDistance(Number(trip.distanceKm))}</small>
      </div>
      <div class="history-points">+${(Number(trip.points) || 0).toLocaleString("en-IN")} pts
        <small>${(Number(trip.savedKg) || 0).toFixed(2)} kg CO₂e avoided*</small>
      </div>
    `;

    container.appendChild(row);
  });
}

$("clearTripsButton").addEventListener("click", () => {
  if (!confirm("Clear trip history and reset Green Points on this device?")) return;

  saveJSON(KEYS.trips, []);
  localStorage.setItem(KEYS.points, "0");
  renderDashboard();
  setMessage("profileMessage", "Trip history and points cleared.", "success");
});

/* ---------- Reset for a new trip ---------- */

function resetTrip() {
  stopTracking();

  state.start = null;
  state.destination = null;
  state.routes = [];
  state.selectedMode = null;
  state.roadGeometry = null;
  state.routeNotice = "";
  state.completed = false;
  state.lastPosition = null;
  state.previousPosition = null;
  state.arrivalReadings = 0;
  state.travelledKm = 0;
  state.earnedPoints = 0;
  state.pickTarget = "start";

  $("startPlace").value = "";
  $("destinationPlace").value = "";
  $("budgetSlider").value = "150";
  state.budget = 150;
  $("budgetValue").textContent = "150";

  setMessage("tripMessage", "");
  setMessage("routeMessage", "");
  setMessage("navigationMessage", "");
  setPickTarget("start");

  [state.homeRouteLine, state.homeStartMarker, state.homeEndMarker].forEach((layer) => {
    removeMapLayer(state.homeMap, layer);
  });

  state.homeRouteLine = null;
  state.homeStartMarker = null;
  state.homeEndMarker = null;

  if (state.homeMap) state.homeMap.setView(HOME, 12);
  $("homeMapMessage").textContent = "Map ready. Zoom and tap to select a location.";

  showPage("pageTrip");
}

$("brandHome").addEventListener("click", () => showPage("pageTrip"));

/* ---------- Start ---------- */

function init() {
  $("budgetValue").textContent = state.budget.toLocaleString("en-IN");
  updatePreferenceSummary();
  updateProfileHeader();
  initHomeMap();
  setPickTarget("start");

  // Keep the map sized correctly on first load and orientation changes.
  setTimeout(() => state.homeMap?.invalidateSize(), 150);
  window.addEventListener("resize", () => {
    state.homeMap?.invalidateSize();
    state.routeMap?.invalidateSize();
    state.navigationMap?.invalidateSize();
  });

  showPage("pageTrip", false);
}

init();
