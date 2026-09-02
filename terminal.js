/* ==========================================================================
   Your Linux Guide — terminal.js
   A self-contained, in-page Linux terminal simulator (practice.html).
   No iframes, no servers, no dependencies — pure vanilla JavaScript, so it
   can never be blocked, throttled or taken offline by a third party.

   What it supports:
     · A virtual file system (in memory — Reset restores the default tree)
     · ~30 real commands with common flags (see COMMANDS below / type `help`)
     · Pipes  |   redirection  >  >>   and chaining  &&  ;
     · Tab completion (commands + paths), ↑/↓ history, Ctrl+L, Ctrl+C
     · Pasting multiple lines runs them one after another
   ========================================================================== */
(function () {
  "use strict";

  const out    = document.getElementById("ylgTermOut");
  const input  = document.getElementById("ylgTermInput");
  const prompt = document.getElementById("ylgTermPrompt");
  const body   = document.getElementById("ylgTermBody");
  if (!out || !input) return; // not on the practice page

  /* ----------------------------------------------------------------------
     1. Virtual file system
     Nodes: { type:"dir", mode, children:{} } | { type:"file", mode, content }
     ---------------------------------------------------------------------- */
  const USER = "user", HOST = "ylg";

  function dir(children, mode) { return { type: "dir",  mode: mode || 755, children: children || {} }; }
  function file(content, mode) { return { type: "file", mode: mode || 644, content: content || "" }; }

  function defaultFS() {
    return dir({
      "bin":  dir({}),
      "etc":  dir({
        "hostname": file(HOST + "\n"),
        "os-release": file('NAME="YLG Linux"\nPRETTY_NAME="YLG Linux (Practice Edition)"\nID=ylg\n')
      }),
      "home": dir({
        [USER]: dir({
          ".bashrc":   file("# ~/.bashrc — runs every time a shell starts\nalias ll='ls -la'\nexport EDITOR=vim\n"),
          "notes.txt": file("Things to remember:\n- the terminal is just a conversation, typed\n- man <command> answers most questions\n- rm has no trash can. Think before -rf!\n"),
          "documents": dir({
            "readme.txt": file("Welcome to your practice home directory!\n\nThis file system is virtual: it lives in this browser tab.\nCreate, move and delete anything - the Reset button restores it all.\n\nIdeas:\n  mkdir projects && cd projects\n  echo \"hello\" > hi.txt\n  cat hi.txt\n"),
            "shopping-list.txt": file("bread\nmilk\ncoffee\ncoffee\ncoffee\napples\n")
          }),
          "pictures": dir({ "tux.png": file("(imagine a penguin here)\n") }),
          "projects": dir({})
        })
      }),
      "tmp":  dir({}),
      "usr":  dir({ "bin": dir({}), "share": dir({}) }),
      "var":  dir({ "log": dir({ "syslog": file("Jan  1 00:00:00 ylg kernel: Welcome to YLG Linux\n") }) })
    });
  }

  let FS  = defaultFS();
  let CWD = "/home/" + USER;
  let nuked = false; // set when someone tries the forbidden rm -rf /

  /* ---- path helpers ---- */
  function normalize(path) {
    if (!path) return CWD;
    if (path === "~") path = "/home/" + USER;
    else if (path.slice(0, 2) === "~/") path = "/home/" + USER + path.slice(1);
    if (path[0] !== "/") path = CWD + "/" + path;
    const parts = [];
    path.split("/").forEach(function (p) {
      if (!p || p === ".") return;
      if (p === "..") parts.pop();
      else parts.push(p);
    });
    return "/" + parts.join("/");
  }
  function nodeAt(path) {
    const abs = normalize(path);
    if (abs === "/") return FS;
    let node = FS;
    const parts = abs.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      if (!node || node.type !== "dir") return null;
      node = node.children[parts[i]];
    }
    return node || null;
  }
  function splitParent(path) {
    const abs = normalize(path);
    const i = abs.lastIndexOf("/");
    return { parentPath: abs.slice(0, i) || "/", name: abs.slice(i + 1) };
  }
  function displayPath(abs) {
    const home = "/home/" + USER;
    if (abs === home) return "~";
    if (abs.indexOf(home + "/") === 0) return "~" + abs.slice(home.length);
    return abs;
  }
  function modeString(node) {
    const m = String(node.mode);
    const bit = function (d) {
      d = Number(d);
      return (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-");
    };
    return (node.type === "dir" ? "d" : "-") + bit(m[0]) + bit(m[1] || 0) + bit(m[2] || 0);
  }
  function walk(path, node, fn) { // depth-first visit: fn(path, node)
    fn(path, node);
    if (node.type === "dir") {
      Object.keys(node.children).sort().forEach(function (name) {
        walk((path === "/" ? "" : path) + "/" + name, node.children[name], fn);
      });
    }
  }
  function globToRegex(glob) {
    return new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
                                .replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  }

  /* ----------------------------------------------------------------------
     2. Commands
     Each command: fn(args, stdin) -> { out, err } (strings, "" if none).
     `stdin` carries piped-in text.
     ---------------------------------------------------------------------- */
  function flags(args) { // split "-la style" flags from positional arguments
    const f = {}, rest = [];
    args.forEach(function (a) {
      if (a[0] === "-" && a.length > 1 && a !== "-" && !/^-?\d+$/.test(a.slice(1)) === false && a[1] !== "-") {
        // numeric like -3 (head/tail) — keep as flag "n"
        f.n = a.slice(1); return;
      }
      if (a[0] === "-" && a !== "-") a.slice(1).split("").forEach(function (c) { f[c] = true; });
      else rest.push(a);
    });
    return { f: f, rest: rest };
  }

  const MANS = {
    ls: "list directory contents. Flags: -a (hidden files), -l (long format)",
    cd: "change the working directory. `cd` alone or `cd ~` goes home; `cd ..` goes up",
    pwd: "print the current working directory",
    cat: "print file contents. Usage: cat <file> [file2 ...]",
    echo: "print text. Redirect into files with > (overwrite) or >> (append)",
    mkdir: "create directories. Flag: -p (create parents as needed)",
    touch: "create an empty file (or update one that exists)",
    rm: "remove files. Flags: -r (recurse into directories), -f (no complaints)",
    cp: "copy files. Flag: -r (copy directories recursively)",
    mv: "move or rename files and directories",
    tree: "draw the directory tree from a path (default: current directory)",
    head: "show the first lines of input (default 10). Usage: head -3 file",
    tail: "show the last lines of input (default 10). Usage: tail -3 file",
    wc: "count lines, words and characters. Flag: -l (lines only)",
    grep: "search for text. Flags: -i (ignore case), -r (search directories)",
    find: "find files. Usage: find <path> -name \"*.txt\"",
    sort: "sort lines of text alphabetically. Flag: -r (reverse)",
    uniq: "drop repeated adjacent lines. Flag: -c (count occurrences)",
    chmod: "change permissions. Usage: chmod 755 <file>  or  chmod +x <file>",
    whoami: "print your user name",
    hostname: "print the machine's name",
    uname: "print system information. Flag: -a (everything)",
    date: "print the current date and time",
    clear: "clear the screen (Ctrl+L works too)",
    history: "show the commands you have typed this session",
    man: "show the manual for a command. Usage: man ls",
    help: "list every command this sandbox understands",
    reset: "restore the file system to its original state",
    sudo: "run a command as the superuser (try it and see)",
    vim: "a famously powerful text editor (see what happens)"
  };

  const COMMANDS = {
    help: function () {
      const names = Object.keys(MANS).sort();
      let s = "This sandbox understands " + names.length + " commands:\n\n";
      names.forEach(function (n) { s += "  " + (n + "        ").slice(0, 10) + MANS[n] + "\n"; });
      s += "\nAlso: pipes (|), redirection (> and >>), chaining (&& and ;),\nTab completion, and Up/Down for history. Try: man <command>";
      return { out: s };
    },
    man: function (a) {
      if (!a.rest[0]) return { err: "What manual page do you want?\nFor example, try 'man ls'." };
      const m = MANS[a.rest[0]];
      return m ? { out: a.rest[0].toUpperCase() + "(1)\n\nNAME\n    " + a.rest[0] + " — " + m + "\n\n(Short sandbox manual — the real `man` pages are far longer.)" }
               : { err: "No manual entry for " + a.rest[0] };
    },
    pwd: function () { return { out: CWD }; },
    whoami: function () { return { out: USER }; },
    hostname: function () { return { out: HOST }; },
    date: function () { return { out: new Date().toString() }; },
    uname: function (a) {
      return { out: a.f.a ? "Linux " + HOST + " 6.8.0-ylg #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux (simulated)" : "Linux" };
    },
    clear: function () { out.innerHTML = ""; return { out: "" }; },
    history: function () {
      return { out: history.map(function (h, i) { return "  " + (i + 1) + "  " + h; }).join("\n") };
    },
    reset: function () { resetFS(); return { out: "File system restored to its original state." }; },
    sudo: function (a) {
      if (!a.rest.length) return { err: "usage: sudo <command>" };
      return { err: USER + " is not in the sudoers file.  This incident will be reported.\n(No root here — but nothing in this sandbox needs it. Carry on!)" };
    },
    vim: function () {
      return { err: "Entering vim...\n...\n...you are now trapped in vim. Just kidding — this sandbox spares you.\n(On a real system, :q! quits. People genuinely search for this.)" };
    },

    ls: function (a) {
      const target = a.rest[0] || ".";
      const node = nodeAt(target);
      if (!node) return { err: "ls: cannot access '" + a.rest[0] + "': No such file or directory" };
      if (node.type === "file") return { out: a.rest[0] };
      let names = Object.keys(node.children).sort();
      if (!a.f.a) names = names.filter(function (n) { return n[0] !== "."; });
      else names = [".", ".."].concat(names);
      if (a.f.l) {
        return { out: names.map(function (n) {
          const c = n === "." ? node : n === ".." ? (nodeAt(normalize(target + "/..")) || node) : node.children[n];
          const size = c.type === "file" ? String(c.content.length) : "4096";
          return modeString(c) + "  " + USER + " " + USER + "  " + ("      " + size).slice(-6) + "  " + n + (c.type === "dir" ? "/" : "");
        }).join("\n") };
      }
      return { out: names.map(function (n) {
        const c = n === "." || n === ".." ? null : node.children[n];
        return c && c.type === "dir" ? n + "/" : n;
      }).join("  ") };
    },

    cd: function (a) {
      const target = a.rest[0] || "~";
      const node = nodeAt(target);
      if (!node) return { err: "cd: no such file or directory: " + target };
      if (node.type !== "dir") return { err: "cd: not a directory: " + target };
      CWD = normalize(target);
      return { out: "" };
    },

    cat: function (a, stdin) {
      if (!a.rest.length) return { out: stdin || "" };
      const chunks = [], errs = [];
      a.rest.forEach(function (p) {
        const n = nodeAt(p);
        if (!n) errs.push("cat: " + p + ": No such file or directory");
        else if (n.type === "dir") errs.push("cat: " + p + ": Is a directory");
        else chunks.push(n.content.replace(/\n$/, ""));
      });
      return { out: chunks.join("\n"), err: errs.join("\n") };
    },

    echo: function (a) { return { out: a.rest.join(" ") }; },

    mkdir: function (a) {
      if (!a.rest.length) return { err: "mkdir: missing operand" };
      const errs = [];
      a.rest.forEach(function (p) {
        const abs = normalize(p), parts = abs.split("/").filter(Boolean);
        let node = FS, ok = true;
        for (let i = 0; i < parts.length; i++) {
          const last = i === parts.length - 1;
          if (!node.children[parts[i]]) {
            if (last || a.f.p) node.children[parts[i]] = dir();
            else { errs.push("mkdir: cannot create directory '" + p + "': No such file or directory (use -p)"); ok = false; break; }
          } else if (last && !a.f.p) { errs.push("mkdir: cannot create directory '" + p + "': File exists"); ok = false; break; }
          if (ok) node = node.children[parts[i]];
        }
      });
      return { out: "", err: errs.join("\n") };
    },

    touch: function (a) {
      if (!a.rest.length) return { err: "touch: missing file operand" };
      const errs = [];
      a.rest.forEach(function (p) {
        const s = splitParent(p), parent = nodeAt(s.parentPath);
        if (!parent || parent.type !== "dir") { errs.push("touch: cannot touch '" + p + "': No such file or directory"); return; }
        if (!parent.children[s.name]) parent.children[s.name] = file("");
      });
      return { out: "", err: errs.join("\n") };
    },

    rm: function (a) {
      if (!a.rest.length) return { err: "rm: missing operand" };
      /* The forbidden one — make it memorable, and recoverable */
      if ((a.f.r || a.f.R) && a.f.f && a.rest.some(function (p) { return normalize(p) === "/"; })) {
        FS = dir({}); CWD = "/"; nuked = true;
        return { out: "rm: removing everything...\n\n  /bin gone.  /etc gone.  /home gone.  /usr gone.  /var gone.\n\nAnd that's how a single command erases a Linux system. No confirmation,\nno trash can, no undo. On a real machine this is game over.\n\nHere? Click the Reset button (or type `reset`) and all is forgiven." };
      }
      const errs = [];
      a.rest.forEach(function (p) {
        const n = nodeAt(p);
        if (!n) { if (!a.f.f) errs.push("rm: cannot remove '" + p + "': No such file or directory"); return; }
        if (n.type === "dir" && !(a.f.r || a.f.R)) { errs.push("rm: cannot remove '" + p + "': Is a directory (use -r)"); return; }
        const s = splitParent(p), parent = nodeAt(s.parentPath);
        if (parent) delete parent.children[s.name];
        if (normalize(p) === CWD || CWD.indexOf(normalize(p) + "/") === 0) CWD = "/home/" + USER;
      });
      return { out: "", err: errs.join("\n") };
    },

    cp: function (a) {
      if (a.rest.length < 2) return { err: "cp: missing file operand" };
      const src = nodeAt(a.rest[0]);
      if (!src) return { err: "cp: cannot stat '" + a.rest[0] + "': No such file or directory" };
      if (src.type === "dir" && !a.f.r) return { err: "cp: -r not specified; omitting directory '" + a.rest[0] + "'" };
      let destPath = a.rest[1];
      const destNode = nodeAt(destPath);
      if (destNode && destNode.type === "dir") destPath = destPath + "/" + splitParent(a.rest[0]).name;
      const s = splitParent(destPath), parent = nodeAt(s.parentPath);
      if (!parent || parent.type !== "dir") return { err: "cp: cannot create '" + a.rest[1] + "': No such file or directory" };
      parent.children[s.name] = JSON.parse(JSON.stringify(src)); // deep copy
      return { out: "" };
    },

    mv: function (a) {
      if (a.rest.length < 2) return { err: "mv: missing file operand" };
      const src = nodeAt(a.rest[0]);
      if (!src) return { err: "mv: cannot stat '" + a.rest[0] + "': No such file or directory" };
      let destPath = a.rest[1];
      const destNode = nodeAt(destPath);
      if (destNode && destNode.type === "dir") destPath = destPath + "/" + splitParent(a.rest[0]).name;
      const d = splitParent(destPath), parent = nodeAt(d.parentPath);
      if (!parent || parent.type !== "dir") return { err: "mv: cannot move to '" + a.rest[1] + "': No such file or directory" };
      const o = splitParent(a.rest[0]);
      parent.children[d.name] = src;
      delete nodeAt(o.parentPath).children[o.name];
      return { out: "" };
    },

    tree: function (a) {
      const rootPath = a.rest[0] || ".";
      const root = nodeAt(rootPath);
      if (!root) return { err: "tree: '" + rootPath + "': No such file or directory" };
      if (root.type === "file") return { out: rootPath };
      let dirs = 0, files = 0;
      const lines = [displayPath(normalize(rootPath))];
      (function draw(node, prefix) {
        const names = Object.keys(node.children).filter(function (n) { return n[0] !== "."; }).sort();
        names.forEach(function (n, i) {
          const last = i === names.length - 1, c = node.children[n];
          lines.push(prefix + (last ? "└── " : "├── ") + n + (c.type === "dir" ? "/" : ""));
          if (c.type === "dir") { dirs++; draw(c, prefix + (last ? "    " : "│   ")); }
          else files++;
        });
      })(root, "");
      lines.push("", dirs + (dirs === 1 ? " directory, " : " directories, ") + files + (files === 1 ? " file" : " files"));
      return { out: lines.join("\n") };
    },

    head: function (a, stdin) { return headTail(a, stdin, false); },
    tail: function (a, stdin) { return headTail(a, stdin, true); },

    wc: function (a, stdin) {
      const read = a.rest[0] ? nodeAt(a.rest[0]) : null;
      if (a.rest[0] && !read) return { err: "wc: " + a.rest[0] + ": No such file or directory" };
      const text = a.rest[0] ? read.content : (stdin || "");
      const lines = text ? text.replace(/\n$/, "").split("\n").length : 0;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (a.f.l) return { out: String(lines) + (a.rest[0] ? " " + a.rest[0] : "") };
      return { out: lines + "  " + words + "  " + text.length + (a.rest[0] ? " " + a.rest[0] : "") };
    },

    grep: function (a, stdin) {
      if (!a.rest.length) return { err: "usage: grep [-i] [-r] <pattern> [file|dir]" };
      const pattern = a.rest[0], target = a.rest[1];
      const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), a.f.i ? "i" : "");
      const hits = [];
      function searchFile(label, content) {
        content.replace(/\n$/, "").split("\n").forEach(function (line) {
          if (re.test(line)) hits.push(label ? label + ":" + line : line);
        });
      }
      if (a.f.r) {
        const start = target || ".";
        const root = nodeAt(start);
        if (!root) return { err: "grep: " + start + ": No such file or directory" };
        walk(normalize(start), root, function (p, n) { if (n.type === "file") searchFile(displayPath(p), n.content); });
      } else if (target) {
        const n = nodeAt(target);
        if (!n) return { err: "grep: " + target + ": No such file or directory" };
        if (n.type === "dir") return { err: "grep: " + target + ": Is a directory (use -r)" };
        searchFile("", n.content);
      } else {
        searchFile("", stdin || "");
      }
      return { out: hits.join("\n") };
    },

    find: function (a) {
      const start = a.rest[0] || ".";
      const root = nodeAt(start);
      if (!root) return { err: "find: '" + start + "': No such file or directory" };
      /* support: find <path> [-name "pattern"] */
      let pattern = null;
      const nameIdx = a.rest.indexOf("-name");
      if (nameIdx !== -1 && a.rest[nameIdx + 1]) pattern = globToRegex(a.rest[nameIdx + 1]);
      const results = [];
      walk(normalize(start), root, function (p, n) {
        const base = p.split("/").pop() || "/";
        if (!pattern || pattern.test(base)) results.push(displayPath(p) || "/");
      });
      return { out: results.join("\n") };
    },

    sort: function (a, stdin) {
      const text = a.rest[0] ? (nodeAt(a.rest[0]) || {}).content : stdin;
      if (text == null) return { err: "sort: " + (a.rest[0] || "") + ": No such file or directory" };
      const lines = text.replace(/\n$/, "").split("\n").sort();
      if (a.f.r) lines.reverse();
      return { out: lines.join("\n") };
    },

    uniq: function (a, stdin) {
      const text = a.rest[0] ? (nodeAt(a.rest[0]) || {}).content : stdin;
      if (text == null) return { err: "uniq: " + (a.rest[0] || "") + ": No such file or directory" };
      const outLines = [];
      let prev = null, count = 0;
      text.replace(/\n$/, "").split("\n").concat([null]).forEach(function (line) {
        if (line === prev) { count++; return; }
        if (prev !== null) outLines.push(a.f.c ? ("      " + count).slice(-7) + " " + prev : prev);
        prev = line; count = 1;
      });
      return { out: outLines.join("\n") };
    },

    chmod: function (a) {
      const mode = a.rest[0], target = a.rest[1];
      if (!mode || !target) return { err: "usage: chmod <mode> <file>   e.g.  chmod 755 script.sh" };
      const n = nodeAt(target);
      if (!n) return { err: "chmod: cannot access '" + target + "': No such file or directory" };
      if (/^[0-7]{3}$/.test(mode)) n.mode = Number(mode);
      else if (mode === "+x") n.mode = Number(String(n.mode).split("").map(function (d) { return Number(d) | 1; }).join(""));
      else if (mode === "-x") n.mode = Number(String(n.mode).split("").map(function (d) { return Number(d) & 6; }).join(""));
      else return { err: "chmod: invalid mode: '" + mode + "' (this sandbox understands 755-style numbers, +x and -x)" };
      return { out: "" };
    }
  };

  function headTail(a, stdin, fromEnd) {
    let count = 10;
    if (a.f.n && /^\d+$/.test(a.f.n)) count = Number(a.f.n);
    const src = a.rest[0] ? nodeAt(a.rest[0]) : null;
    if (a.rest[0] && !src) return { err: (fromEnd ? "tail" : "head") + ": cannot open '" + a.rest[0] + "'" };
    const text = a.rest[0] ? src.content : (stdin || "");
    const lines = text.replace(/\n$/, "").split("\n");
    return { out: (fromEnd ? lines.slice(-count) : lines.slice(0, count)).join("\n") };
  }

  /* ----------------------------------------------------------------------
     3. Parsing & execution: quotes → tokens → && / ; chains → | pipelines
        with a trailing  > file  or  >> file  redirection per pipeline.
     ---------------------------------------------------------------------- */
  function tokenize(line) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line))) tokens.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
    return tokens;
  }

  function runPipeline(segment) {
    /* peel off redirection */
    let redirect = null, append = false;
    let src = segment;
    const rmatch = src.match(/(>>?)\s*(\S+)\s*$/);
    if (rmatch && src.lastIndexOf(rmatch[1]) > -1) {
      append = rmatch[1] === ">>";
      redirect = rmatch[2];
      src = src.slice(0, src.lastIndexOf(rmatch[1]));
    }

    const stages = src.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    let stdin = "", errAll = [];
    let result = { out: "", err: "" };

    for (let i = 0; i < stages.length; i++) {
      const tokens = tokenize(stages[i]);
      if (!tokens.length) continue;
      const name = tokens[0];
      const fn = COMMANDS[name];
      if (!fn) {
        const hint = nuked ? "\n(You did just delete the entire system… type `reset` to restore it.)" : "\nType `help` to see what this sandbox understands.";
        return { out: "", err: name + ": command not found" + hint, code: 1 };
      }
      result = fn(flags(tokens.slice(1)), stdin) || { out: "" };
      if (result.err) errAll.push(result.err);
      stdin = result.out || "";
    }

    if (redirect) {
      const s = splitParent(redirect), parent = nodeAt(s.parentPath);
      if (!parent || parent.type !== "dir") return { out: "", err: "bash: " + redirect + ": No such file or directory", code: 1 };
      const existing = parent.children[s.name];
      const text = (stdin ? stdin + "\n" : "");
      if (append && existing && existing.type === "file") existing.content += text;
      else parent.children[s.name] = file(text);
      stdin = ""; // redirected output doesn't print
    }

    return { out: stdin, err: errAll.join("\n"), code: errAll.length ? 1 : 0 };
  }

  function runLine(line) {
    /* split on && and ; while honoring && short-circuiting */
    const parts = line.split(/(&&|;)/).map(function (s) { return s.trim(); });
    let skip = false;
    for (let i = 0; i < parts.length; i += 2) {
      const op = parts[i - 1];
      if (op === "&&" && skip) continue;
      if (!parts[i]) continue;
      const r = runPipeline(parts[i]);
      if (r.out) print(r.out);
      if (r.err) print(r.err, "err");
      skip = r.code !== 0;
    }
  }

  /* ----------------------------------------------------------------------
     4. Screen, prompt, input handling
     ---------------------------------------------------------------------- */
  const history = [];
  let histIdx = -1;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function print(text, kind) {
    const div = document.createElement("div");
    div.className = "ylg-term-block" + (kind === "err" ? " is-err" : "") + (kind === "echo" ? " is-echo" : "");
    div.innerHTML = kind === "echo" ? text : esc(text);
    out.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function promptHTML() {
    return '<span class="p-user">' + USER + "@" + HOST + '</span>:<span class="p-path">' + esc(displayPath(CWD)) + '</span>$ ';
  }
  function refreshPrompt() { prompt.innerHTML = promptHTML(); }

  function execute(raw) {
    const line = raw.trim();
    print(promptHTML() + esc(raw), "echo"); // echo the typed line, prompt included
    if (line) {
      history.push(line);
      histIdx = history.length;
      runLine(line);
    }
    refreshPrompt();
    body.scrollTop = body.scrollHeight;
  }

  /* Tab completion: first token → command names, otherwise → paths */
  function complete() {
    const value = input.value;
    const upToCursor = value.slice(0, input.selectionStart == null ? value.length : input.selectionStart);
    const tokens = upToCursor.split(/\s+/);
    const current = tokens[tokens.length - 1] || "";
    let candidates = [];

    if (tokens.length <= 1) {
      candidates = Object.keys(COMMANDS).filter(function (c) { return c.indexOf(current) === 0; });
    } else {
      const slash = current.lastIndexOf("/");
      const dirPart = slash === -1 ? "" : current.slice(0, slash + 1);
      const base = slash === -1 ? current : current.slice(slash + 1);
      const parent = nodeAt(dirPart || ".");
      if (parent && parent.type === "dir") {
        candidates = Object.keys(parent.children)
          .filter(function (n) { return n.indexOf(base) === 0 && (base[0] === "." || n[0] !== "."); })
          .map(function (n) { return dirPart + n + (parent.children[n].type === "dir" ? "/" : ""); });
      }
    }

    if (candidates.length === 1) {
      tokens[tokens.length - 1] = candidates[0] + (tokens.length <= 1 ? " " : "");
      input.value = tokens.join(" ") + value.slice(upToCursor.length);
    } else if (candidates.length > 1) {
      print(promptHTML() + esc(value), "echo");
      print(candidates.map(function (c) { return c.split("/").filter(Boolean).pop() || c; }).join("  "));
    }
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = input.value;
      input.value = "";
      execute(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
      else { histIdx = history.length; input.value = ""; }
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      out.innerHTML = "";
    } else if (e.key === "c" && e.ctrlKey && !window.getSelection().toString()) {
      e.preventDefault();
      print(promptHTML() + esc(input.value) + "^C", "echo");
      input.value = "";
    }
  });

  /* Pasting several lines runs them one by one (works with the Copy buttons) */
  input.addEventListener("paste", function (e) {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && text.indexOf("\n") !== -1) {
      e.preventDefault();
      const lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      lines.forEach(function (l, i) {
        setTimeout(function () { input.value = ""; execute(l); }, i * 120);
      });
    }
  });

  /* Clicking anywhere in the terminal focuses the input (unless selecting text) */
  body.addEventListener("click", function () {
    if (!window.getSelection().toString()) input.focus();
  });

  /* ----------------------------------------------------------------------
     5. Reset + fullscreen controls (header buttons)
     ---------------------------------------------------------------------- */
  function resetFS() {
    FS = defaultFS();
    CWD = "/home/" + USER;
    nuked = false;
    refreshPrompt();
  }

  const resetBtn = document.getElementById("termReset");
  if (resetBtn) resetBtn.addEventListener("click", function () {
    resetFS();
    out.innerHTML = "";
    boot(true);
    input.focus();
  });

  const embed = document.getElementById("builtinEmbed");
  const fsBtn = document.getElementById("termFullscreen");
  function syncFsIcon() {
    const active = document.fullscreenElement === embed || embed.classList.contains("is-fs-fallback");
    const icon = fsBtn && fsBtn.querySelector("i");
    if (icon) icon.className = "bi " + (active ? "bi-fullscreen-exit" : "bi-arrows-fullscreen");
    const label = fsBtn && fsBtn.querySelector("span");
    if (label) label.textContent = active ? "Exit" : "Fullscreen";
  }
  function fallbackOff() {
    embed.classList.remove("is-fs-fallback");
    document.documentElement.classList.remove("ylg-noscroll");
    syncFsIcon();
  }
  if (fsBtn && embed) {
    fsBtn.addEventListener("click", function () {
      if (embed.classList.contains("is-fs-fallback")) return fallbackOff();
      if (document.fullscreenElement === embed) return document.exitFullscreen();
      if (embed.requestFullscreen) {
        embed.requestFullscreen().catch(function () {
          embed.classList.add("is-fs-fallback");
          document.documentElement.classList.add("ylg-noscroll");
          syncFsIcon();
        });
      } else {
        embed.classList.add("is-fs-fallback");
        document.documentElement.classList.add("ylg-noscroll");
        syncFsIcon();
      }
    });
    document.addEventListener("fullscreenchange", syncFsIcon);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && embed.classList.contains("is-fs-fallback")) fallbackOff();
    });
  }

  /* ----------------------------------------------------------------------
     7. Run buttons + public API
     Blocks with a [data-run] button get their clean commands (no prompts,
     no comments — same rules as the Copy buttons) typed into this terminal
     line by line, exactly like pasting. Also exposed as window.YLGTerm.run.
     ---------------------------------------------------------------------- */
  function runScript(text) {
    const lines = String(text).split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    lines.forEach(function (l, i) {
      setTimeout(function () { input.value = ""; execute(l); }, i * 140);
    });
  }
  window.YLGTerm = { run: runScript, reset: resetFS };

  document.querySelectorAll("[data-run]").forEach(function (btn) {
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

      runScript(command);
      if (embed) embed.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();

      const original = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-check2"></i><span>Sent</span>';
      setTimeout(function () { btn.innerHTML = original; }, 1400);
    });
  });

  /* ----------------------------------------------------------------------
     6. Boot
     ---------------------------------------------------------------------- */
  function boot(isReset) {
    print("YLG Linux (Practice Edition) — a terminal that lives in this page.");
    print(isReset ? "Fresh file system loaded. As if nothing ever happened." :
                    "Type `help` to see every command, or just start exploring: try `ls`.");
    print("");
    refreshPrompt();
  }

  boot(false);
})();
