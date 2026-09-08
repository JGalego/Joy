const demos = {
  claude: {
    cast: "assets/claude.cast",
    description: "Joy pairs on Unicode edge cases while keeping the core slugify algorithm with the user.",
    mode: "pair",
    title: "Claude Code"
  },
  copilot: {
    cast: "assets/copilot.cast",
    description: "Joy offers a graduated hint and a focused test while the user keeps the binary-search diagnosis and fix.",
    mode: "learn",
    title: "GitHub Copilot CLI"
  }
};

const playerElement = document.querySelector("#player");
const panel = document.querySelector("#player-panel");
const description = document.querySelector("#demo-description");
const downloadLink = document.querySelector("#download-cast");
const terminalTitle = document.querySelector("#terminal-title");
const speedSelect = document.querySelector("#speed");
const tabs = [...document.querySelectorAll("[role='tab'][data-demo]")];
const casePlayerElement = document.querySelector("#case-player");
const casePlayerStatus = document.querySelector("#case-player-status");
const caseTabs = [...document.querySelectorAll("[role='tab'][data-case-panel]")];
const casePanels = [...document.querySelectorAll("[role='tabpanel'][data-case-content]")];
const caseChapters = [...document.querySelectorAll("[data-case-marker]")];
const caseStages = [...document.querySelectorAll("[data-case-stage]")];
const query = new URLSearchParams(window.location.search);

let activeDemo = Object.hasOwn(demos, query.get("demo")) ? query.get("demo") : "claude";
let player;
let casePlayer;

function castUrl(path) {
  return new URL(path, document.baseURI).href;
}

function setDemoState(name) {
  const demo = demos[name];
  description.textContent = demo.description;
  downloadLink.href = castUrl(demo.cast);
  downloadLink.setAttribute("download", `${name}.cast`);
  terminalTitle.textContent = `Joy · ${demo.title} · ${demo.mode}`;
  panel.setAttribute("aria-labelledby", `tab-${name}`);

  for (const tab of tabs) {
    const selected = tab.dataset.demo === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

function updateQuery(name) {
  const url = new URL(window.location.href);
  url.searchParams.set("demo", name);
  window.history.replaceState({}, "", url);
}

function showFallback(demo) {
  const fallback = document.createElement("p");
  const link = document.createElement("a");

  fallback.className = "player-fallback";
  fallback.append("Interactive playback could not load. ");
  link.href = castUrl(demo.cast);
  link.textContent = "Download the terminal recording instead.";
  fallback.append(link);
  playerElement.replaceChildren(fallback);
}

function renderPlayer({ autoPlay = false, startAt = 0 } = {}) {
  const demo = demos[activeDemo];
  const speed = Number(speedSelect.value);

  setDemoState(activeDemo);
  player?.dispose();
  player = undefined;
  playerElement.replaceChildren();

  if (!window.AsciinemaPlayer) {
    showFallback(demo);
    return;
  }

  try {
    player = window.AsciinemaPlayer.create(castUrl(demo.cast), playerElement, {
      autoPlay,
      controls: true,
      fit: "width",
      idleTimeLimit: 2,
      poster: autoPlay ? undefined : "npt:1",
      preload: true,
      speed,
      startAt,
      terminalFontSize: "small",
      theme: "asciinema"
    });
  } catch {
    showFallback(demo);
  }
}

function selectDemo(name, { focus = false, updateUrl = true } = {}) {
  if (!Object.hasOwn(demos, name)) return;
  activeDemo = name;
  if (updateUrl) updateQuery(name);
  renderPlayer();
  if (focus) document.querySelector(`#tab-${name}`).focus();
}

function setCaseStage(index) {
  for (const chapter of caseChapters) {
    const active = Number(chapter.dataset.caseMarker) === index;
    chapter.classList.toggle("is-active", active);
    if (active) chapter.setAttribute("aria-current", "step");
    else chapter.removeAttribute("aria-current");
  }

  for (const stage of caseStages) {
    stage.classList.toggle("is-active", Number(stage.dataset.caseStage) === index);
  }
}

function selectCasePanel(name, { focus = false } = {}) {
  for (const tab of caseTabs) {
    const selected = tab.dataset.casePanel === name;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const casePanel of casePanels) {
    casePanel.hidden = casePanel.dataset.caseContent !== name;
  }

  if (name !== "session") casePlayer?.pause();
  if (focus) document.querySelector(`#case-tab-${name}`)?.focus();
}

function showCaseFallback() {
  const fallback = document.createElement("p");
  const link = document.createElement("a");

  fallback.className = "player-fallback";
  fallback.append("Interactive playback could not load. ");
  link.href = castUrl("assets/case-study.cast");
  link.textContent = "Download the case-study recording instead.";
  fallback.append(link);
  casePlayerElement.replaceChildren(fallback);
  casePlayerStatus.textContent = "Interactive case-study playback could not load.";
}

function renderCasePlayer() {
  if (!casePlayerElement) return;
  if (!window.AsciinemaPlayer) {
    showCaseFallback();
    return;
  }

  try {
    casePlayer = window.AsciinemaPlayer.create(castUrl("assets/case-study.cast"), casePlayerElement, {
      autoPlay: false,
      controls: true,
      fit: "width",
      idleTimeLimit: 2,
      poster: "npt:2.6",
      preload: true,
      speed: 1,
      terminalFontSize: "small",
      theme: "asciinema"
    });
    casePlayer.addEventListener("marker", ({ index }) => setCaseStage(Math.min(index, caseStages.length - 1)));
    casePlayer.addEventListener("ended", () => setCaseStage(caseStages.length - 1));
  } catch {
    showCaseFallback();
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectDemo(tab.dataset.demo));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    selectDemo(tabs[nextIndex].dataset.demo, { focus: true });
  });
}

for (const tab of caseTabs) {
  tab.addEventListener("click", () => selectCasePanel(tab.dataset.casePanel));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = caseTabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? caseTabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + caseTabs.length) % caseTabs.length;
    selectCasePanel(caseTabs[nextIndex].dataset.casePanel, { focus: true });
  });
}

for (const chapter of caseChapters) {
  chapter.addEventListener("click", async () => {
    const marker = Number(chapter.dataset.caseMarker);
    if (!casePlayer) {
      casePlayerStatus.textContent = "The case-study recording is not ready yet.";
      return;
    }

    try {
      await casePlayer.seek({ marker });
      setCaseStage(marker);
      await casePlayer.play();
      casePlayerStatus.textContent = `Playing the ${chapter.textContent} chapter.`;
    } catch {
      casePlayerStatus.textContent = "That case-study chapter could not be played.";
    }
  });
}

speedSelect.addEventListener("change", async () => {
  const currentTime = await player?.getCurrentTime?.();
  renderPlayer({ autoPlay: Boolean(currentTime), startAt: currentTime || 0 });
});

const copyButton = document.querySelector("[data-copy-target]");
const copyStatus = document.querySelector("#copy-status");
let copyReset;

copyButton.addEventListener("click", async () => {
  const target = document.querySelector(`#${copyButton.dataset.copyTarget}`);
  const command = target.textContent.trim();

  try {
    await navigator.clipboard.writeText(command);
    copyButton.querySelector(".copy-label").textContent = "Copied";
    copyStatus.textContent = "Install command copied to the clipboard.";
    window.clearTimeout(copyReset);
    copyReset = window.setTimeout(() => {
      copyButton.querySelector(".copy-label").textContent = "Copy";
    }, 1800);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = "Select the highlighted install command and copy it manually.";
  }
});

renderPlayer();
renderCasePlayer();
