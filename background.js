// Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("Gemini Extension Installed");
  // Set default side panel behavior to open on action click (optional, but good UX)
  // But strictly, we want FAB to open it.
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  }
});

// Handle External Messages from Content Script (FAB Click)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "OPEN_SIDE_PANEL") {
    // Open side panel for the current window
    // Note: This requires a user gesture. The click on the FAB in content script
    // counts as a user gesture if propagated correctly.
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id, windowId: sender.tab.windowId })
        .then(() => {
          console.log("Side panel opened");
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error("Failed to open side panel:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Async
    }
  }

  // Log for debugging transcription updates
  if (message.type === "TRANSCRIPT_UPDATE") {
    console.log("Transcript received:", message.text);
  }
});
