(function () {
  "use strict";

  const BUDGET_FACTORS = {
    low: { stay: 25, food: 18, local: 10, activity: 12 },
    medium: { stay: 55, food: 30, local: 20, activity: 28 },
    high: { stay: 120, food: 60, local: 35, activity: 50 },
  };

  const VIBE_PLANS = {
    adventure: ["Trail or cycling route", "Adventure activity window", "Local food lane"],
    chill: ["Slow breakfast and cafe time", "One scenic walk", "Sunset and relaxed dinner"],
    history: ["Old town walk", "Museum or heritage site", "Evening cultural lane"],
    food: ["Morning market", "Cooking class or tasting", "Local signature dinner"],
    nature: ["Early nature block", "Botanical or lakeside hour", "Light evening"],
  };

  const TIPS = [
    "Buy a transit day pass if you plan 3+ rides; it usually costs less and saves queue time.",
    "For crowd control, target major spots within 90 minutes of opening.",
    "Keep one indoor backup block per day for weather changes.",
  ];
  const MIN_NEARBY_RESULTS = 6;

  /**
   * Nearby places: only temples, monuments, museums, nature, heritage, etc.
   * Excludes schools, hospitals, offices, and similar non-attraction POIs.
   */
  const PLACE_EXCLUDE_TITLE =
    /\b(university|college|campus|\bschool\b|hospital|clinic|medical\s+cent(?:er|re)|pharmacy|morgue|cemetery|graveyard|prison|jail|police\s+station|fire\s+station|courthouse|embassy|consulate|parking\s+garage|office\s+tower|data\s+center)\b/i;

  const PLACE_EXCLUDE_CATEGORY =
    /\b(universit|college|schools|academ|hospitals?|clinics?|medical\s+schools?|health\s+care|cemeteries|prisons?|elementary|secondary|high\s+school|students?|faculty|airports?|railway\s+stations?|bus\s+stations?|metro\s+stations?|shopping\s+malls?|supermarkets?|office\s+buildings?|residential)\b/i;

  const PLACE_INCLUDE_TITLE =
    /\b(temple|mosque|shrine|cathedral|basilica|synagogue|gurdwara|stupa|pagoda|minaret|minar|monument|museum|memorial|fort|fortress|palace|castle|citadel|bastion|gate|ruins|archaeological|heritage|historic\s+(site|district)|national\s+park|nature\s+reserve|wildlife|botanical|garden|waterfall|lake|beach|mountain|observatory|zoo|aquarium|amphitheatre|amphitheater|tower|bridge|square|plaza|mausoleum|tomb|scenic|viewpoint|landmark|world\s+heritage)\b/i;

  const PLACE_INCLUDE_CATEGORY =
    /\b(temples?|mosques?|shrines?|monuments?|museums?|memorials?|forts?|palaces?|castles?|historic\s+sites?|world\s+heritage|national\s+parks?|nature\s+reserves?|natural\s+features?|botanical\s+gardens?|parks?\s+in|gardens?\s+in|archaeological\s+sites?|religious\s+buildings?|churches?|cathedrals?|basilicas?|tourist\s+attractions?|visitor\s+attractions?|landmarks?|heritage|scenic|protected\s+areas?|lakes?|beaches?|mountains?|waterfalls?)\b/i;

  const state = {
    expenses: [],
    placeHistory: new Map(),
  };

  const ui = {
    locationText: document.getElementById("location-text"),
    detectBtn: document.getElementById("detect-btn"),
    originLocationBtn: document.getElementById("origin-location-btn"),
    originInput: document.getElementById("origin"),
    places: document.getElementById("places"),
    tripForm: document.getElementById("trip-form"),
    resultSection: document.getElementById("result-section"),
    resultHeading: document.getElementById("result-heading"),
    resultMeta: document.getElementById("result-meta"),
    tipText: document.getElementById("tip-text"),
    itinerary: document.getElementById("itinerary"),
    budgetSummary: document.getElementById("budget-summary"),
    expenseForm: document.getElementById("expense-form"),
    expenseNote: document.getElementById("expense-note"),
    expenseAmount: document.getElementById("expense-amount"),
    expenseList: document.getElementById("expense-list"),
    expenseTotal: document.getElementById("expense-total"),
  };

  function clampDays(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return 2;
    return Math.max(1, Math.min(14, n));
  }

  function normalizeBudget(value) {
    return ["low", "medium", "high"].includes(value) ? value : "medium";
  }

  function normalizeVibe(value) {
    return Object.prototype.hasOwnProperty.call(VIBE_PLANS, value) ? value : "chill";
  }

  function dailyBudget(budget) {
    return BUDGET_FACTORS[budget];
  }

  function haversineKm(aLat, aLon, bLat, bLon) {
    const R = 6371;
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const lat1 = aLat * toRad;
    const lat2 = bLat * toRad;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function geocodePlace(name) {
    const query = String(name || "").trim();
    if (!query) return null;
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
          encodeURIComponent(query)
      );
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      return {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon),
        label: data[0].display_name || query,
      };
    } catch (error) {
      return null;
    }
  }

  async function reverseGeocodeName(lat, lon) {
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
          encodeURIComponent(lat) +
          "&lon=" +
          encodeURIComponent(lon)
      );
      const data = await res.json();
      if (!data || !data.address) return null;
      const addr = data.address;
      const name =
        addr.city || addr.town || addr.village || addr.county || addr.state_district || addr.state || null;
      return name;
    } catch (error) {
      return null;
    }
  }

  async function getRouteDetails(origin, destination) {
    const [from, to] = await Promise.all([geocodePlace(origin), geocodePlace(destination)]);
    if (!from || !to) {
      return { km: null, from: from, to: to, stops: [] };
    }

    const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
    if (km < 120) {
      return { km: km, from: from, to: to, stops: [] };
    }

    const stopCount = km > 900 ? 3 : km > 350 ? 2 : 1;
    const stops = [];
    for (let i = 1; i <= stopCount; i += 1) {
      const f = i / (stopCount + 1);
      const lat = from.lat + (to.lat - from.lat) * f;
      const lon = from.lon + (to.lon - from.lon) * f;
      // Reverse geocode points on the line for practical mid-route stop ideas.
      // This is an approximation, not turn-by-turn route snapping.
      // It still gives useful city/town names between endpoints.
      const name = await reverseGeocodeName(lat, lon);
      if (!name) continue;
      const lower = name.toLowerCase();
      if (
        lower === String(origin).trim().toLowerCase() ||
        lower === String(destination).trim().toLowerCase()
      ) {
        continue;
      }
      if (!stops.some(function (s) { return s.toLowerCase() === lower; })) {
        stops.push(name);
      }
    }

    return { km: km, from: from, to: to, stops: stops };
  }

  function renderBudgetSuggestion(days, budget, routeKm) {
    const base = dailyBudget(budget);
    const total = {
      stay: base.stay * days,
      food: base.food * days,
      local: base.local * days,
      activity: base.activity * days,
    };
    const stayAndDaily = total.stay + total.food + total.local + total.activity;
    const travel = routeKm ? routeKm * (budget === "low" ? 0.08 : budget === "medium" ? 0.14 : 0.26) : 0;
    const expected = stayAndDaily + travel;
    const uncertainty = expected * (budget === "low" ? 0.14 : budget === "medium" ? 0.18 : 0.22);
    const estimated = expected + uncertainty;

    ui.budgetSummary.innerHTML = "";
    [
      ["Stay", total.stay],
      ["Food", total.food],
      ["Local transport", total.local],
      ["Activities", total.activity],
      ["Travel route", travel],
      ["Expected", expected],
      ["Estimated", estimated],
    ].forEach((item, idx, arr) => {
      const box = document.createElement("article");
      box.className = "budget-box" + (idx === arr.length - 1 ? " budget-box--total" : "");
      box.innerHTML = "<p>" + item[0] + "</p><strong>$" + item[1].toFixed(0) + "</strong>";
      ui.budgetSummary.appendChild(box);
    });
  }

  function buildItinerary(origin, destination, vibe, days) {
    const plan = VIBE_PLANS[vibe];
    const out = [];
    for (let i = 1; i <= days; i += 1) {
      out.push({
        title: "Day " + i,
        theme: plan[(i - 1) % plan.length],
        slots: [
          { time: "08:30 - 10:00", name: "Morning start", desc: "Transit + breakfast buffer in " + destination + "." },
          { time: "10:30 - 13:00", name: plan[(i - 1) % plan.length], desc: "Core vibe activity aligned to your chosen style." },
          { time: "13:00 - 15:30", name: "Lunch and rest", desc: "Unscheduled rest window to avoid overpacking." },
          { time: "16:00 - 19:00", name: "Second block", desc: "Neighborhood level exploration away from generic tourist strips." },
          { time: "Evening", name: "Light close", desc: "Dinner and flexible walk. Route: " + origin + " to " + destination + "." },
        ],
      });
    }
    return out;
  }

  function renderRouteStops(stops, routeKm) {
    if (!stops.length && !routeKm) return;
    const card = document.createElement("article");
    card.className = "day-card";
    const chips = stops.length
      ? stops.map(function (s) { return '<span class="stop-chip">' + escapeHtml(s) + "</span>"; }).join("")
      : '<span class="stop-chip">Direct route recommended</span>';
    card.innerHTML =
      '<div class="day-card__head"><h4 class="day-card__title">Route highlights</h4><p class="day-card__theme">' +
      (routeKm ? "~" + routeKm.toFixed(0) + " km total distance" : "Distance unavailable") +
      '</p></div><div class="route-stops"><p class="route-stops__label">Possible in-between stops</p><div class="stop-chips">' +
      chips +
      "</div></div>";
    ui.itinerary.appendChild(card);
  }

  async function renderItinerary(payload) {
    const days = clampDays(payload.duration);
    const vibe = normalizeVibe(payload.vibe);
    const budget = normalizeBudget(payload.budget);
    const cards = buildItinerary(payload.origin, payload.destination, vibe, days);
    const route = await getRouteDetails(payload.origin, payload.destination);

    ui.resultHeading.textContent = payload.destination;
    const routeInfo = route.km ? " • ~" + route.km.toFixed(0) + " km route" : "";
    const stopInfo = route.stops.length ? " • " + route.stops.length + " stop ideas" : "";
    ui.resultMeta.textContent =
      days + " days • " + vibe + " vibe • " + budget + " budget • from " + payload.origin + routeInfo + stopInfo;
    ui.tipText.textContent = TIPS[(payload.destination.length + days) % TIPS.length];
    ui.itinerary.innerHTML = "";
    renderRouteStops(route.stops, route.km);

    cards.forEach((day) => {
      const card = document.createElement("article");
      card.className = "day-card";
      const list = day.slots
        .map(function (slot) {
          return (
            '<li class="slot"><p class="slot__time">' +
            escapeHtml(slot.time) +
            '</p><h5 class="slot__name">' +
            escapeHtml(slot.name) +
            '</h5><p class="slot__desc">' +
            escapeHtml(slot.desc) +
            "</p></li>"
          );
        })
        .join("");
      card.innerHTML =
        '<div class="day-card__head"><h4 class="day-card__title">' +
        escapeHtml(day.title) +
        '</h4><p class="day-card__theme">' +
        escapeHtml(day.theme) +
        '</p></div><ul class="slot-list">' +
        list +
        "</ul>";
      ui.itinerary.appendChild(card);
    });

    renderBudgetSuggestion(days, budget, route.km);
    ui.resultSection.hidden = false;
    ui.resultHeading.focus({ preventScroll: true });
  }

  async function detectLocation() {
    if (!navigator.geolocation) {
      ui.locationText.textContent = "Geolocation not supported in this browser.";
      return;
    }

    ui.locationText.textContent = "Detecting precise position...";
    navigator.geolocation.getCurrentPosition(
      async function (position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        ui.locationText.textContent = "Lat " + lat.toFixed(3) + ", Lon " + lon.toFixed(3);
        await reverseGeocode(lat, lon);
        await loadNearbyPlaces(lat, lon);
      },
      function () {
        ui.locationText.textContent = "Location permission denied. You can still use planner manually.";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function fillOriginWithCurrentLocation() {
    if (!navigator.geolocation) return;
    if (!ui.originLocationBtn || !ui.originInput) return;

    const initialLabel = ui.originLocationBtn.textContent;
    ui.originLocationBtn.disabled = true;
    ui.originLocationBtn.textContent = "Detecting...";

    navigator.geolocation.getCurrentPosition(
      async function (position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const name = await reverseGeocodeName(lat, lon);
        if (name) {
          ui.originInput.value = name;
        } else {
          ui.originInput.value = lat.toFixed(3) + ", " + lon.toFixed(3);
        }
        ui.originInput.focus();
        ui.originLocationBtn.disabled = false;
        ui.originLocationBtn.textContent = initialLabel;
      },
      function () {
        ui.originLocationBtn.disabled = false;
        ui.originLocationBtn.textContent = initialLabel;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
          encodeURIComponent(lat) +
          "&lon=" +
          encodeURIComponent(lon)
      );
      const data = await res.json();
      if (data && data.address) {
        const city = data.address.city || data.address.town || data.address.village || "your area";
        ui.locationText.textContent = city + " (" + lat.toFixed(3) + ", " + lon.toFixed(3) + ")";
      }
    } catch (error) {
      ui.locationText.textContent += " • Reverse geocode unavailable.";
    }
  }

  function normalizeWikiTitle(t) {
    return String(t || "").replace(/_/g, " ");
  }

  function stripCategoryPrefix(catTitle) {
    return catTitle.replace(/^Category:/i, "");
  }

  function isTouristAttraction(title, categoryTitles) {
    const t = normalizeWikiTitle(title);
    if (PLACE_EXCLUDE_TITLE.test(t)) return false;
    if (/^list\s+of\b/i.test(t)) return false;

    const cats = (categoryTitles || []).map(stripCategoryPrefix);
    const catBlob = cats.join(" | ");
    if (PLACE_EXCLUDE_CATEGORY.test(catBlob)) return false;

    if (PLACE_INCLUDE_TITLE.test(t)) return true;
    if (PLACE_INCLUDE_CATEGORY.test(catBlob)) return true;

    return false;
  }

  function guessPlaceKind(title, categoryTitles) {
    const t = normalizeWikiTitle(title).toLowerCase();
    const c = (categoryTitles || []).join(" ").toLowerCase();
    if (/temple|mosque|shrine|cathedral|basilica|synagogue|gurdwara|stupa|pagoda/.test(t + c))
      return "Sacred / heritage";
    if (/museum|gallery/.test(t + c)) return "Museum";
    if (/fort|palace|castle|monument|memorial|heritage|world heritage|historic/.test(t + c))
      return "Monument & history";
    if (/park|garden|nature|national park|reserve|waterfall|lake|beach|mountain|wildlife|scenic/.test(t + c))
      return "Nature & outdoors";
    return "Attraction";
  }

  async function fetchCategoriesForPageIds(pageIds) {
    if (!pageIds.length) return {};
    const out = {};
    const chunkSize = 45;
    for (let i = 0; i < pageIds.length; i += chunkSize) {
      const chunk = pageIds.slice(i, i + chunkSize);
      const url =
        "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=categories&cllimit=40&pageids=" +
        chunk.join("|");
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query && data.query.pages ? data.query.pages : {};
      Object.keys(pages).forEach(function (pid) {
        const p = pages[pid];
        if (!p.categories) {
          out[p.pageid] = [];
          return;
        }
        out[p.pageid] = p.categories.map(function (c) {
          return c.title;
        });
      });
    }
    return out;
  }

  async function fetchThumbnailsForPageIds(pageIds) {
    if (!pageIds.length) return {};
    const out = {};
    const chunkSize = 45;
    for (let i = 0; i < pageIds.length; i += chunkSize) {
      const chunk = pageIds.slice(i, i + chunkSize);
      const url =
        "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=360&pageids=" +
        chunk.join("|");
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query && data.query.pages ? data.query.pages : {};
      Object.keys(pages).forEach(function (pid) {
        const p = pages[pid];
        if (p.thumbnail && p.thumbnail.source) {
          out[p.pageid] = p.thumbnail.source;
        }
      });
    }
    return out;
  }

  async function fetchGeoItems(lat, lon, radius, limit) {
    const geoRes = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=" +
        encodeURIComponent(radius) +
        "&gslimit=" +
        encodeURIComponent(limit) +
        "&format=json&origin=*&gscoord=" +
        encodeURIComponent(lat + "|" + lon)
    );
    const geoData = await geoRes.json();
    return geoData && geoData.query && geoData.query.geosearch ? geoData.query.geosearch : [];
  }

  async function loadNearbyPlaces(lat, lon) {
    ui.places.innerHTML =
      '<p class="places-status"><span class="places-status__dot" aria-hidden="true"></span> Finding curated attractions nearby…</p>';
    try {
      const radii = [15000, 35000, 70000];
      const rawMap = new Map();
      for (let i = 0; i < radii.length; i += 1) {
        const items = await fetchGeoItems(lat, lon, radii[i], 50);
        items.forEach(function (item) {
          if (!rawMap.has(item.pageid)) rawMap.set(item.pageid, item);
        });
      }
      const raw = Array.from(rawMap.values());
      if (!raw.length) {
        ui.places.innerHTML =
          "<p class=\"places-empty\">No Wikipedia points found in this radius. Try again after moving or use a larger city area.</p>";
        return;
      }

      const pageIds = raw.map(function (g) {
        return g.pageid;
      });
      const catMap = await fetchCategoriesForPageIds(pageIds);

      const filtered = raw
        .filter(function (g) {
          const cats = catMap[g.pageid] || [];
          return isTouristAttraction(g.title, cats);
        })
        .sort(function (a, b) {
          return a.dist - b.dist;
        })
        .slice(0, 12);

      if (!filtered.length) {
        ui.places.innerHTML =
          "<p class=\"places-empty\">No temples, monuments, or natural sights matched nearby after filtering out schools and hospitals. Pan the map or try a more historic area.</p>";
        return;
      }
      if (filtered.length < MIN_NEARBY_RESULTS) {
        ui.places.innerHTML =
          "<p class=\"places-empty\">Only " +
          filtered.length +
          " curated attractions were found after strict filtering. Expanding radius still did not reach six in this area.</p>";
      }

      const thumbs = await fetchThumbnailsForPageIds(
        filtered.map(function (x) {
          return x.pageid;
        })
      );

      renderPlaceCards(filtered.slice(0, Math.max(MIN_NEARBY_RESULTS, filtered.length)), catMap, thumbs);
    } catch (error) {
      ui.places.innerHTML =
        "<p class=\"places-empty\">Unable to load nearby attractions right now.</p>";
    }
  }

  function renderPlaceCards(items, catMap, thumbs) {
    ui.places.innerHTML = "";
    items.forEach(function (item) {
      const cats = catMap[item.pageid] || [];
      const kind = guessPlaceKind(item.title, cats);
      const thumb = thumbs[item.pageid];
      const card = document.createElement("article");
      card.className = "place-card";
      card.tabIndex = 0;
      card.dataset.title = item.title;

      const media = document.createElement("div");
      media.className = "place-card__media" + (thumb ? "" : " place-card__media--empty");
      media.setAttribute("aria-hidden", thumb ? "false" : "true");
      if (thumb) {
        const img = document.createElement("img");
        img.src = thumb;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        media.appendChild(img);
      }

      const body = document.createElement("div");
      body.className = "place-card__body";
      const badge = document.createElement("span");
      badge.className = "place-card__badge";
      badge.textContent = kind;
      const h4 = document.createElement("h4");
      h4.textContent = normalizeWikiTitle(item.title);
      const meta = document.createElement("p");
      meta.className = "place-card__meta";
      meta.textContent =
        "~" +
        (item.dist >= 1000 ? (item.dist / 1000).toFixed(1) + " km" : Number(item.dist).toFixed(0) + " m") +
        " away";
      body.appendChild(badge);
      body.appendChild(h4);
      body.appendChild(meta);

      const history = document.createElement("div");
      history.className = "place-history";
      history.setAttribute("role", "tooltip");
      const histLabel = document.createElement("span");
      histLabel.className = "place-history__label";
      histLabel.textContent = "About";
      const histText = document.createElement("p");
      histText.className = "place-history__text";
      histText.textContent = "Loading…";
      history.appendChild(histLabel);
      history.appendChild(histText);

      card.appendChild(media);
      card.appendChild(body);
      card.appendChild(history);

      card.addEventListener("mouseenter", function () {
        loadPlaceHistory(card, item.title);
      });
      card.addEventListener("focus", function () {
        loadPlaceHistory(card, item.title);
      });
      ui.places.appendChild(card);
    });
  }

  async function loadPlaceHistory(card, title) {
    const panel = card.querySelector(".place-history");
    if (!panel) return;
    const textEl = panel.querySelector(".place-history__text");
    if (state.placeHistory.has(title)) {
      if (textEl) textEl.textContent = state.placeHistory.get(title);
      return;
    }
    try {
      const res = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_"))
      );
      const data = await res.json();
      const text = data.extract ? data.extract.slice(0, 280) : "No short summary on Wikipedia yet.";
      state.placeHistory.set(title, text);
      if (textEl) textEl.textContent = text;
    } catch (error) {
      if (textEl) textEl.textContent = "Unable to fetch summary.";
    }
  }

  function addExpense(note, amount) {
    state.expenses.push({ note: note, amount: amount });
    renderExpenses();
  }

  function renderExpenses() {
    ui.expenseList.innerHTML = "";
    let total = 0;
    state.expenses.forEach(function (entry) {
      total += entry.amount;
      const li = document.createElement("li");
      li.innerHTML = "<span>" + escapeHtml(entry.note) + "</span><strong>₹" + entry.amount.toFixed(2) + "</strong>";
      ui.expenseList.appendChild(li);
    });
    ui.expenseTotal.textContent = total.toFixed(2);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  ui.tripForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = new FormData(ui.tripForm);
    const origin = String(formData.get("origin") || "").trim();
    const destination = String(formData.get("destination") || "").trim();
    if (!origin || !destination) return;
    renderItinerary({
      origin: origin,
      destination: destination,
      vibe: String(formData.get("vibe") || "chill"),
      duration: String(formData.get("duration") || "2"),
      budget: String(formData.get("budget") || "medium"),
    }).catch(function () {
      ui.resultSection.hidden = false;
      ui.resultMeta.textContent = "Unable to compute route details right now. Showing local itinerary only.";
    });
  });

  ui.expenseForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const note = ui.expenseNote.value.trim();
    const amount = Number(ui.expenseAmount.value);
    if (!note || Number.isNaN(amount) || amount <= 0) return;
    addExpense(note, amount);
    ui.expenseForm.reset();
    ui.expenseNote.focus();
  });

  ui.detectBtn.addEventListener("click", function () {
    detectLocation();
  });
  if (ui.originLocationBtn) {
    ui.originLocationBtn.addEventListener("click", function () {
      fillOriginWithCurrentLocation();
    });
  }

  detectLocation();
})();
