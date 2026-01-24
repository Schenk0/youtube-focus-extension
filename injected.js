// This script runs in the page context to access YouTube's player API
(function() {
  // Track our desired speed (null means let YouTube control it)
  let enforcedSpeed = null;
  let enforceUntil = 0;
  
  // Listen for messages from content script
  window.addEventListener("yt-set-speed", function() {
    const player = document.getElementById("movie_player");
    if (player && typeof player.setPlaybackRate === "function") {
      player.setPlaybackRate(2);
    }
  });

  // Function to set playback speed directly on video element
  function setVideoSpeed(speed) {
    const video = document.querySelector("video");
    if (video) {
      video.playbackRate = speed;
    }
  }

  // Update the visual selection state of speed menu items
  function updateSpeedMenuUI(selectedSpeed) {
    const allMenuItems = document.querySelectorAll(".ytp-menuitem");
    for (const item of allMenuItems) {
      const label = item.querySelector(".ytp-menuitem-label");
      if (!label) continue;
      
      const text = label.textContent.trim();
      if (text === "Normal" || !isNaN(parseFloat(text))) {
        if (text === String(selectedSpeed) || (text === "Normal" && selectedSpeed === 1)) {
          item.setAttribute("aria-checked", "true");
        } else {
          item.setAttribute("aria-checked", "false");
        }
      }
    }
  }

  // Add 3x speed option to YouTube's playback speed menu
  function add3xSpeedOption() {
    const allMenuItems = document.querySelectorAll(".ytp-menuitem");
    if (allMenuItems.length === 0) return;
    
    let option2x = null;
    for (const item of allMenuItems) {
      const label = item.querySelector(".ytp-menuitem-label");
      if (label && label.textContent.trim() === "2") {
        option2x = item;
        break;
      }
    }
    
    if (!option2x) return;
    
    if (document.querySelector("[data-speed-3x]")) {
      const video = document.querySelector("video");
      if (video) {
        updateSpeedMenuUI(video.playbackRate);
      }
      return;
    }
    
    const option3x = document.createElement("div");
    option3x.className = "ytp-menuitem";
    option3x.setAttribute("tabindex", "0");
    option3x.setAttribute("role", "menuitemradio");
    option3x.setAttribute("aria-checked", "false");
    option3x.setAttribute("data-speed-3x", "true");
    option3x.style.cursor = "pointer";
    
    const label3x = document.createElement("div");
    label3x.className = "ytp-menuitem-label";
    label3x.textContent = "3";
    option3x.appendChild(label3x);
    
    option2x.parentNode.insertBefore(option3x, option2x.nextSibling);
    
    const video = document.querySelector("video");
    if (video) {
      updateSpeedMenuUI(video.playbackRate);
    }
  }
  
  // Handle clicks on our 3x option
  document.addEventListener("click", function(e) {
    const target = e.target.closest("[data-speed-3x]");
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      
      // Set enforced speed for the next 500ms
      enforcedSpeed = 3;
      enforceUntil = Date.now() + 500;
      
      setVideoSpeed(3);
      updateSpeedMenuUI(3);
      
      // Close menu
      setTimeout(function() {
        const settingsButton = document.querySelector(".ytp-settings-button");
        if (settingsButton) {
          settingsButton.click();
        }
      }, 50);
      
      return false;
    }
  }, true);
  
  // Watch the video element's playbackRate and enforce our speed if needed
  function watchVideoSpeed() {
    const video = document.querySelector("video");
    if (!video) {
      setTimeout(watchVideoSpeed, 500);
      return;
    }
    
    // Listen for rate changes
    video.addEventListener("ratechange", function() {
      // If we're enforcing a speed and YouTube tried to change it, change it back
      if (enforcedSpeed !== null && Date.now() < enforceUntil) {
        if (video.playbackRate !== enforcedSpeed) {
          video.playbackRate = enforcedSpeed;
        }
      } else {
        // Clear enforcement after timeout
        enforcedSpeed = null;
      }
    });
  }
  
  // Watch for DOM changes
  const observer = new MutationObserver(function(mutations) {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        add3xSpeedOption();
        break;
      }
    }
  });
  
  function startObserving() {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      startObserving();
      watchVideoSpeed();
    });
  } else {
    startObserving();
    watchVideoSpeed();
  }
  
  add3xSpeedOption();
})();
