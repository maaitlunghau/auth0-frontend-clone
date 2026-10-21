/* auth0.com clone — behaviour. Copy and asset paths come from the recon dumps
   in RECON/ (tab-states.json, lifecycle.json, nav.json, asset-manifest.json). */
(function () {
  "use strict";

  var IMG = "assets/images/cdn.auth0.com/";
  var CTF = "assets/images/images.ctfassets.net/";
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- announcement ticker ---------- */

  var TICKER = [
    { text: "Streamcast Ep 9: Agentic commerce—Don’t let agents steal your customers", cta: "Register now" },
    { text: "B2B Connect: Enterprise-ready in days without platform migration.", cta: "See how" },
    { text: "AI Identity for Commerce: Unlock new channels for your business.", cta: "Learn more" },
    { text: "Transform identity into a growth lever with Identity Conversion Suite.", cta: "Learn more" }
  ];

  (function ticker() {
    var textEl = $("[data-ticker-text]");
    var ctaEl = $("[data-ticker-cta]");
    if (!textEl || !ctaEl || reduced) return;
    var i = 0;
    setInterval(function () {
      i = (i + 1) % TICKER.length;
      textEl.textContent = TICKER[i].text;
      ctaEl.innerHTML = TICKER[i].cta + ' <span aria-hidden="true">→</span>';
    }, 7000);
  }());

  /* ---------- header nav ---------- */

  (function nav() {
    var header = $(".site-header");
    var toggle = $("[data-navtoggle]");
    var items = $$("[data-navitem]");
    var isDesktop = function () { return window.matchMedia("(min-width: 901px)").matches; };

    function close(item) {
      item.dataset.open = "false";
      var btn = $(".navitem__label", item);
      if (btn && btn.tagName === "BUTTON") btn.setAttribute("aria-expanded", "false");
    }
    function open(item) {
      items.forEach(function (other) { if (other !== item) close(other); });
      item.dataset.open = "true";
      var btn = $(".navitem__label", item);
      if (btn && btn.tagName === "BUTTON") btn.setAttribute("aria-expanded", "true");
    }

    items.forEach(function (item) {
      var btn = $(".navitem__label", item);
      if (!btn) return;
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        if (item.dataset.open === "true") close(item); else open(item);
      });
      item.addEventListener("mouseenter", function () { if (isDesktop()) open(item); });
      item.addEventListener("mouseleave", function () { if (isDesktop()) close(item); });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") items.forEach(close);
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".navitem")) items.forEach(close);
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = header.dataset.navOpen !== "true";
        header.dataset.navOpen = String(next);
        toggle.setAttribute("aria-expanded", String(next));
        if (!next) items.forEach(close);
      });
    }
  }());

  /* ---------- customer logo marquee ---------- */

  (function marquee() {
    var track = $("[data-marquee]");
    if (!track) return;
    var logos = [
      ["logo-mclaren-5de739ad6a.png", "McLaren", 401, 58],
      ["logo-pga-c6d9b35a00.png", "PGA of America", 88, 80],
      ["logo-zapier-ec680dfdc9.png", "Zapier", 222, 60],
      ["logo-cribl-70f667ce02.png", "Cribl", 218, 60],
      ["logo-claas-07ca455d15.png", "CLAAS", 286, 50],
      ["logo-vialtopartners-8a88911b48.png", "Vialto Partners", 196, 57],
      ["logo-jerseymikes-2-e1e6effcd8.png", "Jersey Mike's", 346, 64],
      ["logo-zinnia-b6efaa4cf0.png", "Zinnia", 211, 60],
      ["logo-ita-740b437b27.png", "Los Angeles ITA", 449, 71],
      ["logo-signify-18639cbff1.png", "Signify", 207, 50],
      ["customer-bluetooth-logo-1df054cfd1.png", "Bluetooth", 245, 60],
      ["logo-jamf-b03cb24cc2.png", "Jamf", 193, 74],
      ["logo-arduino-4c864cd05e.png", "Arduino", 109, 74],
      ["logo-maven-4237810827.png", "Maven", 290, 50],
      ["logo-siemens-00c6d240e3.png", "Siemens", 252, 40],
      ["logo-wyndham-546a7d719e.png", "Wyndham", 240, 60]
    ];
    var html = logos.map(function (l) {
      return '<img src="' + IMG + l[0] + '" alt="' + l[1] + '" width="' + l[2] + '" height="' + l[3] + '" loading="lazy">';
    }).join("");
    // duplicated once so the -50% translate loops seamlessly
    track.innerHTML = html + html;
  }());

  /* ---------- lifecycle arc ---------- */

  var LIFECYCLE = {
    b2c: {
      cta: "Explore B2C Solutions",
      stages: [
        { node: "Sign up", icon: "B2C-SignUp-7ecce42cff.png", title: "Convert",
          copy: "Convert more customers through secure and easy sign up." },
        { node: "Login", icon: "B2C-Login-633801be72.png", title: "Protect",
          copy: "Protect revenue by stopping fraud without adding unnecessary friction." },
        { node: "Checkout", icon: "B2C-Checkout-d49dfb48c4.png", title: "Personalize",
          copy: "Build lifetime value and loyalty with personalized experiences across every channel." },
        { node: "Agentic experience", icon: "B2C-AIAgent-a792af2175.png", title: "Grow",
          copy: "Grow the relationship by carrying trusted customer context into AI-assisted experiences." }
      ]
    },
    b2b: {
      cta: "Explore B2B SaaS",
      stages: [
        { node: "Evaluation", icon: "B2B-Evaluation-8714c47972.png", title: "Win",
          copy: "Close deals faster with enterprise grade identity including enterprise federation, compliance and access controls." },
        { node: "Onboarding", icon: "B2B-Onboarding-279f4dea8b.png", title: "Accelerate",
          copy: "Accelerate time-to-value by removing onboarding friction so customers go-live faster." },
        { node: "Expansion", icon: "B2B-Expansion-4e6e132a94.png", title: "Scale",
          copy: "Scale adoption and expansion easily by letting customers self-manage their organizations, user roles, and access." },
        { node: "Agentic readiness", icon: "B2B-AgenticReadiness-5c859e676f.png", title: "Evolve",
          copy: "Adapt to market demands by adding secure agentic experiences to your platform." }
      ]
    }
  };

  (function lifecycle() {
    var section = $(".lifecycle");
    if (!section) return;
    var nodes = $$("[data-uj-node]", section);
    var arms = $$(".uj-arm", section);
    var titleEl = $("[data-uj-title]", section);
    var copyEl = $("[data-uj-copy]", section);
    var ctaEl = $("[data-uj-cta]", section);
    var mode = "b2c";
    var index = 0;
    var timer = null;

    function render() {
      var data = LIFECYCLE[mode];
      nodes.forEach(function (node, i) {
        var stage = data.stages[i];
        var img = $("[data-node-icon]", node);
        var label = $("[data-node-label]", node);
        img.src = IMG + stage.icon;
        img.alt = "";
        img.width = 632;
        img.height = 565;
        label.textContent = stage.node;
        node.setAttribute("aria-pressed", String(i === index));
      });
      arms.forEach(function (arm, i) { arm.dataset.active = String(i === index); });
      titleEl.textContent = data.stages[index].title;
      copyEl.textContent = data.stages[index].copy;
      ctaEl.textContent = data.cta;
      section.dataset.mode = mode;
    }

    function play() {
      if (reduced) return;
      stop();
      timer = setInterval(function () {
        index = (index + 1) % 4;
        render();
      }, 4200);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    nodes.forEach(function (node, i) {
      node.addEventListener("click", function () { index = i; render(); play(); });
    });
    $$("[data-mode-btn]", section).forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.dataset.modeBtn;
        index = 0;
        $$("[data-mode-btn]", section).forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        render();
        play();
      });
    });
    section.addEventListener("mouseenter", stop);
    section.addEventListener("mouseleave", play);

    render();
    play();
  }());

  /* ---------- tabber: the left list tracks the card you are reading ---------- */

  (function tabber() {
    var items = $$("[data-tabber-item]");
    var cards = $$("[data-tabber-card]");
    if (!cards.length) return;

    function setActive(i) {
      items.forEach(function (item) {
        item.setAttribute("aria-current", String(Number(item.dataset.tabberItem) === i));
      });
      cards.forEach(function (card) {
        var on = Number(card.dataset.tabberCard) === i;
        card.dataset.active = String(on);
        var video = card.querySelector("video");
        if (!video) return;
        // the original keeps every clip running and only dims the inactive cards
        var played = video.play();
        if (played && played.catch) played.catch(function () {});
      });
    }

    items.forEach(function (item) {
      item.addEventListener("click", function () {
        var card = cards[Number(item.dataset.tabberItem)];
        if (!card) return;
        var top = card.getBoundingClientRect().top + window.scrollY - 160;
        window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      });
    });

    // Pick the card nearest the viewport centre rather than using an
    // IntersectionObserver band: above the first card the list must still show
    // item 1, and a band leaves the last-fired state stuck when nothing is in it.
    var current = -1;
    function track() {
      var mid = window.scrollY + window.innerHeight / 2;
      var best = 0;
      var bestDistance = Infinity;
      cards.forEach(function (card, i) {
        var rect = card.getBoundingClientRect();
        var centre = rect.top + window.scrollY + rect.height / 2;
        var distance = Math.abs(centre - mid);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      });
      if (best !== current) { current = best; setActive(best); }
    }

    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; track(); });
    }, { passive: true });
    window.addEventListener("resize", track);
    track();
  }());

  /* ---------- generic tab groups ---------- */

  function wireTabs(tabAttr, panelAttr, onChange) {
    var tabs = $$("[" + tabAttr + "]");
    var panels = $$("[" + panelAttr + "]");
    if (!tabs.length) return;
    function select(i) {
      tabs.forEach(function (tab) {
        tab.setAttribute("aria-selected", String(Number(tab.getAttribute(tabAttr)) === i));
      });
      panels.forEach(function (panel) {
        panel.hidden = Number(panel.getAttribute(panelAttr)) !== i;
      });
      if (onChange) onChange(i);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { select(Number(tab.getAttribute(tabAttr))); });
    });
    select(0);
  }

  wireTabs("data-industry-tab", "data-industry-panel");
  wireTabs("data-agent-tab", "data-agent-panel");

  /* ---------- resource cards ---------- */

  var RESOURCES = [
    [
      { kind: "Whitepaper", title: "When AI moves faster than your identity layer", img: "Auth0_Template-NoImage_01__1_-53544a63b5.png" },
      { kind: "Whitepaper", title: "The AI-Ready Identity Framework", img: "Auth0_Template-NoImage_02__1_-921d63ad04.png" },
      { kind: "Webinar", title: "AI Identity in 2026: The mid year reality check", img: "Auth0_Template-NoImage_01__2_-3a84aedf0e.png" },
      { kind: "Whitepaper", title: "Developer blueprint for production-ready apps and AI agents", img: "Auth0_Template-NoImage_02__3_-7525a50d1a.png" }
    ],
    [
      { kind: "Whitepaper", title: "Identity Security 101 Checklist", img: "Auth0_Template-NoImage_01__3_-9852cc260a.png" },
      { kind: "Whitepaper", title: "Securing AI Agents: The New Identity Challenge", img: "Auth0_Template-NoImage_02__4_-64bbb46a15.png" },
      { kind: "Webinar", title: "From login to action — Protect every user, agent, and interaction", img: "Auth0_Template-NoImage_01__1_-309d9e9c10.png" },
      { kind: "Webinar", title: "Secure production-ready AI Agents with Auth0", img: "Auth0_Template-NoImage_02__1_-2c92bfc431.png" }
    ],
    [
      { kind: "Whitepaper", title: "From prototype to production: A guide to shipping AI agents faster", img: "Auth0_Template-NoImage_01-c67674df38.png" },
      { kind: "Video", title: "Auth0 introduction", img: "Auth0_Template-NoImage_02-a079d211df.png" },
      { kind: "Whitepaper", title: "How teams actually get AI agents into production", img: "Auth0_Template-NoImage_01__1_-40e554da6a.png" },
      { kind: "Whitepaper", title: "Fine-Grained Authorization (FGA): A technical primer", img: "Auth0_Template-NoImage_02__1_-afbbd4d391.png" }
    ],
    [
      { kind: "Podcast", title: "Unlock the future of customer trust & AI", img: "Auth0_Template-NoImage_01__2_-17fb052f47.png" },
      { kind: "Whitepaper", title: "Accelerating AI in retail: Building identity for agent-driven experiences", img: "Auth0_Template-NoImage_02__2_-ffb857a66f.png" },
      { kind: "Ebook", title: "How to power consistent, multi-brand, omnichannel experiences", img: "Auth0_Template-NoImage_01__3_-f953de9a08.png" },
      { kind: "Webinar", title: "Passwordless 101: Building high-conversion login flows", img: "Auth0_Template-NoImage_02__3_-2ca7291f26.png" }
    ]
  ];

  (function resources() {
    var panels = $$("[data-res-panel]");
    if (!panels.length) return;
    var docIcon = window.__A0_ICONS && window.__A0_ICONS.doc ? window.__A0_ICONS.doc : "";
    var playIcon = window.__A0_ICONS && window.__A0_ICONS.play ? window.__A0_ICONS.play : "";
    panels.forEach(function (panel, p) {
      panel.innerHTML = RESOURCES[p].map(function (card) {
        var icon = /webinar|video|podcast/i.test(card.kind) ? playIcon : docIcon;
        return '' +
          '<a class="rescard" href="#" data-od-id="resource-' + card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + '">' +
            '<img src="' + CTF + card.img + '" width="600" height="777" alt="' + card.title.replace(/"/g, "&quot;") + '" loading="lazy">' +
            '<span class="rescard__body">' +
              '<span class="rescard__kind">' + icon + card.kind + '</span>' +
              '<h3>' + card.title + '</h3>' +
            '</span>' +
          '</a>';
      }).join("");
    });
    wireTabs("data-res-tab", "data-res-panel");
  }());

  /* ---------- copy buttons ---------- */

  (function copy() {
    var toast = $("[data-toast]");
    var hide = null;
    $$("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = btn.dataset.copy;
        var done = function () {
          if (!toast) return;
          toast.textContent = "Copied to clipboard";
          toast.dataset.show = "true";
          clearTimeout(hide);
          hide = setTimeout(function () { toast.dataset.show = "false"; }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, done);
        } else {
          var field = document.createElement("textarea");
          field.value = value;
          document.body.appendChild(field);
          field.select();
          try { document.execCommand("copy"); } catch (error) { /* clipboard unavailable */ }
          document.body.removeChild(field);
          done();
        }
      });
    });
  }());
}());
