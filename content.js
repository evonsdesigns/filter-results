// content.js — injected into Amazon pages
// Detects and hides results from weirdly-named Chinese dropshipper brands

(async function () {
  console.group('[Amazon Brand Filter] 🚀 Content script loaded on:', location.href);

  const data = await new Promise(resolve =>
    chrome.storage.local.get(['enabled', 'customBrands', 'filterMode'], resolve)
  );
  console.log('[ABF] Storage state:', data);

  const enabled = data.enabled !== false;
  const filterMode = data.filterMode || 'hide'; // 'hide' | 'flag'
  console.log('[ABF] Filter mode:', filterMode);

  // Restore any previously hidden or flagged items first
  const previouslyHidden = document.querySelectorAll('[data-amz-filter="hidden"]');
  console.log(`[ABF] Restoring ${previouslyHidden.length} previously hidden item(s).`);
  previouslyHidden.forEach(el => {
    el.style.display = '';
    el.removeAttribute('data-amz-filter');
  });
  document.querySelectorAll('[data-amz-filter="flagged"]').forEach(el => {
    el.removeAttribute('data-amz-filter');
    el.style.position = '';
    const badge = el.querySelector('.amz-filter-badge');
    if (badge) badge.remove();
  });

  if (!enabled) {
    console.log('[ABF] Filter is OFF — exiting.');
    console.groupEnd();
    chrome.storage.local.set({ hiddenCount: 0 });
    return;
  }

  const customBrands = new Set((data.customBrands || []).map(b => b.toLowerCase()));
  console.log('[ABF] Custom blocklist:', customBrands.size > 0 ? [...customBrands] : '(empty)');

  // ── Heuristic helpers ──────────────────────────────────────────────────────

  // Well-known legitimate all-caps brands that should never be filtered
  const SAFE_BRANDS = new Set([
    'sony', 'bose', 'anker', 'apple', 'samsung', 'lg', 'jbl', 'amd', 'cpu',
    'nvidia', 'intel', 'asus', 'acer', 'dell', 'hp', 'ibm', 'akg', 'usa',
    'nato', 'nasa', 'usb', 'hdmi', 'atv', 'led', 'lcd', 'oled', 'ram',
    'ssd', 'hdd', 'rgb', 'hvac', 'ac', 'dc', 'nikon', 'canon', 'fuji',
    'avid', 'abc', 'cbs', 'nbc', 'ups', 'dhl', 'tplink', 'tp-link',
    'logitech', 'razer', 'corsair', 'belkin', 'netgear', 'linksys',
    'dewalt', 'makita', 'bosch', 'ryobi', 'ridgid', 'stanley', 'craftsman',
    'kitchenaid', 'cuisinart', 'hamilton', 'instant', 'ninja', 'vitamix',
    'fitbit', 'garmin', 'polar', 'suunto', 'casio', 'seiko', 'citizen',
    'lego', 'hasbro', 'mattel', 'fisher', 'vtech', 'leapfrog',
    'ajax', 'ajax', 'jquery', 'vue',
    // Drinkware / kitchen brands commonly sold on Amazon
    'stanley', 'hydro', 'hydrojug', 'hydroflask', 'owala', 'klean', 'contigo',
    'hefty', 'pyrex', 'silverette', 'munchkin', 'simple', 'iron', 'collective',
    'dixie', 'yeti', 'nalgene', 'camelbak', 'thermos', 'zojirushi',
    'vitamix', 'ninja', 'instant', 'cuisinart', 'hamilton', 'kitchenaid',
    // Amazon / generic
    'amazon',
  ]);

  // Hardcoded known Chinese dropshipper brands that heuristics alone won't reliably catch
  const KNOWN_WEIRD_BRANDS = new Set([
    'racetop', 'vitever', 'lamosi', 'dealusy',
    'doqaus', 'ijoy', 'topelek', 'elegiant', 'vbestlife', 'mugast',
    'homemaxs', 'ranipobo', 'vikakiool', 'hiearcool', 'cshidworld',
    'ankilo', 'ausdom', 'jeemak', 'kvidio', 'dodocool', 'picun',
    'pasonomi', 'cowin', 'zihnic', 'gorsun', 'vilinice', 'vogek',
    'sennuopu', 'aikela', 'mairdi', 'anioo', 'zingyou', 'sudotack',
    'kimafun', 'maono', 'fifine', 'moukey', 'lekato', 'sonicake',
    'ammoon', 'muslady', 'glocusent', 'lepotec', 'fulighture', 'elzle',
    'aiskki', 'onforu', 'linkind', 'koogeek', 'jinvoo', 'teckin',
    'lumary', 'treatlife', 'minger', 'zengge', 'wobsion', 'ntonpower',
    'powrui', 'daybetter', 'jzbrain', 'hnyyzl', 'ouiido', 'biqiqi',
    'turewell', 'kapcice', 'deewar', 'youthwhisper', 'tonor',
    'aozita', 'bluepolar', 'moumoulife', 'litopak',
    // Aquarium brands
    'hygger', 'aqqa', 'aquaneat', 'freesea', 'jebao', 'pawfly', 'fzone',
    'jerepet', 'zksj', 'datoo', 'aqqa', 'sicce',
    // Hair tool brands
    'wavytalk', 'farery', 'tymo', 'nonk', 'miracomb', 'orynne',
    // Generic Chinese sellers
    'imikeya',
  ]);

  // Unusual endings extremely rare in legitimate brands, very common in Chinese dropshipper names
  // e.g. Lamosi (-osi), Dealusy (-usy), Tuposi (-osi), Ranipobo (-obo)
  const WEIRD_ENDINGS_RE = /(?:osi|asi|isi|usi|usy|osy|asy|isy|obo|ibo|abo|ubo|ivo|evo|ako|uko|eko|ifo|ofo|afo|ita|pak|zita|vita|eya|oya|aya|bao|tao|jao|dao|gao)$/i;

  // Suspicious mid-capital: "DaToo", "JeBao" — a capital letter after lowercase mid-word
  const MIDCAP_RE = /^[A-Z][a-z]{1,4}[A-Z][a-z]/; // e.g. DaToo, JeBao, HyGger

  // Common filler suffixes used in all-caps portmanteau brand names (RACE+TOP, VIT+EVER)
  // Only suspicious when the prefix before them is not itself a meaningful standalone word
  const CAPS_FILLER_SUFFIX_RE = /^([A-Z]{3,6})(VER|TOP|FIT|JOY|MAX|LIFE|BEST|TECH|WAY|GO|US|ACE|PRO)$/;

  /**
   * Vowel-ratio check: legitimate words usually have ≥25% vowels.
   * Random consonant strings like "HNYYZL", "VBESTLIFE", "TOPELEK" fail this.
   */
  function hasLowVowelRatio(word) {
    const upper = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (upper.length < 4) return false;
    const vowels = (upper.match(/[AEIOU]/g) || []).length;
    return vowels / upper.length < 0.25;
  }

  /**
   * Returns true if the word is all-caps, 4-12 chars, and not in the safe list.
   */
  function isWeirdAllCaps(word) {
    if (!/^[A-Z][A-Z0-9]{3,11}$/.test(word)) return false;
    if (SAFE_BRANDS.has(word.toLowerCase())) return false;
    return hasLowVowelRatio(word);
  }

  /**
   * Chinese romanised syllable patterns: many brands use Pinyin-like fragments
   * e.g. "Ranipobo", "Homemaxs", "Ouiido", "Mugast", "Vikakiool"
   */
  const PINYIN_PATTERN = /(?:ao|ia|ie|iu|uo|ui|ou|ang|ing|ong|eng|ian|iao|uan|uen|üe|zh|ch|sh|xi|qi|zhi|chi|shi|xin|qin|jin|lin|ming|ning|ping|qing|ring|sing|ting|uing|ving|wing|xing|ying|zing){2,}/i;

  /**
   * Repeated syllable pattern: "biqiqi", "tooto", "mumuzo" — nonsense brand names
   */
  function hasRepeatedSyllables(name) {
    const lower = name.toLowerCase().replace(/[^a-z]/g, '');
    return /(.{2,3})\1/.test(lower);
  }

  /**
   * "Random Store" pattern: a weird prefix followed by "Store" or "shop"
   * e.g. "Ranipobo Store", "HNYYZL Official Store"
   */
  function isWeirdStoreName(name) {
    return /\b(store|shop|official|direct|mall)\b/i.test(name);
  }

  /**
   * Detects if a brand name looks like a random letter string regardless of case.
   * e.g. "Topelek", "Elegiant", "Vbestlife", "Knossos" — capitalised nonsense.
   * Strategy: strip to letters, check vowel ratio and length.
   */
  function isNonsenseLooking(name) {
    const stripped = name.replace(/[^a-zA-Z]/g, '');
    if (stripped.length < 5 || stripped.length > 14) return false;
    // Count Y as a vowel — it almost always functions as one in brand names (Hydro, Hefty, Styrle…)
    const vowels = (stripped.match(/[aeiouAEIOUyY]/g) || []).length;
    const ratio = vowels / stripped.length;
    if (ratio < 0.22) return true;
    // 5+ consecutive non-vowel letters (excluding Y) is a strong signal
    if (/[^aeiouAEIOUyY]{5,}/.test(stripped)) return true;
    return false;
  }

  /**
   * Master classifier: returns true if the brand name looks like a
   * weirdly-named Chinese dropshipper brand.
   */
  function isWeirdBrand(rawName) {
    if (!rawName) return false;
    const name = rawName.trim();
    const lower = name.toLowerCase();

    // Custom user blocklist — exact match
    if (customBrands.has(lower)) return true;
    // Also check if any custom brand is contained in the name
    for (const cb of customBrands) {
      if (lower.includes(cb)) return true;
    }

    // Skip very short or very long names
    if (name.length < 3 || name.length > 40) return false;

    // Hardcoded known weird brands (heuristic-resistant cases like RACETOP, VITEVER)
    if (KNOWN_WEIRD_BRANDS.has(lower)) return true;
    // Also match if any single token matches
    for (const tok of lower.split(/\s+/)) {
      if (KNOWN_WEIRD_BRANDS.has(tok)) return true;
    }

    const words = name.split(/\s+/);

    // Check every token for weird endings, caps-compound, and nonsense-looking
    for (const w of words) {
      const letters = w.replace(/[^a-zA-Z]/g, '');

      // Weird endings: -osi, -usy, -ita, -pak etc. — check EVERY token, not just the first
      if (letters.length >= 4 && WEIRD_ENDINGS_RE.test(letters)) {
        console.debug(`[ABF] weird-ending hit: "${w}" in "${name}"`);
        return true;
      }

      // All-caps portmanteau check per token: RACETOP, VITEVER
      const capsCompound = w.match(CAPS_FILLER_SUFFIX_RE);
      if (capsCompound) {
        const prefix = capsCompound[1];
        if (!SAFE_BRANDS.has(prefix.toLowerCase()) && (hasLowVowelRatio(prefix) || prefix.length <= 3)) {
          console.debug(`[ABF] caps-compound hit: "${w}" in "${name}" (prefix "${prefix}")`);
          return true;
        }
      }

      // Nonsense-looking word — check ALL tokens, not just when word count ≤ 2
      if (letters.length >= 5 && isNonsenseLooking(letters)) return true;

      // Mid-capital pattern: DaToo, JeBao, HyGger — capital after 1-4 lowercase chars
      if (letters.length >= 4 && MIDCAP_RE.test(w) && !SAFE_BRANDS.has(w.toLowerCase())) {
        console.debug(`[ABF] mid-cap hit: "${w}" in "${name}"`);
        return true;
      }
    }

    // "XYZ Store / Shop / Mall" pattern
    if (isWeirdStoreName(name)) {
      // Only flag if the part before "Store" is also weird
      const prefix = name.replace(/\s*(store|shop|official|direct|mall).*/i, '').trim();
      if (prefix.length >= 3 && (isNonsenseLooking(prefix) || hasRepeatedSyllables(prefix) || isWeirdAllCaps(prefix))) {
        return true;
      }
    }

    // All-caps weird string (e.g. "HNYYZL", "VBESTLIFE")
    const capsWords = name.match(/\b[A-Z][A-Z0-9]{3,}\b/g) || [];
    for (const w of capsWords) {
      if (isWeirdAllCaps(w)) return true;
    }

    // Pinyin-heavy name
    if (PINYIN_PATTERN.test(name)) return true;

    // Repeated syllable pattern
    if (hasRepeatedSyllables(name)) return true;

    return false;
  }

  // ── DOM scraping ────────────────────────────────────────────────────────────

  /**
   * Returns true for Amazon UI noise strings that are never brand names:
   * "3K+ bought in past month", "New on Amazon", "Amazon's Choice", etc.
   */
  function isBadgeNoise(text) {
    return /bought in past month/i.test(text)
        || /new on amazon/i.test(text)
        || /amazon.?s choice/i.test(text)
        || /best seller/i.test(text)
        || /limited time deal/i.test(text)
        || /^\d+[K+\d]*\+?\s/i.test(text)   // starts with a number like "3K+ ..."
        || /^\d+%\s/i.test(text);            // "10% off" etc.
  }

  /**
   * Extracts the brand/seller name from a search result card.
   * Amazon uses several different selectors across layouts.
   */
  function extractBrandFromCard(card) {
    // Dedicated brand byline selectors Amazon uses — ordered from most to least specific
    const brandSelectors = [
      '.s-line-clamp-1 .a-size-base.a-color-secondary',   // brand row below title
      '.a-row .a-size-base.a-color-secondary',             // secondary-color brand line
      '[data-cy="reviews-block"] + .a-row .a-size-base',  // brand above reviews
      '.s-merchant-info .a-size-small',                    // sold-by / merchant
      'h2 ~ .a-row .a-size-base-plus.a-color-base',        // brand after h2 title
    ];

    for (const sel of brandSelectors) {
      const el = card.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        // Reject Amazon badge/noise strings before treating as a brand
        if (isBadgeNoise(text)) continue;
        // Reject anything that looks like a product title (very long or contains common title words)
        if (text && text.length >= 2 && text.length <= 60 && !/\d+\s*(oz|pack|count|pcs|ml|ft|inch)/i.test(text)) {
          return text;
        }
      }
    }

    // Fallback: look for "Brand: X" or "Visit the X Store" patterns in the card text
    const fullText = card.textContent;
    const brandMatch = fullText.match(/\bBrand[:\s]+([A-Za-z0-9 &'\-]{2,30})/);
    if (brandMatch) return brandMatch[1].trim();

    const storeMatch = fullText.match(/Visit the ([A-Za-z0-9 &'\-]{2,30}) Store/);
    if (storeMatch) return storeMatch[1].trim();

    return null;
  }

  /**
   * Extract the product title text from a card (used as a secondary signal).
   * Amazon titles are almost always inside an h2 > a > span.
   */
  function extractTitleFromCard(card) {
    const el = card.querySelector('h2 .a-text-normal, h2 a span, h2 span');
    return el ? el.textContent.trim() : null;
  }

  // ── Main filter loop ────────────────────────────────────────────────────────

  // Amazon search result cards
  const CARD_SELECTORS = [
    '[data-component-type="s-search-result"]',
    '.s-result-item[data-asin]',
    '[data-asin][data-index]',
  ];

  let cards = [];
  let matchedSelector = null;
  for (const sel of CARD_SELECTORS) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) { cards = Array.from(found); matchedSelector = sel; break; }
  }
  console.log(`[ABF] Found ${cards.length} result card(s) using selector: "${matchedSelector || 'none matched'}".`);

  let hiddenCount = 0;
  const scanLog = [];

  for (const card of cards) {
    // Skip ads/banners that have no ASIN
    if (!card.dataset.asin && card.dataset.asin !== '0') continue;

    const asin = card.dataset.asin;
    const brand = extractBrandFromCard(card);
    const title = extractTitleFromCard(card);

    // Derive name candidates to check:
    // - The extracted brand field (most reliable)
    // - The first word of the title only — brand names lead Amazon titles, but
    //   multi-word combos like "Amazon Basics Small" cause false positives on
    //   common English words in positions 2/3.
    const titleLeadWords = title ? title.split(/\s+/) : [];
    const namesToCheck = [
      brand,
      titleLeadWords[0],   // first title word only
    ].filter(n => n && !isBadgeNoise(n) && !/^\d/.test(n.trim()));

    if (namesToCheck.length === 0) {
      console.debug(`[ABF] ASIN ${asin}: could not extract brand or title — skipping.`);
      continue;
    }

    const matchedName = namesToCheck.find(n => isWeirdBrand(n));
    const weird = !!matchedName;
    const displayBrand = brand || titleLeadWords[0] || '?';
    scanLog.push({ asin, brand: displayBrand, title: title ? title.slice(0, 60) : '', status: weird ? `❌ HIDDEN ("${matchedName}")` : '✅ kept' });
    if (weird) {
      console.warn(`[ABF] ❌ HIDING  ASIN ${asin} — matched "${matchedName}" | brand field: "${displayBrand}"`);
      if (filterMode === 'flag') {
        card.setAttribute('data-amz-filter', 'flagged');
        card.style.position = 'relative';
        const badge = document.createElement('div');
        badge.className = 'amz-filter-badge';
        badge.textContent = '❌';
        badge.title = `Flagged by Amazon Brand Filter: "${matchedName}"`;
        badge.style.cssText = [
          'position:absolute', 'top:6px', 'left:6px', 'z-index:999',
          'font-size:28px', 'line-height:1', 'pointer-events:none',
          'filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
        ].join(';');
        card.prepend(badge);
      } else {
        card.style.display = 'none';
        card.setAttribute('data-amz-filter', 'hidden');
        card.setAttribute('data-amz-filter-brand', matchedName);
      }
      hiddenCount++;
    } else {
      console.debug(`[ABF] ✅ keeping ASIN ${asin} — brand: "${displayBrand}"`);
    }
  }

  chrome.storage.local.set({ hiddenCount });
  console.log(`[ABF] ✅ Done — scanned ${cards.length} cards, ${filterMode === 'flag' ? 'flagged' : 'hid'} ${hiddenCount}.`);
  if (scanLog.length > 0) {
    console.groupCollapsed(`[ABF] 📋 Scan summary (${scanLog.length} entries)`);
    console.table(scanLog);
    console.groupEnd();
  }
  console.groupEnd();
})();
