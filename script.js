/* LingoFlow — keyless text translator
 * Primary engine : Google Translate web endpoint (translate.googleapis.com, no API key)
 * Fallback engine: MyMemory translation API (api.mymemory.translated.net)
 */

(() => {
  "use strict";

  /* ----------------------------- Languages ----------------------------- */
  const LANGUAGES = [
    { code: "ar", name: "Arabic" },
    { code: "bn", name: "Bengali" },
    { code: "bg", name: "Bulgarian" },
    { code: "ca", name: "Catalan" },
    { code: "zh-CN", name: "Chinese (Simplified)" },
    { code: "zh-TW", name: "Chinese (Traditional)" },
    { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" },
    { code: "nl", name: "Dutch" },
    { code: "en", name: "English" },
    { code: "fi", name: "Finnish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "el", name: "Greek" },
    { code: "gu", name: "Gujarati" },
    { code: "he", name: "Hebrew" },
    { code: "hi", name: "Hindi" },
    { code: "hu", name: "Hungarian" },
    { code: "id", name: "Indonesian" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "kn", name: "Kannada" },
    { code: "ko", name: "Korean" },
    { code: "ml", name: "Malayalam" },
    { code: "mr", name: "Marathi" },
    { code: "ne", name: "Nepali" },
    { code: "no", name: "Norwegian" },
    { code: "pa", name: "Punjabi" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
    { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" },
    { code: "sk", name: "Slovak" },
    { code: "es", name: "Spanish" },
    { code: "sw", name: "Swahili" },
    { code: "sv", name: "Swedish" },
    { code: "ta", name: "Tamil" },
    { code: "te", name: "Telugu" },
    { code: "th", name: "Thai" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
    { code: "ur", name: "Urdu" },
    { code: "vi", name: "Vietnamese" },
  ];

  const MAX_CHARS = 5000;
  const DEBOUNCE_MS = 900;
  const SETTINGS_KEY = "lingoflow-settings";

  /* ------------------------------ Elements ----------------------------- */
  const $ = (id) => document.getElementById(id);

  const sourceLangEl = $("sourceLang");
  const targetLangEl = $("targetLang");
  const sourceTextEl = $("sourceText");
  const outputEl = $("outputText");
  const charCountEl = $("charCount");
  const statusEl = $("statusBadge");
  const detectedEl = $("detectedBadge");
  const errorEl = $("errorBox");
  const engineEl = $("engineLabel");
  const translateBtn = $("translateBtn");
  const geminiKeyEl = $("geminiKey");
  const geminiModelEl = $("geminiModel");
  const engineOrderEl = $("engineOrder");

  /* --------------------------- State / helpers ------------------------- */
  let debounceTimer = null;
  let abortController = null;

  // Optional Gemini API key settings (persisted in localStorage only).
  const settings = { key: "", model: "gemini-2.5-flash", order: "free" };

  const langName = (code) =>
    LANGUAGES.find((l) => l.code.toLowerCase() === String(code).toLowerCase())?.name || code;

  function populateSelects() {
    for (const lang of LANGUAGES) {
      const optSource = new Option(lang.name, lang.code);
      const optTarget = new Option(lang.name, lang.code);
      targetLangEl.add(optTarget);
      sourceLangEl.add(optSource);
    }
    sourceLangEl.value = "auto";
    targetLangEl.value = "es";
  }

  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.className = "badge" + (kind ? ` badge--${kind}` : "");
  }

  function showError(message) {
    errorEl.classList.remove("error--warn");
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function showWarning(message) {
    errorEl.classList.add("error--warn");
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function setBusy(busy) {
    translateBtn.disabled = busy;
    translateBtn.classList.toggle("is-busy", busy);
    outputEl.classList.toggle("is-loading", busy);
  }

  /* ------------------------------- Engines ----------------------------- */
  /** Primary: Google Translate (gtx) web endpoint — no key, CORS enabled. */
  async function translateGoogle(text, source, target, signal) {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      `?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}` +
      `&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Google Translate responded with HTTP ${res.status}`);

    const data = await res.json();
    const translated = (data?.[0] || [])
      .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
      .join("");
    const detected = typeof data?.[2] === "string" ? data[2] : null;

    if (!translated) throw new Error("Empty response from Google Translate");
    return { translated, detected, engine: "Google Translate" };
  }

  /** Fallback: MyMemory — no key, but requires an explicit source language. */
  async function translateMyMemory(text, source, target, signal) {
    const from = source === "auto" ? "en" : source; // MyMemory has no auto-detect
    const url =
      "https://api.mymemory.translated.net/get" +
      `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(target)}`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`MyMemory responded with HTTP ${res.status}`);

    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || data.responseStatus >= 400) {
      throw new Error(data?.responseDetails || "Empty response from MyMemory");
    }
    return {
      translated,
      detected: source === "auto" ? null : from,
      engine: "MyMemory",
      note: source === "auto" ? "MyMemory cannot auto-detect — English was assumed as the source language." : null,
    };
  }

  /** Optional: Google Gemini API — used when the user adds a key (free tier available). */
  async function translateGemini(text, source, target, signal) {
    const prompt = [
      `Translate the text below into ${langName(target)}.`,
      source === "auto"
        ? "First detect the language of the input."
        : `The input is written in ${langName(source)}.`,
      'Reply with JSON only, in this exact shape: {"detected":"<BCP-47 code of the input language>","translation":"<translated text>"}',
      "No markdown, no notes, no explanations.",
      "TEXT:",
      '"""',
      text,
      '"""',
    ].join("\n");

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}` +
      `:generateContent?key=${encodeURIComponent(settings.key)}`;

    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        message = errBody?.error?.message || message;
      } catch { /* non-JSON error body */ }
      throw new Error(`Gemini ${res.status}: ${message}`);
    }

    const data = await res.json();
    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!raw) {
      const blocked = data?.promptFeedback?.blockReason;
      throw new Error(blocked ? `Gemini blocked the request (${blocked})` : "Gemini returned an empty response");
    }

    let translated = raw;
    let detected = null;
    try {
      const parsed = JSON.parse(raw);
      translated = parsed.translation ?? parsed.text ?? raw;
      detected = parsed.detected || null;
    } catch {
      /* model answered with plain text instead of JSON — use it as-is */
    }

    if (!translated) throw new Error("Gemini returned an empty translation");
    return { translated, detected, engine: `Gemini (${settings.model})` };
  }

  /**
   * Engine chain, honouring the user's key and priority choice:
   *   free      -> Google gtx -> MyMemory -> Gemini (only if a key is saved)
   *   gemini    -> Gemini -> Google gtx -> MyMemory
   *   free-only -> Google gtx -> MyMemory
   */
  function getEngines() {
    const freeEngines = [
      { id: "google", name: "Google Translate", fn: translateGoogle },
      { id: "mymemory", name: "MyMemory", fn: translateMyMemory },
    ];
    const hasKey = Boolean(settings.key);
    if (!hasKey || settings.order === "free-only") return freeEngines;

    const gemini = { id: "gemini", name: "Gemini", fn: translateGemini };
    return settings.order === "gemini"
      ? [gemini, ...freeEngines]
      : [...freeEngines, gemini];
  }

  /* ----------------------------- Translation --------------------------- */
  async function translate() {
    const text = sourceTextEl.value.trim();
    const source = sourceLangEl.value;
    const target = targetLangEl.value;

    showError("");

    if (!text) {
      outputEl.textContent = "";
      detectedEl.hidden = true;
      setStatus("Ready");
      return;
    }

    if (source !== "auto" && source === target) {
      outputEl.textContent = sourceTextEl.value;
      setStatus("Same language");
      engineEl.textContent = "Engine: not needed";
      return;
    }

    // Cancel any in-flight request.
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const { signal } = abortController;

    setBusy(true);
    setStatus("Translating…", "busy");

    const engines = getEngines();
    const failures = [];
    let result = null;
    let servedBy = null;

    for (const engine of engines) {
      try {
        result = await engine.fn(text, source, target, signal);
        servedBy = engine;
        break;
      } catch (err) {
        if (err.name === "AbortError") return; // superseded by a newer request
        failures.push({ engine, message: err.message });
      }
      if (signal.aborted) return;
    }

    if (!result) {
      setBusy(false);
      setStatus("Failed", "error");
      showError(
        "Translation failed on every engine. " +
          failures.map((f) => `${f.engine.name}: ${f.message}`).join(" · ") +
          " — check your internet connection and try again."
      );
      return;
    }

    outputEl.textContent = result.translated;
    engineEl.textContent = `Engine: ${result.engine || servedBy.name}`;
    setStatus("Translated ✓");

    // Surface fallback causes instead of hiding them behind a "Translated ✓".
    const notes = [];
    const geminiFailure = failures.find((f) => f.engine.id === "gemini");
    if (geminiFailure) {
      notes.push(`Gemini did not answer (${geminiFailure.message}) — translated via ${servedBy.name} instead.`);
    }
    if (result.note) notes.push(result.note);
    if (notes.length) showWarning(notes.join(" "));

    if (result.detected && source === "auto") {
      detectedEl.textContent = `Detected: ${langName(result.detected)}`;
      detectedEl.hidden = false;
    } else {
      detectedEl.hidden = true;
    }

    setBusy(false);
  }

  function scheduleTranslation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(translate, DEBOUNCE_MS);
  }

  /* ------------------------------- Actions ----------------------------- */
  async function copyText(text, button) {
    if (!text) return;
    let copied = false;

    // Modern API first (needs a user gesture / permission).
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        /* denied or unavailable — fall back to the legacy path */
      }
    }

    // Legacy fallback: works without the async clipboard permission.
    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        copied = document.execCommand("copy");
        ta.remove();
      } catch {
        copied = false;
      }
    }

    flashLabel(button, copied ? "✓" : "✗");
  }

  function flashLabel(button, symbol) {
    const original = button.textContent;
    button.textContent = symbol;
    setTimeout(() => (button.textContent = original), 1100);
  }

  /* --------------------------- Text-to-speech --------------------------
     Devices rarely have voices for every language (this machine only has
     English!), so playback picks the fastest source that can actually
     speak the requested language:
       1. a matching LOCAL voice (instant, offline)
       2. otherwise an ONLINE voice via the local server's /api/tts proxy
          (Google Translate TTS, keyless — any language, ~180-char chunks)
       3. otherwise the default voice + an honest tip about installing voices
     Voices are cached, chunks are prefetched, and everything is cancellable.
  ---------------------------------------------------------------------- */
  let voiceList = [];
  let speakingButton = null;
  let noticeTimer = null;
  let noticeSnapshot = null;
  let playingAudio = null;
  const ttsCache = new Map(); // "lang|text" -> object URL

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    voiceList = window.speechSynthesis.getVoices() || [];
  }

  /** Wait (briefly!) for Chrome's async voice list without slowing speech down. */
  function ensureVoices(timeoutMs = 150) {
    refreshVoices();
    if (voiceList.length || !("speechSynthesis" in window)) return Promise.resolve(voiceList);

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.speechSynthesis.removeEventListener("voiceschanged", finish);
        refreshVoices();
        resolve(voiceList);
      };
      window.speechSynthesis.addEventListener("voiceschanged", finish);
      setTimeout(finish, timeoutMs); // never make the user wait for audio
    });
  }

  /** Best voice for a language code: exact match, then base-language match. */
  function findVoice(langCode) {
    if (!voiceList.length) refreshVoices();
    const wanted = String(langCode || "").toLowerCase();
    if (!voiceList.length || !wanted || wanted === "auto") return null;

    const base = wanted.split("-")[0];
    return (
      voiceList.find((v) => v.lang.toLowerCase().replace("_", "-") === wanted) ||
      voiceList.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base) ||
      null
    );
  }

  /** Split text into short chunks — long single utterances get cut off in Chrome. */
  function chunkText(text, max = 180) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const chunks = [];
    let line = "";
    for (const word of words) {
      if (line && (line + " " + word).length > max) {
        chunks.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) chunks.push(line);
    return chunks.length ? chunks : [text];
  }

  /** Temporary amber note that restores whatever warning was shown before. */
  function flashNotice(message, durationMs = 4000) {
    clearTimeout(noticeTimer);
    if (!noticeSnapshot) {
      noticeSnapshot = {
        text: errorEl.textContent,
        hidden: errorEl.hidden,
        warn: errorEl.classList.contains("error--warn"),
      };
    }
    showWarning(message);
    noticeTimer = setTimeout(() => {
      const snap = noticeSnapshot;
      noticeSnapshot = null;
      if (!snap) return;
      if (snap.hidden) showError("");
      else if (snap.warn) showWarning(snap.text);
      else showError(snap.text);
    }, durationMs);
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (playingAudio) {
      playingAudio.pause();
      playingAudio.removeAttribute("src");
      playingAudio = null;
    }
    speakingButton?.classList.remove("is-speaking");
    speakingButton = null;
  }

  function finishSpeaking(button) {
    button.classList.remove("is-speaking");
    if (speakingButton === button) speakingButton = null;
  }

  /** Local playback through the Web Speech API, in ~180-char chunks. */
  function speakWithVoice(text, voice, lang, button) {
    const chunks = chunkText(text);
    let index = 0;

    const next = () => {
      if (speakingButton !== button) return; // stopped or taken over
      if (index >= chunks.length) {
        finishSpeaking(button);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      if (voice) utterance.voice = voice;
      utterance.lang = lang;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = next;
      utterance.onerror = (event) => {
        // "interrupted"/"canceled" = the user pressed stop — not a failure.
        if (event.error === "interrupted" || event.error === "canceled") return;
        finishSpeaking(button);
      };
      window.speechSynthesis.speak(utterance);
    };

    next();
  }

  /* Online voices: GET /api/tts?text=…&lang=… -> MP3.
     The page may be served by *any* static server (Live Server, file://,
     python -m http.server) that has no /api/tts route — so when the same
     origin 404s we hunt for `server.py` on its default ports instead of
     giving up. The working origin is remembered for later visits. */
  const TTS_CANDIDATE_ORIGINS = ["", "http://localhost:8123", "http://127.0.0.1:8123"];
  let ttsOrigin = "";
  try {
    ttsOrigin = localStorage.getItem("lingoflow-tts-origin") || "";
  } catch {
    /* storage blocked — origin rediscovery just takes one extra request */
  }

  function canUseOnlineVoices() {
    return true; // same-origin or via a discovered local voice server
  }

  function rememberTtsOrigin(origin) {
    ttsOrigin = origin;
    try {
      if (origin) localStorage.setItem("lingoflow-tts-origin", origin);
      else localStorage.removeItem("lingoflow-tts-origin");
    } catch {
      /* ignore */
    }
  }

  /** Origins to probe, most likely first; http:// fallbacks are dropped on https pages. */
  function ttsOriginsToTry() {
    const seen = [];
    for (const origin of [ttsOrigin, ...TTS_CANDIDATE_ORIGINS]) {
      if (seen.includes(origin)) continue;
      if (origin.startsWith("http://") && location.protocol === "https:") continue; // mixed content
      seen.push(origin);
    }
    return seen;
  }

  const isConnectionProblem = (message) =>
    message === "no-server" ||
    /^failed to fetch/i.test(message) ||
    /^networkerror/i.test(message) ||
    /load failed/i.test(message);

  function loadTtsChunk(text, lang) {
    const key = `${lang}|${text}`;
    if (ttsCache.has(key)) return Promise.resolve(ttsCache.get(key));

    const query = `?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`;
    const origins = ttsOriginsToTry();

    const tryAt = (i) => {
      if (i >= origins.length) throw new Error("no-server"); // nothing answered anywhere
      const origin = origins[i];
      return fetch(`${origin}/api/tts${query}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.status === 404 ? "no-server" : `HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (origin !== ttsOrigin) rememberTtsOrigin(origin); // remember the winner
          const url = URL.createObjectURL(blob);
          ttsCache.set(key, url);
          return url;
        })
        .catch((err) => {
          const message = String(err.message || err);
          // A real server answered (e.g. 502) — no point hunting other ports.
          if (!isConnectionProblem(message)) throw err;
          if (origin === ttsOrigin) rememberTtsOrigin(""); // remembered origin is stale
          return tryAt(i + 1);
        });
    };

    return tryAt(0);
  }

  /**
   * Speak in ANY language using the server-side voice proxy.
   * Chunked + prefetched so playback is continuous; on failure it drops back
   * to the default local voice instead of staying silent.
   */
  function speakOnline(text, langCode, button) {
    const chunks = chunkText(text);
    const player = new Audio();
    let index = 0;
    let fellBack = false;
    playingAudio = player;

    const fail = (reason) => {
      if (playingAudio !== player) return; // already handled
      playingAudio = null;
      player.removeAttribute("src");

      if (reason === "blocked") {
        finishSpeaking(button);
        flashNotice("Playback was blocked by the browser — tap the speaker icon again.", 5000);
        return;
      }
      if (fellBack) {
        finishSpeaking(button);
        return;
      }
      fellBack = true;
      flashNotice(
        reason === "no-server"
          ? 'Voice server not found — run "python server.py" in the project folder, then try again. Using the default voice.'
          : `Online voice for ${langName(langCode)} failed (${reason}) — using the default voice.`,
        6000
      );
      if ("speechSynthesis" in window) speakWithVoice(text, null, langCode, button);
      else finishSpeaking(button);
    };

    const playNext = () => {
      if (playingAudio !== player) return;
      if (index >= chunks.length) {
        playingAudio = null;
        finishSpeaking(button);
        return;
      }
      const current = index;
      loadTtsChunk(chunks[current], langCode)
        .then((url) => {
          if (playingAudio !== player) return; // stopped while loading
          player.src = url;
          const started = player.play();
          if (started && typeof started.catch === "function") {
            started.catch((err) => fail(err.name === "NotAllowedError" ? "blocked" : err.name || "play"));
          }
          // prefetch the next chunk so playback is seamless
          if (current + 1 < chunks.length) {
            loadTtsChunk(chunks[current + 1], langCode).catch(() => {});
          }
        })
        .catch((err) => fail(String(err.message || err)));
    };

    player.addEventListener("ended", () => {
      if (playingAudio !== player) return;
      index += 1;
      playNext();
    });
    player.addEventListener("error", () => fail("load"));

    playNext();
    return true;
  }

  async function speak(text, langCode, button) {
    if (!("speechSynthesis" in window) && !canUseOnlineVoices()) {
      showError("Text-to-speech is not supported in this browser.");
      return;
    }
    if (!text) return;

    // Toggle: pressing the same button stops playback.
    if (speakingButton === button) {
      stopSpeaking();
      return;
    }
    stopSpeaking();

    // Register immediately so a second tap during load still cancels.
    speakingButton = button;
    button.classList.add("is-speaking");

    const voices = await ensureVoices(); // instant if loaded, capped at 150ms
    if (speakingButton !== button) return; // user pressed stop while waiting

    const voice = findVoice(langCode);
    const hasLang = Boolean(langCode) && langCode !== "auto";

    // 1) Local voice for this language: instant and offline.
    if (voice) {
      speakWithVoice(text, voice, voice.lang, button);
      return;
    }

    // 2) No local voice -> online voice: works for EVERY language.
    if (hasLang && canUseOnlineVoices()) {
      speakOnline(text, langCode, button);
      return;
    }

    // 3) Nothing better available: default voice + an honest tip.
    if (hasLang) {
      flashNotice(
        location.protocol === "file:"
          ? `No ${langName(langCode)} voice is installed and online voices need the local server — ` +
            'start the app with "python server.py" for full language audio. Playing with the default voice.'
          : `No ${langName(langCode)} voice is installed — using the default voice. ` +
            "Add voices in Windows Settings → Time & Language → Speech, or open this page in Microsoft Edge.",
        7000
      );
    }
    if ("speechSynthesis" in window) {
      speakWithVoice(text, null, hasLang ? langCode : navigator.language, button);
    } else {
      finishSpeaking(button);
    }
  }

  function swapLanguages() {
    const oldSource = sourceLangEl.value;
    const oldTarget = targetLangEl.value;

    // Language the auto-detect resolved to (if we already translated something).
    const detectedCode = detectedEl.hidden
      ? null
      : LANGUAGES.find((l) => l.name === detectedEl.textContent.replace("Detected: ", ""))?.code;

    const newSource = oldTarget;
    let newTarget = oldSource === "auto" ? detectedCode || "en" : oldSource;

    // Swapping identical languages is pointless — nudge the target.
    if (newSource === newTarget) newTarget = newSource === "en" ? "es" : "en";

    sourceLangEl.value = newSource;
    targetLangEl.value = newTarget;

    // Move the text across as well.
    const outText = outputEl.textContent || "";
    if (outText) {
      sourceTextEl.value = outText;
      outputEl.textContent = "";
      updateCount();
    }
    translate();
  }

  function updateCount() {
    const length = sourceTextEl.value.length;
    charCountEl.textContent = `${length} / ${MAX_CHARS}`;
    charCountEl.style.color = length >= MAX_CHARS ? "var(--danger)" : "";
  }

  /** Language to speak in the source pane — resolves "auto" via the detection badge. */
  function effectiveSourceLang() {
    if (sourceLangEl.value !== "auto") return sourceLangEl.value;
    if (detectedEl.hidden) return "auto"; // nothing detected yet -> browser default
    const name = detectedEl.textContent.replace("Detected:", "").trim();
    return LANGUAGES.find((l) => l.name === name)?.code || "auto";
  }

  /* ------------------------------ API settings -------------------------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(settings, JSON.parse(raw));
    } catch { /* storage unavailable */ }

    geminiKeyEl.value = settings.key;
    geminiModelEl.value = settings.model;
    engineOrderEl.value = settings.order;
    updateKeyIndicator();
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* storage unavailable */ }
    updateKeyIndicator();
  }

  function updateKeyIndicator() {
    $("settingsBtn").classList.toggle("has-key", Boolean(settings.key));
    $("settingsBtn").title = settings.key
      ? "API settings — Gemini key saved"
      : "API settings";
  }

  function setSettingsStatus(message) {
    $("settingsStatus").textContent = message;
  }

  function wireSettings() {
    const panel = $("settingsPanel");
    const openBtn = $("settingsBtn");

    const setOpen = (open) => {
      panel.hidden = !open;
      openBtn.setAttribute("aria-expanded", String(open));
      if (open) geminiKeyEl.focus();
    };

    openBtn.addEventListener("click", () => setOpen(panel.hidden));
    $("closeSettings").addEventListener("click", () => setOpen(false));

    $("toggleKeyVis").addEventListener("click", (e) => {
      const showing = geminiKeyEl.type === "text";
      geminiKeyEl.type = showing ? "password" : "text";
      e.currentTarget.textContent = showing ? "👁" : "🙈";
    });

    $("saveSettings").addEventListener("click", () => {
      settings.key = geminiKeyEl.value.trim();
      settings.model = geminiModelEl.value;
      settings.order = engineOrderEl.value;
      persistSettings();
      setSettingsStatus(
        settings.key ? "Saved ✓ Gemini key active." : "Saved ✓ (no key — free engines only)"
      );
      clearTimeout(debounceTimer);
      translate();
    });

    $("clearKey").addEventListener("click", () => {
      geminiKeyEl.value = "";
      settings.key = "";
      persistSettings();
      setSettingsStatus("Key removed.");
      clearTimeout(debounceTimer);
      translate();
    });

    geminiKeyEl.addEventListener("input", () => setSettingsStatus(""));
  }

  /* ------------------------------- Theme ------------------------------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
    try {
      localStorage.setItem("lingoflow-theme", theme);
    } catch { /* storage unavailable (e.g. private mode) */ }
  }

  /* -------------------------------- Wire up ---------------------------- */
  function init() {
    populateSelects();
    loadSettings();
    wireSettings();
    refreshVoices(); // warm up the voice list (Chrome loads it async)

    // Restore theme preference.
    let saved = null;
    try {
      saved = localStorage.getItem("lingoflow-theme");
    } catch { /* ignore */ }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));

    sourceTextEl.addEventListener("input", () => {
      updateCount();
      scheduleTranslation();
    });

    sourceTextEl.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        clearTimeout(debounceTimer);
        translate();
      }
    });

    sourceLangEl.addEventListener("change", translate);
    targetLangEl.addEventListener("change", translate);

    translateBtn.addEventListener("click", () => {
      clearTimeout(debounceTimer);
      translate();
    });

    $("swapBtn").addEventListener("click", swapLanguages);

    $("clearBtn").addEventListener("click", () => {
      sourceTextEl.value = "";
      outputEl.textContent = "";
      detectedEl.hidden = true;
      showError("");
      setStatus("Ready");
      engineEl.textContent = "Engine: Google Translate";
      updateCount();
      sourceTextEl.focus();
    });

    $("copySourceBtn").addEventListener("click", (e) =>
      copyText(sourceTextEl.value, e.currentTarget)
    );
    $("copyTargetBtn").addEventListener("click", (e) =>
      copyText(outputEl.textContent, e.currentTarget)
    );

    $("speakSourceBtn").addEventListener("click", (e) =>
      speak(sourceTextEl.value, effectiveSourceLang(), e.currentTarget)
    );
    $("speakTargetBtn").addEventListener("click", (e) =>
      speak(outputEl.textContent, targetLangEl.value, e.currentTarget)
    );

    $("themeToggle").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      applyTheme(current === "dark" ? "light" : "dark");
    });

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        sourceTextEl.value = chip.dataset.text;
        targetLangEl.value = chip.dataset.target;
        updateCount();
        clearTimeout(debounceTimer);
        translate();
      });
    });

    // Deep links from the landing page: app.html?text=…&source=…&target=…
    try {
      const params = new URLSearchParams(window.location.search);
      const text = params.get("text");
      const source = params.get("source");
      const target = params.get("target");
      if (text) sourceTextEl.value = text.slice(0, MAX_CHARS);
      if (source && (source === "auto" || LANGUAGES.some((l) => l.code === source))) {
        sourceLangEl.value = source;
      }
      if (target && LANGUAGES.some((l) => l.code === target)) targetLangEl.value = target;
    } catch { /* malformed query string */ }

    updateCount();
    if (sourceTextEl.value.trim()) translate();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
