// -------------------------------------------------------------
// Load JSON config then start the animation
// -------------------------------------------------------------
let CONFIG = {};

const VIEW_MODE = new URLSearchParams(window.location.search).get("view");

fetch("ecu_animation_config.json")
  .then(r => r.json())
  .then(json => {
    CONFIG = json;
    document.documentElement.style.setProperty("--spark-color", CONFIG.sparkColor);
    document.documentElement.style.setProperty("--spark-glow",  CONFIG.sparkGlow);
    document.documentElement.style.setProperty("--coil-on",     CONFIG.coilOnColor);
    document.documentElement.style.setProperty("--coil-off",    CONFIG.coilOffColor);
    startECUAnimation();
  })
  .catch(err => console.error("Failed to load ecu_animation_config.json", err));


// -------------------------------------------------------------
// Main animation logic
// -------------------------------------------------------------
function startECUAnimation() {
  // DOM references
  const gridContainer  = document.getElementById("anim-grid");
  const cardCode       = document.getElementById("card-code");
  const cardEcu        = document.getElementById("card-ecu");
  const cardMonitor    = document.getElementById("card-monitor");

  const codeContainer   = document.getElementById("code-container");
  const ecuModeChip     = document.getElementById("ecu-mode-chip");
  const ecuSvg          = document.getElementById("ecu-svg");
  const encoderPointer  = document.getElementById("encoder-pointer");
  const encoderDwell    = document.getElementById("encoder-dwell");

  const metricRpm       = document.getElementById("metric-rpm");
  const metricVbat      = document.getElementById("metric-vbat");
  const metricDwell     = document.getElementById("metric-dwell");
  const metricMode      = document.getElementById("metric-mode");
  const enginePill      = document.getElementById("engine-pill");

  const coilGrid        = document.getElementById("coil-grid");
  const coilActiveLabel = document.getElementById("coil-active-label");
  const coilStateList   = document.getElementById("coil-state-list");

  const waveRpmPoly     = document.getElementById("wave-rpm-poly");
  const waveVbatPoly    = document.getElementById("wave-vbat-poly");

  // Apply optional view filtering
  function applyViewMode() {
    if (VIEW_MODE === "code") {
      document.body.classList.add("code-view");
      if (cardEcu) cardEcu.style.display = "none";
      if (cardMonitor) cardMonitor.style.display = "none";
      if (gridContainer) gridContainer.style.gridTemplateColumns = "minmax(0, 1fr)";
    } else if (VIEW_MODE === "visuals") {
      document.body.classList.remove("code-view");
      if (cardCode) cardCode.style.display = "none";
      if (gridContainer) gridContainer.style.gridTemplateColumns = "minmax(0, 1.05fr) minmax(0, 1.1fr)";
    } else {
      document.body.classList.remove("code-view");
    }
  }

  applyViewMode();

  // State
  let cylinders   = CONFIG.initialCylinders;
  let tickIndex   = 0;
  let pseudoIndex = 0;

  const rpmBase   = CONFIG.rpm.base;
  const rpmVar    = CONFIG.rpm.variation;
  const vBase     = CONFIG.vbat.base;
  const vVar      = CONFIG.vbat.variation;
  const dwellMin  = CONFIG.dwellMs.min;
  const dwellMax  = CONFIG.dwellMs.max;
  const waveLen   = CONFIG.waveform.length;
  const crankDeg  = CONFIG.encoder.crankCycleDeg;

  let rpmHist     = new Array(waveLen).fill(rpmBase);
  let vbatHist    = new Array(waveLen).fill(vBase);

  // audio
  let audioCtx = null;
  function playSparkSound() {
    if (!CONFIG.sound || !CONFIG.sound.enabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 3200;
      gain.gain.value = CONFIG.sound.volume || 0.2;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) { /* ignore */ }
  }

  // -----------------------------------------------------------
  // PSEUDO-CODE
  // -----------------------------------------------------------
  CONFIG.pseudoCode.forEach((line, i) => {
    const row = document.createElement("div");
    row.className = "code-line";
    row.id = "code-line-" + i;

    const num = document.createElement("span");
    num.className = "code-line-num";
    num.textContent = String(i + 1).padStart(2, "0");

    const txt = document.createElement("span");
    txt.className  = "code-line-text";
    txt.textContent = line;

    row.appendChild(num);
    row.appendChild(txt);
    codeContainer.appendChild(row);
  });

  function highlightPseudo() {
    CONFIG.pseudoCode.forEach((_, i) => {
      const el = document.getElementById("code-line-" + i);
      if (el) el.classList.remove("active");
    });
    const idx = pseudoIndex % CONFIG.pseudoCode.length;
    const active = document.getElementById("code-line-" + idx);
    if (active) active.classList.add("active");
    pseudoIndex++;
  }

  // -----------------------------------------------------------
  // SPARK PLUGS
  // -----------------------------------------------------------
  const maxCyl = 12;
  const sparkPositions = []; // for reference only

  // Arrange 5 plugs top, 5 bottom (centered)
  const topY = 50;
  const bottomY = 210;
  const xs = [85, 130, 180, 220, 270];

  for (let i = 1; i <= maxCyl; i++) {
    const idx  = (i - 1) % 5;
    const rowY = i <= 5 ? topY : bottomY;
    const x    = xs[idx];
    const y    = rowY;

    sparkPositions.push({ x, y });

    const plug = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    plug.setAttribute("cx", x);
    plug.setAttribute("cy", y);
    plug.setAttribute("r", 9);
    plug.setAttribute("id", "plug-" + i);
    plug.setAttribute("class", "spark-plug");
    ecuSvg.appendChild(plug);

    const tip = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    tip.setAttribute("x", x - 2);
    tip.setAttribute("y", y - 14);
    tip.setAttribute("width", 4);
    tip.setAttribute("height", 6);
    tip.setAttribute("id", "tip-" + i);
    tip.setAttribute("class", "spark-tip");
    ecuSvg.appendChild(tip);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x);
    label.setAttribute("y", y + 18);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "spark-label");
    label.setAttribute("id", "label-" + i);
    label.textContent = "CYL " + i;
    ecuSvg.appendChild(label);
  }

  function updateCylinderVisibility() {
    ecuModeChip.textContent = cylinders + "-cylinder mode";
    metricMode.textContent  = cylinders + " cylinders";

    for (let i = 1; i <= maxCyl; i++) {
      const visible = i <= cylinders;
      ["plug-", "tip-", "label-"].forEach(prefix => {
        const el = document.getElementById(prefix + i);
        if (el) el.style.opacity = visible ? "1" : "0";
      });
    }
  }
  updateCylinderVisibility();

  // -----------------------------------------------------------
  // COIL OUTPUT PILLS + COIL STATE TIMELINE
  // -----------------------------------------------------------
  function buildCoilOutputs() {
    coilGrid.innerHTML = "";
    for (let i = 1; i <= maxCyl; i++) {
      const pill = document.createElement("div");
      pill.className = "coil-pill";
      pill.dataset.cyl = i;

      const id = document.createElement("div");
      id.className = "coil-pill-id";
      id.textContent = "CYL " + String(i).padStart(2, "0");

      const bar = document.createElement("div");
      bar.className = "coil-pill-bar";

      const fill = document.createElement("div");
      fill.className = "coil-pill-fill";
      fill.id = "coil-pill-fill-" + i;

      bar.appendChild(fill);
      pill.appendChild(id);
      pill.appendChild(bar);
      coilGrid.appendChild(pill);
    }
  }

  function buildCoilStateRows() {
    coilStateList.innerHTML = "";
    for (let i = 1; i <= maxCyl; i++) {
      const row  = document.createElement("div");
      row.className = "coil-state-row";
      row.dataset.cyl = i;

      const label = document.createElement("div");
      label.className = "coil-state-label";
      label.textContent = "CYL " + String(i).padStart(2, "0");

      const bar = document.createElement("div");
      bar.className = "coil-state-bar";

      const segIdle = document.createElement("div");
      segIdle.className = "coil-state-seg seg-idle";
      segIdle.id = "seg-idle-" + i;

      const segChar = document.createElement("div");
      segChar.className = "coil-state-seg seg-charging";
      segChar.id = "seg-charging-" + i;

      const segIgn  = document.createElement("div");
      segIgn.className = "coil-state-seg seg-ignition";
      segIgn.id = "seg-ignition-" + i;

      bar.appendChild(segIdle);
      bar.appendChild(segChar);
      bar.appendChild(segIgn);

      row.appendChild(label);
      row.appendChild(bar);
      coilStateList.appendChild(row);
    }
  }

  buildCoilOutputs();
  buildCoilStateRows();

  function updateCoilOutputs(activeCyl) {
    coilActiveLabel.textContent = "Active: CYL " + activeCyl;

    for (let i = 1; i <= maxCyl; i++) {
      const fill = document.getElementById("coil-pill-fill-" + i);
      if (!fill) continue;
      fill.classList.toggle("active", i === activeCyl);
    }
  }

  function updateCoilStateTimeline(activeCyl, state) {
    for (let i = 1; i <= maxCyl; i++) {
      ["idle", "charging", "ignition"].forEach(kind => {
        const el = document.getElementById(`seg-${kind}-${i}`);
        if (!el) return;
        el.classList.remove("coil-state-active");
        if (i === activeCyl) {
          if (kind === "idle"      && state === "IDLE")         el.classList.add("coil-state-active");
          if (kind === "charging"  && state === "COIL_CHARGING")el.classList.add("coil-state-active");
          if (kind === "ignition"  && state === "IGNITION")     el.classList.add("coil-state-active");
        }
      });
    }
  }

  // -----------------------------------------------------------
  // ENCODER WHEEL HELPERS
  // -----------------------------------------------------------
  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end   = polarToCartesian(cx, cy, r, startAngle);
    const large = endAngle - startAngle <= 180 ? 0 : 1;
    return ["M", start.x, start.y, "A", r, r, 0, large, 0, end.x, end.y].join(" ");
  }

  function updateEncoderVisual(fireDeg, dwellDeg) {
    // pointer
    const p = polarToCartesian(0, 0, 58, fireDeg);
    encoderPointer.setAttribute("x2", p.x.toFixed(2));
    encoderPointer.setAttribute("y2", p.y.toFixed(2));

    // dwell arc
    const startDeg = fireDeg - dwellDeg;
    const path = describeArc(0, 0, 62, startDeg, fireDeg);
    encoderDwell.setAttribute("d", path);
  }

  // -----------------------------------------------------------
  // WAVEFORMS
  // -----------------------------------------------------------
  function pushHist(arr, value) {
    arr.push(value);
    if (arr.length > waveLen) arr.shift();
  }

  function updateWaveforms() {
    // RPM waveform
    const maxRpm = rpmBase + rpmVar;
    const ptsRpm = rpmHist.map((v, i) => {
      const x = (i / (waveLen - 1)) * 200;
      const norm = Math.min(Math.max(v / maxRpm, 0), 1);
      const y = 32 - norm * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    waveRpmPoly.setAttribute("points", ptsRpm.join(" "));

    // VBAT waveform
    const ptsV = vbatHist.map((v, i) => {
      const x = (i / (waveLen - 1)) * 200;
      const norm = Math.min(Math.max((v - (vBase - vVar)) / (2 * vVar), 0), 1);
      const y = 32 - norm * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    waveVbatPoly.setAttribute("points", ptsV.join(" "));
  }

  // -----------------------------------------------------------
  // FSM STATE (simplified from your C code)
  // -----------------------------------------------------------
  function getFSMState() {
    const phase = tickIndex % 3;
    if (phase === 0) return "COIL_CHARGING";
    if (phase === 1) return "IGNITION";
    return "IDLE";
  }

  // -----------------------------------------------------------
  // SPARK VISUALS
  // -----------------------------------------------------------
  function activateSpark(cyl) {
    for (let i = 1; i <= maxCyl; i++) {
      const plug = document.getElementById("plug-" + i);
      const tip  = document.getElementById("tip-" + i);
      if (!plug || !tip) continue;
      plug.classList.remove("spark-active");
      tip.classList.remove("spark-active-tip");
    }
    const p = document.getElementById("plug-" + cyl);
    const t = document.getElementById("tip-" + cyl);
    if (p) p.classList.add("spark-active");
    if (t) t.classList.add("spark-active-tip");
  }

  // -----------------------------------------------------------
  // MAIN TICK
  // -----------------------------------------------------------
  function tick() {
    // 1) choose firing order for current cyl count
    const key = String(cylinders);
    let order = CONFIG.firingOrder[key];
    if (!order) order = Array.from({ length: cylinders }, (_, i) => i + 1);

    const cyl = order[tickIndex % order.length];

    // 2) rpm / vbat trajectories
    const phase = (tickIndex % 64) / 64;
    const rpm   = rpmBase + rpmVar * Math.abs(Math.sin(phase * Math.PI * 2));
    const vbat  = vBase  + vVar   * Math.cos(phase * Math.PI * 2 + Math.PI / 3);

    pushHist(rpmHist, rpm);
    pushHist(vbatHist, vbat);
    updateWaveforms();

    // 3) compute dwell from vbat (lower v → higher dwell)
    const t = (vBase + vVar - vbat) / (2 * vVar);
    const dwellMs = dwellMin + (dwellMax - dwellMin) * Math.min(Math.max(t, 0), 1);
    const dwellDeg = (dwellMs / dwellMax) * 60;

    // 4) fire angle per cylinder (spread across crank cycle)
    const degPerCyl = crankDeg / cylinders;
    const fireDeg   = (cyl - 1) * degPerCyl + degPerCyl * 0.6;

    updateEncoderVisual(fireDeg, dwellDeg);

    // 5) metrics
    metricRpm.textContent  = rpm.toFixed(0);
    metricVbat.innerHTML   = vbat.toFixed(1) + "&nbsp;V";
    metricDwell.innerHTML  = dwellMs.toFixed(2) + "&nbsp;ms";

    const running = rpm > 300;
    enginePill.textContent = running ? "RUNNING" : "STOPPED";
    enginePill.classList.toggle("bad", !running);

    // 6) FSM + coils
    const fsmState = getFSMState();
    highlightPseudo();
    activateSpark(cyl);
    updateCoilOutputs(cyl);
    updateCoilStateTimeline(cyl, fsmState);
    playSparkSound();

    tickIndex++;
  }

  // -----------------------------------------------------------
  // Cylinder count transition (4 -> final)
  // -----------------------------------------------------------
  setTimeout(() => {
    cylinders = CONFIG.finalCylinders;
    updateCylinderVisibility();
  }, CONFIG.transitionAfterMs);

  // initial tick
  highlightPseudo();
  tick();
  setInterval(tick, CONFIG.sparkIntervalMs);
}
