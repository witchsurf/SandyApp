const ALLOWED_RECIPE_DOMAINS = [
  'www.marmiton.org',
  'marmiton.org',
  'cuisine.journaldesfemmes.fr',
  'www.cuisineaz.com',
  'cuisineaz.com',
  'www.bbcgoodfood.com',
  'www.allrecipes.com',
  'www.jamieoliver.com',
  'www.delish.com',
];

const RECIPE_KEYWORD_STOP_WORDS = new Set([
  'avec',
  'aux',
  'des',
  'les',
  'dans',
  'pour',
  'sur',
  'sans',
  'entre',
  'quelque',
  'quelques',
  'recette',
  'plat',
  'plats',
  'facile',
  'faciles',
  'rapide',
  'rapides',
]);

const OPTIONAL_RECIPE_KEYWORDS = new Set([
  'saute',
  'rotis',
  'rotie',
  'roties',
  'gratin',
  'grillade',
  'grille',
  'grillee',
  'grillees',
  'poelee',
  'poelees',
  'poele',
  'poeles',
  'curry',
  'sauce',
  'au',
  'aux',
  'du',
  'de',
  'des',
]);

const KEYWORD_SYNONYMS = {
  cochon: ['cochon', 'porc', 'porcine', 'porcelet'],
  porc: ['porc', 'cochon'],
  porcines: ['porc', 'porcine', 'cochon'],
  porcinet: ['porcelet', 'porc', 'cochon'],
  porcelet: ['porcelet', 'porc', 'cochon'],
  boeuf: ['boeuf', 'bœuf', 'beouf'],
  boeufs: ['boeuf', 'bœuf'],
  pommes: ['pomme', 'pommes'],
  pomme: ['pomme', 'pommes'],
  terre: ['terre'],
  patate: ['patate', 'patates', 'pommes'],
  patates: ['patate', 'patates', 'pommes'],
};

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_MAX_ENTRIES = 200;
const sanitizeCache = new Map();

function makeCacheKey(url, title) {
  const safeUrl = url || '';
  const safeTitle = normalizeLabel(title || '');
  return `${safeUrl}__${safeTitle}`;
}

function readCache(key) {
  const entry = sanitizeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    sanitizeCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  sanitizeCache.set(key, { value, timestamp: Date.now() });
  if (sanitizeCache.size > CACHE_MAX_ENTRIES) {
    const [oldestKey] = sanitizeCache.keys();
    sanitizeCache.delete(oldestKey);
  }
}

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildFallbackRecipeUrl(title = '') {
  const query = encodeURIComponent(title || 'recette facile famille');
  return `https://www.marmiton.org/recettes/recherche.aspx?aqt=${query}`;
}

const RECIPE_SEARCH_STRATEGIES = [
  {
    baseUrl: 'https://www.cuisineaz.com',
    buildSearchUrl: (keywords) => {
      const query = encodeURIComponent(keywords.join(' '));
      return `https://www.cuisineaz.com/recherche?q=${query}`;
    },
    linkPattern: /href="(\/recettes\/[^"#?]+\.aspx)"/gi,
  },
  {
    baseUrl: 'https://www.marmiton.org',
    buildSearchUrl: (keywords) => {
      const query = encodeURIComponent(keywords.join(' '));
      return `https://www.marmiton.org/recettes/recherche.aspx?aqt=${query}`;
    },
    linkPattern: /href="(\/recettes\/[^"#?]+)"/gi,
  },
];

function parseAllowedRecipeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_RECIPE_DOMAINS.includes(host)) {
      return null;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      return null;
    }
    return parsed.href;
  } catch (err) {
    return null;
  }
}

function extractRecipeKeywords(value) {
  if (!value) return [];
  const normalized = normalizeLabel(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter((word) => word.length > 2 && !RECIPE_KEYWORD_STOP_WORDS.has(word));
}

function hasSufficientKeywordOverlap(expected, candidate) {
  if (!expected || expected.length === 0) return true;
  if (!candidate || candidate.length === 0) return false;
  const candidateSet = new Set(candidate);
  const matches = expected.filter((word) => candidateSet.has(word));
  if (expected.length === 1) return matches.length === 1;
  if (expected.length === 2) return matches.length >= 2;
  const required = Math.min(expected.length, Math.max(2, Math.ceil(expected.length / 2)));
  return matches.length >= required;
}

function keywordMatches(word, candidateSet) {
  const synonyms = KEYWORD_SYNONYMS[word] || [word];
  return synonyms.some((syn) => candidateSet.has(syn));
}

function hasEssentialKeywordCoverage(expected, candidate) {
  if (!expected || expected.length === 0) return true;
  if (!candidate || candidate.length === 0) return false;
  const candidateSet = new Set(candidate);
  return expected.every((word) => {
    if (OPTIONAL_RECIPE_KEYWORDS.has(word)) {
      return true;
    }
    return keywordMatches(word, candidateSet);
  });
}

async function resolveRecipeRedirect(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        const resolved = new URL(location, url);
        return resolved.href;
      }
    }
  } catch (err) {
    console.warn('Impossible de vérifier la redirection de la recette:', err.message);
  }
  return null;
}

async function fetchTextWithTimeout(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    console.warn('Impossible de récupérer la page de recherche recette:', err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractRecipeLinksFromHtml(html, { baseUrl, linkPattern }) {
  if (!html) return [];
  const urls = new Set();
  let match;
  const regex = new RegExp(linkPattern);
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    try {
      const absolute = new URL(href, baseUrl).href;
      urls.add(absolute);
    } catch (err) {
      // ignore invalid URL
    }
  }
  return Array.from(urls);
}

async function findRecipeFromKeywords(keywords) {
  if (!keywords || keywords.length === 0) {
    return null;
  }

  for (const strategy of RECIPE_SEARCH_STRATEGIES) {
    try {
      const searchUrl = strategy.buildSearchUrl(keywords);
      const html = await fetchTextWithTimeout(searchUrl);
      const candidates = extractRecipeLinksFromHtml(html, strategy);
      for (const candidate of candidates) {
        try {
          const urlObj = new URL(candidate);
          const candidateKeywords = extractRecipeKeywords(
            decodeURIComponent(urlObj.pathname)
          );
          if (
            !hasSufficientKeywordOverlap(keywords, candidateKeywords) ||
            !hasEssentialKeywordCoverage(keywords, candidateKeywords)
          ) {
            continue;
          }
          const redirected = await resolveRecipeRedirect(candidate);
          if (redirected) {
            const redirectedUrl = new URL(redirected);
            const redirectedKeywords = extractRecipeKeywords(
              decodeURIComponent(redirectedUrl.pathname)
            );
            if (
              !hasSufficientKeywordOverlap(keywords, redirectedKeywords) ||
              !hasEssentialKeywordCoverage(keywords, redirectedKeywords)
            ) {
              continue;
            }
            if (ALLOWED_RECIPE_DOMAINS.includes(redirectedUrl.hostname.toLowerCase())) {
              return redirectedUrl.href;
            }
            continue;
          }
          if (ALLOWED_RECIPE_DOMAINS.includes(urlObj.hostname.toLowerCase())) {
            return urlObj.href;
          }
        } catch (err) {
          // ignore malformed candidate
        }
      }
    } catch (err) {
      console.warn('Recherche de recette échouée:', err.message);
    }
  }

  return null;
}

async function sanitizeRecipeUrl(url, title) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let initialUrl;
  try {
    initialUrl = new URL(trimmed);
  } catch (err) {
    return null;
  }

  const cacheKey = makeCacheKey(trimmed, title);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const remember = (value) => {
    writeCache(cacheKey, value);
    return value;
  };

  const normalizedHost = initialUrl.hostname.toLowerCase();
  const titleKeywords = extractRecipeKeywords(title);
  const allowedTitleUrl = parseAllowedRecipeUrl(title);

  if (
    initialUrl.pathname.includes('/recettes/recherche') ||
    initialUrl.pathname.includes('/recherche')
  ) {
    const queryTarget = initialUrl.searchParams.get('aqt') || initialUrl.searchParams.get('q');
    const parsedTarget = parseAllowedRecipeUrl(queryTarget);
    if (parsedTarget) {
      return remember(parsedTarget);
    }
  }

  if (!ALLOWED_RECIPE_DOMAINS.includes(normalizedHost)) {
    const alternative = await findRecipeFromKeywords(titleKeywords);
    return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
  }

  const pathKeywords = extractRecipeKeywords(decodeURIComponent(initialUrl.pathname));
  if (
    !hasSufficientKeywordOverlap(titleKeywords, pathKeywords) ||
    !hasEssentialKeywordCoverage(titleKeywords, pathKeywords)
  ) {
    const alternative = await findRecipeFromKeywords(titleKeywords);
    return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
  }

  const redirected = await resolveRecipeRedirect(trimmed);
  if (redirected) {
    try {
      const redirectedUrl = new URL(redirected);
      const redirectedHost = redirectedUrl.hostname.toLowerCase();
      if (!ALLOWED_RECIPE_DOMAINS.includes(redirectedHost)) {
        const alternative = await findRecipeFromKeywords(titleKeywords);
        return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
      }
      const redirectedKeywords = extractRecipeKeywords(
        decodeURIComponent(redirectedUrl.pathname)
      );
      if (
        !hasSufficientKeywordOverlap(titleKeywords, redirectedKeywords) ||
        !hasEssentialKeywordCoverage(titleKeywords, redirectedKeywords)
      ) {
        const alternative = await findRecipeFromKeywords(titleKeywords);
        return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
      }
      return remember(redirectedUrl.href);
    } catch (err) {
      const alternative = await findRecipeFromKeywords(titleKeywords);
      return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
    }
  }

  if (initialUrl.pathname === '/' || initialUrl.pathname.length < 2) {
    const alternative = await findRecipeFromKeywords(titleKeywords);
    return remember(alternative || allowedTitleUrl || buildFallbackRecipeUrl(title));
  }

  return remember(trimmed);
}

export {
  ALLOWED_RECIPE_DOMAINS,
  RECIPE_KEYWORD_STOP_WORDS,
  OPTIONAL_RECIPE_KEYWORDS,
  KEYWORD_SYNONYMS,
  buildFallbackRecipeUrl,
  parseAllowedRecipeUrl,
  extractRecipeKeywords,
  hasSufficientKeywordOverlap,
  keywordMatches,
  hasEssentialKeywordCoverage,
  resolveRecipeRedirect,
  fetchTextWithTimeout,
  extractRecipeLinksFromHtml,
  findRecipeFromKeywords,
  sanitizeRecipeUrl,
};
