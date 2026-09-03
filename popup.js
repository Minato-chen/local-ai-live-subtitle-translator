document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  const { enabled = true } = await chrome.storage.sync.get({ enabled: true });
  document.getElementById("enabled").checked = enabled;
});

document.getElementById("enabled").addEventListener("change", (event) => {
  chrome.storage.sync.set({ enabled: event.target.checked });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
