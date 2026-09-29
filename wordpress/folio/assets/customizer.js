(function (api) {
  var colors = {
    folio_bg: "--bg",
    folio_surface: "--surface",
    folio_ink: "--ink",
    folio_muted: "--muted",
    folio_line: "--line",
    folio_accent: "--accent",
    folio_accent_soft: "--accent-soft",
  };

  function clearColors() {
    Object.keys(colors).forEach(function (id) {
      document.documentElement.style.removeProperty(colors[id]);
    });
  }

  api("folio_theme", function (setting) {
    setting.bind(function (value) {
      document.documentElement.setAttribute("data-theme", value || "folio");
      if (value !== "custom") clearColors();
    });
  });

  Object.keys(colors).forEach(function (id) {
    api(id, function (setting) {
      setting.bind(function (value) {
        if (!api("folio_theme") || api("folio_theme").get() !== "custom") return;
        if (value) document.documentElement.style.setProperty(colors[id], value);
      });
    });
  });

  api("folio_search_shape", function (setting) {
    setting.bind(function (value) {
      document.documentElement.style.setProperty("--search-radius", value === "rounded" ? "1rem" : "999px");
    });
  });
})(wp.customize);
