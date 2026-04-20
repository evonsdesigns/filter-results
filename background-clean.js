// background-clean.js — service worker

const AMAZON_PATTERN = /^https?:\/\/(www\.)?amazon\.(com|co\.uk|ca|com\.au|de|fr|co\.jp)\//;

// Re-inject the content script whenever an Amazon tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && AMAZON_PATTERN.test(tab.url)) {
    chrome.storage.local.get(['enabled'], (data) => {
      if (data.enabled === false) return;

      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(() => {
        // Tab may not be injectable (e.g., chrome:// pages) — silently ignore
      });
    });
  }
});
