(function () {
  var root = document.getElementById("folio");
  if (!root || !window.folioData) return;

  var sources = { web: true, wiki: true, grok: true };
  var recent = [];
  try {
    var saved = JSON.parse(localStorage.getItem("folio-sources") || "");
    if (saved && typeof saved === "object") {
      sources.web = saved.web !== false;
      sources.wiki = saved.wiki !== false;
      sources.grok = saved.grok !== false;
    }
  } catch (error) {}
  try {
    var past = JSON.parse(localStorage.getItem("folio-recent") || "[]");
    if (Array.isArray(past)) recent = past.filter(function (item) { return typeof item === "string"; }).slice(0, 6);
  } catch (error) {}

  var state = { query: "", page: 1, data: null, loading: false, open: null, trends: [], menu: false, refsOpen: true };
  var params = new URLSearchParams(location.search);
  if (params.get("q")) {
    state.query = params.get("q");
    state.page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function logo(url) {
    var host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (error) {}
    var img = el("img", "logo");
    img.alt = "";
    img.width = 18;
    img.height = 18;
    if (!host) return img;
    img.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64";
    img.addEventListener("error", function () { img.replaceWith(el("span", "logo", host.charAt(0).toUpperCase())); });
    return img;
  }

  function post(action, fields) {
    var body = new URLSearchParams();
    body.set("action", action);
    body.set("nonce", folioData.nonce);
    Object.keys(fields).forEach(function (key) { body.set(key, fields[key]); });
    return fetch(folioData.ajax, { method: "POST", credentials: "same-origin", body: body }).then(function (response) {
      return response.json();
    });
  }

  function remember(query) {
    recent = [query].concat(recent.filter(function (item) { return item.toLowerCase() !== query.toLowerCase(); })).slice(0, 6);
    localStorage.setItem("folio-recent", JSON.stringify(recent));
  }

  function search(query, page) {
    state.query = query;
    state.page = page || 1;
    state.loading = true;
    state.open = null;
    state.menu = false;
    remember(query);
    var next = folioData.home.replace(/\/$/, "/") + "?q=" + encodeURIComponent(query) + (state.page > 1 ? "&page=" + state.page : "");
    history.pushState({ q: query, page: state.page }, "", next);
    render();
    post("folio_search", {
      q: query,
      page: String(state.page),
      web: sources.web ? "1" : "0",
      wiki: sources.wiki ? "1" : "0",
      grok: sources.grok ? "1" : "0",
    }).then(function (payload) {
      state.loading = false;
      state.data = payload && payload.success ? payload.data : null;
      render();
    }).catch(function () {
      state.loading = false;
      state.data = null;
      render();
    });
  }

  function loadTrends() {
    if (state.trends.length) return;
    post("folio_trends", {}).then(function (payload) {
      state.trends = payload && payload.success && Array.isArray(payload.data) ? payload.data : [];
      if (state.menu) render();
    }).catch(function () {});
  }

  function pages(current, total, size, done) {
    var last = total ? Math.max(1, Math.ceil(total / size)) : (done ? current : current + 1);
    last = Math.min(400, last);
    var items = [];
    var start = Math.max(1, current - 2);
    var end = Math.min(last, start + 4);
    start = Math.max(1, end - 4);
    if (start > 1) items.push(1);
    if (start > 2) items.push("…");
    for (var i = start; i <= end; i += 1) items.push(i);
    if (end < last - 1) items.push("…");
    if (end < last) items.push(last);
    return { last: last, items: items };
  }

  function countLabel(total, source) {
    if (!total) return "";
    if (source === "web") return "About " + total.toLocaleString("en-US") + " results";
    var shown = total >= 10000 ? "10,000+" : total.toLocaleString("en-US");
    return shown + (total === 1 ? " result" : " results");
  }

  function references(data) {
    var pools = [data.web.results, data.wiki.results, data.grok.results];
    var picks = [];
    var seen = {};
    for (var i = 0; i < 3 && picks.length < 6; i += 1) {
      pools.forEach(function (pool) {
        var hit = pool[i];
        if (!hit || seen[hit.url] || picks.length >= 6) return;
        seen[hit.url] = true;
        picks.push(hit);
      });
    }
    return picks;
  }

  function sourceBlock(key, label, size) {
    var block = state.data[key];
    var section = el("section", "source");
    var head = el("div", "source-head");
    head.appendChild(el("h2", "", label));
    var count = countLabel(block.total, key);
    head.appendChild(el("p", "muted", "Search for “" + state.query + "”" + (count ? " — " + count : "")));
    section.appendChild(head);
    if (block.error) {
      section.appendChild(el("p", "status", label + " didn’t respond. The other sources still ran."));
      return section;
    }
    if (!block.results.length) {
      section.appendChild(el("p", "status", "No matches in " + label + "."));
      return section;
    }
    block.results.forEach(function (hit) {
      var row = el("div", "hit" + (state.open && state.open.id === hit.id ? " is-on" : ""));
      var button = el("button", "body");
      button.type = "button";
      var meta = el("span", "meta");
      meta.appendChild(logo(hit.url));
      meta.appendChild(el("span", "", hit.meta));
      button.appendChild(meta);
      button.appendChild(el("h3", "", hit.title));
      if (hit.snippet) button.appendChild(el("p", "snippet", hit.snippet));
      button.addEventListener("click", function () { state.open = hit; render(); });
      var open = el("a", "folio-icon");
      open.href = hit.url;
      open.target = "_blank";
      open.rel = "noreferrer";
      open.setAttribute("aria-label", "Open " + hit.title + " in a new tab");
      open.textContent = "↗";
      row.appendChild(button);
      row.appendChild(open);
      section.appendChild(row);
    });
    var pager = pages(state.page, block.total, size, block.done);
    var bar = el("div", "pager");
    function pageButton(label, page, current) {
      var button = el("button", current ? "is-on" : "", label);
      button.type = "button";
      button.disabled = !page || page === state.page;
      if (page) button.addEventListener("click", function () { search(state.query, page); });
      return button;
    }
    bar.appendChild(pageButton("Previous", state.page > 1 ? state.page - 1 : 0, false));
    pager.items.forEach(function (item) {
      if (item === "…") bar.appendChild(el("span", "muted", "…"));
      else bar.appendChild(pageButton(String(item), item, item === state.page));
    });
    bar.appendChild(pageButton("Next", state.page < pager.last ? state.page + 1 : 0, false));
    section.appendChild(bar);
    return section;
  }

  function side() {
    var aside = el("aside", "side");
    var data = state.data;
    if (data.note) {
      var note = el("section", "card");
      note.appendChild(el("p", "kicker", data.note.source === "grok" ? "Grokipedia" : "Wikipedia"));
      note.appendChild(el("h3", "", data.note.title));
      note.appendChild(el("p", "muted", data.note.kicker));
      note.appendChild(el("p", "", data.note.extract));
      var read = el("a", "", "Read the article");
      read.href = data.note.url;
      note.appendChild(read);
      aside.appendChild(note);
    }
    var refs = references(data);
    if (refs.length > 1) {
      var box = el("section", "card");
      box.appendChild(el("h2", "", "References"));
      var shown = state.refsOpen ? refs : refs.slice(0, 3);
      shown.forEach(function (hit) {
        var link = el("a", "ref");
        link.href = hit.url;
        var who = el("span", "meta");
        who.appendChild(logo(hit.url));
        who.appendChild(el("span", "", hit.meta));
        link.appendChild(who);
        link.appendChild(el("strong", "", hit.title));
        if (hit.snippet) link.appendChild(el("span", "snippet", hit.snippet));
        box.appendChild(link);
      });
      if (refs.length > 3) {
        var toggle = el("button", "pill", state.refsOpen ? "Show less" : "Show more");
        toggle.type = "button";
        toggle.addEventListener("click", function () { state.refsOpen = !state.refsOpen; render(); });
        box.appendChild(toggle);
      }
      aside.appendChild(box);
    }
    if (data.definitions && data.definitions.length) {
      var defs = el("section", "card");
      defs.appendChild(el("h2", "", "Definitions"));
      data.definitions.forEach(function (item) {
        defs.appendChild(el("h3", "", item.word));
        item.senses.forEach(function (sense) {
          var row = el("div", "sense");
          row.appendChild(el("p", "part", sense.part));
          row.appendChild(el("p", "", sense.definition));
          defs.appendChild(row);
        });
        if (item.source) {
          var source = el("a", "muted", "WordNet");
          source.href = item.source;
          defs.appendChild(source);
        }
      });
      aside.appendChild(defs);
    }
    return aside;
  }

  function menu(input) {
    var box = el("div", "folio-menu");
    box.setAttribute("role", "listbox");
    if (input.value.trim().length < 2 && state.trends.length) {
      box.appendChild(el("p", "label", "Trending now"));
      state.trends.forEach(function (item) {
        var button = el("button", "folio-option");
        button.type = "button";
        if (item.image) {
          var photo = el("img", "trend-photo");
          photo.alt = "";
          photo.src = item.image;
          button.appendChild(photo);
        } else {
          button.appendChild(el("span", "", "↗"));
        }
        button.appendChild(el("span", "", item.title));
        button.addEventListener("mousedown", function (event) {
          event.preventDefault();
          search(item.title, 1);
        });
        box.appendChild(button);
      });
    }
    recent.forEach(function (item) {
      var button = el("button", "folio-option", item);
      button.type = "button";
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        search(item, 1);
      });
      box.appendChild(button);
    });
    return box.childNodes.length ? box : null;
  }

  function searchForm() {
    var wrap = el("div", "folio-search");
    var form = el("form", "folio-bar");
    var input = el("input");
    input.type = "search";
    input.placeholder = "Search";
    input.value = state.query;
    input.setAttribute("aria-label", "Search");
    var go = el("button", "folio-go", "↑");
    go.type = "submit";
    go.setAttribute("aria-label", "Search");
    form.appendChild(input);
    form.appendChild(go);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var query = input.value.trim();
      if (query) search(query, 1);
    });
    input.addEventListener("focus", function () {
      state.menu = true;
      loadTrends();
      render();
    });
    input.addEventListener("input", function () { state.query = input.value; state.menu = true; render(); });
    wrap.appendChild(form);
    if (state.menu) {
      var list = menu(input);
      if (list) wrap.appendChild(list);
    }
    return wrap;
  }

  function chips() {
    var row = el("div", "folio-sources");
    [["web", "Web"], ["wiki", "Wikipedia"], ["grok", "Grokipedia"]].forEach(function (item) {
      var button = el("button", "chip" + (sources[item[0]] ? " is-on" : ""), item[1]);
      button.type = "button";
      button.addEventListener("click", function () {
        sources[item[0]] = !sources[item[0]];
        localStorage.setItem("folio-sources", JSON.stringify(sources));
        if (state.query) search(state.query, 1);
        else render();
      });
      row.appendChild(button);
    });
    return row;
  }

  function peek() {
    if (!state.open) return;
    var hit = state.open;
    var backdrop = el("button", "backdrop");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Close preview");
    backdrop.addEventListener("click", function () { state.open = null; render(); });
    var panel = el("aside", "peek");
    panel.setAttribute("role", "dialog");
    var header = el("header");
    header.appendChild(el("p", "kicker", hit.meta));
    var close = el("button", "folio-icon", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", function () { state.open = null; render(); });
    header.appendChild(close);
    panel.appendChild(header);
    var body = el("div", "body");
    body.appendChild(el("h2", "", hit.title));
    if (hit.snippet) body.appendChild(el("p", "", hit.snippet));
    panel.appendChild(body);
    var footer = el("footer");
    var link = el("a", "", "Open page");
    link.href = hit.url;
    footer.appendChild(link);
    panel.appendChild(footer);
    root.appendChild(backdrop);
    root.appendChild(panel);
  }

  function render() {
    root.innerHTML = "";
    document.title = state.query ? state.query + " — Folio" : "Folio";
    if (!state.data && !state.loading && !params.get("q")) {
      var home = el("div", "folio-home");
      var inner = el("div");
      inner.appendChild(el("h1", "folio-brand", "Folio"));
      inner.appendChild(searchForm());
      inner.appendChild(chips());
      home.appendChild(inner);
      root.appendChild(home);
      return;
    }
    var top = el("div", "folio-top");
    var bar = el("div", "folio-wrap");
    var mark = el("a", "folio-mark", "Folio");
    mark.href = folioData.home;
    mark.addEventListener("click", function (event) {
      event.preventDefault();
      state.query = "";
      state.data = null;
      state.loading = false;
      params = new URLSearchParams();
      history.pushState({}, "", folioData.home);
      render();
    });
    bar.appendChild(mark);
    bar.appendChild(searchForm());
    top.appendChild(bar);
    root.appendChild(top);
    var main = el("main", "folio-results");
    var wrap = el("div", "folio-wrap");
    var head = el("div", "folio-head");
    head.appendChild(el("h1", "", state.query || "Search"));
    if (state.data) head.appendChild(el("p", "muted", state.data.tookMs + " ms"));
    wrap.appendChild(head);
    if (state.loading && !state.data) wrap.appendChild(el("p", "status", "Searching…"));
    if (state.data) {
      var layout = el("div", "layout");
      var results = el("div");
      if (sources.web) results.appendChild(sourceBlock("web", "Web", 8));
      if (sources.wiki) results.appendChild(sourceBlock("wiki", "Wikipedia", 8));
      if (sources.grok) results.appendChild(sourceBlock("grok", "Grokipedia", 12));
      layout.appendChild(results);
      layout.appendChild(side());
      wrap.appendChild(layout);
    }
    main.appendChild(wrap);
    root.appendChild(main);
    peek();
    var field = root.querySelector("input[type=search]");
    if (field && state.menu) {
      var pos = field.selectionStart;
      field.focus();
      if (pos != null) field.setSelectionRange(pos, pos);
    }
  }

  window.addEventListener("popstate", function () {
    var next = new URLSearchParams(location.search);
    state.query = next.get("q") || "";
    state.page = Math.max(1, parseInt(next.get("page") || "1", 10) || 1);
    state.data = null;
    params = next;
    if (state.query) search(state.query, state.page);
    else render();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      state.menu = false;
      state.open = null;
      render();
    }
  });

  render();
  if (state.query) search(state.query, state.page);
})();
