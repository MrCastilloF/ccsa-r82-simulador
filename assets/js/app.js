/* =========================================================================
   Simulador CCSA R82 — lógica de la aplicación
   Vanilla JS, sin dependencias. Persistencia: localStorage + cookies.
   ========================================================================= */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1. Constantes y utilidades                                         */
  /* ------------------------------------------------------------------ */

  const PASS_MARK = (window.COURSE && window.COURSE.passMark) || 70;
  const KEYS = {
    active: "ccsa.active.session",
    history: "ccsa.history",
    seen: "ccsa.seen",
    settings: "ccsa.settings"
  };
  const COOKIE_DAYS = 400;
  const LETTERS = ["A", "B", "C", "D", "E", "F"];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const fmtClock = (ms) => {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  };

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ------------------------------------------------------------------ */
  /* 2. Almacenamiento (localStorage + cookies)                         */
  /* ------------------------------------------------------------------ */

  const store = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    }
  };

  const cookie = {
    set(name, value) {
      try {
        const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
      } catch (e) { /* cookies bloqueadas */ }
    },
    get(name) {
      try {
        const found = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
        return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
      } catch (e) {
        return null;
      }
    },
    remove(name) {
      try { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; } catch (e) { /* noop */ }
    }
  };

  const db = {
    history() { return store.read(KEYS.history, []); },
    seen() { return store.read(KEYS.seen, {}); },
    settings() {
      return Object.assign(
        { count: 20, mode: "practice", avoidSeen: true },
        store.read(KEYS.settings, {})
      );
    },
    saveSettings(patch) {
      const next = Object.assign(this.settings(), patch);
      store.write(KEYS.settings, next);
      return next;
    },
    active() { return store.read(KEYS.active, null); },
    saveActive(session) { store.write(KEYS.active, session); },
    clearActive() { store.remove(KEYS.active); },

    recordSession(result) {
      const history = this.history();
      history.unshift(result);
      store.write(KEYS.history, history.slice(0, 60));

      // Marca de progreso global
      const seen = this.seen();
      result.answers.forEach((a) => {
        const prev = seen[a.qid] || { times: 0, correct: 0, last: null };
        seen[a.qid] = {
          times: prev.times + 1,
          correct: prev.correct + (a.correct ? 1 : 0),
          last: a.correct ? "ok" : "bad",
          at: result.finishedAt
        };
      });
      store.write(KEYS.seen, seen);

      // Espejo compacto en cookies: sobrevive a la limpieza de localStorage
      const ids = Object.keys(seen).sort();
      cookie.set("ccsa_seen_ids", ids.join("."));
      cookie.set("ccsa_seen_count", String(ids.length));
      cookie.set("ccsa_last_score", String(result.percent));
      cookie.set("ccsa_last_date", result.finishedAt);
      cookie.set("ccsa_sessions", String(history.length));
    },

    restoreFromCookie() {
      // Si localStorage se perdió pero la cookie sigue, recuperamos lo esencial.
      const seen = this.seen();
      if (Object.keys(seen).length) return false;
      const raw = cookie.get("ccsa_seen_ids");
      if (!raw) return false;
      const restored = {};
      raw.split(".").filter(Boolean).forEach((id) => {
        restored[id] = { times: 1, correct: 0, last: "unknown", at: cookie.get("ccsa_last_date") || null };
      });
      store.write(KEYS.seen, restored);
      return true;
    },

    wipe() {
      Object.values(KEYS).forEach((k) => store.remove(k));
      ["ccsa_seen_ids", "ccsa_seen_count", "ccsa_last_score", "ccsa_last_date", "ccsa_sessions"].forEach((c) => cookie.remove(c));
    }
  };

  /* ------------------------------------------------------------------ */
  /* 3. Datos del curso                                                 */
  /* ------------------------------------------------------------------ */

  // El contenido llega DESPUÉS del login, así que se resuelve en cada arranque.
  let QUESTIONS = [];
  let MODULES = [];
  let byId = new Map();
  let moduleById = new Map();

  function refreshData() {
    QUESTIONS = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
    MODULES = Array.isArray(window.MODULES) ? window.MODULES : [];
    byId = new Map(QUESTIONS.map((q) => [q.id, q]));
    moduleById = new Map(MODULES.map((m) => [m.id, m]));
  }

  const moduleName = (id) => (moduleById.get(id) || {}).name || id;
  const moduleShort = (id) => (moduleById.get(id) || {}).short || moduleName(id);

  /* ------------------------------------------------------------------ */
  /* 4. Estado                                                          */
  /* ------------------------------------------------------------------ */

  let session = null;      // sesión activa
  let timerHandle = null;
  let toastHandle = null;
  let reviewFilter = "all";
  let lastResult = null;
  let activeScreen = "home";

  const els = {};
  function bindEls() {
    const ids = [
      "screen-home", "screen-exam", "screen-results", "screen-progress",
      "statTotal", "statModules", "statSeen", "moduleGrid",
      "qCount", "qCountOut", "quickPick", "quickAll", "countHint", "modes", "avoidSeen",
      "btnStart", "streakChip", "streakValue", "btnHistory", "btnRestart", "topbarCourse",
      "examModule", "examType", "examTimer", "timerValue", "progressWrap", "progressFill",
      "examCounter", "examScore", "questionNum", "questionText", "questionFigure", "figureBtn", "figureBtnText",
      "questionImage", "questionCaption", "questionZoom", "questionHint", "options", "feedback",
      "feedbackIcon", "feedbackTitle", "feedbackAnswer", "feedbackExplain", "feedbackSource",
      "btnCheck", "btnNext", "btnSkip", "navGrid", "navProgress", "btnFinishEarly", "btnAbort",
      "resPercent", "resVerdict", "resTitle", "resMessage", "resCorrect", "resWrong",
      "resTotal", "resTime", "ringBar", "breakdown", "trendChart", "historyList",
      "reviewList", "reviewFilter", "btnNewSession", "btnReviewWrong", "btnBackHome",
      "btnBackHome2", "btnWipe", "kpiGrid", "progressChart", "coverage", "sessionTable",
      "seenList", "lastRun", "lastRunText", "lastRunScore", "btnLastDetails",
      "footerCount", "toast", "dlgConfirm", "dlgTitle", "dlgText", "btnFooterHistory"
    ];
    ids.forEach((id) => { els[id] = document.getElementById(id); });
  }

  function showScreen(name) {
    activeScreen = name;
    ["home", "exam", "results", "progress"].forEach((s) => {
      const el = $(`#screen-${s}`);
      if (el) el.classList.toggle("screen--active", s === name);
    });
    if (name !== "exam" && timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    if (name === "exam" && session) startTimer();
    els.btnRestart.hidden = !(session && !session.finished);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("is-show");
    clearTimeout(toastHandle);
    toastHandle = setTimeout(() => els.toast.classList.remove("is-show"), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* 5. Inicio                                                          */
  /* ------------------------------------------------------------------ */

  function totalQuestions() { return QUESTIONS.length; }

  function initSettingsUI() {
    const s = db.settings();
    const max = Math.max(5, totalQuestions());
    const desired = clamp(s.count > 0 ? s.count : Math.min(20, max), 5, max);

    els.qCount.min = "5";
    els.qCount.max = String(max);
    // Paso 1: con paso 5 el deslizador no alcanzaba el total cuando no era múltiplo de 5.
    els.qCount.step = "1";
    els.qCount.value = String(Math.min(desired, max));
    els.btnStart.disabled = totalQuestions() === 0;

    const modeInput = document.querySelector(`input[name="mode"][value="${s.mode}"]`);
    if (modeInput) modeInput.checked = true;
    els.avoidSeen.checked = !!s.avoidSeen;

    syncCountUI();
  }

  function syncCountUI() {
    const max = totalQuestions();
    let value = parseInt(els.qCount.value, 10) || 20;
    value = clamp(value, 5, max);
    els.qCount.value = String(value);

    const all = value >= max;
    els.qCountOut.textContent = all ? `All (${max})` : String(value);
    els.quickAll.textContent = `All (${max})`;
    els.countHint.textContent = all
      ? `You will use the whole bank: ${plural(max, "question", "questions")}.`
      : `You picked ${plural(value, "question", "questions")} of ${max} available.`;

    const pct = max === 5 ? 100 : ((value - 5) / (max - 5)) * 100;
    els.qCount.style.setProperty("--fill", `${pct}%`);

    $$("#quickPick button").forEach((b) => {
      const c = parseInt(b.dataset.count, 10);
      b.classList.toggle("is-active", c === 0 ? all : c === value);
    });
  }

  function renderHome() {
    els.statTotal.textContent = String(totalQuestions());
    els.statModules.textContent = String(MODULES.length);
    els.footerCount.textContent = String(totalQuestions());

    const seen = db.seen();
    els.statSeen.textContent = String(Object.keys(seen).length);

    // Temario
    const counts = {};
    QUESTIONS.forEach((q) => { counts[q.module] = (counts[q.module] || 0) + 1; });
    els.moduleGrid.innerHTML = MODULES.map((m) => `
      <article class="module-card">
        <span class="module-card__tag">${escapeHtml(m.tag || "Module")}</span>
        <h3 class="module-card__name">${escapeHtml(m.name)}</h3>
        <p class="module-card__meta">${plural(counts[m.id] || 0, "question", "questions")} · p. ${escapeHtml(String(m.pages || "—"))}</p>
      </article>`).join("");

    // Última sesión
    const history = db.history();
    if (history.length) {
      const last = history[0];
      els.lastRun.hidden = false;
      els.lastRunText.textContent = `${fmtDate(last.finishedAt)} · ${last.correct} of ${last.total} correct · ${last.mode === "exam" ? "exam simulation" : "guided practice"}.`;
      els.lastRunScore.textContent = `${last.percent}%`;
      els.lastRunScore.style.color = last.percent >= PASS_MARK ? "var(--ok)" : "var(--bad)";
    } else {
      els.lastRun.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6. Motor de sesión                                                 */
  /* ------------------------------------------------------------------ */

  function pickQuestions(count, avoidSeen, onlyIds) {
    let pool = QUESTIONS.slice();
    if (onlyIds && onlyIds.length) {
      pool = pool.filter((q) => onlyIds.includes(q.id));
    }

    let chosen;
    if (avoidSeen) {
      const seen = db.seen();
      const unseen = pool.filter((q) => !seen[q.id]);
      const seenPool = pool.filter((q) => seen[q.id]);
      chosen = shuffle(unseen).slice(0, count);
      if (chosen.length < count) {
        chosen = chosen.concat(shuffle(seenPool).slice(0, count - chosen.length));
      }
    } else {
      chosen = shuffle(pool).slice(0, count);
    }
    return shuffle(chosen).map((q) => q.id);
  }

  function startSession(opts) {
    const total = totalQuestions();
    if (!total) { toast("No questions loaded."); return; }

    let count = opts && opts.count ? opts.count : parseInt(els.qCount.value, 10);
    count = clamp(count || Math.min(20, total), 1, total);
    const avoidSeen = opts && typeof opts.avoidSeen === "boolean" ? opts.avoidSeen : els.avoidSeen.checked;
    const mode = (opts && opts.mode) || (document.querySelector('input[name="mode"]:checked') || {}).value || "practice";
    const order = pickQuestions(count, avoidSeen, opts && opts.onlyIds);

    session = {
      id: "s" + Date.now().toString(36),
      startedAt: Date.now(),
      finishedAt: null,
      mode,
      total: order.length,
      order,
      index: 0,
      answers: {},
      checked: {},
      correctCount: 0,
      streak: 0,
      elapsedMs: 0
    };

    db.saveSettings({ count, mode, avoidSeen });
    db.saveActive(session);
    els.btnRestart.hidden = false;
    els.examScore.textContent = mode === "exam" ? "Correct: —" : "Correct: 0";
    els.streakValue.textContent = "0";
    showScreen("exam");
    renderQuestion();
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    const tick = () => {
      if (!session) return;
      const live = Date.now() - session.startedAt;
      els.timerValue.textContent = fmtClock(live);
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function currentQuestion() {
    if (!session) return null;
    return byId.get(session.order[session.index]) || null;
  }

  function isMulti(q) { return q.type === "multi" || (Array.isArray(q.answer) && q.answer.length > 1); }

  function renderQuestion() {
    const q = currentQuestion();
    if (!q) { finishSession(); return; }

    const answered = session.checked[q.id];
    const selection = session.answers[q.id] || [];

    els.questionNum.textContent = `Question ${session.index + 1}`;
    els.questionText.textContent = q.question;

    // Imagen asociada (si la pregunta depende de una figura del material)
    if (q.image) {
      els.figureBtn.hidden = false;
      els.figureBtn.setAttribute("aria-expanded", "false");
      els.figureBtnText.textContent = `Ver la figura del material (pág. ${q.page})`;
      els.questionFigure.hidden = true;
      els.questionImage.src = q.image;
      els.questionImage.alt = q.imageAlt || "Figura del material del curso relacionada con la pregunta";
      els.questionCaption.textContent = q.imageCaption || `Figura extraída del material (pág. ${q.page}).`;
      if (els.questionZoom) els.questionZoom.href = q.image;
    } else {
      els.figureBtn.hidden = true;
      els.questionFigure.hidden = true;
      els.questionImage.removeAttribute("src");
    }

    // Tipo de pregunta
    els.examType.textContent = isMulti(q) ? "Multiple choice" : "Single choice";
    els.examType.classList.toggle("pill--multi", isMulti(q));

    // Pista
    if (isMulti(q)) {
      const need = q.answer.length;
      els.questionHint.style.display = "";
      els.questionHint.textContent = `Select ${need} answers. This question needs more than one option.`;
    } else {
      els.questionHint.style.display = "none";
    }

    els.examModule.textContent = moduleShort(q.module);

    // Opciones
    els.options.innerHTML = "";
    q.options.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.index = String(i);
      btn.setAttribute("aria-pressed", selection.includes(i) ? "true" : "false");
      if (selection.includes(i)) btn.classList.add("is-selected");
      btn.innerHTML = `<span class="option__key" aria-hidden="true">${LETTERS[i]}</span>
        <span class="option__text"></span>`;
      btn.querySelector(".option__text").textContent = text;
      btn.addEventListener("click", () => onOptionClick(i));
      els.options.appendChild(btn);
    });

    // Estado de la barra y botones
    els.progressFill.style.width = `${((session.index + (answered ? 1 : 0)) / session.total) * 100}%`;
    els.progressWrap.setAttribute("aria-valuenow", String(Math.round(((session.index + (answered ? 1 : 0)) / session.total) * 100)));
    els.examCounter.textContent = `Question ${session.index + 1} of ${session.total}`;
    if (session.mode !== "exam") {
      els.examScore.textContent = `Correct: ${session.correctCount}`;
    }

    if (answered) {
      lockOptions();
      renderFeedback(q, true);
      els.btnCheck.hidden = true;
      els.btnNext.hidden = false;
      els.btnNext.textContent = session.index + 1 >= session.total ? "See results →" : "Next →";
      els.btnSkip.hidden = true;
    } else {
      els.btnCheck.hidden = false;
      els.btnCheck.disabled = selection.length === 0;
      els.btnNext.hidden = true;
      els.btnSkip.hidden = false;
      els.feedback.hidden = true;
      if (session.mode === "exam") {
        els.btnCheck.textContent = "Save and continue";
      } else {
        els.btnCheck.textContent = "Check answer";
      }
    }

    renderNavigator();
    // Enfocar el enunciado para lectores de pantalla
    els.questionText.setAttribute("tabindex", "-1");
    els.questionText.focus({ preventScroll: true });
  }

  function onOptionClick(i) {
    const q = currentQuestion();
    if (!q || session.checked[q.id]) return;

    const selected = (session.answers[q.id] || []).slice();
    if (isMulti(q)) {
      const at = selected.indexOf(i);
      if (at >= 0) selected.splice(at, 1);
      else selected.push(i);
    } else {
      selected.length = 0;
      selected.push(i);
    }
    session.answers[q.id] = selected;
    db.saveActive(session);

    $$(".option", els.options).forEach((el) => {
      const idx = Number(el.dataset.index);
      el.classList.toggle("is-selected", selected.includes(idx));
      el.setAttribute("aria-pressed", selected.includes(idx) ? "true" : "false");
    });

    if (els.btnCheck) els.btnCheck.disabled = selected.length === 0;
  }

  function lockOptions() {
    $$(".option", els.options).forEach((el) => {
      el.classList.add("is-locked");
      el.disabled = true;
    });
  }

  function isCorrectAnswer(q, selected) {
    const a = (q.answer || []).slice().sort((x, y) => x - y);
    const s = (selected || []).slice().sort((x, y) => x - y);
    return a.length === s.length && a.every((v, i) => v === s[i]);
  }

  function checkAnswer() {
    const q = currentQuestion();
    if (!q) return;
    const selected = session.answers[q.id] || [];
    if (!selected.length) return;

    if (session.mode === "exam") {
      session.checked[q.id] = true;
      goNext();
      return;
    }

    const ok = isCorrectAnswer(q, selected);
    session.checked[q.id] = ok;
    if (ok) {
      session.correctCount += 1;
      session.streak += 1;
      els.streakChip.classList.add("is-hot");
      setTimeout(() => els.streakChip.classList.remove("is-hot"), 500);
    } else {
      session.streak = 0;
    }
    els.streakValue.textContent = String(session.streak);
    db.saveActive(session);

    // Pintar opciones
    const answers = q.answer || [];
    $$(".option", els.options).forEach((el) => {
      const idx = Number(el.dataset.index);
      el.classList.remove("is-selected");
      if (answers.includes(idx)) el.classList.add("is-correct");
      if (selected.includes(idx) && !answers.includes(idx)) el.classList.add("is-wrong");
      if (!answers.includes(idx) && !selected.includes(idx)) el.classList.add("is-dim");
    });
    lockOptions();
    renderFeedback(q, false);

    els.btnCheck.hidden = true;
    els.btnNext.hidden = false;
    els.btnNext.textContent = session.index + 1 >= session.total ? "See results →" : "Next →";
    els.btnSkip.hidden = true;
    els.examScore.textContent = `Correct: ${session.correctCount}`;
    els.progressFill.style.width = `${((session.index + 1) / session.total) * 100}%`;
    renderNavigator();
    els.btnNext.focus({ preventScroll: true });
  }

  function renderFeedback(q, replay) {
    if (session.mode === "exam") { els.feedback.hidden = true; return; }
    const ok = !!session.checked[q.id];
    els.feedback.hidden = false;
    els.feedback.className = "feedback " + (ok ? "is-ok" : "is-bad");
    els.feedbackIcon.textContent = ok ? "✓" : "✕";
    els.feedbackTitle.textContent = ok ? "Correct!" : "Incorrect answer";

    const correctTexts = (q.answer || []).map((i) => q.options[i]).join(" · ");
    const yours = (session.answers[q.id] || []).map((i) => q.options[i]).join(" · ");
    els.feedbackAnswer.textContent = ok
      ? "Nice work — that is the key concept."
      : `Your answer: ${yours || "no answer"}\nCorrect: ${correctTexts}`;

    els.feedbackExplain.textContent = q.explanation || "";
    els.feedbackSource.textContent = `Source: CCSA R82 material, ${moduleName(q.module)} · page ${q.page}${replay ? " (review)" : ""}.`;
  }

  function goNext() {
    if (!session) return;
    if (session.index + 1 >= session.total) {
      finishSession();
      return;
    }
    session.index += 1;
    db.saveActive(session);
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function skipQuestion() {
    const q = currentQuestion();
    if (!q) return;
    session.checked[q.id] = false;
    session.streak = 0;
    els.streakValue.textContent = "0";
    db.saveActive(session);
    goNext();
  }

  function renderNavigator() {
    if (!session) return;
    els.navGrid.innerHTML = "";
    session.order.forEach((qid, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "navdot";
      b.textContent = String(i + 1);
      b.title = `Question ${i + 1}`;
      const done = Object.prototype.hasOwnProperty.call(session.checked, qid);
      if (done) {
        b.classList.add(session.mode === "exam" ? "is-done" : (session.checked[qid] ? "is-ok" : "is-bad"));
      }
      if (i === session.index) b.classList.add("is-now");
      b.addEventListener("click", () => {
        session.index = i;
        db.saveActive(session);
        renderQuestion();
      });
      els.navGrid.appendChild(b);
    });

    let doneCount = 0;
    session.order.forEach((qid) => {
      if (Object.prototype.hasOwnProperty.call(session.checked, qid)) doneCount += 1;
    });
    els.navProgress.textContent = `${doneCount}/${session.total}`;
    els.btnFinishEarly.hidden = doneCount < 1;
  }

  /* ------------------------------------------------------------------ */
  /* 7. Resultados                                                      */
  /* ------------------------------------------------------------------ */

  function scoreSession() {
    const rows = session.order.map((qid) => {
      const q = byId.get(qid);
      const selected = session.answers[qid] || [];
      return {
        qid,
        module: q.module,
        page: q.page,
        question: q.question,
        options: q.options,
        answer: q.answer,
        selected,
        correct: session.mode === "exam" ? isCorrectAnswer(q, selected) : !!session.checked[qid]
      };
    });
    const correct = rows.filter((r) => r.correct).length;
    return {
      id: session.id,
      finishedAt: new Date().toISOString(),
      mode: session.mode,
      startedAt: new Date(session.startedAt).toISOString(),
      total: rows.length,
      correct,
      wrong: rows.length - correct,
      percent: rows.length ? Math.round((correct / rows.length) * 100) : 0,
      elapsedMs: Date.now() - session.startedAt,
      answers: rows
    };
  }

  function finishSession() {
    if (!session) return;
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    const result = scoreSession();
    lastResult = result;
    db.recordSession(result);
    session = null;
    db.clearActive();
    els.btnRestart.hidden = true;
    showScreen("results");
    renderResults(result);
  }

  function renderResults(result) {
    els.resPercent.textContent = `${result.percent}%`;
    els.resCorrect.textContent = String(result.correct);
    els.resWrong.textContent = String(result.wrong);
    els.resTotal.textContent = String(result.total);
    els.resTime.textContent = fmtClock(result.elapsedMs);

    const passed = result.percent >= PASS_MARK;
    els.resVerdict.textContent = passed ? "Passed" : "Keep practicing";
    els.resVerdict.className = "pill " + (passed ? "tag--ok" : "tag--bad");
    els.resVerdict.style.background = passed ? "var(--ok-soft)" : "var(--bad-soft)";
    els.resVerdict.style.color = passed ? "var(--ok)" : "var(--bad)";
    els.resTitle.textContent = passed ? "Target cleared!" : "Good progress";
    els.resMessage.textContent = passed
      ? `You got ${result.correct} of ${result.total}. The reference threshold is ${PASS_MARK}%. Review the missed ones to close the gaps.`
      : `You got ${result.correct} of ${result.total}. The reference threshold is ${PASS_MARK}%. Read the explanations and try again: it is the fastest way up.`;

    // Anillo
    const circumference = 2 * Math.PI * 52;
    els.ringBar.style.strokeDasharray = String(circumference);
    els.ringBar.style.strokeDashoffset = String(circumference);
    els.ringBar.style.stroke = passed ? "var(--ok)" : "var(--brand-2)";
    requestAnimationFrame(() => {
      els.ringBar.style.strokeDashoffset = String(circumference * (1 - result.percent / 100));
    });

    renderBreakdown(result);
    renderTrend(els.trendChart, db.history().slice(0, 12).reverse(), 180);
    renderHistoryList();

    reviewFilter = "all";
    $$("#reviewFilter button").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === "all"));
    renderReview(result);

    els.btnReviewWrong.hidden = result.wrong === 0;
    els.btnReviewWrong.textContent = result.wrong === 1
      ? "Review the missed question"
      : `Review the ${result.wrong} missed questions`;
  }

  function renderBreakdown(result) {
    const map = new Map();
    result.answers.forEach((a) => {
      const cur = map.get(a.module) || { total: 0, ok: 0 };
      cur.total += 1;
      if (a.correct) cur.ok += 1;
      map.set(a.module, cur);
    });
    els.breakdown.innerHTML = Array.from(map.entries()).map(([mod, s]) => {
      const pct = Math.round((s.ok / s.total) * 100);
      return `<div class="bd-row">
        <div class="bd-row__top"><strong>${escapeHtml(moduleShort(mod))}</strong><span>${s.ok}/${s.total} · ${pct}%</span></div>
        <div class="bd-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join("");
  }

  function renderHistoryList() {
    const history = db.history().slice(0, 6);
    els.historyList.innerHTML = history.map((h) => `
      <li>
        <span>${escapeHtml(fmtDate(h.finishedAt))} · ${h.mode === "exam" ? "Exam" : "Practice"}</span>
        <b style="color:${h.percent >= PASS_MARK ? "var(--ok)" : "var(--bad)"}">${h.percent}%</b>
      </li>`).join("") || `<li><span>No sessions saved yet.</span></li>`;
  }

  function renderReview(result) {
    const rows = result.answers.filter((a) => {
      if (reviewFilter === "wrong") return !a.correct;
      if (reviewFilter === "right") return a.correct;
      return true;
    });

    els.reviewList.innerHTML = rows.map((a, i) => {
      const correctTexts = a.answer.map((idx) => `${LETTERS[idx]}) ${a.options[idx]}`).join(" · ");
      const yourTexts = a.selected.length
        ? a.selected.map((idx) => `${LETTERS[idx]}) ${a.options[idx]}`).join(" · ")
        : "No answer";
      return `<article class="review-item ${a.correct ? "is-right" : "is-wrong"}" data-q="${a.qid}">
        <button class="review-item__btn" type="button" aria-expanded="false">
          <span class="review-item__badge" aria-hidden="true">${a.correct ? "✓" : "✕"}</span>
          <span class="review-item__q">${escapeHtml(a.question)}</span>
          <span class="review-item__meta">${escapeHtml(moduleShort(a.module))} · p. ${a.page}</span>
        </button>
        <div class="review-item__body">
          <p class="review-item__row ${a.correct ? "is-ok" : "is-bad"}"><b>Your answer:</b> ${escapeHtml(yourTexts)}</p>
          <p class="review-item__row is-ok"><b>Correct answer:</b> ${escapeHtml(correctTexts)}</p>
          <p class="review-item__explain">${escapeHtml((byId.get(a.qid) || {}).explanation || "")}</p>
        </div>
      </article>`;
    }).join("") || `<p class="hint">No questions in this filter.</p>`;

    $$(".review-item__btn", els.reviewList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".review-item");
        const open = item.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. Gráficos (canvas, sin librerías)                                */
  /* ------------------------------------------------------------------ */

  function renderTrend(canvas, data, height) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || canvas.parentElement.clientWidth || 480;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 30, r: 12, t: 14, b: 22 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    // Rejilla
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.fillStyle = "rgba(157,171,208,.85)";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.lineWidth = 1;
    [0, 50, 100].forEach((pct) => {
      const y = pad.t + h - (pct / 100) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.fillText(String(pct), 4, y + 4);
    });

    if (!data.length) {
      ctx.fillStyle = "rgba(157,171,208,.65)";
      ctx.fillText("No data yet", pad.l + 8, pad.t + h / 2);
      return;
    }

    const step = data.length > 1 ? w / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      x: pad.l + (data.length === 1 ? w / 2 : i * step),
      y: pad.t + h - (clamp(d.percent, 0, 100) / 100) * h,
      v: d.percent
    }));

    // Área
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, "rgba(229,0,90,.45)");
    grad.addColorStop(1, "rgba(229,0,90,0)");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.t + h);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.t + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Línea
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = "#ff4d8d";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Puntos
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#ff4d8d";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 9. Pantalla de progreso                                            */
  /* ------------------------------------------------------------------ */

  function renderProgress() {
    const history = db.history();
    const seen = db.seen();
    const seenIds = Object.keys(seen);

    const sessions = history.length;
    const avg = sessions ? Math.round(history.reduce((s, h) => s + h.percent, 0) / sessions) : 0;
    const best = history.reduce((m, h) => Math.max(m, h.percent), 0);
    const answered = seenIds.length;

    els.kpiGrid.innerHTML = [
      ["Sessions completed", sessions],
      ["Average", `${avg}%`],
      ["Best score", `${best}%`],
      ["Questions seen", `${answered}/${totalQuestions()}`]
    ].map(([label, value]) => `
      <div class="kpi"><span class="kpi__num">${escapeHtml(String(value))}</span><span class="kpi__label">${escapeHtml(label)}</span></div>`).join("");

    renderTrend(els.progressChart, history.slice(0, 12).reverse(), 220);

    // Cobertura por módulo
    const counts = {};
    QUESTIONS.forEach((q) => { counts[q.module] = (counts[q.module] || 0) + 1; });
    const seenPerModule = {};
    seenIds.forEach((id) => {
      const q = byId.get(id);
      if (q) seenPerModule[q.module] = (seenPerModule[q.module] || 0) + 1;
    });
    els.coverage.innerHTML = MODULES.map((m) => {
      const t = counts[m.id] || 0;
      const s = seenPerModule[m.id] || 0;
      const pct = t ? Math.round((s / t) * 100) : 0;
      return `<div class="coverage__row">
        <div class="coverage__top"><strong>${escapeHtml(m.short || m.name)}</strong><span>${s}/${t} · ${pct}%</span></div>
        <div class="bd-bar"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join("");

    // Tabla de sesiones
    const tbody = els.sessionTable.querySelector("tbody");
    tbody.innerHTML = history.map((h) => `
      <tr>
        <td>${escapeHtml(fmtDate(h.finishedAt))}</td>
        <td>${h.mode === "exam" ? "Exam" : "Practice"}</td>
        <td>${h.correct}/${h.total}</td>
        <td>${h.percent}%</td>
        <td>${fmtClock(h.elapsedMs || 0)}</td>
        <td><span class="tag ${h.percent >= PASS_MARK ? "tag--ok" : "tag--bad"}">${h.percent >= PASS_MARK ? "Passed" : "Needs review"}</span></td>
      </tr>`).join("") || `<tr><td colspan="6">You have not finished a session yet.</td></tr>`;

    // Preguntas vistas
    const rows = seenIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => (seen[b.id].at || "").localeCompare(seen[a.id].at || ""));
    els.seenList.innerHTML = rows.length ? rows.map((q) => {
      const s = seen[q.id];
      const mark = s.last === "ok" ? "✓" : s.last === "bad" ? "✕" : "•";
      const cls = s.last === "ok" ? "tag--ok" : s.last === "bad" ? "tag--bad" : "";
      return `<div class="seen-row">
        <span class="seen-row__mark ${cls}">${mark}</span>
        <span class="seen-row__q">${escapeHtml(q.question)}</span>
        <span class="seen-row__meta">${escapeHtml(moduleShort(q.module))} · p. ${q.page} · ${s.times}×</span>
      </div>`;
    }).join("") : `<p class="hint">You have not seen any question yet.</p>`;
  }

  /* ------------------------------------------------------------------ */
  /* 10. Diálogo de confirmación                                        */
  /* ------------------------------------------------------------------ */

  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      if (!els.dlgConfirm || typeof els.dlgConfirm.showModal !== "function") {
        resolve(window.confirm(text));
        return;
      }
      els.dlgTitle.textContent = title;
      els.dlgText.textContent = text;
      const onClose = () => {
        els.dlgConfirm.removeEventListener("close", onClose);
        resolve(els.dlgConfirm.returnValue === "ok");
      };
      els.dlgConfirm.addEventListener("close", onClose);
      els.dlgConfirm.showModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 11. Eventos                                                        */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    els.qCount.addEventListener("input", syncCountUI);

    $$("#quickPick button").forEach((b) => {
      b.addEventListener("click", () => {
        const c = parseInt(b.dataset.count, 10);
        els.qCount.value = String(c === 0 ? totalQuestions() : clamp(c, 5, totalQuestions()));
        syncCountUI();
      });
    });

    els.btnStart.addEventListener("click", () => startSession());

    els.btnCheck.addEventListener("click", checkAnswer);
    els.btnNext.addEventListener("click", goNext);
    els.btnSkip.addEventListener("click", skipQuestion);

    // El botón de figura expande o contrae la imagen del material
    if (els.figureBtn) {
      els.figureBtn.addEventListener("click", () => {
        const open = els.questionFigure.hidden;
        els.questionFigure.hidden = !open;
        els.figureBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    els.btnFinishEarly.addEventListener("click", async () => {
      const ok = await confirmDialog("Finish now?", "Questions are still unanswered. They will count as incorrect and you will see your partial result.");
      if (ok) finishSession();
    });

    els.btnAbort.addEventListener("click", async () => {
      const ok = await confirmDialog("Leave the session?", "You will lose the progress of this session. What you already answered will be saved.");
      if (!ok) return;
      if (session) {
        session.finishedAt = new Date().toISOString();
        const result = scoreSession();
        db.recordSession(result);
      }
      session = null;
      db.clearActive();
      els.btnRestart.hidden = true;
      showScreen("home");
      renderHome();
    });

    els.btnRestart.addEventListener("click", async () => {
      const ok = await confirmDialog("Restart the test?", "The current session will be closed and you will start a new one with new questions.");
      if (!ok) return;
      session = null;
      db.clearActive();
      startSession();
    });

    els.btnHistory.addEventListener("click", () => { renderProgress(); showScreen("progress"); });
    els.btnFooterHistory.addEventListener("click", () => { renderProgress(); showScreen("progress"); });
    els.btnBackHome.addEventListener("click", () => { renderHome(); showScreen("home"); });
    els.btnBackHome2.addEventListener("click", () => { renderHome(); showScreen("home"); });

    els.btnNewSession.addEventListener("click", () => {
      renderHome();
      showScreen("home");
      startSession();
    });

    els.btnReviewWrong.addEventListener("click", () => {
      if (!lastResult) return;
      const wrongIds = lastResult.answers.filter((a) => !a.correct).map((a) => a.qid);
      if (!wrongIds.length) { toast("No missed questions in this session."); return; }
      startSession({ count: wrongIds.length, onlyIds: wrongIds, mode: "practice", avoidSeen: false });
    });

    els.btnLastDetails.addEventListener("click", () => {
      if (!lastResult) return;
      renderResults(lastResult);
      showScreen("results");
    });

    $$("#reviewFilter button").forEach((b) => {
      b.addEventListener("click", () => {
        reviewFilter = b.dataset.filter;
        $$("#reviewFilter button").forEach((x) => x.classList.toggle("is-active", x === b));
        if (lastResult) renderReview(lastResult);
      });
    });

    els.btnWipe.addEventListener("click", async () => {
      const ok = await confirmDialog("Erase all your progress?", "History, seen questions and the current session will be removed from this browser.");
      if (!ok) return;
      db.wipe();
      session = null;
      lastResult = null;
      els.btnRestart.hidden = true;
      toast("Progress erased.");
      renderHome();
      showScreen("home");
    });

    // Atajos de teclado
    document.addEventListener("keydown", (e) => {
      if (activeScreen !== "exam") return;
      if (e.target.matches("input, textarea, select, button") && e.key !== "Enter") return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) {
        const opt = $(`.option[data-index="${n - 1}"]`, els.options);
        if (opt && !opt.disabled) { opt.click(); e.preventDefault(); }
      }
      if (e.key === "Enter") {
        if (!els.btnCheck.hidden && !els.btnCheck.disabled) { checkAnswer(); e.preventDefault(); }
        else if (!els.btnNext.hidden) { goNext(); e.preventDefault(); }
      }
    });

    // Reanudar al recargar
    window.addEventListener("beforeunload", () => {
      if (session) db.saveActive(session);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 12. Arranque                                                       */
  /* ------------------------------------------------------------------ */

  // Modo de vista previa local (solo en localhost): ?preview=exam|results|progress|image|feedback
  function runPreview(kind) {
    if (!QUESTIONS.length) return;
    if (kind === "progress") {
      renderProgress();
      showScreen("progress");
      return;
    }
    if (kind === "image") {
      const q = QUESTIONS.find((x) => x.image);
      if (q) {
        startSession({ count: 1, onlyIds: [q.id], avoidSeen: false, mode: "practice" });
        if (new URLSearchParams(location.search).get("open") && els.figureBtn) els.figureBtn.click();
      }
      return;
    }
    if (kind === "feedback") {
      startSession({ count: 5, avoidSeen: false, mode: "practice" });
      const q = currentQuestion();
      if (q) {
        const wrong = q.options.map((_, i) => i).find((i) => !q.answer.includes(i));
        session.answers[q.id] = [wrong === undefined ? q.answer[0] : wrong];
        checkAnswer();
      }
      return;
    }
    startSession({ count: Math.min(5, QUESTIONS.length), avoidSeen: false, mode: "practice" });
    if (kind === "exam") return;
    session.order.forEach((qid, i) => {
      const q = byId.get(qid);
      const choose = i % 3 === 0 ? q.answer.slice() : [0];
      session.answers[qid] = choose;
      const ok = isCorrectAnswer(q, choose);
      session.checked[qid] = ok;
      if (ok) session.correctCount += 1;
    });
    session.startedAt = Date.now() - 7 * 60 * 1000;
    finishSession();
  }

  function resumeIfNeeded() {
    const saved = db.active();
    if (!saved) return false;
    if (!saved.order || !saved.order.length) return false;
    session = saved;
    els.btnRestart.hidden = false;
    if (session.mode === "exam") els.examScore.textContent = "Correct: —";
    els.streakValue.textContent = String(session.streak || 0);
    showScreen("exam");
    if (session.checked && Object.keys(session.checked).length) {
      // Si la última pregunta ya fue comprobada, mostramos feedback reconstruido
    }
    renderQuestion();
    toast("Resuming your previous session.");
    return true;
  }

  function boot() {
    refreshData();
    bindEls();
    bindEvents();

    if (window.COURSE && window.COURSE.title) {
      document.title = `${window.COURSE.examCode || "CCSA R82"} · Simulador de examen`;
      if (els.topbarCourse && window.COURSE.subtitle) els.topbarCourse.textContent = window.COURSE.subtitle;
    }

    if (!QUESTIONS.length) {
      els.btnStart.disabled = true;
      els.countHint.textContent = "Could not load the questions (assets/js/data.js).";
      toast("The questions file is missing.");
      return;
    }

    db.restoreFromCookie();
    initSettingsUI();
    renderHome();
    showScreen("home");
    resumeIfNeeded();

    const params = new URLSearchParams(location.search);
    if (params.get("preview") && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      runPreview(params.get("preview"));
    }
  }

  window.CCSA_APP = {
    start() {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
      } else {
        boot();
      }
    }
  };

  // Modo desarrollo: si el contenido ya está en claro, arranca sin pasar por el login.
  if (Array.isArray(window.QUESTIONS) && window.QUESTIONS.length) {
    window.CCSA_APP.start();
  }
})();
