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

function updatePopup() {
  chrome.storage.local.get(
    ["dailyWatch", "dailyTotal", "weeklyWatch", "dailyLimit", "bonusMinutes"],
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
      
      // Remaining time
      const remainingSeconds = Math.max(0, totalLimit * 60 - watchToday);
      const remainingEl = document.getElementById("remaining");
      remainingEl.textContent = formatMinutes(remainingSeconds);

      const addBtn = document.getElementById("add-5-min");
      if (remainingSeconds > 0) {
        addBtn.disabled = true;
        addBtn.title = "You still have time left!";
      } else {
        addBtn.disabled = false;
        addBtn.title = "";
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
  
  chrome.storage.local.get(["bonusMinutes", "dailyWatch"], (data) => {
    const bonusToday = data.bonusMinutes?.[today] || 0;
    const watchToday = data.dailyWatch?.[today] || 0;
    const watchMinutes = Math.floor(watchToday / 60);
    
    // Update big numbers
    document.getElementById("guilt-watched").textContent = watchMinutes;
    document.getElementById("guilt-bonus").textContent = bonusToday;
    document.getElementById("hold-challenge").classList.remove("challenge-hidden");
    document.getElementById("add-5-min").style.display = "none";
    
    // Reset progress
    holdProgress = 0;
    updateHoldUI();
  });
}

function hideChallenge() {
  document.getElementById("hold-challenge").classList.add("challenge-hidden");
  document.getElementById("add-5-min").style.display = "block";
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
      // Success! Add the bonus time
      stopHold();
      addBonusMinutes();
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

function addBonusMinutes() {
  const today = getTodayKey();
  
  chrome.storage.local.get(["bonusMinutes"], (data) => {
    const bonusMinutes = data.bonusMinutes || {};
    bonusMinutes[today] = (bonusMinutes[today] || 0) + 5;
    
    chrome.storage.local.set({ bonusMinutes }, () => {
      updatePopup();
      hideChallenge();
    });
  });
}

// Add 5 minutes button - now shows the challenge
document.getElementById("add-5-min").addEventListener("click", () => {
  showChallenge();
});

// Remove 5 minutes button - instant, no challenge needed
document.getElementById("remove-5-min").addEventListener("click", () => {
  const today = getTodayKey();
  
  chrome.storage.local.get(["bonusMinutes"], (data) => {
    const bonusMinutes = data.bonusMinutes || {};
    const current = bonusMinutes[today] || 0;
    bonusMinutes[today] = Math.max(0, current - 5);
    
    chrome.storage.local.set({ bonusMinutes }, () => {
      updatePopup();
    });
  });
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
    chrome.storage.local.set({ dailyLimit: newLimit }, () => {
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
