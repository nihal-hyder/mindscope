/* ==========================================================================
   MindScope — Front-end logic (vanilla JavaScript)

   Responsibilities
     • Navigation (sticky state, mobile menu, active link)
     • API connection indicator (GET /hello)
     • Multi-step assessment form (sliders, validation, progress)
     • Prediction request (POST /predict) and error handling
     • Results dashboard (animated score, inputs, session history)

   All predictions come from the FastAPI backend. Nothing here generates,
   simulates or interprets a score.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     Configuration
     ------------------------------------------------------------------------ */
  // Local development uses your own uvicorn; the deployed site uses the
  // Hugging Face Space. Replace PRODUCTION_API with your Space's URL.
  const LOCAL_API = "http://localhost:2200";
  const PRODUCTION_API = "https://YOUR-HF-USERNAME-mindscope-api.hf.space";
  const IS_LOCAL = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const API_BASE = IS_LOCAL ? LOCAL_API : PRODUCTION_API;
  const ENDPOINTS = {
    health: `${API_BASE}/hello`,
    predict: `${API_BASE}/predict`,
  };
  const HEALTH_TIMEOUT_MS = 4000;
  const PREDICT_TIMEOUT_MS = 15000;
  const HEALTH_POLL_MS = 20000;
  const MIN_LOADING_MS = 650; // keeps the loader from flashing on very fast responses

  /**
   * Field specification. Keys are the EXACT field names expected by the
   * FastAPI `StudentData` model. Constraints mirror the Pydantic validators:
   *   min = exclusive lower bound (gt), max = inclusive upper bound (le).
   */
  const FIELDS = {
    Age:                     { step: 0, kind: "number", int: true,  min: 10, max: 100, label: "Age", unit: "yrs" },
    Gender:                  { step: 0, kind: "radio",  label: "Gender", required: "Please select your gender." },
    Country:                 { step: 0, kind: "select", label: "Country", required: "Please select your country." },
    Academic_Level:          { step: 0, kind: "radio",  label: "Academic level", required: "Please select your academic level." },
    Most_Used_Platform:      { step: 1, kind: "radio",  label: "Platform", required: "Please select the platform you use most." },
    Purpose_Of_Use:          { step: 1, kind: "radio",  label: "Purpose", required: "Please select your main purpose of use." },
    Avg_Daily_Usage_Hours:   { step: 1, kind: "number", int: false, min: 0, max: 24, label: "Daily usage", unit: "h" },
    Daily_Unlocks:           { step: 1, kind: "number", int: true,  min: 0, max: null, label: "Daily unlocks", unit: "" },
    Study_Hours:             { step: 2, kind: "number", int: false, min: 0, max: 24, label: "Study", unit: "h" },
    Physical_Activity_Hours: { step: 2, kind: "number", int: false, min: 0, max: 24, label: "Activity", unit: "h" },
    Sleep_Hours_Per_Night:   { step: 2, kind: "number", int: false, min: 0, max: 24, label: "Sleep", unit: "h" },
    Stress_Level:            { step: 3, kind: "radio",  label: "Stress level", required: "Please select a stress level." },
  };
  const FIELD_NAMES = Object.keys(FIELDS);
  const TOTAL_STEPS = 4;

  /* ------------------------------------------------------------------------
     DOM helpers
     ------------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    nav: $("#nav"),
    navToggle: $("#nav-toggle"),
    navLinks: $("#nav-links"),
    apiStatus: $("#api-status"),
    apiLabel: $("#api-status .api-status__label"),

    form: $("#assessment-form"),
    steps: $$(".form-step"),
    stepButtons: $$("[data-step-target]"),
    btnPrev: $("#btn-prev"),
    btnNext: $("#btn-next"),
    btnSubmit: $("#btn-submit"),
    btnSubmitLabel: $("#btn-submit .btn__label"),
    progressFill: $("#progress-fill"),
    progressValue: $("#progress-value"),
    progressBar: $("#progress-bar"),
    reviewGrid: $("#review-grid"),
    banner: $("#form-banner"),
    bannerTitle: $("#banner-title"),
    bannerText: $("#banner-text"),
    bannerClose: $("#banner-close"),
    loading: $("#loading"),
    panel: $(".panel"),

    results: $("#results"),
    resultsTitle: $("#results-title"),
    scoreValue: $("#score-value"),
    scoreArc: $("#score-arc"),
    scoreSr: $("#score-sr"),
    metaLatency: $("#meta-latency"),
    metaTime: $("#meta-time"),
    inputsGrid: $("#inputs-grid"),
    payloadJson: $("#payload-json"),
    historyCard: $("#history-card"),
    historyBody: $("#history-body"),
    btnEdit: $("#btn-edit"),
    btnRestart: $("#btn-restart"),
  };

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */
  const state = {
    currentStep: 0,
    visited: new Set([0]),
    touched: new Set(),       // fields the user has interacted with / attempted
    isSubmitting: false,
    history: [],
    apiState: "checking",
  };

  /* ========================================================================
     NAVIGATION
     ======================================================================== */
  function initNavigation() {
    // Sticky nav background once the page scrolls.
    const onScroll = () => els.nav.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Mobile menu.
    const setMenu = (open) => {
      els.navToggle.setAttribute("aria-expanded", String(open));
      els.navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      els.navLinks.classList.toggle("is-open", open);
    };
    els.navToggle.addEventListener("click", () => {
      setMenu(els.navToggle.getAttribute("aria-expanded") !== "true");
    });
    $$(".nav__link").forEach((link) => link.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.navLinks.classList.contains("is-open")) {
        setMenu(false);
        els.navToggle.focus();
      }
    });
    document.addEventListener("click", (e) => {
      if (!els.nav.contains(e.target)) setMenu(false);
    });

    // Highlight the link of the section currently in view.
    const links = $$("[data-nav]");
    const sections = links.map((l) => document.getElementById(l.dataset.nav)).filter(Boolean);
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((l) => l.classList.toggle("is-active", l.dataset.nav === entry.target.id));
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      sections.forEach((s) => observer.observe(s));
    }
  }

  /* ========================================================================
     THEME (light by default; choice saved per browser)
     ======================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggle = $("#theme-toggle");
    const next = theme === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", `Switch to ${next} mode`);
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#121110" : "#f6f4ef");
  }

  function initTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    $("#theme-toggle").addEventListener("click", () => {
      const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(theme);
      try { localStorage.setItem("mindscope-theme", theme); } catch { /* storage unavailable */ }
    });
  }

  /** Fade/slide elements in as they enter the viewport. */
  function initReveal() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    items.forEach((el) => observer.observe(el));
  }

  /* ========================================================================
     API CONNECTION STATUS
     ======================================================================== */

  /** fetch() with a timeout implemented through AbortController. */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function setApiStatus(apiState) {
    state.apiState = apiState;
    els.apiStatus.dataset.state = apiState;
    const labels = { checking: "Checking API", connected: "API connected", disconnected: "API disconnected" };
    els.apiLabel.textContent = labels[apiState];
    els.apiStatus.setAttribute(
      "aria-label",
      `${labels[apiState]}. Activate to check again.`
    );
  }

  let healthInFlight = false;
  async function checkApiHealth({ showChecking = false } = {}) {
    if (healthInFlight) return;
    healthInFlight = true;
    if (showChecking) setApiStatus("checking");
    try {
      const res = await fetchWithTimeout(ENDPOINTS.health, { method: "GET", cache: "no-store" }, HEALTH_TIMEOUT_MS);
      setApiStatus(res.ok ? "connected" : "disconnected");
    } catch {
      setApiStatus("disconnected");
    } finally {
      healthInFlight = false;
    }
  }

  function initApiStatus() {
    checkApiHealth({ showChecking: true });
    els.apiStatus.addEventListener("click", () => checkApiHealth({ showChecking: true }));
    setInterval(() => {
      if (document.visibilityState === "visible") checkApiHealth();
    }, HEALTH_POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkApiHealth();
    });
  }

  /* ========================================================================
     FORM: VALUES
     ======================================================================== */

  /** Raw (string) value of a field as currently entered. */
  function getRawValue(name) {
    const spec = FIELDS[name];
    if (spec.kind === "radio") {
      const checked = els.form.querySelector(`input[name="${name}"]:checked`);
      return checked ? checked.value : "";
    }
    const input = document.getElementById(name);
    return input ? input.value.trim() : "";
  }

  /** Convert a field's raw value into the type the API expects. */
  function getTypedValue(name) {
    const spec = FIELDS[name];
    const raw = getRawValue(name);
    if (spec.kind !== "number") return raw;
    return spec.int ? parseInt(raw, 10) : parseFloat(raw);
  }

  /** Build the exact JSON payload for POST /predict. */
  function buildPayload() {
    const payload = {};
    FIELD_NAMES.forEach((name) => { payload[name] = getTypedValue(name); });
    return payload;
  }

  /** Human-friendly display string for a value. */
  function formatValue(name, value) {
    const spec = FIELDS[name];
    if (value === "" || value === undefined || value === null || Number.isNaN(value)) return "—";
    if (spec.kind === "number") {
      const n = Number(value);
      const text = spec.int ? String(n) : (Number.isInteger(n) ? n.toFixed(1) : String(n));
      return spec.unit ? `${text} ${spec.unit}` : text;
    }
    if (name === "Country") {
      const option = $(`#Country option[value="${CSS.escape(value)}"]`);
      return option ? option.textContent : value;
    }
    return value;
  }

  /* ========================================================================
     FORM: VALIDATION
     ======================================================================== */

  /** Returns an error message for a field, or "" if valid. Mirrors Pydantic rules. */
  function validateValue(name) {
    const spec = FIELDS[name];
    const raw = getRawValue(name);

    if (spec.kind === "radio" || spec.kind === "select") {
      return raw ? "" : spec.required;
    }

    if (raw === "") return "Please enter a value.";
    const n = Number(raw);
    if (!Number.isFinite(n)) return "Please enter a valid number.";
    if (spec.int && !Number.isInteger(n)) return "Please use a whole number.";
    if (n <= spec.min) return `Must be greater than ${spec.min}.`;
    if (spec.max !== null && n > spec.max) return `Must be ${spec.max} or less.`;
    return "";
  }

  function setFieldError(name, message) {
    const field = els.form.querySelector(`[data-field="${name}"]`);
    const errorEl = document.getElementById(`${name}-error`);
    if (!field || !errorEl) return;
    field.classList.toggle("is-invalid", Boolean(message));
    errorEl.textContent = message;

    // aria-invalid on the focusable control(s)
    const controls = FIELDS[name].kind === "radio"
      ? $$(`input[name="${name}"]`, els.form)
      : [document.getElementById(name)];
    controls.forEach((c) => c && c.setAttribute("aria-invalid", message ? "true" : "false"));
  }

  /** Validate one field and update its UI. Returns true when valid. */
  function validateField(name, { show = true } = {}) {
    const message = validateValue(name);
    if (show) setFieldError(name, message);
    return message === "";
  }

  function fieldsInStep(step) {
    return FIELD_NAMES.filter((n) => FIELDS[n].step === step);
  }

  /** Validate a whole step. Focuses the first invalid control if requested. */
  function validateStep(step, { focus = true } = {}) {
    const names = fieldsInStep(step);
    let firstInvalid = null;
    names.forEach((name) => {
      state.touched.add(name);
      if (!validateField(name) && !firstInvalid) firstInvalid = name;
    });
    if (firstInvalid && focus) focusField(firstInvalid);
    updateStepIndicators();
    return firstInvalid === null;
  }

  function focusField(name) {
    const spec = FIELDS[name];
    const target = spec.kind === "radio"
      ? (els.form.querySelector(`input[name="${name}"]:checked`) || els.form.querySelector(`input[name="${name}"]`))
      : document.getElementById(name);
    if (target) target.focus({ preventScroll: false });
  }

  /* ========================================================================
     FORM: SLIDERS (range <-> number box sync with live value indicator)
     ======================================================================== */
  function updateRangeFill(range) {
    const min = parseFloat(range.min);
    const max = parseFloat(range.max);
    const val = parseFloat(range.value);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    range.style.setProperty("--fill", `${Math.min(100, Math.max(0, pct))}%`);
  }

  function updateDisplay(name) {
    const display = els.form.querySelector(`[data-display="${name}"]`);
    if (!display) return;
    const raw = getRawValue(name);
    const n = Number(raw);
    const spec = FIELDS[name];
    let text = "—";
    if (raw !== "" && Number.isFinite(n)) {
      text = spec.int ? String(n) : (Number.isInteger(n) ? n.toFixed(1) : String(n));
    }
    if (display.textContent !== text) {
      display.textContent = text;
      const pill = display.parentElement;
      pill.classList.remove("is-bump");
      void pill.offsetWidth; // restart animation
      pill.classList.add("is-bump");
    }
  }

  function initSliders() {
    $$(".slider__range", els.form).forEach((range) => {
      const name = range.dataset.rangeFor;
      const number = document.getElementById(name);
      updateRangeFill(range);

      // Slider moved → update number box
      range.addEventListener("input", () => {
        number.value = range.value;
        updateRangeFill(range);
        updateDisplay(name);
        state.touched.add(name);
        validateField(name);
        onFormChange();
      });

      // Number typed → update slider (clamped to its visual range)
      number.addEventListener("input", () => {
        const n = Number(number.value);
        if (number.value.trim() !== "" && Number.isFinite(n)) {
          const clamped = Math.min(parseFloat(range.max), Math.max(parseFloat(range.min), n));
          range.value = String(clamped);
          updateRangeFill(range);
        }
        updateDisplay(name);
        // Only show live errors once the user has already seen this field's error state.
        validateField(name, { show: state.touched.has(name) });
        onFormChange();
      });

      number.addEventListener("blur", () => {
        state.touched.add(name);
        validateField(name);
        onFormChange();
      });
    });
  }

  /** Re-sync every slider with its number box (after a reset). */
  function syncAllSliders() {
    $$(".slider__range", els.form).forEach((range) => {
      const number = document.getElementById(range.dataset.rangeFor);
      range.value = number.value;
      updateRangeFill(range);
      updateDisplay(range.dataset.rangeFor);
    });
  }

  /* ========================================================================
     FORM: STEPS, PROGRESS, REVIEW
     ======================================================================== */
  function goToStep(target, { focus = true } = {}) {
    if (target < 0 || target >= TOTAL_STEPS) return;
    const direction = target < state.currentStep ? "back" : "forward";

    els.steps.forEach((section, i) => {
      const active = i === target;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
      section.classList.toggle("is-back", active && direction === "back");
    });

    state.currentStep = target;
    state.visited.add(target);

    els.btnPrev.disabled = target === 0;
    const isLast = target === TOTAL_STEPS - 1;
    els.btnNext.hidden = isLast;
    els.btnSubmit.hidden = !isLast;
    if (isLast) renderReview();

    els.stepButtons.forEach((btn) => {
      if (Number(btn.dataset.stepTarget) === target) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });

    updateProgress();
    updateStepIndicators();

    if (focus) {
      const title = els.steps[target].querySelector(".form-step__title");
      if (title) title.focus({ preventScroll: true });
      scrollPanelIntoView();
    }
  }

  /** Bring the top of the assessment panel into view if the user scrolled past it. */
  function scrollPanelIntoView() {
    const rect = els.panel.getBoundingClientRect();
    const navH = els.nav.offsetHeight;
    if (rect.top < navH || rect.top > window.innerHeight * 0.6) {
      window.scrollTo({ top: window.scrollY + rect.top - navH - 16, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }

  /** Move toward a step, validating each step in between. */
  function navigateTo(target) {
    if (target <= state.currentStep) {
      goToStep(target);
      return;
    }
    for (let s = state.currentStep; s < target; s++) {
      if (!validateStep(s, { focus: false })) {
        goToStep(s);
        const firstInvalid = fieldsInStep(s).find((n) => validateValue(n));
        if (firstInvalid) focusField(firstInvalid);
        return;
      }
    }
    goToStep(target);
  }

  /** A field counts as complete when valid and (for preset sliders) its step was visited. */
  function isFieldComplete(name) {
    const spec = FIELDS[name];
    if (validateValue(name)) return false;
    return spec.kind !== "number" || state.visited.has(spec.step);
  }

  function updateProgress() {
    const done = FIELD_NAMES.filter(isFieldComplete).length;
    const pct = Math.round((done / FIELD_NAMES.length) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressValue.textContent = `${pct}%`;
    els.progressBar.setAttribute("aria-valuenow", String(pct));
  }

  function updateStepIndicators() {
    els.stepButtons.forEach((btn) => {
      const step = Number(btn.dataset.stepTarget);
      const names = fieldsInStep(step);
      const complete = state.visited.has(step) && names.every((n) => !validateValue(n));
      const hasError = names.some((n) => state.touched.has(n) && validateValue(n));
      btn.classList.toggle("is-complete", complete);
      btn.classList.toggle("has-error", hasError);
    });
  }

  /** Summary of all answers on the final step; each item jumps to its step. */
  function renderReview() {
    els.reviewGrid.innerHTML = "";
    FIELD_NAMES.filter((n) => n !== "Stress_Level").forEach((name) => {
      const spec = FIELDS[name];
      const missing = Boolean(validateValue(name));
      const display = missing ? "Needs attention" : formatValue(name, getTypedValue(name));

      const item = document.createElement("div");
      item.className = `review__item${missing ? " is-missing" : ""}`;
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.setAttribute("aria-label", `${spec.label}: ${display}. Edit in step ${spec.step + 1}.`);

      const dt = document.createElement("dt");
      dt.textContent = spec.label;
      const dd = document.createElement("dd");
      dd.textContent = display;
      item.append(dt, dd);

      const go = () => {
        goToStep(spec.step);
        focusField(name);
      };
      item.addEventListener("click", go);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
      els.reviewGrid.appendChild(item);
    });
  }

  /** Called whenever any value changes. */
  function onFormChange() {
    updateProgress();
    updateStepIndicators();
    if (state.currentStep === TOTAL_STEPS - 1) renderReview();
  }

  function initFormControls() {
    // Radio groups & select: validate on change.
    FIELD_NAMES.filter((n) => FIELDS[n].kind !== "number").forEach((name) => {
      const controls = FIELDS[name].kind === "radio"
        ? $$(`input[name="${name}"]`, els.form)
        : [document.getElementById(name)];
      controls.forEach((c) => c.addEventListener("change", () => {
        state.touched.add(name);
        validateField(name);
        if (name === "Country") c.classList.remove("is-placeholder");
        onFormChange();
      }));
    });
    document.getElementById("Country").classList.add("is-placeholder");

    els.btnNext.addEventListener("click", () => {
      if (validateStep(state.currentStep)) goToStep(state.currentStep + 1);
    });
    els.btnPrev.addEventListener("click", () => goToStep(state.currentStep - 1));
    els.stepButtons.forEach((btn) =>
      btn.addEventListener("click", () => navigateTo(Number(btn.dataset.stepTarget)))
    );

    els.bannerClose.addEventListener("click", hideBanner);
    els.form.addEventListener("submit", handleSubmit);

    els.btnEdit.addEventListener("click", () => showForm({ step: TOTAL_STEPS - 1 }));
    els.btnRestart.addEventListener("click", resetAssessment);

    // Start Assessment: after the smooth scroll, move focus into the form for keyboard users.
    $("#start-assessment").addEventListener("click", () => {
      setTimeout(() => {
        const title = els.steps[state.currentStep].querySelector(".form-step__title");
        if (!els.form.hidden && title) title.focus({ preventScroll: true });
      }, 600);
    });
  }

  /* ========================================================================
     BANNER (global errors)
     ======================================================================== */
  function showBanner(title, text) {
    els.bannerTitle.textContent = title;
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }
  function hideBanner() {
    els.banner.hidden = true;
  }

  /* ========================================================================
     SUBMISSION
     ======================================================================== */
  function setLoading(loading) {
    state.isSubmitting = loading;
    els.loading.hidden = !loading;
    els.form.setAttribute("aria-busy", String(loading));
    els.btnSubmit.classList.toggle("is-loading", loading);
    els.btnSubmit.disabled = loading;
    els.btnPrev.disabled = loading || state.currentStep === 0;
    els.btnSubmitLabel.textContent = loading ? "Generating…" : "Generate Prediction";
    els.stepButtons.forEach((b) => { b.disabled = loading; });
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.isSubmitting) return; // prevent duplicate submissions

    // Pressing Enter on an earlier step behaves like "Next".
    if (state.currentStep < TOTAL_STEPS - 1) {
      els.btnNext.click();
      return;
    }

    hideBanner();

    // Validate every step; jump to the first one with a problem.
    for (let s = 0; s < TOTAL_STEPS; s++) {
      if (!validateStep(s, { focus: false })) {
        goToStep(s);
        const firstInvalid = fieldsInStep(s).find((n) => validateValue(n));
        if (firstInvalid) focusField(firstInvalid);
        showBanner("Some answers need attention", "Please fix the highlighted fields before generating a prediction.");
        return;
      }
    }

    const payload = buildPayload();
    setLoading(true);
    const started = performance.now();

    try {
      const result = await requestPrediction(payload);
      const latency = performance.now() - started;
      const remaining = MIN_LOADING_MS - latency;
      if (remaining > 0) await wait(remaining);
      setApiStatus("connected");
      showResults(result, payload, latency);
    } catch (err) {
      handlePredictionError(err);
    } finally {
      setLoading(false);
    }
  }

  /** Custom error type so the UI can react to each failure mode. */
  class ApiError extends Error {
    constructor(kind, message, details = null) {
      super(message);
      this.kind = kind;       // "network" | "timeout" | "validation" | "server" | "http" | "unexpected"
      this.details = details;
    }
  }

  /**
   * POST the payload to the FastAPI backend.
   * Resolves with the numeric score, or throws an ApiError.
   */
  async function requestPrediction(payload) {
    let response;
    try {
      response = await fetchWithTimeout(
        ENDPOINTS.predict,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        PREDICT_TIMEOUT_MS
      );
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new ApiError("timeout", `The API did not respond within ${PREDICT_TIMEOUT_MS / 1000} seconds.`);
      }
      throw new ApiError("network", `Could not reach ${API_BASE}. Make sure the FastAPI server is running.`);
    }

    // Try to parse JSON regardless of status (FastAPI errors are JSON too).
    let data = null;
    const text = await response.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (response.status === 422) {
      throw new ApiError("validation", "The API rejected some of the submitted values.", data && data.detail);
    }
    if (response.status >= 500) {
      throw new ApiError("server", `The backend returned an internal error (HTTP ${response.status}) while running the model.`);
    }
    if (!response.ok) {
      const detail = data && typeof data.detail === "string" ? ` ${data.detail}.` : "";
      throw new ApiError("http", `The API responded with HTTP ${response.status}.${detail}`);
    }

    const score = data && data.predicted_mental_health_score;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new ApiError(
        "unexpected",
        "The API responded, but the response did not contain a numeric predicted_mental_health_score."
      );
    }
    return score;
  }

  /** Map an ApiError to banner text and inline field errors. */
  function handlePredictionError(err) {
    const kind = err instanceof ApiError ? err.kind : "unexpected";
    const message = err && err.message ? err.message : "Something went wrong.";

    switch (kind) {
      case "network":
        setApiStatus("disconnected");
        showBanner("Backend unavailable", message);
        break;
      case "timeout":
        showBanner("Request timed out", message);
        break;
      case "validation":
        showValidationErrors(err.details);
        break;
      case "server":
        showBanner("Prediction failed", `${message} Check the uvicorn terminal for the full traceback.`);
        break;
      case "http":
        showBanner("Request failed", message);
        break;
      default:
        showBanner("Unexpected response", message);
    }
    els.banner.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  /** Render FastAPI 422 `detail` entries next to the matching inputs. */
  function showValidationErrors(detail) {
    const unmatched = [];
    let firstStep = null;
    let firstField = null;

    if (Array.isArray(detail)) {
      detail.forEach((item) => {
        const loc = Array.isArray(item.loc) ? item.loc : [];
        const name = loc.find((part) => FIELDS[part]);
        const msg = item.msg || "Invalid value.";
        if (name) {
          state.touched.add(name);
          setFieldError(name, `Server: ${msg}`);
          const step = FIELDS[name].step;
          if (firstStep === null || step < firstStep) { firstStep = step; firstField = name; }
        } else {
          unmatched.push(msg);
        }
      });
    }

    const extra = unmatched.length ? ` ${unmatched.join(" ")}` : "";
    showBanner(
      "The API rejected some values (HTTP 422)",
      `Fields with problems are highlighted.${extra}`.trim()
    );
    updateStepIndicators();

    if (firstStep !== null) {
      goToStep(firstStep);
      focusField(firstField);
    }
  }

  /* ========================================================================
     RESULTS
     ======================================================================== */
  function decimalsOf(n) {
    const s = String(n);
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  }

  /** Count up from 0 to the returned value; ends on the exact value. */
  function animateNumber(el, target, decimals, duration = 1400) {
    if (prefersReducedMotion()) {
      el.textContent = target.toFixed(decimals);
      return;
    }
    const start = performance.now();
    const easeOut = (t) => 1 - Math.pow(1 - t, 4);
    const token = (animateNumber.token = (animateNumber.token || 0) + 1);
    const finish = () => { if (token === animateNumber.token) el.textContent = target.toFixed(decimals); };
    const frame = (now) => {
      if (token !== animateNumber.token) return; // a newer animation took over
      const t = Math.min(1, (now - start) / duration);
      el.textContent = (target * easeOut(t)).toFixed(decimals);
      if (t < 1) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
    // rAF pauses in background tabs; guarantee the exact final value is shown.
    setTimeout(finish, duration + 100);
  }

  function showResults(score, payload, latencyMs) {
    const now = new Date();
    const decimals = Math.min(4, Math.max(2, decimalsOf(score)));

    // Header meta (real measurements)
    els.metaLatency.textContent = `${Math.round(latencyMs)} ms`;
    els.metaTime.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    // Inputs actually sent
    els.inputsGrid.innerHTML = "";
    FIELD_NAMES.forEach((name) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = FIELDS[name].label;
      const dd = document.createElement("dd");
      dd.textContent = formatValue(name, payload[name]);
      dd.title = dd.textContent;
      wrap.append(dt, dd);
      els.inputsGrid.appendChild(wrap);
    });
    els.payloadJson.textContent = JSON.stringify(payload, null, 2);

    // Session history
    state.history.unshift({ time: now, payload, score });
    renderHistory(decimals);

    // Swap form for results
    els.form.hidden = true;
    els.results.hidden = false;
    hideBanner();

    // Ring draw-in (decorative) and counter
    els.scoreArc.classList.remove("is-drawn");
    void els.scoreArc.getBoundingClientRect();
    requestAnimationFrame(() => els.scoreArc.classList.add("is-drawn"));
    els.scoreValue.textContent = (0).toFixed(decimals);
    animateNumber(els.scoreValue, score, decimals);
    els.scoreSr.textContent = `Predicted mental health score: ${score.toFixed(decimals)}`;

    els.resultsTitle.focus({ preventScroll: true });
    scrollPanelIntoView();
  }

  function renderHistory(decimals) {
    els.historyBody.innerHTML = "";
    const total = state.history.length;
    state.history.forEach((entry, index) => {
      const tr = document.createElement("tr");
      if (index === 0) tr.className = "is-latest";
      const cells = [
        String(total - index),
        entry.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        formatValue("Sleep_Hours_Per_Night", entry.payload.Sleep_Hours_Per_Night),
        formatValue("Avg_Daily_Usage_Hours", entry.payload.Avg_Daily_Usage_Hours),
        entry.payload.Stress_Level,
        entry.score.toFixed(Math.max(decimals, decimalsOf(entry.score))),
      ];
      cells.forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      els.historyBody.appendChild(tr);
    });
    els.historyCard.hidden = total < 2; // history becomes useful from the second run
  }

  /** Return to the form, optionally at a given step. */
  function showForm({ step = 0 } = {}) {
    els.results.hidden = true;
    els.form.hidden = false;
    goToStep(step);
  }

  /** Clear every answer and start again from step 1. */
  function resetAssessment() {
    els.form.reset();
    document.getElementById("Country").classList.add("is-placeholder");
    state.visited = new Set([0]);
    state.touched.clear();
    FIELD_NAMES.forEach((n) => setFieldError(n, ""));
    syncAllSliders();
    showForm({ step: 0 });
  }

  /* ========================================================================
     INIT
     ======================================================================== */
  function init() {
    initTheme();
    initNavigation();
    initReveal();
    initApiStatus();
    initSliders();
    initFormControls();
    goToStep(0, { focus: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
