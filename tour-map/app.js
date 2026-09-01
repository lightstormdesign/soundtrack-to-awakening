/* Tour Route Planner — booking agents + festivals on a US map.
   Data mirrors lightstorm.co/directory (agents.json, festivals.json) and
   lightstorm.co/template (outreach rules/template/AI prompt), copied into
   ./data so this page runs standalone with no build step. */

(() => {
  "use strict";

  /* ---------------- Starfield background ---------------- */
  (function starfield() {
    const canvas = document.getElementById("starfield");
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars = [];
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const count = Math.round((w * h) / 6000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
      }));
    }
    window.addEventListener("resize", resize);
    resize();

    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        const tw = reduced ? 0.75 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase);
        ctx.globalAlpha = tw * 0.85;
        ctx.fillStyle = "#f5f3ee";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      t += 16;
      if (!reduced) requestAnimationFrame(draw);
    }
    draw();
  })();

  /* ---------------- State FIPS table ---------------- */
  const STATES = [
    ["Alabama","AL",1],["Alaska","AK",2],["Arizona","AZ",4],["Arkansas","AR",5],
    ["California","CA",6],["Colorado","CO",8],["Connecticut","CT",9],["Delaware","DE",10],
    ["District of Columbia","DC",11],["Florida","FL",12],["Georgia","GA",13],["Hawaii","HI",15],
    ["Idaho","ID",16],["Illinois","IL",17],["Indiana","IN",18],["Iowa","IA",19],
    ["Kansas","KS",20],["Kentucky","KY",21],["Louisiana","LA",22],["Maine","ME",23],
    ["Maryland","MD",24],["Massachusetts","MA",25],["Michigan","MI",26],["Minnesota","MN",27],
    ["Mississippi","MS",28],["Missouri","MO",29],["Montana","MT",30],["Nebraska","NE",31],
    ["Nevada","NV",32],["New Hampshire","NH",33],["New Jersey","NJ",34],["New Mexico","NM",35],
    ["New York","NY",36],["North Carolina","NC",37],["North Dakota","ND",38],["Ohio","OH",39],
    ["Oklahoma","OK",40],["Oregon","OR",41],["Pennsylvania","PA",42],["Rhode Island","RI",44],
    ["South Carolina","SC",45],["South Dakota","SD",46],["Tennessee","TN",47],["Texas","TX",48],
    ["Utah","UT",49],["Vermont","VT",50],["Virginia","VA",51],["Washington","WA",53],
    ["West Virginia","WV",54],["Wisconsin","WI",55],["Wyoming","WY",56],
  ];
  const NAME_TO_FIPS = new Map(STATES.map(([name, , fips]) => [name.toLowerCase(), fips]));
  const FIPS_TO_META = new Map(STATES.map(([name, abbr, fips]) => [fips, { name, abbr }]));

  /* ---------------- Niche / genre filters ---------------- */
  const NICHES = [
    { key: "all", label: "All genres" },
    { key: "conscious", label: "Conscious / Spiritual", kw: ["conscious","spiritual","sacred","medicine","yoga","ecstatic","healing","transformation","meditat","ceremon","plant","holistic","wellness","consciousness"] },
    { key: "folk", label: "Folk & Acoustic", kw: ["folk","acoustic","singer-songwriter","singer/songwriter","americana","bluegrass"] },
    { key: "rock", label: "Rock", kw: ["rock","punk","metal","alternative","indie"] },
    { key: "electronic", label: "Electronic / DJ", kw: ["electronic","edm","dj","house","techno","dance"] },
    { key: "hiphop", label: "Hip-Hop / R&B", kw: ["hip hop","hip-hop","rap","r&b","soul","funk"] },
    { key: "country", label: "Country", kw: ["country","western"] },
    { key: "jazz", label: "Jazz / Blues", kw: ["jazz","blues"] },
    { key: "latin", label: "Latin / World", kw: ["latin","salsa","reggaeton","cumbia","world","reggae","afrobeat"] },
    { key: "family", label: "Family / Corporate", kw: ["family","corporate","private event","wedding","kids"] },
  ];

  /* ---------------- helpers (mirrors lightstorm.co/directory) ---------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Scraped source data sometimes has a real address followed by leftover
  // junk from a misaligned column or a second contact (e.g. "info@x.com
  // New", "a@x.com – Jane Doe (Artist Relations", ": a@x.com b@y.com") —
  // the strict full-string EMAIL_RE above rejects the whole field in those
  // cases even though a valid address is sitting right there. This looser
  // pattern is only used as a fallback, to pull that first address out
  // rather than discard it (recovers ~213 otherwise-lost festival emails).
  const EMAIL_FIND_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const cleanStr = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);

  // Same root cause as EMAIL_FIND_RE above, but bigger: ~10% of festivals.json
  // has its name/website/phone fields (real data, presumably valid in the
  // original source) run together with a fragment of an unrelated field
  // after 2+ spaces — a column-misalignment artifact from wherever this was
  // scraped, e.g. "Winter Park Brew Fest    Web: https://..." or, worse,
  // "3                    Inst" where even the surviving prefix is a
  // meaningless fragment. Splits off whatever comes after that gap; callers
  // decide whether the remainder is trustworthy enough to use.
  function stripColumnShiftJunk(raw) {
    const m = raw.match(/^([\s\S]*?)\s{2,}\S/);
    return m ? { prefix: m[1].trim(), hadJunk: true } : { prefix: raw.trim(), hadJunk: false };
  }
  const cleanPhone = (s) => {
    const v = cleanStr(s);
    if (!v) return null;
    const cleaned = v.replace(/^phone:?\s*/i, "").trim();
    if (!cleaned) return null;
    const { prefix, hadJunk } = stripColumnShiftJunk(cleaned);
    if (!hadJunk) return prefix || null;
    // Only keep the stripped prefix if it's still a complete-looking phone
    // number on its own — a few of these were truncated mid-digit along
    // with the junk (e.g. "+1-828-686-874"), and a broken number is worse
    // than none.
    return PHONE_RE.test(prefix) ? prefix : null;
  };
  const cleanEmail = (raw) => {
    if (!raw) return null;
    const first = raw.split("/")[0].trim();
    if (EMAIL_RE.test(first)) return first;
    const match = first.match(EMAIL_FIND_RE);
    return match ? match[0] : null;
  };
  const cleanWebsiteField = (raw) => {
    const v = cleanStr(raw);
    if (!v) return null;
    const { prefix, hadJunk } = stripColumnShiftJunk(v);
    if (!hadJunk) return prefix || null;
    if (!/\.[a-z]{2,}/i.test(prefix)) return null;
    try {
      new URL(/^https?:\/\//i.test(prefix) ? prefix : `https://${prefix}`);
    } catch {
      return null;
    }
    return prefix;
  };
  // Same idea for festival names, but a name can't just be dropped when the
  // cleanup isn't confident (the UI needs *something* to show as the card
  // title) — so an uncertain one falls back to the untouched original
  // string, flagged, rather than a possibly-wrong guess at where it ends.
  function cleanFestivalName(raw) {
    const v = cleanStr(raw);
    if (!v) return { name: "Untitled festival", nameUncertain: false };
    const { prefix, hadJunk } = stripColumnShiftJunk(v);
    if (!hadJunk) return { name: prefix, nameUncertain: false };
    const looksComplete = prefix.length >= 8 && /[a-zA-Z]{3,}/.test(prefix);
    return looksComplete ? { name: prefix, nameUncertain: false } : { name: v, nameUncertain: true };
  }
  const websiteHref = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
  const websiteLabel = (url) => url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const socialLabel = (url) => {
    if (/facebook\.com/i.test(url)) return "Facebook";
    if (/instagram\.com/i.test(url)) return "Instagram";
    if (/twitter\.com|x\.com/i.test(url)) return "Twitter";
    return "Social";
  };
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Best-effort, disclosed-as-approximate location for records with no real
  // state field: resolves a US phone number's area code to the one state it
  // belongs to (a fixed public numbering-plan table, not a guess about the
  // specific festival) — skipped for toll-free codes and multi-match junk.
  const PHONE_RE = /(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  function resolveApproxState(phoneRaw) {
    if (!phoneRaw) return null;
    const m = PHONE_RE.exec(phoneRaw);
    if (!m) return null;
    const code = m[1];
    if (window.LS_TOLLFREE_CODES?.has(code)) return null;
    const name = window.LS_AREA_CODE_STATE?.[code];
    if (!name) return null;
    const fips = NAME_TO_FIPS.get(name.toLowerCase());
    return fips ? { fips, name } : null;
  }

  // Collapses near-identical scraped entries — same normalized name AND a
  // shared email or website domain (a name match alone isn't enough: some
  // generic extraction artifacts like "events" share a name but nothing
  // else, and merging those would wrongly combine unrelated listings).
  const normKey = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const domainOf = (url) => {
    if (!url) return null;
    try { return new URL(websiteHref(url)).hostname.replace(/^www\./, ""); } catch { return null; }
  };
  // locationKey (e.g. "state" for agents): when the raw records carry a
  // location field, two same-name/same-domain records only merge if that
  // field agrees (or is blank on both) — a shared domain alone isn't
  // enough, since several agencies here run one site with a separate
  // per-state landing page each, which must stay as separate state pins.
  function dedupeRaw(list, locationKey, exactKeys = []) {
    const byName = new Map();
    list.forEach((item, i) => {
      const key = normKey(item.name);
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(i);
    });
    const consumed = new Set();
    const result = [];
    list.forEach((item, i) => {
      if (consumed.has(i)) return;
      const key = normKey(item.name);
      const candidates = key ? byName.get(key) : [i];
      const baseEmail = (item.email || "").toLowerCase().split("/")[0].trim();
      const baseDomain = domainOf(item.website);
      const baseLoc = locationKey ? (item[locationKey] || "").toLowerCase().trim() : "";
      const cluster = [i];
      for (const j of candidates) {
        if (j === i || consumed.has(j)) continue;
        const other = list[j];
        const otherEmail = (other.email || "").toLowerCase().split("/")[0].trim();
        const otherDomain = domainOf(other.website);
        const otherLoc = locationKey ? (other[locationKey] || "").toLowerCase().trim() : "";
        const locCompatible = !locationKey || !baseLoc || !otherLoc || baseLoc === otherLoc;
        const exactCompatible = exactKeys.every((k) => (item[k] || "") === (other[k] || ""));
        if (locCompatible && exactCompatible && ((baseEmail && otherEmail && baseEmail === otherEmail) || (baseDomain && otherDomain && baseDomain === otherDomain))) {
          cluster.push(j);
        }
      }
      cluster.forEach((idx) => consumed.add(idx));
      if (cluster.length === 1) { result.push(item); return; }
      const mergedItem = { ...item };
      for (const idx of cluster) {
        if (idx === i) continue;
        const other = list[idx];
        for (const k of Object.keys(other)) {
          const v = other[k], cur = mergedItem[k];
          if ((cur === null || cur === undefined || cur === "") && v !== null && v !== undefined && v !== "") mergedItem[k] = v;
          if (Array.isArray(cur) && Array.isArray(v)) mergedItem[k] = Array.from(new Set([...cur, ...v]));
        }
      }
      mergedItem.__dupCount = cluster.length - 1;
      result.push(mergedItem);
    });
    return result;
  }

  function normalizeAgent(a, i) {
    const isNational = a.scope === "national";
    const stateFips = !isNational ? NAME_TO_FIPS.get((a.state || "").toLowerCase()) ?? null : null;
    const subtitle = isNational
      ? [cleanStr(a.category), cleanStr(a.regions)].filter(Boolean).join(" · ")
      : [cleanStr(a.city), cleanStr(a.state)].filter(Boolean).join(", ");
    const genresText = cleanStr(isNational ? a.genres_listed : a.genres);
    const website = cleanWebsiteField(a.website);
    const links = (!isNational && Array.isArray(a.socials) ? a.socials : [])
      .map(cleanStr).filter(Boolean).map((href) => ({ label: socialLabel(href), href }));
    return {
      id: `agency-${i}`, type: "agent", name: a.name, subtitle: subtitle || null,
      genresText, email: cleanEmail(a.email), website, phone: cleanPhone(a.phone), links,
      isNational, stateFips, stateName: !isNational ? cleanStr(a.state) : null,
      dupCount: a.__dupCount || 0,
      searchIndex: [a.name, genresText, subtitle, website].filter(Boolean).join(" ").toLowerCase(),
    };
  }

  function normalizeFestival(f, i) {
    const website = cleanWebsiteField(f.website);
    const links = [
      f.facebook ? { label: "Facebook", href: cleanWebsiteField(f.facebook) } : null,
      f.instagram ? { label: "Instagram", href: cleanWebsiteField(f.instagram) } : null,
      f.twitter ? { label: "Twitter", href: cleanWebsiteField(f.twitter) } : null,
    ].filter((l) => l && l.href);
    const subtitle = cleanStr(f.month);
    const { name, nameUncertain } = cleanFestivalName(f.name);
    const verifiedState = window.LS_FESTIVAL_OVERRIDES?.[name] || null;
    const approx = resolveApproxState(f.phone);
    return {
      id: `festival-${i}`, type: "festival", name, nameUncertain, subtitle,
      genresText: null, email: cleanEmail(f.email), website, phone: cleanPhone(f.phone), links,
      isNational: false,
      stateFips: verifiedState ? NAME_TO_FIPS.get(verifiedState.toLowerCase()) ?? null : null,
      stateName: verifiedState,
      month: subtitle,
      approxStateFips: approx?.fips ?? null, approxStateName: approx?.name ?? null,
      dupCount: f.__dupCount || 0,
      searchIndex: [f.name, subtitle, website].filter(Boolean).join(" ").toLowerCase(),
    };
  }

  function matchesNiche(item, nicheKey) {
    if (nicheKey === "all" || !item.genresText) return nicheKey === "all";
    const niche = NICHES.find((n) => n.key === nicheKey);
    if (!niche || !niche.kw) return true;
    const text = item.genresText.toLowerCase();
    return niche.kw.some((k) => text.includes(k));
  }

  /* ---------------- App state ---------------- */
  const state = {
    mode: "agents",
    query: "",
    niches: new Set(["all"]),
    month: "all",
    selectedFips: null,
    festivalMapView: false,
    sidePanelKind: null,
    sharedRoute: null,
    agents: [],
    festivals: [],
    route: loadRoute(),
    profile: loadProfile(),
    contacted: loadContacted(),
    topology: null,
    features: null,
    pathGen: null,
    zoomed: false,
  };

  function loadRoute() {
    try {
      const raw = localStorage.getItem("ls_tour_route");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveRoute() {
    try { localStorage.setItem("ls_tour_route", JSON.stringify(state.route)); } catch {}
  }

  // Saved once, reused everywhere the AI prompt / template need "my info" —
  // so an artist never retypes their stats per outreach email.
  const PROFILE_FIELDS = [
    { key: "artistName", label: "Your name (for signing emails)", placeholder: "Ela Winters" },
    { key: "nameGenre", label: "Name / genre in one phrase", placeholder: "Ela Winters — ambient soul for late-night drives" },
    { key: "stat", label: "Best crowd size / stat", placeholder: "40k monthly listeners" },
    { key: "festivals", label: "Festivals you've played", placeholder: "Bonnaroo, Envision" },
    { key: "artists", label: "Artists you've toured with / supported", placeholder: "Nahko, Xavier Rudd" },
    { key: "momentum", label: "Current momentum signal", placeholder: "New single out this month, tour flyer attached" },
    { key: "secondary", label: "Secondary offerings", placeholder: "Sound bath, songwriting workshop" },
    { key: "promoLink", label: "Promo video / highlight reel link", placeholder: "https://youtu.be/..." },
    { key: "instagramEpk", label: "Instagram + press kit / EPK link", placeholder: "@elawinters · https://elawinters.com/epk" },
    { key: "phone", label: "Phone number", placeholder: "(555) 123-4567" },
  ];
  function loadProfile() {
    try {
      const raw = localStorage.getItem("ls_artist_profile");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveProfile(next) {
    state.profile = next;
    try { localStorage.setItem("ls_artist_profile", JSON.stringify(next)); } catch {}
  }
  function autoMatchNiche(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const hit = NICHES.find((n) => n.kw && n.kw.some((k) => lower.includes(k)));
    return hit ? hit.key : null;
  }

  // Lightweight outreach-status tags per card (localStorage, not on the
  // records themselves) so a long campaign doesn't rely on memory.
  const CONTACT_STATUSES = [
    { key: "none", label: "Not contacted" },
    { key: "emailed", label: "Emailed" },
    { key: "booked", label: "Booked" },
  ];
  function loadContacted() {
    try {
      const raw = localStorage.getItem("ls_contact_status");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveContacted() {
    try { localStorage.setItem("ls_contact_status", JSON.stringify(state.contacted)); } catch {}
  }
  function getContactStatus(id) { return state.contacted[id] || "none"; }
  function cycleContactStatus(id) {
    const order = CONTACT_STATUSES.map((s) => s.key);
    const cur = getContactStatus(id);
    const next = order[(order.indexOf(cur) + 1) % order.length];
    if (next === "none") delete state.contacted[id];
    else state.contacted[id] = next;
    saveContacted();
  }

  /* ---------------- Boot ---------------- */
  const els = {
    modeToggle: document.getElementById("modeToggle"),
    modePill: document.getElementById("modePill"),
    searchInput: document.getElementById("searchInput"),
    nationalBtn: document.getElementById("nationalBtn"),
    nationalCount: document.getElementById("nationalCount"),
    nicheChips: document.getElementById("nicheChips"),
    dataNote: document.getElementById("dataNote"),
    mapStage: document.querySelector(".map-stage"),
    svg: document.getElementById("us-map"),
    festivalScroll: document.getElementById("festivalScroll"),
    festivalGrid: document.getElementById("festivalGrid"),
    festivalCount: document.getElementById("festivalCount"),
    tooltip: document.getElementById("tooltip"),
    sidePanel: document.getElementById("sidePanel"),
    spTitle: document.getElementById("spTitle"),
    spCount: document.getElementById("spCount"),
    spBody: document.getElementById("spBody"),
    spClose: document.getElementById("spClose"),
    profileBtn: document.getElementById("profileBtn"),
    festivalViewToggle: document.getElementById("festivalViewToggle"),
    festivalApproxCount: document.getElementById("festivalApproxCount"),
    routeToggleBtn: document.getElementById("routeToggleBtn"),
    routeBtnCount: document.getElementById("routeBtnCount"),
    routeDrawer: document.getElementById("routeDrawer"),
    rdBody: document.getElementById("rdBody"),
    clearRouteBtn: document.getElementById("clearRouteBtn"),
    exportRouteBtn: document.getElementById("exportRouteBtn"),
    shareRouteBtn: document.getElementById("shareRouteBtn"),
    printRouteBtn: document.getElementById("printRouteBtn"),
    routeCloseBtn: document.getElementById("routeCloseBtn"),
    modalOverlay: document.getElementById("modalOverlay"),
    modalContent: document.getElementById("modalContent"),
    toast: document.getElementById("toast"),
  };

  Promise.all([
    fetch("data/agents.json").then((r) => r.json()),
    fetch("data/festivals.json").then((r) => r.json()),
    fetch("data/us-states-10m.json").then((r) => r.json()),
  ])
    .then(([agentsRaw, festivalsRaw, topo]) => {
      state.agents = Array.isArray(agentsRaw) ? dedupeRaw(agentsRaw, "state", ["scope"]).map(normalizeAgent) : [];
      state.festivals = Array.isArray(festivalsRaw) ? dedupeRaw(festivalsRaw).map(normalizeFestival) : [];
      state.topology = topo;
      initMap(topo);
      renderNicheChips();
      updateDataNote();
      updateLayoutVisibility();
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      els.svg.outerHTML = '<p class="loading-msg">Couldn\'t load the map data — try refreshing the page.</p>';
    });

  /* ---------------- Map setup (d3 + topojson) ---------------- */
  let svg, zoomLayer, statesLayer, labelsLayer, markersLayer, approxMarkersLayer, routeLayer, path, projection;

  function initMap(topo) {
    const width = 975, height = 610;
    projection = d3.geoAlbersUsa().scale(1300).translate([width / 2, height / 2]);
    path = d3.geoPath(projection);

    const featureCollection = topojson.feature(topo, topo.objects.states);
    state.features = featureCollection.features.filter((f) => FIPS_TO_META.has(+f.id));

    svg = d3.select("#us-map");
    zoomLayer = svg.append("g").attr("id", "zoomLayer");
    statesLayer = zoomLayer.append("g").attr("id", "statesLayer");
    routeLayer = zoomLayer.append("g").attr("id", "routeLayer");
    markersLayer = zoomLayer.append("g").attr("id", "markersLayer");
    approxMarkersLayer = zoomLayer.append("g").attr("id", "approxMarkersLayer");
    labelsLayer = zoomLayer.append("g").attr("id", "labelsLayer");

    statesLayer.selectAll("path.state-path")
      .data(state.features)
      .join("path")
      .attr("class", "state-path")
      .attr("d", path)
      .style("vector-effect", "non-scaling-stroke")
      .attr("data-fips", (d) => +d.id)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (d) => FIPS_TO_META.get(+d.id)?.name || "")
      .on("mouseenter", (e, d) => showTooltip(e, d))
      .on("mousemove", (e) => moveTooltip(e))
      .on("mouseleave", hideTooltip)
      .on("focus", (e, d) => showTooltip(e, d))
      .on("blur", hideTooltip)
      .on("click", (e, d) => onStateClick(+d.id))
      .on("keydown", (e, d) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onStateClick(+d.id); }
      });

    labelsLayer.selectAll("text.state-label")
      .data(state.features)
      .join("text")
      .attr("class", "state-label")
      .attr("x", (d) => path.centroid(d)[0])
      .attr("y", (d) => path.centroid(d)[1])
      .style("vector-effect", "non-scaling-stroke")
      .text((d) => FIPS_TO_META.get(+d.id)?.abbr || "");

    svg.on("click", (e) => {
      if (e.target === svg.node()) resetZoom();
    });
  }

  function centroidFor(fips) {
    const f = state.features.find((d) => +d.id === fips);
    return f ? path.centroid(f) : null;
  }

  function showTooltip(e, d) {
    const fips = +d.id;
    const meta = FIPS_TO_META.get(fips);
    const items = currentFilteredAgents().filter((a) => a.stateFips === fips);
    els.tooltip.innerHTML =
      `<div class="t-title">${meta.name}</div><div class="t-sub">${items.length} booking agent${items.length === 1 ? "" : "s"}</div>`;
    els.tooltip.classList.add("show");
    moveTooltip(e);
  }
  function moveTooltip(e) {
    let x = e.clientX, y = e.clientY;
    if (x == null || y == null) {
      const r = e.target.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    els.tooltip.style.left = x + 16 + "px";
    els.tooltip.style.top = y + 16 + "px";
  }
  function hideTooltip() { els.tooltip.classList.remove("show"); }

  function onStateClick(fips) {
    if (state.mode === "agents") {
      state.selectedFips = fips;
      zoomToState(fips);
      openStatePanel(fips);
    } else if (state.mode === "festivals" && state.festivalMapView) {
      state.selectedFips = fips;
      zoomToState(fips);
      openFestivalApproxPanel(fips);
    }
  }

  function zoomToState(fips) {
    const f = state.features.find((d) => +d.id === fips);
    if (!f) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const width = 975, height = 610;
    const dx = x1 - x0, dy = y1 - y0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const scale = Math.max(1, Math.min(8, 0.82 / Math.max(dx / width, dy / height)));
    const tx = width / 2 - scale * cx;
    const ty = height / 2 - scale * cy;
    zoomLayer.transition().duration(650).ease(d3.easeCubicOut)
      .attr("transform", `translate(${tx},${ty}) scale(${scale})`);
    state.zoomed = true;
  }

  function resetZoom() {
    if (!state.zoomed) return;
    zoomLayer.transition().duration(550).ease(d3.easeCubicOut).attr("transform", "translate(0,0) scale(1)");
    state.zoomed = false;
    state.selectedFips = null;
    closeSidePanel();
    statesLayer.selectAll("path.state-path").classed("selected", false);
  }

  /* ---------------- Filtering ---------------- */
  function currentFilteredAgents() {
    const q = state.query.trim().toLowerCase();
    return state.agents.filter((a) => (!q || a.searchIndex.includes(q)) && matchesNicheOrAll(a));
  }
  function matchesNicheOrAll(a) {
    if (state.niches.has("all")) return true;
    return Array.from(state.niches).some((key) => matchesNiche(a, key));
  }
  function currentFilteredFestivals() {
    const q = state.query.trim().toLowerCase();
    return state.festivals.filter((f) => (!q || f.searchIndex.includes(q)) && (state.month === "all" || f.month === state.month));
  }

  /* ---------------- Rendering ---------------- */
  function renderAll() {
    renderMapMarkers();
    renderNationalCount();
    renderFestivalApproxCount();
    if (state.mode === "festivals") renderFestivalGrid();
    if (state.sidePanelKind === "agentState") openStatePanel(state.sidePanelFips);
    else if (state.sidePanelKind === "festivalApprox") openFestivalApproxPanel(state.sidePanelFips);
    else if (state.sidePanelKind === "national") openNationalPanel();
  }

  function groupByFips(items, fipsKey) {
    const byFips = new Map();
    for (const it of items) {
      const fips = it[fipsKey];
      if (fips == null) continue;
      if (!byFips.has(fips)) byFips.set(fips, []);
      byFips.get(fips).push(it);
    }
    return byFips;
  }

  function renderMapMarkers() {
    const isAgentsMode = state.mode === "agents";
    const showApproxFestivals = state.mode === "festivals" && state.festivalMapView;

    statesLayer.selectAll("path.state-path")
      .classed("dimmed", () => state.mode === "festivals" && !state.festivalMapView)
      .classed("selected", (d) => +d.id === state.selectedFips);
    labelsLayer.selectAll("text.state-label")
      .classed("dimmed", () => state.mode === "festivals" && !state.festivalMapView);

    // Confirmed-location layer: agent counts in Agents mode, or manually
    // verified festivals (real stateFips, from festival-overrides.js) in
    // Festivals map view — markersLayer is otherwise unused in that mode.
    const confirmedByFips = isAgentsMode
      ? groupByFips(currentFilteredAgents().filter((a) => !a.isNational), "stateFips")
      : showApproxFestivals
        ? groupByFips(currentFilteredFestivals().filter((f) => f.stateFips != null), "stateFips")
        : new Map();
    const confirmedMax = Math.max(1, ...Array.from(confirmedByFips.values()).map((v) => v.length));
    const confirmedR = d3.scaleSqrt().domain([0, confirmedMax]).range([0, 15]);
    const confirmedData = Array.from(confirmedByFips.entries()).map(([fips, items]) => ({ fips, items }));

    markersLayer.selectAll("circle.state-marker")
      .data(confirmedData, (d) => d.fips)
      .join(
        (enter) => enter.append("circle")
          .attr("class", "state-marker")
          .attr("cx", (d) => centroidFor(d.fips)?.[0] ?? 0)
          .attr("cy", (d) => centroidFor(d.fips)?.[1] ?? 0)
          .attr("r", 0)
          .call((e) => e.transition().duration(400).attr("r", (d) => Math.max(3, confirmedR(d.items.length)))),
        (update) => update.call((u) => u.transition().duration(300).attr("r", (d) => Math.max(3, confirmedR(d.items.length)))),
        (exit) => exit.transition().duration(200).attr("r", 0).remove()
      )
      .on("mouseenter", (e, d) => {
        const meta = FIPS_TO_META.get(d.fips);
        const label = isAgentsMode ? `${d.items.length} matching agent${d.items.length === 1 ? "" : "s"}` : `${d.items.length} verified festival${d.items.length === 1 ? "" : "s"}`;
        els.tooltip.innerHTML = `<div class="t-title">${meta.name}</div><div class="t-sub">${label}</div>`;
        els.tooltip.classList.add("show");
        moveTooltip(e);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (e, d) => { e.stopPropagation(); onStateClick(d.fips); });

    // Approximate festival layer (phone area-code inferred, disclosed as
    // unconfirmed) — excludes anything already shown as verified above.
    const approxByFips = showApproxFestivals
      ? groupByFips(currentFilteredFestivals().filter((f) => f.stateFips == null), "approxStateFips")
      : new Map();
    const approxMax = Math.max(1, ...Array.from(approxByFips.values()).map((v) => v.length));
    const approxR = d3.scaleSqrt().domain([0, approxMax]).range([0, 15]);
    const approxData = Array.from(approxByFips.entries()).map(([fips, items]) => ({ fips, items }));

    approxMarkersLayer.selectAll("circle.state-marker-approx")
      .data(approxData, (d) => d.fips)
      .join(
        (enter) => enter.append("circle")
          .attr("class", "state-marker-approx")
          .attr("cx", (d) => centroidFor(d.fips)?.[0] ?? 0)
          .attr("cy", (d) => centroidFor(d.fips)?.[1] ?? 0)
          .attr("r", 0)
          .call((e) => e.transition().duration(400).attr("r", (d) => Math.max(3, approxR(d.items.length)))),
        (update) => update.call((u) => u.transition().duration(300).attr("r", (d) => Math.max(3, approxR(d.items.length)))),
        (exit) => exit.transition().duration(200).attr("r", 0).remove()
      )
      .on("mouseenter", (e, d) => {
        const meta = FIPS_TO_META.get(d.fips);
        els.tooltip.innerHTML = `<div class="t-title">${meta.name}</div><div class="t-sub">${d.items.length} festival${d.items.length === 1 ? "" : "s"} · approx., via area code</div>`;
        els.tooltip.classList.add("show");
        moveTooltip(e);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (e, d) => { e.stopPropagation(); onStateClick(d.fips); });
  }

  function renderNationalCount() {
    els.nationalCount.textContent = currentFilteredAgents().filter((a) => a.isNational).length;
  }

  function renderFestivalApproxCount() {
    if (!els.festivalApproxCount) return;
    els.festivalApproxCount.textContent = currentFilteredFestivals().filter((f) => effectiveFips(f) != null).length;
  }

  function renderNicheChips() {
    if (state.mode === "festivals") {
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const present = new Set(state.festivals.map((f) => f.month).filter(Boolean));
      const opts = [{ key: "all", label: "All months" }, ...months.filter((m) => present.has(m)).map((m) => ({ key: m, label: m }))];
      els.nicheChips.innerHTML = opts.map((o) =>
        `<button type="button" class="chip ${state.month === o.key ? "active" : ""}" data-month="${escapeHtml(o.key)}">${o.label}</button>`
      ).join("");
      els.nicheChips.querySelectorAll("[data-month]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.month = btn.dataset.month;
          renderNicheChips();
          renderFestivalGrid();
          renderMapMarkers();
          updateLayoutVisibility();
        });
      });
    } else {
      els.nicheChips.innerHTML = NICHES.map((n) =>
        `<button type="button" class="chip ${state.niches.has(n.key) ? "active" : ""}" data-niche="${n.key}" aria-pressed="${state.niches.has(n.key)}">${n.label}</button>`
      ).join("");
      els.nicheChips.querySelectorAll("[data-niche]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.niche;
          if (key === "all") {
            state.niches = new Set(["all"]);
          } else {
            state.niches.delete("all");
            if (state.niches.has(key)) state.niches.delete(key);
            else state.niches.add(key);
            if (state.niches.size === 0) state.niches.add("all");
          }
          renderNicheChips();
          renderAll();
        });
      });
    }
  }

  function updateDataNote() {
    if (state.mode === "agents") {
      els.dataNote.textContent = "Pulled from the lightstorm.co directory — verify a contact before a mass send, some entries may be outdated.";
      return;
    }
    const verifiedCount = state.festivals.filter((f) => f.stateFips != null).length;
    const approxCount = state.festivals.filter((f) => f.stateFips == null && f.approxStateFips != null).length;
    const located = verifiedCount + approxCount;
    els.dataNote.textContent = state.festivalMapView
      ? `Showing ${located} of ${state.festivals.length} festivals with a location — ${verifiedCount} manually verified (solid pins), ${approxCount} approximated from their phone area code (hollow pins, unconfirmed). The rest have no usable location and stay in the list view.`
      : `Festival location data isn't reliably captured for most entries, so festivals are searchable below rather than pinned on the map. ${located} of them have a location (${verifiedCount} verified, ${approxCount} approximate) — toggle "Show approx. map" to see those on the map. Every other action (route, email, AI prompt) works the same either way.`;
  }

  /* ---------------- Mode / search wiring ---------------- */
  function updateLayoutVisibility() {
    const showMap = state.mode === "agents" || (state.mode === "festivals" && state.festivalMapView);
    els.mapStage.style.display = showMap ? "flex" : "none";
    els.festivalScroll.style.display = state.mode === "festivals" && !state.festivalMapView ? "block" : "none";
    els.nationalBtn.style.display = state.mode === "agents" ? "inline-block" : "none";
    els.festivalViewToggle.style.display = state.mode === "festivals" ? "inline-block" : "none";
    els.festivalViewToggle.innerHTML = state.festivalMapView
      ? "Show as list"
      : `Show on map <span class="count-badge" id="festivalApproxCount">0</span>`;
    els.festivalApproxCount = document.getElementById("festivalApproxCount");
    renderFestivalApproxCount();
  }

  els.modeToggle.querySelectorAll("button[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      state.festivalMapView = false;
      els.modeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      els.modePill.style.transform = state.mode === "agents" ? "translateX(0)" : "translateX(100%)";
      updateLayoutVisibility();
      closeSidePanel();
      resetZoom();
      renderNicheChips();
      updateDataNote();
      renderAll();
    });
  });

  els.festivalViewToggle.addEventListener("click", () => {
    state.festivalMapView = !state.festivalMapView;
    updateLayoutVisibility();
    closeSidePanel();
    resetZoom();
    updateDataNote();
    renderAll();
  });

  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.query = els.searchInput.value;
      renderAll();
      updateLayoutVisibility();
    }, 200);
  });

  els.nationalBtn.addEventListener("click", openNationalPanel);

  /* ---------------- Side panel ---------------- */
  function openStatePanel(fips) {
    state.sidePanelKind = "agentState";
    state.sidePanelFips = fips;
    const meta = FIPS_TO_META.get(fips);
    const items = currentFilteredAgents().filter((a) => a.stateFips === fips);
    els.spTitle.textContent = meta.name;
    els.spCount.textContent = `${items.length} booking agent${items.length === 1 ? "" : "s"}`;
    els.spBody.innerHTML = items.length ? items.map(cardHtml).join("") : `<p class="empty-msg">No agents match the current filters in ${meta.name}.</p>`;
    wireCardActions(els.spBody, items);
    els.sidePanel.classList.add("open");
  }

  function openFestivalApproxPanel(fips) {
    state.sidePanelKind = "festivalApprox";
    state.sidePanelFips = fips;
    const meta = FIPS_TO_META.get(fips);
    const items = currentFilteredFestivals().filter((f) => effectiveFips(f) === fips);
    const verifiedCount = items.filter((f) => f.stateFips != null).length;
    els.spTitle.textContent = meta.name;
    els.spCount.textContent = `${items.length} festival${items.length === 1 ? "" : "s"}${verifiedCount ? ` · ${verifiedCount} verified` : " · approx., via area code"}`;
    els.spBody.innerHTML = items.length ? items.map(cardHtml).join("") : `<p class="empty-msg">No festivals located in ${meta.name} match the current filters.</p>`;
    wireCardActions(els.spBody, items);
    els.sidePanel.classList.add("open");
  }

  function openNationalPanel() {
    state.sidePanelKind = "national";
    state.sidePanelFips = null;
    state.selectedFips = null;
    const items = currentFilteredAgents().filter((a) => a.isNational);
    els.spTitle.textContent = "National Booking Agents";
    els.spCount.textContent = `${items.length} agenc${items.length === 1 ? "y" : "ies"} · book anywhere in the US`;
    els.spBody.innerHTML = items.length ? items.map(cardHtml).join("") : `<p class="empty-msg">No national agents match the current filters.</p>`;
    wireCardActions(els.spBody, items);
    els.sidePanel.classList.add("open");
  }

  function closeSidePanel() {
    state.sidePanelFips = null;
    state.sidePanelKind = null;
    els.sidePanel.classList.remove("open");
  }
  els.spClose.addEventListener("click", () => { closeSidePanel(); resetZoom(); });

  function effectiveFips(item) { return item.stateFips ?? item.approxStateFips ?? null; }
  function effectiveStateName(item) { return item.stateName ?? item.approxStateName ?? null; }

  // Straight-line ("as the crow flies") distance between two route stops'
  // state centers — a rough tour-planning estimate, not driving distance.
  function haversineMiles([lat1, lon1], [lat2, lon2]) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  function stateLatLon(stateName) { return window.LS_STATE_CENTER_LATLON?.[stateName] || null; }

  // States roughly "on the way" between two route stops — a state counts if
  // routing through its center adds at most ~15% extra distance over the
  // direct A→B line. Rough tour-planning heuristic, not real road routing.
  function statesAlongPath(nameA, nameB, maxDetourFactor = 1.15) {
    const a = stateLatLon(nameA), b = stateLatLon(nameB);
    if (!a || !b) return [];
    const direct = haversineMiles(a, b) || 1;
    const results = [];
    for (const [name, latlon] of Object.entries(window.LS_STATE_CENTER_LATLON || {})) {
      if (name === nameA || name === nameB) continue;
      const via = haversineMiles(a, latlon) + haversineMiles(latlon, b);
      if (via / direct <= maxDetourFactor) results.push(name);
    }
    return results;
  }

  function cardHtml(item) {
    const inRoute = state.route.some((r) => r.id === item.id);
    const confirmedNote = item.type === "festival" && item.stateName
      ? `<p class="sub" style="color:var(--ls-text-soft);">${escapeHtml(item.stateName)} <i style="color:var(--ls-text-muted);">(location verified)</i></p>` : "";
    const approxNote = !item.stateName && item.approxStateName
      ? `<p class="sub" style="color:var(--ls-gold-light);">~ ${escapeHtml(item.approxStateName)} <i style="color:var(--ls-text-muted);">(approx., via area code)</i></p>` : "";
    const dupNote = item.dupCount > 0
      ? `<p class="sub" style="color:var(--ls-text-muted);font-size:10px;">merged ${item.dupCount} duplicate listing${item.dupCount === 1 ? "" : "s"}</p>` : "";
    const nameUncertainNote = item.nameUncertain
      ? `<p class="sub" style="color:var(--ls-text-muted);font-size:10px;">name may be garbled in source data</p>` : "";
    const status = getContactStatus(item.id);
    return `
      <div class="card" data-id="${item.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <h3>${escapeHtml(item.name)}</h3>
          <button type="button" data-action="status" class="status-pill status-${status}" title="Click to change outreach status">${CONTACT_STATUSES.find((s) => s.key === status).label}</button>
        </div>
        ${nameUncertainNote}
        ${item.subtitle ? `<p class="sub">${escapeHtml(item.subtitle)}</p>` : ""}
        ${confirmedNote}
        ${approxNote}
        ${item.genresText ? `<p class="genres">${escapeHtml(item.genresText)}</p>` : ""}
        ${dupNote}
        <div class="row-actions">
          <button type="button" data-action="contact">Contact &amp; email</button>
          <button type="button" data-action="route" class="${inRoute ? "added" : ""}">${inRoute ? "✓ In route" : "+ Add to route"}</button>
          ${item.website ? `<a href="${escapeHtml(websiteHref(item.website))}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel(item.website))}</a>` : ""}
        </div>
      </div>`;
  }

  function wireCardActions(container, items) {
    container.querySelectorAll(".card").forEach((cardEl) => {
      const item = items.find((i) => i.id === cardEl.dataset.id);
      if (!item) return;
      cardEl.querySelector('[data-action="contact"]').addEventListener("click", () => openContactModal(item));
      cardEl.querySelector('[data-action="route"]').addEventListener("click", (e) => {
        toggleRoute(item);
        e.target.classList.toggle("added");
        e.target.textContent = state.route.some((r) => r.id === item.id) ? "✓ In route" : "+ Add to route";
      });
      cardEl.querySelector('[data-action="status"]').addEventListener("click", (e) => {
        cycleContactStatus(item.id);
        const s = getContactStatus(item.id);
        e.target.className = `status-pill status-${s}`;
        e.target.textContent = CONTACT_STATUSES.find((x) => x.key === s).label;
      });
    });
  }

  /* ---------------- Festival grid (mode = festivals) ---------------- */
  const FESTIVAL_CAP = 90;
  function renderFestivalGrid() {
    const all = currentFilteredFestivals();
    const items = all.slice(0, FESTIVAL_CAP);
    els.festivalCount.textContent = `${all.length} result${all.length === 1 ? "" : "s"}${all.length > FESTIVAL_CAP ? ` — showing first ${FESTIVAL_CAP}, search to narrow` : ""}`;
    els.festivalGrid.innerHTML = items.length ? items.map(cardHtml).join("") : `<p class="empty-msg" style="grid-column:1/-1;">No festivals match — try a different name or month.</p>`;
    wireCardActions(els.festivalGrid, items);
  }

  /* ---------------- Route planner ---------------- */
  function toggleRoute(item) {
    const idx = state.route.findIndex((r) => r.id === item.id);
    if (idx >= 0) {
      state.route.splice(idx, 1);
    } else {
      state.route.push({ ...item, date: "" });
    }
    saveRoute();
    renderRouteUi();
    drawRouteOnMap();
  }
  function removeFromRoute(id) {
    state.route = state.route.filter((r) => r.id !== id);
    saveRoute();
    renderRouteUi();
    drawRouteOnMap();
    // The side panel / festival grid can be open behind the route drawer at
    // the same time (nothing closes one when the other opens) — without
    // this, a card removed here keeps showing a stale "✓ In route" pill
    // until something else forces that panel to re-render.
    renderAll();
  }
  function moveStop(id, dir) {
    const i = state.route.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.route.length) return;
    [state.route[i], state.route[j]] = [state.route[j], state.route[i]];
    saveRoute();
    renderRouteUi();
    drawRouteOnMap();
  }

  function renderSharedRouteUi() {
    els.routeBtnCount.textContent = state.route.length;
    const stops = state.sharedRoute;
    const rows = stops.map((r, i) => `
      <div class="route-stop" data-id="${r.id}">
        <div class="num">${i + 1}</div>
        <div class="info">
          <div class="name">${escapeHtml(r.name)}</div>
          <div class="loc">${escapeHtml(r.stateName || "Location not mapped")}${r.date ? ` · ${escapeHtml(r.date)}` : ""}</div>
        </div>
      </div>`).join("");
    els.rdBody.innerHTML = `
      <div class="shared-route-banner">
        <p>You're viewing a route someone shared with you — ${stops.length} stop${stops.length === 1 ? "" : "s"}, read-only.</p>
        <div class="m-actions">
          <button type="button" class="icon-btn gold" id="importSharedBtn">Import into my route</button>
          <button type="button" class="icon-btn" id="dismissSharedBtn">View my own route instead</button>
        </div>
      </div>
      ${rows}`;
    els.rdBody.querySelector("#importSharedBtn").addEventListener("click", importSharedRoute);
    els.rdBody.querySelector("#dismissSharedBtn").addEventListener("click", dismissSharedRoute);
  }

  function renderRouteUi() {
    if (state.sharedRoute) { renderSharedRouteUi(); return; }
    els.routeBtnCount.textContent = state.route.length;
    if (!state.route.length) {
      els.rdBody.innerHTML = `<p class="empty-msg">No stops yet — add an agent or festival from the map to start planning your route.</p>`;
      return;
    }

    let totalMiles = 0, hasAnyLeg = false;
    const rows = state.route.map((r, i) => {
      const loc = r.stateName || (r.approxStateName ? `~${r.approxStateName} (approx.)` : null) || r.subtitle || (r.type === "festival" ? "Location not mapped" : "National");
      const next = state.route[i + 1];
      let legHtml = "";
      if (next) {
        const a = stateLatLon(effectiveStateName(r)), b = stateLatLon(effectiveStateName(next));
        if (a && b) {
          const miles = haversineMiles(a, b);
          totalMiles += miles;
          hasAnyLeg = true;
          legHtml = `<div class="route-leg">↓ ~${miles.toLocaleString()} mi to next stop</div>`;
        } else {
          legHtml = `<div class="route-leg route-leg-unknown">↓ distance unknown (no located state)</div>`;
        }
      }
      return `
        <div class="route-stop" data-id="${r.id}">
          <div class="num">${i + 1}</div>
          <div class="info">
            <div class="name">${escapeHtml(r.name)}</div>
            <div class="loc">${escapeHtml(loc)}</div>
          </div>
          <input type="date" value="${r.date || ""}" data-date-id="${r.id}">
          <div class="stop-actions">
            <button type="button" data-up="${r.id}" title="Move up">↑</button>
            <button type="button" data-down="${r.id}" title="Move down">↓</button>
            <button type="button" data-remove="${r.id}" title="Remove">&times;</button>
          </div>
        </div>
        ${legHtml}`;
    }).join("");

    const summary = state.route.length > 1
      ? `<p class="route-summary">${hasAnyLeg ? `~${totalMiles.toLocaleString()} mi total (straight-line, in current order)` : "Add located stops to estimate total distance"}</p>`
      : "";

    const suggestionsHtml = buildRouteSuggestionsHtml();
    els.rdBody.innerHTML = summary + rows + suggestionsHtml;

    els.rdBody.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => moveStop(b.dataset.up, -1)));
    els.rdBody.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => moveStop(b.dataset.down, 1)));
    els.rdBody.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeFromRoute(b.dataset.remove)));
    els.rdBody.querySelectorAll("[data-date-id]").forEach((inp) => inp.addEventListener("change", () => {
      const r = state.route.find((x) => x.id === inp.dataset.dateId);
      if (r) { r.date = inp.value; saveRoute(); renderRouteUi(); }
    }));
    els.rdBody.querySelectorAll("[data-suggest-fips]").forEach((chip) => chip.addEventListener("click", () => {
      const fips = +chip.dataset.suggestFips;
      els.routeDrawer.classList.remove("open");
      if (state.mode !== "agents") {
        state.mode = "agents";
        els.modeToggle.querySelector('[data-mode="agents"]').click();
      }
      onStateClick(fips);
    }));
  }

  function buildRouteSuggestionsHtml() {
    if (state.mode !== "agents" || state.route.length < 2) return "";
    const alongNames = new Set();
    for (let i = 0; i < state.route.length - 1; i++) {
      const a = effectiveStateName(state.route[i]), b = effectiveStateName(state.route[i + 1]);
      if (!a || !b) continue;
      statesAlongPath(a, b).forEach((n) => alongNames.add(n));
    }
    if (!alongNames.size) return "";
    const routeStateNames = new Set(state.route.map(effectiveStateName).filter(Boolean));
    const agentsByState = groupByFips(currentFilteredAgents().filter((a) => !a.isNational), "stateFips");
    const chips = Array.from(alongNames)
      .filter((n) => !routeStateNames.has(n))
      .map((n) => ({ name: n, fips: NAME_TO_FIPS.get(n.toLowerCase()), count: (agentsByState.get(NAME_TO_FIPS.get(n.toLowerCase())) || []).length }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    if (!chips.length) return "";
    return `
      <div class="route-suggestions">
        <p class="route-suggestions-title">Along your route — states worth a stop</p>
        <div class="chips" style="justify-content:flex-start;margin:8px 0 0;padding:0;">
          ${chips.map((c) => `<button type="button" class="chip" data-suggest-fips="${c.fips}">${escapeHtml(c.name)} <span class="count-badge">${c.count}</span></button>`).join("")}
        </div>
      </div>`;
  }

  function exportRouteCsv() {
    if (!state.route.length) return;
    const header = ["#", "Name", "Type", "Location", "Date", "Email", "Website"];
    const rows = state.route.map((r, i) => [
      i + 1, r.name, r.type,
      r.stateName || (r.approxStateName ? `${r.approxStateName} (approx.)` : "") || "",
      r.date || "", r.email || "", r.website || "",
    ]);
    const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tour-route-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function drawRouteOnMap() {
    const stops = state.route.filter((r) => effectiveFips(r) != null);
    const pts = stops.map((r) => centroidFor(effectiveFips(r))).filter(Boolean);
    routeLayer.selectAll("*").remove();
    if (pts.length > 1) {
      const line = d3.line().curve(d3.curveCatmullRom.alpha(0.7));
      routeLayer.append("path").attr("class", "route-line").attr("d", line(pts));
    }
    stops.forEach((r, i) => {
      const c = centroidFor(effectiveFips(r));
      if (!c) return;
      routeLayer.append("circle").attr("class", "route-node").attr("cx", c[0]).attr("cy", c[1]).attr("r", 6);
      routeLayer.append("text").attr("class", "route-node-num").attr("x", c[0]).attr("y", c[1] + 2).text(i + 1);
    });
  }

  /* ---------------- Share route link ---------------- */
  const toBase64Url = (str) =>
    btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fromBase64Url = (str) => {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
    return decodeURIComponent(atob(b64).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
  };

  function shareRoute() {
    if (!state.route.length) return;
    const payload = state.route.map((r) => [r.name, r.type, r.stateName || r.approxStateName || "", r.date || "", r.email || "", r.website || ""]);
    const encoded = toBase64Url(JSON.stringify(payload));
    const url = `${location.origin}${location.pathname}?route=${encoded}`;
    copyText(url, "Share link copied — anyone with it can view this route, no login needed");
  }

  function loadSharedRouteFromUrl() {
    const params = new URLSearchParams(location.search);
    const routeParam = params.get("route");
    if (!routeParam) return;
    try {
      const arr = JSON.parse(fromBase64Url(routeParam));
      state.sharedRoute = arr.map(([name, type, stateName, date, email, website], i) => ({
        id: `shared-${i}`, name, type, stateName: stateName || null, approxStateName: null,
        date: date || "", email: email || null, website: website || null,
      }));
      els.routeDrawer.classList.add("open");
      renderRouteUi();
    } catch {
      // malformed/tampered link — ignore silently, show the viewer's own route instead
    }
  }

  function dismissSharedRoute() {
    state.sharedRoute = null;
    const url = new URL(location.href);
    url.searchParams.delete("route");
    history.replaceState({}, "", url);
    renderRouteUi();
  }

  // Shared-route stops carry no stable id (shareRoute() strips it down to
  // name/type/state/date/email/website, and each import mints a fresh
  // `imported-${Date.now()}-i}` id) — so "already in your route" has to be
  // decided by content, not id equality, or re-opening the same share link
  // silently duplicates every stop on each import.
  function importSharedRoute() {
    if (!state.sharedRoute) return;
    const sig = (r) => `${(r.name || "").toLowerCase()}|${r.type}|${(r.stateName || r.approxStateName || "").toLowerCase()}`;
    const existingSigs = new Set(state.route.map(sig));
    let added = 0;
    state.sharedRoute.forEach((r, i) => {
      if (existingSigs.has(sig(r))) return;
      const id = `imported-${Date.now()}-${i}`;
      state.route.push({ ...r, id, stateFips: r.stateName ? NAME_TO_FIPS.get(r.stateName.toLowerCase()) ?? null : null, approxStateFips: null, subtitle: null, isNational: false });
      existingSigs.add(sig(r));
      added++;
    });
    saveRoute();
    dismissSharedRoute();
    drawRouteOnMap();
    showToast(`Imported ${added} stop${added === 1 ? "" : "s"} into your route`);
  }

  function printItinerary() {
    const stops = state.sharedRoute || state.route;
    if (!stops.length) return;
    const rows = stops.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.type === "festival" ? "Festival" : "Agent")}</td>
        <td>${escapeHtml(r.stateName || r.approxStateName || "—")}</td>
        <td>${escapeHtml(r.date || "—")}</td>
        <td>${escapeHtml(r.email || "—")}</td>
        <td>${escapeHtml(r.website ? websiteLabel(r.website) : "—")}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tour Route Itinerary</title>
      <style>
        body{font-family: Georgia, 'Times New Roman', serif; color:#111; padding:36px; max-width:760px; margin:0 auto;}
        h1{font-size:22px; margin:0 0 4px;}
        p.sub{color:#555; font-size:12px; margin:0 0 20px;}
        table{width:100%; border-collapse:collapse;}
        th,td{border-bottom:1px solid #ccc; padding:8px 6px; text-align:left; font-size:13px; vertical-align:top;}
        th{text-transform:uppercase; font-size:10px; letter-spacing:0.05em; color:#666; border-bottom:2px solid #111;}
        @media print{ body{padding:0;} }
      </style></head><body>
      <h1>Tour Route Itinerary</h1>
      <p class="sub">Generated ${new Date().toLocaleDateString()} · ${stops.length} stop${stops.length === 1 ? "" : "s"}</p>
      <table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>State</th><th>Date</th><th>Email</th><th>Website</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { showToast("Allow pop-ups to print the itinerary"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  els.shareRouteBtn.addEventListener("click", shareRoute);
  els.printRouteBtn.addEventListener("click", printItinerary);
  els.exportRouteBtn.addEventListener("click", exportRouteCsv);
  els.routeToggleBtn.addEventListener("click", () => els.routeDrawer.classList.toggle("open"));
  els.routeCloseBtn.addEventListener("click", () => els.routeDrawer.classList.remove("open"));
  els.clearRouteBtn.addEventListener("click", () => {
    if (!state.route.length) return;
    state.route = [];
    saveRoute();
    renderRouteUi();
    drawRouteOnMap();
    renderAll(); // same staleness reason as removeFromRoute above
  });

  /* ---------------- Artist profile ---------------- */
  function openProfileModal() {
    const p = state.profile;
    els.modalContent.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">&times;</button>
      <h2>My Profile</h2>
      <p class="m-sub">Saved on this device — auto-fills the AI prompt and email template every time, so you never retype it.</p>
      <div class="m-section">
        <div class="profile-form">
          ${PROFILE_FIELDS.map((f) => `
            <label class="profile-field">
              <span>${escapeHtml(f.label)}</span>
              <input type="text" data-profile-key="${f.key}" value="${escapeHtml(p[f.key] || "")}" placeholder="${escapeHtml(f.placeholder)}">
            </label>`).join("")}
        </div>
        <div class="m-actions">
          <button type="button" class="icon-btn gold" id="saveProfileBtn">Save profile</button>
          <button type="button" class="icon-btn" id="exportProfileBtn">Export backup (.json)</button>
          <button type="button" class="icon-btn" id="importProfileBtn">Import backup</button>
          <input type="file" id="importProfileFile" accept="application/json" style="display:none;">
        </div>
        <p style="font-size:0.66rem;color:var(--ls-text-muted);margin-top:8px;">
          This is saved only in this browser — clearing site data or switching devices loses it. Export a backup after filling it in, and re-import it anywhere.
        </p>
      </div>
    `;
    els.modalContent.querySelector("#modalCloseBtn").addEventListener("click", closeModal);
    els.modalContent.querySelector("#saveProfileBtn").addEventListener("click", () => {
      const next = { ...state.profile };
      els.modalContent.querySelectorAll("[data-profile-key]").forEach((inp) => { next[inp.dataset.profileKey] = inp.value.trim(); });
      saveProfile(next);
      const nicheMatch = autoMatchNiche(next.nameGenre);
      if (nicheMatch && state.mode === "agents") {
        state.niches = new Set([nicheMatch]);
        renderNicheChips();
        renderAll();
        showToast(`Profile saved — applied "${NICHES.find((n) => n.key === nicheMatch).label}" filter`);
      } else {
        showToast("Profile saved");
      }
      closeModal();
    });
    els.modalContent.querySelector("#exportProfileBtn").addEventListener("click", () => {
      downloadJson(state.profile, "tour-map-profile-backup.json");
    });
    els.modalContent.querySelector("#importProfileBtn").addEventListener("click", () => {
      els.modalContent.querySelector("#importProfileFile").click();
    });
    els.modalContent.querySelector("#importProfileFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          saveProfile(parsed);
          showToast("Profile imported");
          openProfileModal();
        } catch {
          showToast("Couldn't read that file — is it a profile backup .json?");
        }
      };
      reader.readAsText(file);
    });
    openModalOverlay();
  }
  els.profileBtn.addEventListener("click", openProfileModal);

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------- Contact / email modal ---------------- */
  function openContactModal(item) {
    const tpl = window.LS_TEMPLATE;
    const p = state.profile;
    const subject = "Touring your area — quick note";
    let body = tpl.REFERENCE_TEMPLATE;
    if (p.artistName) body = body.split("[Your Name]").join(p.artistName);
    if (p.phone) body = body.replace("[phone]", () => p.phone);
    const gmailUrl = item.email
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null;
    const mailtoUrl = item.email
      ? `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null;
    // Every value here is free-typed by the artist (or scraped festival
    // data) with no restriction on its characters — passing it as
    // String.replace()'s second argument directly would treat a literal
    // "$&", "$$", "$`", "$'" or "$1"-"$99" in it as a special replacement
    // pattern (e.g. "$5k/show" as a stat would silently vanish and dump
    // unrelated prompt text in its place) instead of literal text. Wrapping
    // each value in a function opts out of that substitution entirely.
    const lit = (v) => () => v;
    const aiPrompt = tpl.AI_PROMPT_TEMPLATE
      .replace("{{EVENT_NAME}}", lit(item.name))
      .replace("{{EVENT_WEBSITE}}", lit(item.website || "not listed"))
      .replace("{{MY_NAME_GENRE}}", lit(p.nameGenre || ""))
      .replace("{{MY_STAT}}", lit(p.stat || ""))
      .replace("{{MY_FESTIVALS}}", lit(p.festivals || ""))
      .replace("{{MY_ARTISTS}}", lit(p.artists || ""))
      .replace("{{MY_MOMENTUM}}", lit(p.momentum || ""))
      .replace("{{MY_SECONDARY}}", lit(p.secondary || ""))
      .replace("{{MY_PROMO_LINK}}", lit(p.promoLink || ""))
      .replace("{{MY_INSTAGRAM_EPK}}", lit(p.instagramEpk || ""))
      .replace("{{MY_PHONE}}", lit(p.phone || ""));
    const hasProfile = PROFILE_FIELDS.some((f) => p[f.key]);

    els.modalContent.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">&times;</button>
      <h2>${escapeHtml(item.name)}</h2>
      <p class="m-sub">${escapeHtml([item.subtitle, item.genresText].filter(Boolean).join(" · ") || "Contact & outreach")}</p>

      <div class="m-section">
        <h4>Contact</h4>
        <div class="row-actions">
          ${item.email ? `<span>${escapeHtml(item.email)}</span>` : `<span style="color:var(--ls-text-muted)">No email on file</span>`}
          ${item.phone ? `<span>${escapeHtml(item.phone)}</span>` : ""}
          ${item.website ? `<a href="${escapeHtml(websiteHref(item.website))}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel(item.website))}</a>` : ""}
          ${item.links.map((l) => `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`).join("")}
        </div>
      </div>

      <div class="m-section">
        <h4>Email this ${item.type === "festival" ? "festival" : "agent"}</h4>
        <div class="m-actions">
          ${gmailUrl ? `<button type="button" data-action="gmail" class="icon-btn gold">Open in Gmail</button>` : ""}
          ${mailtoUrl ? `<a href="${mailtoUrl}" class="icon-btn">Open in mail app</a>` : `<span style="font-size:0.75rem;color:var(--ls-text-muted)">No email on file — use the website or socials above.</span>`}
        </div>
      </div>

      <div class="m-section">
        <h4>Outreach template <button type="button" class="toggle-line" id="toggleTemplate">show/hide</button></h4>
        <div id="templateBlock" style="display:none;">
          <ul class="rules-list">
            ${tpl.RULES.map((r) => `<li><b>${r.n}.</b> ${escapeHtml(r.rule)} <i>(${escapeHtml(r.principle)})</i></li>`).join("")}
          </ul>
          <textarea readonly style="margin-top:10px;">${escapeHtml(body)}</textarea>
          <div class="m-actions">
            <button type="button" class="icon-btn" id="copyTemplateBtn">Copy template</button>
          </div>
        </div>
      </div>

      <div class="m-section">
        <h4>Or draft it with AI</h4>
        <p style="font-size:0.72rem;color:var(--ls-text-soft);margin:0 0 8px;">
          ${hasProfile
            ? "Your saved profile is already filled in below — just add this event's specifics in ChatGPT."
            : `Copy this prompt into ChatGPT (or any assistant) along with your own info — it already knows the 7 rules and this event's name. <button type="button" class="toggle-line" id="fillProfileLink">Save your info once</button> to skip retyping it every time.`}
        </p>
        <div class="m-actions">
          <button type="button" class="icon-btn gold" id="copyAiBtn">Copy AI prompt</button>
        </div>
      </div>
    `;

    els.modalContent.querySelector("#modalCloseBtn").addEventListener("click", closeModal);
    const gmailBtn = els.modalContent.querySelector('[data-action="gmail"]');
    if (gmailBtn) gmailBtn.addEventListener("click", () => window.open(gmailUrl, "_blank", "noopener"));
    els.modalContent.querySelector("#toggleTemplate").addEventListener("click", () => {
      const block = els.modalContent.querySelector("#templateBlock");
      block.style.display = block.style.display === "none" ? "block" : "none";
    });
    els.modalContent.querySelector("#copyTemplateBtn").addEventListener("click", () => copyText(body, "Template copied"));
    els.modalContent.querySelector("#copyAiBtn").addEventListener("click", () => copyText(aiPrompt, "AI prompt copied — paste into ChatGPT"));
    const fillProfileLink = els.modalContent.querySelector("#fillProfileLink");
    if (fillProfileLink) fillProfileLink.addEventListener("click", () => openProfileModal());

    openModalOverlay();
  }
  let lastFocusedEl = null;
  function openModalOverlay() {
    lastFocusedEl = document.activeElement;
    els.modalOverlay.classList.add("open");
    els.modalContent.focus();
  }
  function closeModal() {
    els.modalOverlay.classList.remove("open");
    if (lastFocusedEl && document.body.contains(lastFocusedEl)) lastFocusedEl.focus();
  }
  els.modalOverlay.addEventListener("click", (e) => { if (e.target === els.modalOverlay) closeModal(); });

  function copyText(text, msg) {
    navigator.clipboard?.writeText(text).then(() => showToast(msg)).catch(() => showToast("Couldn't copy — select the text manually"));
  }
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  /* ---------------- Keyboard / accessibility ---------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (els.modalOverlay.classList.contains("open")) { closeModal(); return; }
    if (els.sidePanel.classList.contains("open")) { closeSidePanel(); resetZoom(); return; }
    if (els.routeDrawer.classList.contains("open")) { els.routeDrawer.classList.remove("open"); }
  });

  /* ---------------- init ui bits that don't need data ---------------- */
  renderRouteUi();
  loadSharedRouteFromUrl();
})();
