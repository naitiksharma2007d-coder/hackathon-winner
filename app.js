(function () {
  "use strict";

  // 1. TERA ORIGINAL BUDGET DATA
  const BUDGET_FACTORS = {
    low: { stay: 25, food: 18, local: 10, activity: 12 },
    medium: { stay: 55, food: 30, local: 20, activity: 28 },
    high: { stay: 120, food: 60, local: 35, activity: 50 },
  };

  // 2. TERA FULL VIBE POOLS (20+ Din ka unique data)
  const VIBE_POOLS = {
    adventure: {
      morning: ["Trail hiking", "Cycling city tour", "Sunrise viewpoint trek", "Early morning jog", "Kayaking session", "Forest exploration", "Outdoor yoga"],
      afternoon: ["Rock climbing", "Water sports", "Off-road safari", "Ziplining", "Mountain biking", "Bungee jumping"],
      evening: ["Street food hunt", "Campfire dinner", "Local brewery visit", "Night trekking", "Open-air BBQ"]
    },
    chill: {
      morning: ["Slow breakfast", "Spa morning", "Bookstore visit", "Coffee tasting", "Quiet garden walk", "Meditation session", "Art gallery stroll"],
      afternoon: ["Scenic park walk", "Casual strolling", "Picnic by water", "Pottery class", "Botanical garden", "Photography walk"],
      evening: ["Sunset relaxed dinner", "Live acoustic music", "Stargazing", "Wine tasting", "Cozy movie night"]
    },
    history: {
      morning: ["Old town guided walk", "Fort exploration", "Local artisan workshop", "Antique market", "Historical monument", "Temple/Church visit", "Heritage trail"],
      afternoon: ["Main museum visit", "Ancient ruins", "Historical photography", "Palace tour", "Cultural center", "Archival library"],
      evening: ["Cultural performance", "Traditional dinner", "Historic market walk", "Folk dance show", "Heritage light & sound show"]
    },
    food: {
      morning: ["Morning farmer's market", "Local breakfast joint", "Bakery crawling", "Tea/Coffee estate tour", "Fruit picking", "Spice market walk", "Traditional morning tea"],
      afternoon: ["Cooking class", "Spice market tour", "Farm-to-table lunch", "Cheese tasting", "Local food festival", "Seafood tasting"],
      evening: ["Signature fine dining", "Hidden gem eatery", "Food truck exploration", "Street food night market", "Dessert crawling"]
    },
    nature: {
      morning: ["Early nature trail", "Bird watching", "Hill viewpoint", "Lakeside walk", "Sunrise photography", "Forest canopy walk", "River trail"],
      afternoon: ["Botanical gardens", "Riverside boating", "Forest walk", "Wildlife spotting", "Eco-farm visit", "Mountain hiking"],
      evening: ["Light evening walk", "Sunset picnic", "Eco-friendly cafe", "Campfire gathering", "Firefly watching"]
    }
  };

  const TIPS = [
    "Buy a transit day pass if you plan 3+ rides; it usually costs less.",
    "For crowd control, target major spots within 90 minutes of opening.",
    "Keep one indoor backup block per day for weather changes.",
  ];

  // 3. TERA ORIGINAL WIKI FILTERING LOGIC
  const PLACE_EXCLUDE_TITLE = /\b(university|college|campus|\bschool\b|hospital|clinic|medical|pharmacy|morgue|cemetery|prison|jail|police|fire|courthouse|embassy|consulate|parking|office|data)\b/i;
  const PLACE_INCLUDE_TITLE = /\b(temple|mosque|shrine|cathedral|basilica|synagogue|gurdwara|stupa|pagoda|minaret|minar|monument|museum|memorial|fort|fortress|palace|castle|citadel|bastion|gate|ruins|archaeological|heritage|historic|national\s+park|nature|wildlife|botanical|garden|waterfall|lake|beach|mountain|observatory|zoo|aquarium|amphitheatre|tower|bridge|square|plaza|mausoleum|tomb|scenic|viewpoint|landmark|world\s+heritage)\b/i;

  const state = {
    // LOCAL STORAGE SE LOAD KAR RAHE HAIN
    expenses: JSON.parse(localStorage.getItem("wandercraft_ledger")) || [],
    placeHistory: new Map(),
  };

  const ui = {
    locationText: document.getElementById("location-text"),
    detectBtn: document.getElementById("detect-btn"),
    originInput: document.getElementById("origin"),
    originLocationBtn: document.getElementById("origin-location-btn"),
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

  // --- 4. TERA LEDGER LOGIC (SAVING & INDIVIDUAL REMOVING) ---

  // EK SINGLE ITEM REMOVE KARNE KA FUNCTION
  window.removeSingleExpense = function(index) {
    state.expenses.splice(index, 1); // Specific item delete
    updateLedger(); // Refresh
  };

  function updateLedger() {
    localStorage.setItem("wandercraft_ledger", JSON.stringify(state.expenses));
    ui.expenseList.innerHTML = "";
    let total = 0;
    
    state.expenses.forEach((item, index) => {
      total += item.amount;
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      
      // History mein delete button (×) add kiya
      li.innerHTML = `
        <span>${item.note}</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <strong>₹${item.amount.toFixed(2)}</strong>
          <button onclick="removeSingleExpense(${index})" 
                  style="background: #fee2e2; color: #dc2626; border: none; 
                         border-radius: 6px; padding: 2px 8px; cursor: pointer; 
                         font-weight: bold; font-size: 14px;">×</button>
        </div>
      `;
      ui.expenseList.appendChild(li);
    });
    ui.expenseTotal.textContent = total.toFixed(2);
  }

  ui.expenseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const note = ui.expenseNote.value.trim();
    const amount = parseFloat(ui.expenseAmount.value);
    if (note && amount > 0) {
      state.expenses.push({ note, amount });
      updateLedger();
      ui.expenseForm.reset();
    }
  });

  // Pura data saaf karne ke liye
  window.clearAllData = function() {
    if(confirm("Pura data saaf kar dein?")) {
      state.expenses = [];
      updateLedger();
    }
  };

  // --- 5. GEOLOCATION & WIKI (FULL LOGIC) ---
  async function fetchNearby(lat, lon) {
    ui.places.innerHTML = "<p>Finding curated attractions...</p>";
    try {
      const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=10000&gscoord=${lat}|${lon}&gslimit=50&format=json&origin=*`);
      const data = await res.json();
      const raw = data.query.geosearch;
      
      const filtered = raw.filter(p => !PLACE_EXCLUDE_TITLE.test(p.title) && PLACE_INCLUDE_TITLE.test(p.title)).slice(0, 10);
      
      ui.places.innerHTML = "";
      filtered.forEach(p => {
        const div = document.createElement("div");
        div.className = "itinerary-card";
        div.innerHTML = `<h4>${p.title}</h4><p>~${(p.dist/1000).toFixed(1)} km away</p>`;
        ui.places.appendChild(div);
      });
    } catch (e) { ui.places.innerHTML = "Error loading picks."; }
  }

  ui.detectBtn.onclick = () => {
    ui.locationText.textContent = "Detecting...";
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      ui.locationText.textContent = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      fetchNearby(latitude, longitude);
    });
  };

  // --- 6. ITINERARY BUILDER (FULL TERA LOGIC) ---
  ui.tripForm.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(ui.tripForm);
    const dest = fd.get("destination"), days = parseInt(fd.get("duration")), vibe = fd.get("vibe"), budget = fd.get("budget");
    
    ui.resultHeading.textContent = `Trip to ${dest}`;
    ui.resultMeta.textContent = `${days} Days • ${vibe.toUpperCase()} • Budget: ${budget.toUpperCase()}`;
    ui.tipText.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

    ui.itinerary.innerHTML = "";
    const pool = VIBE_POOLS[vibe];
    for(let i=1; i<=days; i++) {
      const card = document.createElement("div");
      card.className = "itinerary-card";
      card.innerHTML = `
        <h3>Day ${i}</h3>
        <p><b>Morning:</b> ${pool.morning[(i-1) % pool.morning.length]}</p>
        <p><b>Afternoon:</b> ${pool.afternoon[(i-1) % pool.afternoon.length]}</p>
        <p><b>Evening:</b> ${pool.evening[(i-1) % pool.evening.length]}</p>
      `;
      ui.itinerary.appendChild(card);
    }
    ui.resultSection.hidden = false;
  };

  updateLedger(); // Initial load
})();
