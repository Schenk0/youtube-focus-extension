function format(seconds, includeSeconds = true) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${includeSeconds ? `${s}s` : ""}`;
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getWeekKey() {
  const date = new Date();
  const firstThursday = new Date(
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  );
  const weekNumber = Math.ceil(
    ((firstThursday - new Date(firstThursday.getFullYear(), 0, 1)) / 86400000 + 1) / 7
  );
  return `${firstThursday.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/* ===== Time limit blocking state (declared early for use throughout) ===== */

let isBlocked = false;
let allowedVideoId = null;
let wasHiddenRecently = false;

// Track visibility changes to avoid race conditions when switching tabs
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    wasHiddenRecently = true;
    // Clear the flag after a short delay
    setTimeout(() => {
      wasHiddenRecently = false;
    }, 500);
  }
});

/* ===== Blocking settings ===== */

let blockSettings = {
  blockSideRecommendations: false,
  blockHomeRecommendations: false
};

function loadBlockSettings() {
  chrome.storage.local.get(
    ["blockSideRecommendations", "blockHomeRecommendations"],
    (data) => {
      blockSettings.blockSideRecommendations = data.blockSideRecommendations || false;
      blockSettings.blockHomeRecommendations = data.blockHomeRecommendations || false;
      applyBlockingFeatures();
    }
  );
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockSideRecommendations || changes.blockHomeRecommendations) {
    loadBlockSettings();
  }
  if (changes.autoSpeed2x) {
    loadSpeedSettings();
  }
  if (changes.allowedVideo) {
    // Immediately re-check time limit when allowed video changes
    checkTimeLimit();
  }
});

/* ===== Auto 2x speed settings ===== */

let autoSpeed2x = false;
let lastVideoId = null;
let injectedScriptLoaded = false;

function loadSpeedSettings() {
  chrome.storage.local.get(["autoSpeed2x"], (data) => {
    autoSpeed2x = data.autoSpeed2x || false;
  });
}

loadSpeedSettings();

function getVideoId() {
  const params = new URLSearchParams(location.search);
  return params.get("v");
}

// Inject the script that runs in page context
function injectPageScript() {
  if (injectedScriptLoaded) return;
  
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.onload = function() {
    this.remove();
    injectedScriptLoaded = true;
  };
  (document.head || document.documentElement).appendChild(script);
}

// Inject early
injectPageScript();

function applyAutoSpeed() {
  if (!autoSpeed2x) return;
  if (location.pathname !== "/watch") return;
  
  const videoId = getVideoId();
  if (!videoId) return;
  
  // Only apply once per video
  if (videoId === lastVideoId) return;
  
  const video = document.querySelector("video");
  if (!video) return;
  
  lastVideoId = videoId;
  
  // Dispatch event to trigger the injected script
  window.dispatchEvent(new CustomEvent("yt-set-speed"));
}

// Apply speed when video starts playing
document.addEventListener("play", (e) => {
  if (e.target.tagName === "VIDEO") {
    applyAutoSpeed();
  }
}, true);

// Apply on URL change (SPA navigation)
window.addEventListener("yt-navigate-finish", () => {
  // Reset lastVideoId on navigation so speed applies to new video
  const newVideoId = getVideoId();
  if (newVideoId !== lastVideoId) {
    lastVideoId = null;
    // Try to apply speed after a short delay for new video
    setTimeout(applyAutoSpeed, 500);
  }
});

/* ===== Shorts blocking (always on) ===== */

function redirectIfShorts() {
  if (location.pathname.startsWith("/shorts")) {
    location.replace("/");
  }
}

function isShortsElement(node) {
  if (!(node instanceof HTMLElement)) return false;
  
  // Sidebar Shorts entry
  if (node.tagName === "YTD-GUIDE-ENTRY-RENDERER") {
    const link = node.querySelector('a[title="Shorts"]');
    const title = node.querySelector("yt-formatted-string.title");
    if (link || (title && title.textContent?.trim() === "Shorts")) {
      return true;
    }
  }
  
  // Mini sidebar Shorts entry
  if (node.tagName === "YTD-MINI-GUIDE-ENTRY-RENDERER") {
    const title = node.querySelector("span.title");
    if (title && title.textContent?.trim() === "Shorts") {
      return true;
    }
  }
  
  // Shorts shelf on home/subscriptions
  if (node.tagName === "YTD-REEL-SHELF-RENDERER") return true;
  if (node.tagName === "YTD-RICH-SHELF-RENDERER") {
    const title = node.querySelector("#title");
    if (title && title.textContent?.toLowerCase().includes("shorts")) {
      return true;
    }
  }
  
  // Shorts links in grids
  if (node.tagName === "A" && node.href?.includes("/shorts/")) return true;
  if (node.tagName === "YTD-RICH-ITEM-RENDERER") {
    const link = node.querySelector('a[href*="/shorts/"]');
    if (link) return true;
  }
  
  return false;
}

/* ===== Side recommendations blocking ===== */

function isSideRecommendation(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (location.pathname !== "/watch") return false;
  
  if (node.id === "related") return true;
  if (node.tagName === "YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER") return true;
  
  return false;
}

/* ===== Home recommendations blocking ===== */

function isHomeRecommendation(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (location.pathname !== "/" && !location.pathname.startsWith("/feed")) return false;
  
  if (node.tagName === "YTD-RICH-GRID-RENDERER") return true;
  if (node.tagName === "YTD-RICH-SECTION-RENDERER") return true;
  if (node.tagName === "YTD-RICH-ITEM-RENDERER") return true;
  
  return false;
}

function showHomeBlockedMessage() {
  if (location.pathname !== "/" && !location.pathname.startsWith("/feed")) return;
  if (document.querySelector("#yt-home-blocked")) return;
  
  const msg = document.createElement("div");
  msg.id = "yt-home-blocked";
  msg.innerHTML = `
    <div class="yt-home-blocked-icon">🎯</div>
    <h2>Home Feed Blocked</h2>
    <p>Stay focused. Search for what you need.</p>
  `;
  document.body.appendChild(msg);
}

function hideHomeBlockedMessage() {
  const msg = document.querySelector("#yt-home-blocked");
  if (msg) msg.remove();
}

/* ===== Apply blocking features ===== */

function shouldRemoveNode(node) {
  // Always block shorts
  if (isShortsElement(node)) return true;
  
  // Conditionally block side recommendations
  if (blockSettings.blockSideRecommendations && isSideRecommendation(node)) {
    return true;
  }
  
  // Conditionally block home recommendations
  if (blockSettings.blockHomeRecommendations && isHomeRecommendation(node)) {
    showHomeBlockedMessage();
    return true;
  }
  
  return false;
}

function sweepAndRemove(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];
  
  while (walker.nextNode()) {
    if (shouldRemoveNode(walker.currentNode)) {
      toRemove.push(walker.currentNode);
    }
  }
  
  toRemove.forEach((el) => el.remove());
}

function isOnHomePage() {
  return location.pathname === "/" || location.pathname.startsWith("/feed");
}

function applyBlockingFeatures() {
  // Redirect if on shorts page
  redirectIfShorts();
  
  // Handle home blocked message - hide if not on home or if setting is off
  if (!blockSettings.blockHomeRecommendations || !isOnHomePage()) {
    hideHomeBlockedMessage();
  }
  
  // Sweep existing elements
  sweepAndRemove(document.body);
}

// Initial load
loadBlockSettings();
redirectIfShorts();

/* ===== Create header UI ===== */

const tracker = document.createElement("div");
tracker.id = "yt-time-tracker";
tracker.innerHTML = `
  <div class="yt-time-item">
    <span class="label">Watch</span>
    <span class="value" id="yt-watch-today">0h 0m 0s</span>
  </div>
  <div class="divider"></div>
  <div class="yt-time-item">
    <span class="label">Total</span>
    <span class="value" id="yt-total-today">0h 0m 0s</span>
  </div>
  <div class="divider"></div>
  <div class="yt-time-item">
    <span class="label">Week</span>
    <span class="value" id="yt-week">0h 0m</span>
  </div>
`;

/* ===== Create time limit blocker overlay ===== */

const blocker = document.createElement("div");
blocker.id = "yt-time-blocker";
blocker.innerHTML = `
  <div class="yt-blocker-content">
    <div class="yt-blocker-icon">⏰</div>
    <h2>Time Limit Reached</h2>
    <p>You've watched enough for today.<br>Take a break to refocus.</p>
    <div class="yt-blocker-time" id="yt-blocker-time">0h 0m 0s</div>
  </div>
`;

/* ===== Inject into header ===== */

function injectIntoHeader() {
  const end = document.querySelector(
    "#container.ytd-masthead #end.ytd-masthead"
  );

  if (!end) return;
  if (end.querySelector("#yt-time-tracker")) return;

  end.prepend(tracker);
}

injectIntoHeader();

// YouTube is an SPA — re-inject on navigation and apply blocking
const observer = new MutationObserver((mutations) => {
  injectIntoHeader();
  updateEndScreen();
  tryShowBlockerIfNeeded();
  
  // Check new nodes for blocking
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        if (shouldRemoveNode(node)) {
          node.remove();
        } else {
          sweepAndRemove(node);
        }
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Try to show blocker if we should be blocked but overlay isn't showing yet
function tryShowBlockerIfNeeded() {
  if (location.pathname !== "/watch") return;
  
  // Don't aggressively re-show blocker right after tab becomes visible
  // This prevents flickering when switching tabs with "just this video" active
  if (wasHiddenRecently) return;
  
  const player = document.querySelector("#movie_player");
  if (!player) return;
  
  // If blocker should be shown but isn't attached yet, re-check time limit
  // But only if we're not on an allowed video
  if (!player.querySelector("#yt-time-blocker") && !allowedVideoId) {
    try {
      checkTimeLimit();
    } catch (e) {
      // Extension context may be invalidated after reload
    }
  }
}

// Re-apply on SPA navigation
let lastUrl = location.href;

function onUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  redirectIfShorts();
  applyBlockingFeatures();
  
  // Re-check time limit after navigation (blocker may need to show on new page)
  checkTimeLimit();
}

// Listen for YouTube's SPA navigation event
window.addEventListener("yt-navigate-finish", onUrlChange);

// Fallback polling for edge cases
setInterval(onUrlChange, 500);

/* ===== End screen timer replacement ===== */

function updateEndScreen() {
  const endScreen = document.querySelector(".ytp-fullscreen-grid-main-content");
  if (!endScreen) return;
  
  // Check if we already replaced the content
  if (endScreen.querySelector("#yt-endscreen-timer")) return;
  
  // Clear existing content and add timer
  endScreen.innerHTML = `
    <div id="yt-endscreen-timer">
      <div class="yt-endscreen-label">Watch Time Today</div>
      <div class="yt-endscreen-time" id="yt-endscreen-time">0h 0m 0s</div>
    </div>
  `;
}

/* ===== Time limit blocking ===== */

function checkTimeLimit() {
  // Skip aggressive re-blocking right after tab becomes visible again
  // This prevents the blocker from re-appearing due to DOM changes during tab switch
  if (wasHiddenRecently && isBlocked === false && allowedVideoId) {
    return;
  }
  
  chrome.storage.local.get(
    ["dailyWatch", "dailyLimit", "bonusMinutes", "allowedVideo"],
    (data) => {
      const todayKey = getTodayKey();
      const watchToday = data.dailyWatch?.[todayKey] || 0;
      const dailyLimit = data.dailyLimit || 60; // Default 60 minutes
      const bonusMinutes = data.bonusMinutes?.[todayKey] || 0;
      
      const limitSeconds = (dailyLimit + bonusMinutes) * 60;
      const overLimit = watchToday >= limitSeconds;
      
      // Check if current video is the allowed one
      const currentVideoId = getVideoId();
      const allowedVideo = data.allowedVideo;
      const isAllowedVideo = allowedVideo && 
        allowedVideo.date === todayKey && 
        allowedVideo.videoId === currentVideoId;
      
      // Update our local tracking
      allowedVideoId = (allowedVideo?.date === todayKey) ? allowedVideo.videoId : null;
      
      // Block if over limit AND not watching the allowed video
      const shouldBlock = overLimit && !isAllowedVideo;
      
      // Check if overlay is actually rendered (not just isBlocked flag)
      const player = document.querySelector("#movie_player");
      const overlayVisible = player?.querySelector("#yt-time-blocker")?.style.display === "flex";
      
      // Only show blocker if we should block AND (not currently blocked OR overlay is missing on watch page)
      // But don't aggressively re-show if we're on an allowed video
      if (shouldBlock && (!isBlocked || (location.pathname === "/watch" && !overlayVisible))) {
        showBlocker();
      } else if (!shouldBlock && isBlocked) {
        hideBlocker();
      }
    }
  );
}

function showBlocker() {
  // Only show on video pages
  if (location.pathname !== "/watch") {
    isBlocked = true; // Still mark as blocked to prevent video play
    return;
  }
  
  const player = document.querySelector("#movie_player");
  if (!player) {
    // Player not ready yet - don't set isBlocked so we retry next tick
    return;
  }
  
  isBlocked = true;
  
  // Pause the video
  const video = document.querySelector("video");
  if (video) video.pause();
  
  // Check if blocker is already in this player
  let existingBlocker = player.querySelector("#yt-time-blocker");
  if (!existingBlocker) {
    // Create fresh blocker element (old one may have been removed during SPA navigation)
    const newBlocker = document.createElement("div");
    newBlocker.id = "yt-time-blocker";
    newBlocker.innerHTML = `
      <div class="yt-blocker-content">
        <div class="yt-blocker-icon">⏰</div>
        <h2>Time Limit Reached</h2>
        <p>You've watched enough for today.<br>Take a break to refocus.</p>
        <div class="yt-blocker-time" id="yt-blocker-time">0h 0m 0s</div>
      </div>
    `;
    player.appendChild(newBlocker);
    existingBlocker = newBlocker;
  }
  existingBlocker.style.display = "flex";
}

function hideBlocker() {
  isBlocked = false;
  const existingBlocker = document.querySelector("#yt-time-blocker");
  if (existingBlocker) {
    existingBlocker.style.display = "none";
  }
}

/* ===== Update UI every second ===== */

function updateUI() {
  chrome.storage.local.get(
    ["dailyWatch", "dailyTotal", "weeklyWatch"],
    (data) => {
      const todayKey = getTodayKey();
      const weekKey = getWeekKey();

      const watchToday = data.dailyWatch?.[todayKey] || 0;
      const totalToday = data.dailyTotal?.[todayKey] || 0;
      const week = data.weeklyWatch?.[weekKey] || 0;

      // Update header
      const watchEl = document.getElementById("yt-watch-today");
      const totalEl = document.getElementById("yt-total-today");
      const weekEl = document.getElementById("yt-week");
      
      if (watchEl) watchEl.textContent = format(watchToday);
      if (totalEl) totalEl.textContent = format(totalToday);
      if (weekEl) weekEl.textContent = format(week, false);
      
      // Update end screen timer
      const endScreenTime = document.getElementById("yt-endscreen-time");
      if (endScreenTime) endScreenTime.textContent = format(watchToday);
      
      // Update blocker time
      const blockerTime = document.getElementById("yt-blocker-time");
      if (blockerTime) blockerTime.textContent = format(watchToday);
    }
  );
  
  // Check time limit (but respect the visibility debounce)
  if (!wasHiddenRecently || !allowedVideoId) {
    checkTimeLimit();
  }
  
  // Check for end screen
  updateEndScreen();
}

setInterval(() => {
  try {
    updateUI();
  } catch (e) {
    // Extension context may be invalidated after reload
  }
}, 1000);

try {
  updateUI();
} catch (e) {
  // Extension context may be invalidated after reload
}

/* ===== Watching detection ===== */

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "YT_STATE") {
    const video = document.querySelector("video");

    sendResponse({
      visible: document.visibilityState === "visible",
      watching:
        location.pathname === "/watch" &&
        video &&
        !video.paused &&
        !video.ended &&
        !isBlocked
    });
    return;
  }
  
  if (msg.type === "GET_VIDEO_ID") {
    const params = new URLSearchParams(location.search);
    sendResponse({ videoId: params.get("v") });
    return;
  }
});

/* ===== Block video play when limit reached ===== */

document.addEventListener("play", (e) => {
  if (isBlocked && e.target.tagName === "VIDEO") {
    e.target.pause();
  }
}, true);

/* ===== Clear allowed video when it ends ===== */

function setupVideoEndListener() {
  const video = document.querySelector("video");
  if (!video) return;
  
  // Remove existing listener to avoid duplicates
  video.removeEventListener("ended", onVideoEnded);
  video.addEventListener("ended", onVideoEnded);
}

function onVideoEnded() {
  const currentVideoId = getVideoId();
  
  // If the ended video is the allowed video, clear the permission
  if (allowedVideoId && currentVideoId === allowedVideoId) {
    chrome.storage.local.remove("allowedVideo", () => {
      allowedVideoId = null;
      // Re-check limit which will now block since permission is cleared
      checkTimeLimit();
    });
  }
}

// Set up listener when video element is available
const videoObserver = new MutationObserver(() => {
  setupVideoEndListener();
});
videoObserver.observe(document.body, { childList: true, subtree: true });
setupVideoEndListener();

/* ===== Clear allowed video on navigation to different video ===== */

let lastAllowedCheckVideoId = null;

function checkVideoChange() {
  const currentVideoId = getVideoId();
  
  // If we have an allowed video and we're now on a different video, clear permission
  if (allowedVideoId && currentVideoId && currentVideoId !== allowedVideoId) {
    chrome.storage.local.remove("allowedVideo", () => {
      allowedVideoId = null;
      checkTimeLimit();
    });
  }
  
  lastAllowedCheckVideoId = currentVideoId;
}

// Check on SPA navigation
window.addEventListener("yt-navigate-finish", checkVideoChange);

// Also check periodically as a fallback
setInterval(checkVideoChange, 1000);