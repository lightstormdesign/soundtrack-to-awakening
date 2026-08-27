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
  const cleanStr = (s) => (typeof s === "string" && s.trim() ? s.trim() : null);
  const cleanPhone = (s) => {
    const v = cleanStr(s);
    return v ? v.replace(/^phone:?\s*/i, "").trim() || null : null;
  };
  const cleanEmail = (raw) => {
    if (!raw) return null;
    const first = raw.split("/")[0].trim();
    return EMAIL_RE.test(first) ? first : null;
  };
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

  function normalizeAgent(a, i) {
    const isNational = a.scope === "national";
    const stateFips = !isNational ? NAME_TO_FIPS.get((a.state || "").toLowerCase()) ?? null : null;
    const subtitle = isNational
      ? [cleanStr(a.category), cleanStr(a.regions)].filter(Boolean).join(" · ")
      : [cleanStr(a.city), cleanStr(a.state)].filter(Boolean).join(", ");
    const genresText = cleanStr(isNational ? a.genres_listed : a.genres);
    const website = cleanStr(a.website);
    const links = (!isNational && Array.isArray(a.socials) ? a.socials : [])
      .map(cleanStr).filter(Boolean).map((href) => ({ label: socialLabel(href), href }));
    return {
      id: `agency-${i}`, type: "agent", name: a.name, subtitle: subtitle || null,
      genresText, email: cleanEmail(a.email), website, phone: cleanPhone(a.phone), links,
      isNational, stateFips, stateName: !isNational ? cleanStr(a.state) : null,
      searchIndex: [a.name, genresText, subtitle, website].filter(Boolean).join(" ").toLowerCase(),
    };
  }

  function normalizeFestival(f, i) {
    const website = cleanStr(f.website);
    const links = [
      f.facebook ? { label: "Facebook", href: cleanStr(f.facebook) } : null,
      f.instagram ? { label: "Instagram", href: cleanStr(f.instagram) } : null,
      f.twitter ? { label: "Twitter", href: cleanStr(f.twitter) } : null,
    ].filter((l) => l && l.href);
    const subtitle = cleanStr(f.month);
    return {
      id: `festival-${i}`, type: "festival", name: cleanStr(f.name) || "Untitled festival", subtitle,
      genresText: null, email: cleanEmail(f.email), website, phone: cleanPhone(f.phone), links,
      isNational: false, stateFips: null, stateName: null, month: subtitle,
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
    niche: "all",
    month: "all",
    selectedFips: null,
    agents: [],
    festivals: [],
    route: loadRoute(),
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
    routeToggleBtn: document.getElementById("routeToggleBtn"),
    routeBtnCount: document.getElementById("routeBtnCount"),
    routeDrawer: document.getElementById("routeDrawer"),
    rdBody: document.getElementById("rdBody"),
    clearRouteBtn: document.getElementById("clearRouteBtn"),
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
      state.agents = Array.isArray(agentsRaw) ? agentsRaw.map(normalizeAgent) : [];
      state.festivals = Array.isArray(festivalsRaw) ? festivalsRaw.map(normalizeFestival) : [];
      state.topology = topo;
      initMap(topo);
      renderNicheChips();
      updateDataNote();
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      els.svg.outerHTML = '<p class="loading-msg">Couldn\'t load the map data — try refreshing the page.</p>';
    });

  /* ---------------- Map setup (d3 + topojson) ---------------- */
  let svg, zoomLayer, statesLayer, labelsLayer, markersLayer, routeLayer, path, projection;

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
    labelsLayer = zoomLayer.append("g").attr("id", "labelsLayer");

    statesLayer.selectAll("path.state-path")
      .data(state.features)
      .join("path")
      .attr("class", "state-path")
      .attr("d", path)
      .style("vector-effect", "non-scaling-stroke")
      .attr("data-fips", (d) => +d.id)
      .on("mouseenter", (e, d) => showTooltip(e, d))
      .on("mousemove", (e) => moveTooltip(e))
      .on("mouseleave", hideTooltip)
      .on("click", (e, d) => onStateClick(+d.id));

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
    els.tooltip.style.left = e.clientX + 16 + "px";
    els.tooltip.style.top = e.clientY + 16 + "px";
  }
  function hideTooltip() { els.tooltip.classList.remove("show"); }

  function onStateClick(fips) {
    if (state.mode !== "agents") return;
    state.selectedFips = fips;
    zoomToState(fips);
    openStatePanel(fips);
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
    if (state.niche === "all") return true;
    return matchesNiche(a, state.niche);
  }
  function currentFilteredFestivals() {
    const q = state.query.trim().toLowerCase();
    return state.festivals.filter((f) => (!q || f.searchIndex.includes(q)) && (state.month === "all" || f.month === state.month));
  }

  /* ---------------- Rendering ---------------- */
  function renderAll() {
    renderMapMarkers();
    renderNationalCount();
    if (state.mode === "festivals") renderFestivalGrid();
    if (state.sidePanelFips) openStatePanel(state.sidePanelFips);
  }

  function renderMapMarkers() {
    const filtered = currentFilteredAgents().filter((a) => !a.isNational && a.stateFips != null);
    const byFips = new Map();
    for (const a of filtered) {
      if (!byFips.has(a.stateFips)) byFips.set(a.stateFips, []);
      byFips.get(a.stateFips).push(a);
    }
    const maxCount = Math.max(1, ...Array.from(byFips.values()).map((v) => v.length));
    const r = d3.scaleSqrt().domain([0, maxCount]).range([0, 15]);
    const hasFilter = state.query.trim() !== "" || state.niche !== "all";

    const isFestivalMode = state.mode === "festivals";

    statesLayer.selectAll("path.state-path")
      .classed("dimmed", (d) => isFestivalMode)
      .classed("selected", (d) => +d.id === state.selectedFips);
    labelsLayer.selectAll("text.state-label").classed("dimmed", () => isFestivalMode);

    const markerData = isFestivalMode ? [] : Array.from(byFips.entries()).map(([fips, items]) => ({ fips, items }));

    markersLayer.selectAll("circle.state-marker")
      .data(markerData, (d) => d.fips)
      .join(
        (enter) => enter.append("circle")
          .attr("class", "state-marker")
          .attr("cx", (d) => centroidFor(d.fips)?.[0] ?? 0)
          .attr("cy", (d) => centroidFor(d.fips)?.[1] ?? 0)
          .attr("r", 0)
          .call((e) => e.transition().duration(400).attr("r", (d) => Math.max(3, r(d.items.length)))),
        (update) => update.call((u) => u.transition().duration(300).attr("r", (d) => Math.max(3, r(d.items.length)))),
        (exit) => exit.transition().duration(200).attr("r", 0).remove()
      )
      .classed("dimmed", false)
      .on("mouseenter", (e, d) => {
        const meta = FIPS_TO_META.get(d.fips);
        els.tooltip.innerHTML = `<div class="t-title">${meta.name}</div><div class="t-sub">${d.items.length} matching agent${d.items.length === 1 ? "" : "s"}</div>`;
        els.tooltip.classList.add("show");
        moveTooltip(e);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (e, d) => { e.stopPropagation(); onStateClick(d.fips); });

    void hasFilter;
  }

  function renderNationalCount() {
    els.nationalCount.textContent = currentFilteredAgents().filter((a) => a.isNational).length;
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
        });
      });
    } else {
      els.nicheChips.innerHTML = NICHES.map((n) =>
        `<button type="button" class="chip ${state.niche === n.key ? "active" : ""}" data-niche="${n.key}">${n.label}</button>`
      ).join("");
      els.nicheChips.querySelectorAll("[data-niche]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.niche = btn.dataset.niche;
          renderNicheChips();
          renderAll();
        });
      });
    }
  }

  function updateDataNote() {
    els.dataNote.textContent = state.mode === "agents"
      ? "Pulled from the lightstorm.co directory — verify a contact before a mass send, some entries may be outdated."
      : "Festival location data isn't reliably captured yet, so festivals are searchable below rather than pinned on the map — every other action (route, email, AI prompt) still works the same way.";
  }

  /* ---------------- Mode / search wiring ---------------- */
  els.modeToggle.querySelectorAll("button[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      els.modeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      els.modePill.style.transform = state.mode === "agents" ? "translateX(0)" : "translateX(100%)";
      const isFest = state.mode === "festivals";
      els.mapStage.style.display = isFest ? "none" : "flex";
      els.festivalScroll.style.display = isFest ? "block" : "none";
      els.nationalBtn.style.display = isFest ? "none" : "inline-block";
      closeSidePanel();
      resetZoom();
      renderNicheChips();
      updateDataNote();
      renderAll();
    });
  });

  let searchDebounce;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.query = els.searchInput.value;
      renderAll();
    }, 200);
  });

  els.nationalBtn.addEventListener("click", openNationalPanel);

  /* ---------------- Side panel ---------------- */
  function openStatePanel(fips) {
    state.sidePanelFips = fips;
    const meta = FIPS_TO_META.get(fips);
    const items = currentFilteredAgents().filter((a) => a.stateFips === fips);
    els.spTitle.textContent = meta.name;
    els.spCount.textContent = `${items.length} booking agent${items.length === 1 ? "" : "s"}`;
    els.spBody.innerHTML = items.length ? items.map(cardHtml).join("") : `<p class="empty-msg">No agents match the current filters in ${meta.name}.</p>`;
    wireCardActions(els.spBody, items);
    els.sidePanel.classList.add("open");
  }

  function openNationalPanel() {
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
    els.sidePanel.classList.remove("open");
  }
  els.spClose.addEventListener("click", () => { closeSidePanel(); resetZoom(); });

  function cardHtml(item) {
    const inRoute = state.route.some((r) => r.id === item.id);
    return `
      <div class="card" data-id="${item.id}">
        <h3>${escapeHtml(item.name)}</h3>
        ${item.subtitle ? `<p class="sub">${escapeHtml(item.subtitle)}</p>` : ""}
        ${item.genresText ? `<p class="genres">${escapeHtml(item.genresText)}</p>` : ""}
        <div class="row-actions">
          <button type="button" data-action="contact">Contact &amp; email</button>
          <button type="button" data-action="route" class="${inRoute ? "added" : ""}">${inRoute ? "✓ In route" : "+ Add to route"}</button>
          ${item.website ? `<a href="${websiteHref(item.website)}" target="_blank" rel="noopener noreferrer">${websiteLabel(item.website)}</a>` : ""}
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

  function renderRouteUi() {
    els.routeBtnCount.textContent = state.route.length;
    if (!state.route.length) {
      els.rdBody.innerHTML = `<p class="empty-msg">No stops yet — add an agent or festival from the map to start planning your route.</p>`;
      return;
    }
    els.rdBody.innerHTML = state.route.map((r, i) => `
      <div class="route-stop" data-id="${r.id}">
        <div class="num">${i + 1}</div>
        <div class="info">
          <div class="name">${escapeHtml(r.name)}</div>
          <div class="loc">${escapeHtml(r.stateName || r.subtitle || (r.type === "festival" ? "Location not mapped" : "National"))}</div>
        </div>
        <input type="date" value="${r.date || ""}" data-date-id="${r.id}">
        <div class="stop-actions">
          <button type="button" data-up="${r.id}" title="Move up">↑</button>
          <button type="button" data-down="${r.id}" title="Move down">↓</button>
          <button type="button" data-remove="${r.id}" title="Remove">&times;</button>
        </div>
      </div>`).join("");

    els.rdBody.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => moveStop(b.dataset.up, -1)));
    els.rdBody.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => moveStop(b.dataset.down, 1)));
    els.rdBody.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => removeFromRoute(b.dataset.remove)));
    els.rdBody.querySelectorAll("[data-date-id]").forEach((inp) => inp.addEventListener("change", () => {
      const r = state.route.find((x) => x.id === inp.dataset.dateId);
      if (r) { r.date = inp.value; saveRoute(); renderRouteUi(); }
    }));
  }

  function drawRouteOnMap() {
    const stops = state.route.filter((r) => r.stateFips != null);
    const pts = stops.map((r) => centroidFor(r.stateFips)).filter(Boolean);
    routeLayer.selectAll("*").remove();
    if (pts.length > 1) {
      const line = d3.line().curve(d3.curveCatmullRom.alpha(0.7));
      routeLayer.append("path").attr("class", "route-line").attr("d", line(pts));
    }
    stops.forEach((r, i) => {
      const c = centroidFor(r.stateFips);
      if (!c) return;
      routeLayer.append("circle").attr("class", "route-node").attr("cx", c[0]).attr("cy", c[1]).attr("r", 6);
      routeLayer.append("text").attr("class", "route-node-num").attr("x", c[0]).attr("y", c[1] + 2).text(i + 1);
    });
  }

  els.routeToggleBtn.addEventListener("click", () => els.routeDrawer.classList.toggle("open"));
  els.routeCloseBtn.addEventListener("click", () => els.routeDrawer.classList.remove("open"));
  els.clearRouteBtn.addEventListener("click", () => {
    if (!state.route.length) return;
    state.route = [];
    saveRoute();
    renderRouteUi();
    drawRouteOnMap();
  });

  /* ---------------- Contact / email modal ---------------- */
  function openContactModal(item) {
    const tpl = window.LS_TEMPLATE;
    const subject = "Touring your area — quick note";
    const body = tpl.REFERENCE_TEMPLATE;
    const gmailUrl = item.email
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null;
    const mailtoUrl = item.email
      ? `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null;
    const aiPrompt = tpl.AI_PROMPT_TEMPLATE
      .replace("{{EVENT_NAME}}", item.name)
      .replace("{{EVENT_WEBSITE}}", item.website || "not listed");

    els.modalContent.innerHTML = `
      <button class="modal-close" id="modalCloseBtn" aria-label="Close">&times;</button>
      <h2>${escapeHtml(item.name)}</h2>
      <p class="m-sub">${escapeHtml([item.subtitle, item.genresText].filter(Boolean).join(" · ") || "Contact & outreach")}</p>

      <div class="m-section">
        <h4>Contact</h4>
        <div class="row-actions">
          ${item.email ? `<span>${escapeHtml(item.email)}</span>` : `<span style="color:var(--ls-text-muted)">No email on file</span>`}
          ${item.phone ? `<span>${escapeHtml(item.phone)}</span>` : ""}
          ${item.website ? `<a href="${websiteHref(item.website)}" target="_blank" rel="noopener noreferrer">${websiteLabel(item.website)}</a>` : ""}
          ${item.links.map((l) => `<a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join("")}
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
        <p style="font-size:0.72rem;color:var(--ls-text-soft);margin:0 0 8px;">Copy this prompt into ChatGPT (or any assistant) along with your own info — it already knows the 7 rules and this event's name.</p>
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

    els.modalOverlay.classList.add("open");
  }
  function closeModal() { els.modalOverlay.classList.remove("open"); }
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

  /* ---------------- init ui bits that don't need data ---------------- */
  renderRouteUi();
})();
