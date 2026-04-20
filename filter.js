// filter.js — popup script

const statusEl   = document.getElementById('status');
const countEl    = document.getElementById('count');
const toggleBtn  = document.getElementById('toggle');
const rescanBtn  = document.getElementById('rescan');
const customInput = document.getElementById('custom-brands');
const saveBtn    = document.getElementById('save-custom');
const customList = document.getElementById('custom-list');

// Load saved state
chrome.storage.local.get(['enabled', 'hiddenCount', 'customBrands', 'filterMode'], (data) => {
  const enabled = data.enabled !== false; // default true
  updateToggleUI(enabled);
  countEl.textContent = data.hiddenCount || 0;
  renderCustomList(data.customBrands || []);
  const mode = data.filterMode || 'hide';
  document.querySelector(`input[name="filterMode"][value="${mode}"]`).checked = true;
});

document.querySelectorAll('input[name="filterMode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    chrome.storage.local.set({ filterMode: radio.value });
    runContentScript();
  });
});

function updateToggleUI(enabled) {
  toggleBtn.textContent = enabled ? '🟢 Filter ON' : '🔴 Filter OFF';
  toggleBtn.dataset.enabled = enabled;
  statusEl.textContent = enabled
    ? 'Filtering active on this Amazon page.'
    : 'Filtering is disabled.';
}

toggleBtn.addEventListener('click', () => {
  const nowEnabled = toggleBtn.dataset.enabled !== 'true';
  chrome.storage.local.set({ enabled: nowEnabled });
  updateToggleUI(nowEnabled);
  runContentScript();
});

rescanBtn.addEventListener('click', () => {
  runContentScript();
});

saveBtn.addEventListener('click', () => {
  const raw = customInput.value.trim();
  if (!raw) return;
  const newBrands = raw.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  chrome.storage.local.get(['customBrands'], (data) => {
    const existing = data.customBrands || [];
    const merged = [...new Set([...existing, ...newBrands])];
    chrome.storage.local.set({ customBrands: merged }, () => {
      customInput.value = '';
      renderCustomList(merged);
      runContentScript();
    });
  });
});

function renderCustomList(brands) {
  customList.innerHTML = '';
  brands.forEach(brand => {
    const li = document.createElement('li');
    li.textContent = brand;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Remove';
    del.addEventListener('click', () => removeBrand(brand));
    li.appendChild(del);
    customList.appendChild(li);
  });
}

function removeBrand(brand) {
  chrome.storage.local.get(['customBrands'], (data) => {
    const updated = (data.customBrands || []).filter(b => b !== brand);
    chrome.storage.local.set({ customBrands: updated }, () => {
      renderCustomList(updated);
      runContentScript();
    });
  });
}

async function runContentScript() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  }).then(() => {
    // Refresh count after a short delay
    setTimeout(() => {
      chrome.storage.local.get(['hiddenCount'], (data) => {
        countEl.textContent = data.hiddenCount || 0;
      });
    }, 600);
  }).catch(err => {
    statusEl.textContent = '⚠️ Not an Amazon page.';
  });
}

