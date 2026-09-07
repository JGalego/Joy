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
const query = new URLSearchParams(window.location.search);

let activeDemo = Object.hasOwn(demos, query.get("demo")) ? query.get("demo") : "claude";
let player;

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
