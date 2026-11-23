/* =========================================================================
   Simulador CCSA R82 — acceso privado
   El banco de preguntas viaja cifrado (AES-GCM 256) y la clave se deriva de
   la contraseña con PBKDF2-SHA256. Sin credenciales correctas no hay contenido.
   ========================================================================= */
(function () {
  "use strict";

  const DATA = {
    auth: "assets/data/auth.json",
    content: "assets/data/content.enc.json"
  };
  const STORAGE_KEY = "ccsa.k";
  const SESSION_FLAG = "ccsa.unlocked";
  const MAX_TRIES = 5;
  const LOCK_MS = 30000;

  const $ = (s) => document.querySelector(s);

  let els = {};
  let failures = 0;
  let lockUntil = 0;

  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bytesToB64 = (bytes) => btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)));
  const enc = new TextEncoder();

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function deriveKey(password, saltB64, iterations) {
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"]
    );
  }

  async function decryptContent(key, payload) {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
      key,
      b64ToBytes(payload.data)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function loadConfig() {
    const res = await fetch(DATA.auth, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load the access configuration.");
    return res.json();
  }

  async function loadPayload() {
    const res = await fetch(DATA.content, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load the question bank.");
    return res.json();
  }

  function applyContent(content) {
    window.COURSE = content.course || {};
    window.MODULES = content.modules || [];
    window.QUESTIONS = content.questions || [];
  }

  function unlockUI() {
    els.gate.hidden = true;
    document.body.classList.remove("is-gated");
    els.gate.setAttribute("aria-hidden", "true");
    if (window.CCSA_APP) window.CCSA_APP.start();
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    els.error.hidden = true;
    els.error.textContent = "";
  }

  function setBusy(busy) {
    els.btn.disabled = busy;
    els.btn.querySelector("span").textContent = busy ? "Verifying…" : "Enter the simulator";
  }

  async function tryUnlockWithStoredKey() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const key = await crypto.subtle.importKey("raw", b64ToBytes(raw), { name: "AES-GCM" }, false, ["decrypt"]);
      const payload = await loadPayload();
      const content = await decryptContent(key, payload);
      applyContent(content);
      unlockUI();
      return true;
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (els.btn.disabled) return;

    const waiting = lockUntil - Date.now();
    if (waiting > 0) {
      showError(`Too many attempts. Wait ${Math.ceil(waiting / 1000)} seconds.`);
      return;
    }

    const username = els.user.value.trim();
    // Normalización acordada: se ignoran espacios al inicio/fin y mayúsculas.
    const password = els.pass.value.trim().toLowerCase();
    if (!username || !password) {
      showError("Type your username and password.");
      return;
    }

    clearError();
    setBusy(true);

    try {
      const config = await loadConfig();
      const payload = await loadPayload();

      const userOk = (await sha256Hex(username.toLowerCase() + "|" + config.salt)) === config.userHash;
      let key = null;
      let content = null;

      try {
        key = await deriveKey(password, config.salt, config.iterations);
        content = await decryptContent(key, payload);
      } catch (e) {
        key = null;
      }

      if (!userOk || !key || !content) {
        failures += 1;
        if (failures >= MAX_TRIES) {
          lockUntil = Date.now() + LOCK_MS;
          failures = 0;
          showError("Wrong credentials. Access locked for 30 seconds.");
        } else {
          showError(`Wrong credentials. ${MAX_TRIES - failures} attempt(s) left.`);
        }
        els.pass.value = "";
        els.pass.focus();
        return;
      }

      failures = 0;
      applyContent(content);

      if (els.remember.checked) {
        const exported = await crypto.subtle.exportKey("raw", key);
        localStorage.setItem(STORAGE_KEY, bytesToB64(exported));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      sessionStorage.setItem(SESSION_FLAG, "1");

      unlockUI();
      if (window.CCSA_APP && document.querySelector("#toast")) {
        const t = document.querySelector("#toast");
        t.textContent = "Signed in. Let's practice!";
        t.classList.add("is-show");
        setTimeout(() => t.classList.remove("is-show"), 2400);
      }
    } catch (err) {
      console.error(err);
      showError(
        location.protocol === "file:"
          ? "Open the site from its published link (not as a local file) so access can be verified."
          : "Could not verify access. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  function bindLogout() {
    const btn = document.getElementById("btnLogout");
    if (!btn) return;
    btn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_FLAG);
      location.reload();
    });
  }

  async function init() {
    els = {
      gate: document.getElementById("gate"),
      form: document.getElementById("loginForm"),
      user: document.getElementById("loginUser"),
      pass: document.getElementById("loginPass"),
      remember: document.getElementById("rememberMe"),
      error: document.getElementById("loginError"),
      btn: document.getElementById("loginBtn"),
      toggle: document.getElementById("togglePass")
    };

    if (!els.gate) return;
    document.body.classList.add("is-gated");
    els.gate.hidden = false;

    bindLogout();

    els.toggle.addEventListener("click", () => {
      const show = els.pass.type === "password";
      els.pass.type = show ? "text" : "password";
      els.toggle.textContent = show ? "Hide" : "Show";
      els.toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      els.pass.focus();
    });

    els.form.addEventListener("submit", handleSubmit);

    if (sessionStorage.getItem(SESSION_FLAG) === "1") {
      const ok = await tryUnlockWithStoredKey();
      if (ok) return;
    }
    if (await tryUnlockWithStoredKey()) return;

    setTimeout(() => els.user.focus(), 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
