/* ==========================================================================
   Your Linux Guide — main.js
   All interactivity in plain (vanilla) JavaScript:
     1. Progress tracking with localStorage
     2. "Mark as Completed" buttons
     3. Homepage progress bar + card completion badges
     4. Copy-to-clipboard buttons on terminal blocks
     5. Navbar topic search (filters + quick jumps)
     6. Back-to-top button
     7. Scroll-reveal animations
     8. Active nav link highlighting
     9. Smooth page-exit fade transitions
    10. Hero "typed command" animation
    11. "Which distro is for you?" quiz
   ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------------------------------------------------
     0. Site data — the full list of learnable topics.
        `id` is the key stored in localStorage, `keywords` power the search.
     ---------------------------------------------------------------------- */
  const TOPICS = [
    { id: "what-is-linux",       num: "01", title: "What Is Linux?",        href: "what-is-linux.html",       icon: "bi-lightbulb",      keywords: "linux intro operating system kernel history gnu open source windows macos" },
    { id: "distributions",       num: "02", title: "Linux Distributions",   href: "distributions.html",       icon: "bi-diagram-3",      keywords: "distro distros debian ubuntu mint arch manjaro fedora opensuse based on flavors" },
    { id: "desktop-environments", num: "03", title: "Desktop Environments", href: "desktop-environments.html", icon: "bi-display",        keywords: "gnome kde plasma xfce cinnamon window manager i3 hyprland de wm gui look" },
    { id: "terminal-and-shell",  num: "04", title: "Terminal & Shell",      href: "terminal-and-shell.html",  icon: "bi-terminal",       keywords: "bash zsh fish command line cli ls cd pwd mkdir rm cp mv cat sudo chmod grep find man commands" },
    { id: "package-managers",    num: "05", title: "Package Managers",      href: "package-managers.html",    icon: "bi-box-seam",       keywords: "apt pacman dnf flatpak snap install remove update software apps store repository" },
    { id: "file-system",         num: "06", title: "The File System",       href: "file-system.html",         icon: "bi-folder2-open",   keywords: "directories folders tree root home etc var usr bin tmp structure path" },
    { id: "users-and-permissions", num: "07", title: "Users & Permissions", href: "users-and-permissions.html", icon: "bi-shield-lock",    keywords: "root sudo admin rwx chmod read write execute 755 644 owner group user" },
    { id: "essential-concepts",  num: "08", title: "Essential Concepts",    href: "essential-concepts.html",  icon: "bi-cpu",            keywords: "kernel wayland x11 display server grub bootloader systemd services repositories" },
    { id: "getting-started",     num: "09", title: "Getting Started",       href: "getting-started.html",     icon: "bi-rocket-takeoff", keywords: "install live usb dual boot virtual machine vm etcher rufus quiz try flash iso" },
    { id: "cheat-sheet",         num: "10", title: "Cheat Sheet",           href: "cheat-sheet.html",         icon: "bi-journal-text",   keywords: "reference commands quick print shortcuts summary table" }
  ];

  /* Extra pages that should show up in the navbar search but are NOT part of
     the 10-topic learning path (no progress tracking, no homepage card). */
  const EXTRAS = [
    { id: "practice", num: "&gt;_", title: "Practice Terminal", href: "practice.html", icon: "bi-play-circle", keywords: "practice terminal live sandbox webterm try commands online browser real interactive playground test" }
  ];

  /* ----------------------------------------------------------------------
     Theme switcher (dark ↔ light)
     A tiny inline <script> in each page's <head> applies the saved theme
     BEFORE first paint (no flash). Here we just wire the navbar toggle
     button and persist the choice alongside the progress data.
     ---------------------------------------------------------------------- */
  const THEME_KEY = "ylg-theme";
  const themeToggle = document.getElementById("themeToggle");

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function setTheme(theme) {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    html.setAttribute("data-bs-theme", theme); // flip Bootstrap's own theme too
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* storage unavailable */ }

    /* The icon/label describe what you'll switch TO */
    if (themeToggle) {
      const toLight = theme === "dark";
      const icon = themeToggle.querySelector("i");
      if (icon) icon.className = "bi " + (toLight ? "bi-sun" : "bi-moon-stars");
      themeToggle.setAttribute("aria-label", toLight ? "Switch to light mode" : "Switch to dark mode");
      themeToggle.title = toLight ? "Switch to light mode" : "Switch to dark mode";
    }
  }

  if (themeToggle) {
    setTheme(currentTheme()); // sync the button with the pre-paint theme
    themeToggle.addEventListener("click", function () {
      const html = document.documentElement;
      html.classList.add("theme-anim"); // brief cross-fade, removed after
      setTheme(currentTheme() === "dark" ? "light" : "dark");
      setTimeout(function () { html.classList.remove("theme-anim"); }, 420);
    });
  }

  /* ----------------------------------------------------------------------
     1–3. Progress tracking (localStorage)
     We store a simple JSON array of completed topic ids, e.g.
     ["what-is-linux","terminal-and-shell"]
     ---------------------------------------------------------------------- */
  const PROGRESS_KEY = "ylg-progress";

  function getProgress() {
    try {
      const value = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      return Array.isArray(value) ? value : [];
    } catch (e) {
      return []; // corrupted data → start fresh
    }
  }

  function isCompleted(id) {
    return getProgress().indexOf(id) !== -1;
  }

  function setCompleted(id, done) {
    const list = getProgress();
    const at = list.indexOf(id);
    if (done && at === -1) list.push(id);
    if (!done && at > -1) list.splice(at, 1);
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(list)); } catch (e) { /* storage may be unavailable */ }
  }

  /* "Mark as Completed" buttons — toggle saved state on click */
  const completeButtons = document.querySelectorAll(".ylg-complete-btn");

  function renderCompleteButtons() {
    completeButtons.forEach(function (btn) {
      const done = isCompleted(btn.dataset.topic);
      btn.classList.toggle("is-done", done);
      btn.setAttribute("aria-pressed", done ? "true" : "false");
      btn.innerHTML = done
        ? '<i class="bi bi-check-circle-fill"></i><span>Completed — nice work!</span>'
        : '<i class="bi bi-circle"></i><span>Mark as Completed</span>';
    });
  }

  completeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setCompleted(btn.dataset.topic, !isCompleted(btn.dataset.topic));
      renderCompleteButtons();
      updateHomeProgress();
    });
  });
  renderCompleteButtons();

  /* Homepage: progress bar + completed state on topic cards */
  function updateHomeProgress() {
    const bar = document.getElementById("progressBar");
    if (!bar) return; // not on the homepage — nothing to update

    const done = getProgress().filter(function (id) {
      return TOPICS.some(function (t) { return t.id === id; });
    }).length;
    const total = TOPICS.length;
    const pct = Math.round((done / total) * 100);

    bar.style.width = pct + "%";
    bar.setAttribute("aria-valuenow", pct);

    const text = document.getElementById("progressText");
    if (text) text.textContent = done + " of " + total + " topics completed";

    const pctEl = document.getElementById("progressPercent");
    if (pctEl) pctEl.textContent = pct + "%";

    const msg = document.getElementById("progressMsg");
    if (msg) {
      if (done === 0)       msg.textContent = "No shortcuts, no pressure — start with topic 01 and work your way down.";
      else if (done < total) msg.textContent = "Keep going! Your progress is saved automatically in this browser.";
      else                   msg.textContent = "All topics completed — you are officially past zero.";
    }
  }

  /* Show a "Completed" badge on homepage cards for finished topics */
  function renderCardStates() {
    document.querySelectorAll("[data-topic-card]").forEach(function (col) {
      col.classList.toggle("is-completed", isCompleted(col.dataset.topicCard));
    });
  }
  renderCardStates();
  updateHomeProgress();

  /* ----------------------------------------------------------------------
     4. Copy-to-clipboard for terminal blocks
     We copy ONLY the command lines (elements with .cmdline), stripping the
     decorative prompt, so what lands on the clipboard is runnable.
     ---------------------------------------------------------------------- */
  function extractCommands(codeEl) {
    const cmdLines = codeEl.querySelectorAll(".cmdline");
    if (cmdLines.length) {
      return Array.prototype.map.call(cmdLines, function (line) {
        const clone = line.cloneNode(true);
        clone.querySelectorAll(".prompt, .cursor, .comment").forEach(function (n) { n.remove(); });
        return clone.textContent.trim();
      }).filter(Boolean).join("\n");
    }
    return codeEl.textContent.trim();
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(fallbackCopy.bind(null, text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const block = btn.closest(".terminal-block");
      const code = block && block.querySelector("pre code");
      if (!code || btn.dataset.busy) return;

      copyText(extractCommands(code)).then(function () {
        btn.dataset.busy = "1";
        const original = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = '<i class="bi bi-check2"></i><span>Copied</span>';
        setTimeout(function () {
          btn.classList.remove("copied");
          btn.innerHTML = original;
          delete btn.dataset.busy;
        }, 1600);
      });
    });
  });

  /* ----------------------------------------------------------------------
     5. Navbar topic search
     Filters the TOPICS list, shows quick-jump results in a dropdown, and —
     on the homepage — also live-filters the topic card grid.
     ---------------------------------------------------------------------- */
  const searchInput = document.getElementById("navSearch");
  const searchResults = document.getElementById("navSearchResults");

  function matchTopics(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return TOPICS.concat(EXTRAS).filter(function (t) {
      return (t.title + " " + t.keywords).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderSearchResults(matches, query) {
    if (!searchResults) return;
    if (!query.trim()) {
      searchResults.classList.remove("show");
      searchResults.innerHTML = "";
      return;
    }
    searchResults.innerHTML = matches.length
      ? matches.map(function (t) {
          return '<a href="' + t.href + '"><span class="num">' + t.num + "</span><i class='bi " + t.icon + "'></i>" + t.title + "</a>";
        }).join("")
      : '<div class="empty">No topics found for &ldquo;' + query.replace(/</g, "&lt;") + "&rdquo;</div>";
    searchResults.classList.add("show");
  }

  /* Live-filter homepage topic cards while typing */
  function filterCards(query) {
    const cards = document.querySelectorAll("[data-topic-card]");
    if (!cards.length) return;
    const q = query.trim().toLowerCase();
    let visible = 0;
    cards.forEach(function (col) {
      const topic = TOPICS.find(function (t) { return t.id === col.dataset.topicCard; });
      const show = !q || (topic && (topic.title + " " + topic.keywords).toLowerCase().indexOf(q) !== -1);
      col.classList.toggle("d-none", !show);
      if (show) visible++;
    });
    const notice = document.getElementById("noResults");
    if (notice) notice.classList.toggle("d-none", visible > 0);
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      renderSearchResults(matchTopics(searchInput.value), searchInput.value);
      filterCards(searchInput.value);
    });

    searchInput.addEventListener("focus", function () {
      if (searchInput.value.trim()) renderSearchResults(matchTopics(searchInput.value), searchInput.value);
    });

    /* Enter jumps straight to the first match */
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = matchTopics(searchInput.value)[0];
        if (first) window.location.href = first.href;
      }
      if (e.key === "Escape") {
        searchInput.value = "";
        renderSearchResults([], "");
        filterCards("");
        searchInput.blur();
      }
    });

    /* Small delay so result links stay clickable before hiding */
    document.addEventListener("click", function (e) {
      if (searchResults && !e.target.closest(".ylg-search")) searchResults.classList.remove("show");
    });
  }

  /* ----------------------------------------------------------------------
     6. Back-to-top button
     ---------------------------------------------------------------------- */
  const backTop = document.getElementById("backToTop");
  if (backTop) {
    window.addEventListener("scroll", function () {
      backTop.classList.toggle("show", window.scrollY > 500);
    }, { passive: true });
    backTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ----------------------------------------------------------------------
     7. Scroll-reveal — elements with .reveal fade up when they enter view
     ---------------------------------------------------------------------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target); // animate once
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ----------------------------------------------------------------------
     8. Highlight the current page in the navbar
     ---------------------------------------------------------------------- */
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar-nav .nav-link, .navbar-nav .dropdown-item").forEach(function (link) {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
      const dropdown = link.closest(".dropdown");
      if (dropdown) {
        const toggle = dropdown.querySelector(".dropdown-toggle");
        if (toggle) toggle.classList.add("active");
      }
    }
  });

  /* ----------------------------------------------------------------------
     9. Smooth page-exit fade for internal .html links
     ---------------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest('a[href$=".html"]');
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    e.preventDefault();
    document.body.classList.add("page-leave");
    setTimeout(function () { window.location.href = url.href; }, 160);
  });

  /* ----------------------------------------------------------------------
     10. Hero typed-command animation (homepage only)
     ---------------------------------------------------------------------- */
  const typed = document.getElementById("typedCommand");
  if (typed) {
    const commands = [
      "sudo apt install knowledge",
      "cd ~/linux-adventure",
      "ls /your/new/skills",
      "man learning --section=linux"
    ];
    let lineIndex = 0, charIndex = 0, deleting = false;

    (function tick() {
      const line = commands[lineIndex];
      if (!deleting) {
        charIndex++;
        typed.textContent = line.slice(0, charIndex);
        if (charIndex === line.length) {
          deleting = true;
          return setTimeout(tick, 1800); // hold the full command
        }
        return setTimeout(tick, 45 + Math.random() * 55); // human-ish typing
      }
      charIndex--;
      typed.textContent = line.slice(0, charIndex);
      if (charIndex <= 0) {
        deleting = false;
        lineIndex = (lineIndex + 1) % commands.length;
        return setTimeout(tick, 400);
      }
      return setTimeout(tick, 24);
    })();
  }

  /* ----------------------------------------------------------------------
     11. "Which distro is for you?" quiz (getting-started.html only)

     Each answer awards points to one or more distros. At the end, the
     distro with the highest score wins (ties resolve in this order:
     mint > ubuntu > fedora > arch — friendliest first).
     ---------------------------------------------------------------------- */
  const quizBox = document.getElementById("quizBody");
  if (quizBox) {
    const QUESTIONS = [
      {
        q: "How would you describe your computer experience?",
        answers: [
          { text: "Total beginner — I've only ever used Windows or macOS.", points: { mint: 2, ubuntu: 1 } },
          { text: "Comfortable — I enjoy learning how my computer works.",  points: { ubuntu: 2, fedora: 1 } },
          { text: "Power user — I love tinkering and customising.",          points: { arch: 2, fedora: 1 } }
        ]
      },
      {
        q: "What matters most to you in an operating system?",
        answers: [
          { text: "Stability — it should simply work, every single day.",    points: { mint: 2, ubuntu: 1 } },
          { text: "Freshness — I want the newest features quickly.",         points: { fedora: 2, arch: 1 } },
          { text: "Control — I want to build my system exactly my way.",     points: { arch: 2 } }
        ]
      },
      {
        q: "How do you feel about using the terminal?",
        answers: [
          { text: "I'd rather avoid it for now, to be honest.",              points: { mint: 2, ubuntu: 1 } },
          { text: "I'm curious — happy to learn it gradually.",              points: { ubuntu: 1, fedora: 2 } },
          { text: "Command line? Sign me up. I want to live in it.",         points: { arch: 2 } }
        ]
      },
      {
        q: "What will you mainly use Linux for?",
        answers: [
          { text: "Everyday stuff — browsing, documents, media.",            points: { mint: 2, ubuntu: 1 } },
          { text: "Work and development in a polished environment.",         points: { fedora: 2, ubuntu: 1 } },
          { text: "Learning Linux deeply by building my own setup.",         points: { arch: 2 } }
        ]
      }
    ];

    const RESULTS = {
      mint: {
        name: "Linux Mint", icon: "bi-cup-hot", badge: "Beginner friendly",
        desc: "Perfect first step. Mint looks familiar (taskbar, start-menu-like launcher), is rock-stable, includes everything you need out of the box, and almost never makes you open a terminal until you're ready."
      },
      ubuntu: {
        name: "Ubuntu", icon: "bi-globe2", badge: "The popular all-rounder",
        desc: "The most widely used desktop distro — huge community, endless tutorials, and great hardware support. If you ever get stuck, someone's answered your exact question online."
      },
      fedora: {
        name: "Fedora Workstation", icon: "bi-lightning-charge", badge: "Modern & polished",
        desc: "A sleek, up-to-date GNOME desktop with the newest Linux tech, maintained by Red Hat. Excellent for developers and anyone who likes a clean, current system."
      },
      arch: {
        name: "Arch Linux", icon: "bi-puzzle", badge: "For the tinkerers",
        desc: "A rolling-release, build-it-yourself distro. You'll assemble your own system piece by piece and learn a LOT along the way — the famous Arch Wiki will be your best friend."
      }
    };

    const KEYS = ["A", "B", "C", "D"];
    const quizBar = document.getElementById("quizBar");
    const quizStep = document.getElementById("quizStep");
    let current = 0;
    let scores = {};

    function renderQuestion() {
      const q = QUESTIONS[current];
      if (quizBar) quizBar.style.width = Math.round((current / QUESTIONS.length) * 100) + "%";
      if (quizStep) quizStep.textContent = "Question " + (current + 1) + " / " + QUESTIONS.length;

      quizBox.innerHTML =
        '<div class="quiz-anim">' +
          '<p class="quiz-q">' + q.q + "</p>" +
          q.answers.map(function (a, i) {
            return '<button class="quiz-answer" data-answer="' + i + '"><span class="key">' + KEYS[i] + "</span>" + a.text + "</button>";
          }).join("") +
        "</div>";
    }

    function renderResult() {
      if (quizBar) quizBar.style.width = "100%";
      if (quizStep) quizStep.textContent = "Recommended for you";

      /* Highest score wins; ties resolve friendliest-first */
      const winner = ["mint", "ubuntu", "fedora", "arch"].reduce(function (best, key) {
        return (scores[key] || 0) > (scores[best] || 0) ? key : best;
      }, "mint");
      const r = RESULTS[winner];

      quizBox.innerHTML =
        '<div class="quiz-result quiz-anim">' +
          '<div class="result-icon"><i class="bi ' + r.icon + '"></i></div>' +
          '<span class="badge">' + r.badge + "</span>" +
          '<h4 class="mt-3 mb-2">' + r.name + "</h4>" +
          '<p class="text-muted-custom mx-auto" style="max-width:460px">' + r.desc + "</p>" +
          '<div class="d-flex flex-wrap gap-2 justify-content-center mt-4">' +
            '<a href="distributions.html" class="btn-ylg btn text-decoration-none"><i class="bi bi-diagram-3"></i> Learn about distros</a>' +
            '<button class="btn-ylg-outline btn" id="quizRetake"><i class="bi bi-arrow-counterclockwise"></i> Retake quiz</button>' +
          "</div>" +
        "</div>";
    }

    /* Delegate clicks for answer buttons + the retake button */
    quizBox.addEventListener("click", function (e) {
      const answerBtn = e.target.closest("[data-answer]");
      if (answerBtn) {
        const points = QUESTIONS[current].answers[Number(answerBtn.dataset.answer)].points;
        Object.keys(points).forEach(function (k) { scores[k] = (scores[k] || 0) + points[k]; });
        current++;
        current < QUESTIONS.length ? renderQuestion() : renderResult();
        return;
      }
      if (e.target.closest("#quizRetake")) {
        current = 0;
        scores = {};
        renderQuestion();
        document.getElementById("quiz").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    renderQuestion();
  }

  /* ----------------------------------------------------------------------
     12. Real Linux terminal, embedded in-panel (practice.html)
     sandbox.bio's official /embed endpoint in an iframe INSIDE our panel —
     same URL params and iframe attributes as their own embed script
     (https://sandbox.bio/training/embed). Their postMessage protocol:
       iframe → parent : { source:"sandbox.bio", type:"ready" }
       parent → iframe : { source:"sandbox.bio", type:"run", command }
     Hard-won lessons encoded below:
     · The iframe must stay VISIBLE while loading (a display:none +
       loading="lazy" iframe is never fetched). Overlays go on top instead.
     · The embed page draws its own 40px header bar; #sbFrame is positioned
       40px above the panel (styles.css) to clip it out of sight, and the
       height passed as `h` is compensated by the same 40px.
     ---------------------------------------------------------------------- */
  const SB_BAR = 40; // height of the embed page's internal header bar (px)
  const sbFrame = document.getElementById("sbFrame");
  if (sbFrame) {
    const SB_ORIGIN = "https://sandbox.bio";
    const sbEmbed   = document.getElementById("sbEmbed");
    const sbBody    = document.getElementById("sbBody");
    const sbPh      = document.getElementById("sbPlaceholder");
    const sbLoading = document.getElementById("sbLoading");
    const sbLaunch  = document.getElementById("sbLaunch");
    const sbChip    = document.getElementById("sbChip");
    const sbReset   = document.getElementById("sbReset");
    const sbFs      = document.getElementById("sbFullscreen");
    const runBtns   = document.querySelectorAll("[data-run]");
    let sbReady = false;
    let sbLaunched = false;
    const sbQueue = [];

    function chip(icon, label, ready) {
      if (!sbChip) return;
      sbChip.innerHTML = '<i class="bi ' + icon + '"></i><span>' + label + "</span>";
      sbChip.classList.toggle("is-ready", !!ready);
    }

    function sbSend(command) {
      if (sbReady && sbFrame.contentWindow) {
        sbFrame.contentWindow.postMessage({ source: "sandbox.bio", type: "run", command: command }, SB_ORIGIN);
      } else {
        sbQueue.push(command);
      }
    }

    function sbLoad() {
      if (sbLaunched) return;
      sbLaunched = true;
      sbPh.classList.add("d-none");
      sbLoading.classList.remove("d-none");
      chip("bi-hourglass-split", "booting…", false);
      /* `h` mirrors their embed.js height param; +SB_BAR compensates for the
         clipped internal header so the terminal fills the visible panel. */
      const h = Math.max(300, (sbBody.clientHeight || 560)) + SB_BAR;
      sbFrame.src = sbFrame.dataset.src + "&h=" + h;
      setTimeout(function () {
        if (!sbReady) {
          chip("bi-wifi-off", "offline", false);
          sbLoading.innerHTML = '<i class="bi bi-wifi-off" style="font-size:1.4rem"></i>' +
            '<span>The real terminal couldn\u2019t load \u2014 no worries:<br>' +
            'use the <b>built-in terminal</b> below instead (it works offline).</span>';
          const d = document.getElementById("builtinDetails");
          if (d) d.open = true;
        }
      }, 40000);
    }

    /* The shell's "ready" handshake — same message their embed.js listens for */
    window.addEventListener("message", function (e) {
      if (e.origin !== SB_ORIGIN) return;
      if (sbFrame.contentWindow && e.source && e.source !== sbFrame.contentWindow) return;
      const msg = e.data;
      if (!msg || msg.source !== "sandbox.bio") return;
      if (msg.type === "ready") {
        sbReady = true;
        sbLoading.classList.add("d-none");
        chip("bi-check-circle", "ready", true);
        if (sbReset) sbReset.disabled = false;
        if (sbFs) sbFs.disabled = false;
        while (sbQueue.length) sbSend(sbQueue.shift());
      }
    });

    if (sbLaunch) sbLaunch.addEventListener("click", sbLoad);

    /* Reset = reload the frame → a completely fresh Linux system */
    if (sbReset) sbReset.addEventListener("click", function () {
      sbReady = false;
      chip("bi-hourglass-split", "booting…", false);
      sbLoading.classList.remove("d-none");
      sbLoading.innerHTML = '<div class="spinner-border" role="status" aria-hidden="true"></div><span>Rebooting a fresh system…</span>';
      sbFrame.src = sbFrame.src; // re-assigning src reloads a cross-origin iframe
    });

    /* Run buttons: extract clean commands (no prompts, no comments — same
       rules as Copy) and type them into the terminal, launching if needed. */
    runBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const block = btn.closest(".terminal-block");
        const code = block && block.querySelector("pre code");
        if (!code) return;
        const cmdLines = code.querySelectorAll(".cmdline");
        const command = Array.prototype.map.call(cmdLines, function (line) {
          const clone = line.cloneNode(true);
          clone.querySelectorAll(".prompt, .cursor, .comment").forEach(function (n) { n.remove(); });
          return clone.textContent.trim();
        }).filter(Boolean).join("\n");
        if (!command) return;

        if (!sbLaunched) sbLoad();
        sbSend(command);
        sbEmbed.scrollIntoView({ behavior: "smooth", block: "center" });

        const original = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check2"></i><span>' + (sbReady ? "Sent" : "Queued") + "</span>";
        setTimeout(function () { btn.innerHTML = original; }, 1400);
      });
    });

    /* Fullscreen (native API + CSS fallback) */
    function sbSyncFs() {
      const active = document.fullscreenElement === sbEmbed || sbEmbed.classList.contains("is-fs-fallback");
      const icon = sbFs && sbFs.querySelector("i");
      if (icon) icon.className = "bi " + (active ? "bi-fullscreen-exit" : "bi-arrows-fullscreen");
      const label = sbFs && sbFs.querySelector("span");
      if (label) label.textContent = active ? "Exit" : "Fullscreen";
    }
    function sbFsOff() {
      sbEmbed.classList.remove("is-fs-fallback");
      document.documentElement.classList.remove("ylg-noscroll");
      sbSyncFs();
    }
    if (sbFs) {
      sbFs.addEventListener("click", function () {
        if (sbEmbed.classList.contains("is-fs-fallback")) return sbFsOff();
        if (document.fullscreenElement === sbEmbed) return document.exitFullscreen();
        if (sbEmbed.requestFullscreen) {
          sbEmbed.requestFullscreen().catch(function () {
            sbEmbed.classList.add("is-fs-fallback");
            document.documentElement.classList.add("ylg-noscroll");
            sbSyncFs();
          });
        } else {
          sbEmbed.classList.add("is-fs-fallback");
          document.documentElement.classList.add("ylg-noscroll");
          sbSyncFs();
        }
      });
      document.addEventListener("fullscreenchange", sbSyncFs);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && sbEmbed.classList.contains("is-fs-fallback")) sbFsOff();
      });
    }
  }

  /* Fill every ".js-year" element with the current year (footer) */
  document.querySelectorAll(".js-year").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
