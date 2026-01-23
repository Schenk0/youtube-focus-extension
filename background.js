let currentTabId = null;

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

chrome.tabs.onActivated.addListener(({ tabId }) => {
  currentTabId = tabId;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) currentTabId = tabId;
});

setInterval(() => {
  if (!currentTabId) return;

  chrome.tabs.get(currentTabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url || !tab.url.startsWith("https://www.youtube.com")) {
      return; 
    }

    chrome.tabs.sendMessage(
      currentTabId,
      { type: "YT_STATE" },
      (state) => {
        if (chrome.runtime.lastError) {
          return; 
        }

        if (!state?.visible) return;

        const today = getTodayKey();
        const week = getWeekKey();

        chrome.storage.local.get(
          ["dailyWatch", "dailyTotal", "weeklyWatch"],
          (data) => {
            const dailyWatch = data.dailyWatch || {};
            const dailyTotal = data.dailyTotal || {};
            const weeklyWatch = data.weeklyWatch || {};

            // Total YouTube time (visible tab)
            dailyTotal[today] = (dailyTotal[today] || 0) + 1;

            // Active watch time
            if (state.watching) {
              dailyWatch[today] = (dailyWatch[today] || 0) + 1;
              weeklyWatch[week] = (weeklyWatch[week] || 0) + 1;
            }

            chrome.storage.local.set({
              dailyWatch,
              dailyTotal,
              weeklyWatch
            });
          }
        );
      }
    );
  });
}, 1000);
