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

// Add 5 minutes button
document.getElementById("add-5-min").addEventListener("click", () => {
  const today = getTodayKey();
  
  chrome.storage.local.get(["bonusMinutes"], (data) => {
    const bonusMinutes = data.bonusMinutes || {};
    bonusMinutes[today] = (bonusMinutes[today] || 0) + 5;
    
    chrome.storage.local.set({ bonusMinutes }, () => {
      updatePopup();
    });
  });
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
    ["blockSideRecommendations", "blockHomeRecommendations"],
    (data) => {
      document.getElementById("block-side").checked = data.blockSideRecommendations || false;
      document.getElementById("block-home").checked = data.blockHomeRecommendations || false;
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
