/* ===== Tab switching ===== */

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    // Remove active from all tabs and contents
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    
    // Add active to clicked tab and corresponding content
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

/* ===== Helper functions ===== */

function format(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatMinutes(seconds) {
  const m = Math.ceil(seconds / 60);
  return `${m} min`;
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
    ((firstThursday - new Date(firstThursday.getFullYear(), 0, 1)) / 86400000 + 1) /
      7
  );
  return `${firstThursday.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function formatCooldown(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function updatePopup() {
  chrome.storage.local.get(
    ["dailyWatch", "dailyTotal", "weeklyWatch", "dailyLimit", "bonusMinutes", "limitLastChanged"],
    (data) => {
      const today = getTodayKey();
      const week = getWeekKey();

      const watchToday = data.dailyWatch?.[today] || 0;
      const totalToday = data.dailyTotal?.[today] || 0;
      const watchWeek = data.weeklyWatch?.[week] || 0;
      const dailyLimit = data.dailyLimit || 60;
      const bonusMinutes = data.bonusMinutes?.[today] || 0;

      document.getElementById("watch-today").textContent = format(watchToday);
      document.getElementById("total-today").textContent = format(totalToday);
      document.getElementById("watch-week").textContent = format(watchWeek);
      
      // Limit info
      const totalLimit = dailyLimit + bonusMinutes;
      document.getElementById("daily-limit").textContent = `${totalLimit} min`;
      document.getElementById("limit-input").value = dailyLimit;
      
      // Limit cooldown (24 hours)
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;
      const lastChanged = data.limitLastChanged || 0;
      const timeSinceChange = Date.now() - lastChanged;
      const onCooldown = timeSinceChange < COOLDOWN_MS;
      
      const saveBtn = document.getElementById("save-limit");
      const limitInput = document.getElementById("limit-input");
      const cooldownEl = document.getElementById("limit-cooldown");
      
      if (onCooldown) {
        const remainingCooldown = COOLDOWN_MS - timeSinceChange;
        saveBtn.disabled = true;
        limitInput.disabled = true;
        cooldownEl.textContent = `Can change in ${formatCooldown(remainingCooldown)}`;
        cooldownEl.classList.remove("hidden");
      } else {
        saveBtn.disabled = false;
        limitInput.disabled = false;
        cooldownEl.classList.add("hidden");
      }
      
      // Remaining time
      const remainingSeconds = Math.max(0, totalLimit * 60 - watchToday);
      const remainingEl = document.getElementById("remaining");
      remainingEl.textContent = formatMinutes(remainingSeconds);

      const justThisVideoBtn = document.getElementById("just-this-video");
      if (remainingSeconds > 0) {
        justThisVideoBtn.disabled = true;
        justThisVideoBtn.title = "You still have time left!";
      } else {
        justThisVideoBtn.disabled = false;
        justThisVideoBtn.title = "";
      }
      
      if (remainingSeconds === 0) {
        remainingEl.classList.add("over-limit");
      } else {
        remainingEl.classList.remove("over-limit");
      }
    }
  );
}

// Initial load
updatePopup();

/* ===== Hold Challenge System ===== */

const HOLD_DURATION = 10; // seconds
let holdInterval = null;
let holdProgress = 0;

function showChallenge() {
  const today = getTodayKey();
  
  chrome.storage.local.get(["allowedVideo", "dailyWatch"], (data) => {
    const watchToday = data.dailyWatch?.[today] || 0;
    const watchMinutes = Math.floor(watchToday / 60);
    const timesUsedToday = data.allowedVideo?.date === today ? 1 : 0;
    
    // Update big numbers
    document.getElementById("guilt-watched").textContent = watchMinutes;
    document.getElementById("guilt-bonus").textContent = timesUsedToday;
    document.getElementById("hold-challenge").classList.remove("challenge-hidden");
    document.getElementById("just-this-video").style.display = "none";
    
    // Reset progress
    holdProgress = 0;
    updateHoldUI();
  });
}

function hideChallenge() {
  document.getElementById("hold-challenge").classList.add("challenge-hidden");
  document.getElementById("just-this-video").style.display = "block";
  stopHold();
}

function updateHoldUI() {
  const remaining = Math.ceil(HOLD_DURATION - holdProgress);
  document.getElementById("hold-timer").textContent = `${remaining}s`;
  document.getElementById("progress-fill").style.width = `${(holdProgress / HOLD_DURATION) * 100}%`;
  
  const btn = document.getElementById("hold-btn");
  if (holdProgress > 0) {
    btn.classList.add("holding");
  } else {
    btn.classList.remove("holding");
  }
}

function startHold() {
  if (holdInterval) return;
  
  holdInterval = setInterval(() => {
    holdProgress += 0.1;
    updateHoldUI();
    
    if (holdProgress >= HOLD_DURATION) {
      // Success! Allow this video to finish
      stopHold();
      allowCurrentVideo();
    }
  }, 100);
}

function stopHold() {
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null;
  }
  holdProgress = 0;
  updateHoldUI();
}

function allowCurrentVideo() {
  // Get the current active YouTube tab and ask for the video ID
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes("youtube.com/watch")) {
      alert("Please navigate to a YouTube video first!");
      hideChallenge();
      return;
    }
    
    // Ask content script for video ID
    chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_ID" }, (response) => {
      if (chrome.runtime.lastError || !response?.videoId) {
        alert("Couldn't detect the video. Please try again.");
        hideChallenge();
        return;
      }
      
      const today = getTodayKey();
      
      // Store the allowed video
      chrome.storage.local.set({
        allowedVideo: {
          videoId: response.videoId,
          date: today
        }
      }, () => {
        updatePopup();
        hideChallenge();
      });
    });
  });
}

// "Just this video" button - shows the challenge
document.getElementById("just-this-video").addEventListener("click", () => {
  showChallenge();
});

// Hold button events
const holdBtn = document.getElementById("hold-btn");

holdBtn.addEventListener("mousedown", startHold);
holdBtn.addEventListener("mouseup", stopHold);
holdBtn.addEventListener("mouseleave", stopHold);

// Touch support
holdBtn.addEventListener("touchstart", (e) => {
  e.preventDefault();
  startHold();
});
holdBtn.addEventListener("touchend", stopHold);
holdBtn.addEventListener("touchcancel", stopHold);

// Cancel button
document.getElementById("hold-cancel").addEventListener("click", () => {
  hideChallenge();
});

// Save limit button
document.getElementById("save-limit").addEventListener("click", () => {
  const limitInput = document.getElementById("limit-input");
  const newLimit = parseInt(limitInput.value, 10);
  
  if (newLimit > 0 && newLimit <= 480) {
    chrome.storage.local.set({ 
      dailyLimit: newLimit,
      limitLastChanged: Date.now()
    }, () => {
      updatePopup();
    });
  }
});

/* ===== Blocking toggles ===== */

function loadBlockingSettings() {
  chrome.storage.local.get(
    ["blockSideRecommendations", "blockHomeRecommendations", "autoSpeed2x"],
    (data) => {
      document.getElementById("block-side").checked = data.blockSideRecommendations || false;
      document.getElementById("block-home").checked = data.blockHomeRecommendations || false;
      document.getElementById("auto-speed").checked = data.autoSpeed2x || false;
    }
  );
}

loadBlockingSettings();

document.getElementById("block-side").addEventListener("change", (e) => {
  chrome.storage.local.set({ blockSideRecommendations: e.target.checked });
});

document.getElementById("block-home").addEventListener("change", (e) => {
  chrome.storage.local.set({ blockHomeRecommendations: e.target.checked });
});

document.getElementById("auto-speed").addEventListener("change", (e) => {
  chrome.storage.local.set({ autoSpeed2x: e.target.checked });
});
