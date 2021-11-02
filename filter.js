console.log('test!');

var btn = document.getElementById('clean');

function findThoseElements() {
    console.log('finding elements');
    const thingsToClean = new Set([
        "doqaus",
        "ijoy"
    ]);

    for (const a of document.querySelectorAll("span")) {
        const tokens = a.textContent.split(' ').map(x => x.toLowerCase());

        if (tokens.some(token => thingsToClean.has(token))) {
          const elem = $(a).closest('.s-result-item');

          $(a).closest('.s-result-item ').text(String.fromCharCode("0x270B"));
        }
      }
}

btn.addEventListener("click", async function() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: findThoseElements
    });   
});
