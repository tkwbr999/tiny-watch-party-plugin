chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith("chrome://") && !tab.url?.startsWith("chrome-extension://")) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TWPP_TOGGLE" });
    } catch (error) {
      console.log("Content script not ready on this page");
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidebar") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0] && !tabs[0].url?.startsWith("chrome://") && !tabs[0].url?.startsWith("chrome-extension://")) {
        try {
          await chrome.tabs.sendMessage(tabs[0].id, { type: "TWPP_TOGGLE" });
        } catch (error) {
          console.log("Content script not ready on this page");
        }
      }
    });
  }
});