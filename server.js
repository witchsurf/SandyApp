import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';

import {
  sanitizeRecipeUrl,
} from './server/recipeUtils.js';

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOTIFY_WEBHOOK = process.env.NOTIFY_WEBHOOK;
const ALERT_EMAIL = process.env.ALERT_EMAIL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const DEFAULT_FAMILY = [
  { id: 'demo-sandy', name: 'Sandy', age_group: 'adult' },
  { id: 'demo-rene', name: 'René', age_group: 'adult' },
  { id: 'demo-tery', name: 'Tery', age_group: 'teenager' },
  { id: 'demo-warys', name: 'Warys', age_group: 'teenager' },
  { id: 'demo-kelly', name: 'Kelly', age_group: 'teenager' },
  { id: 'demo-sophy', name: 'Sophy', age_group: 'toddler' },
];

const FALLBACK_RECIPES = [
  {
    id: 'demo-1',
    title: 'Pâtes sauce tomate',
    meal_type: 'lunch',
    description: 'Pâtes complètes avec sauce tomate maison',
    ingredients: [
      { product: 'Pâtes', quantity: 600, unit: 'g' },
      { product: 'Tomates', quantity: 500, unit: 'g' },
      { product: 'Oignon', quantity: 1, unit: 'pcs' },
    ],
    suitable_for_toddler: true,
    preparation_time: 25,
    difficulty: 'easy',
  },
  {
    id: 'demo-2',
    title: 'Poulet rôti & légumes',
    meal_type: 'dinner',
    description: 'Poulet rôti au four avec légumes de saison',
    ingredients: [
      { product: 'Poulet', quantity: 1.2, unit: 'kg' },
      { product: 'Carottes', quantity: 400, unit: 'g' },
      { product: 'Pommes de terre', quantity: 600, unit: 'g' },
    ],
    suitable_for_toddler: true,
    preparation_time: 75,
    difficulty: 'medium',
  },
  {
    id: 'demo-3',
    title: 'Riz au thon',
    meal_type: 'lunch',
    description: 'Bol de riz complet, thon et petits légumes',
    ingredients: [
      { product: 'Riz', quantity: 400, unit: 'g' },
      { product: 'Thon en boîte', quantity: 2, unit: 'pcs' },
      { product: 'Carottes', quantity: 200, unit: 'g' },
    ],
    suitable_for_toddler: true,
    preparation_time: 30,
    difficulty: 'easy',
  },
  {
    id: 'demo-4',
    title: 'Œufs brouillés & pain',
    meal_type: 'breakfast',
    description: 'Œufs brouillés moelleux avec tartines beurrées',
    ingredients: [
      { product: 'Œufs', quantity: 8, unit: 'pcs' },
      { product: 'Lait', quantity: 0.2, unit: 'L' },
      { product: 'Pain', quantity: 1, unit: 'pcs' },
    ],
    suitable_for_toddler: true,
    preparation_time: 15,
    difficulty: 'easy',
  },
  {
    id: 'demo-5',
    title: 'Salade composée',
    meal_type: 'dinner',
    description: 'Salade fraîche avec thon, tomates, œufs durs',
    ingredients: [
      { product: 'Salade', quantity: 1, unit: 'pcs' },
      { product: 'Thon en boîte', quantity: 2, unit: 'pcs' },
      { product: 'Tomates', quantity: 3, unit: 'pcs' },
      { product: 'Œufs', quantity: 4, unit: 'pcs' },
    ],
    suitable_for_toddler: false,
    preparation_time: 20,
    difficulty: 'easy',
  },
];

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeMealTypeValue(value) {
  const label = String(value || '').toLowerCase().trim();
  if (
    [
      'breakfast',
      'petit-dejeuner',
      'petit-déjeuner',
      'petit dej',
      'petit-déj',
      'matin',
    ].includes(label)
  ) {
    return 'breakfast';
  }
  if (['lunch', 'déjeuner', 'dejeuner', 'midi'].includes(label)) {
    return 'lunch';
  }
  if (['dinner', 'dîner', 'diner', 'soir'].includes(label)) {
    return 'dinner';
  }
  if (['snack', 'goûter', 'gouter', 'collation'].includes(label)) {
    return 'snack';
  }
  return 'lunch';
}

function normalizeQuantityUnit(rawQuantity, rawUnit, familySize = 4) {
  const size = Math.max(1, Number(familySize) || 4);
  let quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { quantity: null, unit: sanitizeUnit(rawUnit) };
  }

  let unit = sanitizeUnit(rawUnit);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  if (unit === 'kg') {
    quantity *= 1000;
    unit = 'g';
  }
  if (unit === 'mg') {
    quantity /= 1000;
    unit = 'g';
  }
  if (unit === 'l') {
    quantity *= 1000;
    unit = 'ml';
  }
  if (unit === 'cl') {
    quantity *= 10;
    unit = 'ml';
  }

  const maxMap = {
    g: 180 * size,
    ml: 320 * size,
    pcs: 4 * size,
  };
  const minMap = {
    g: 10,
    ml: 10,
    pcs: 1,
  };

  const max = maxMap[unit] ?? 500 * size;
  const min = minMap[unit] ?? 1;
  quantity = clamp(quantity, min, max);

  if (unit === 'g' || unit === 'ml') {
    quantity = Math.round(quantity / 10) * 10;
  } else if (unit === 'pcs') {
    quantity = Math.round(quantity);
  }

  return { quantity, unit };
}

function sanitizeUnit(unit) {
  const value = String(unit || '').toLowerCase().trim();
  if (!value) return 'pcs';
  if (['kg', 'kilogramme', 'kilogrammes'].includes(value)) return 'kg';
  if (['g', 'gramme', 'grammes'].includes(value)) return 'g';
  if (['mg', 'milligramme', 'milligrammes'].includes(value)) return 'mg';
  if (['l', 'litre', 'litres'].includes(value)) return 'l';
  if (['cl', 'centilitre', 'centilitres'].includes(value)) return 'cl';
  if (['ml', 'millilitre', 'millilitres'].includes(value)) return 'ml';
  if (['pc', 'piece', 'pièce', 'pieces', 'pièces', 'unit', 'unité', 'unites', 'units', 'portion', 'portions'].includes(value)) {
    return 'pcs';
  }
  return 'pcs';
}

function ensureSupabaseConfigured(res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({
      error: 'Supabase non configuré. Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans vos variables d\'environnement.',
    });
    return false;
  }
  return true;
}

async function supabaseFetch(path, { method = 'GET', headers = {}, body, signal } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials missing');
  }

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const finalHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...headers,
  };

  let payload = body;
  if (body && typeof body === 'object' && !(body instanceof Buffer)) {
    payload = JSON.stringify(body);
    if (!finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: payload,
    signal,
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('Erreur parsing JSON Supabase', err);
      data = text;
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error_description || `Erreur Supabase ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function recordNotification(payload) {
  try {
    await supabaseFetch('notifications', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: payload,
    });

    if (NOTIFY_WEBHOOK) {
      await fetch(NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: payload.type,
          title: payload.title,
          message: payload.message,
        }),
      }).catch((err) => console.warn('Webhook notification failed:', err.message));
    }
  } catch (err) {
    console.warn('Impossible d\'enregistrer la notification:', err.message);
  }
}

function extractFirstJsonBlock(content) {
  if (!content) return null;
  const jsonMatch = content.match(/```json[\s\S]*?```/i);
  if (jsonMatch) {
    const cleaned = jsonMatch[0].replace(/```json/i, '').replace(/```/, '');
    return cleaned.trim();
  }
  const braceMatch = content.match(/\{[\s\S]*\}/);
  return braceMatch ? braceMatch[0] : null;
}

async function callOpenAIChat(messages, { temperature = 0.7, max_tokens = 2000 } = {}) {
  if (!OPENAI_API_KEY || !openaiClient) {
    throw new Error('OPENAI_API_KEY manquant.');
  }

  const baseMessages = JSON.parse(JSON.stringify(messages));
  let attemptMessages = baseMessages;
  let maxTokens = max_tokens;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let completion;
    try {
      completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: attemptMessages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });
    } catch (err) {
      const message = err?.error?.message || err?.message || 'Appel OpenAI échoué';
      throw new Error(message);
    }

    const choice = completion?.choices?.[0];
    if (!choice) {
      throw new Error('Réponse vide d’OpenAI');
    }

    if (choice.finish_reason && choice.finish_reason !== 'stop') {
      if (choice.finish_reason === 'length' && attempt === 0) {
        attemptMessages = [
          ...baseMessages,
          {
            role: 'system',
            content:
              'La réponse précédente était trop longue. Génère de nouveau un JSON concis en respectant exactement le format demandé, avec uniquement le nombre de jours requis et au plus 3 repas et 3 ingrédients principaux par repas.',
          },
        ];
        maxTokens = Math.min(maxTokens + 500, 3500);
        continue;
      }
      console.error('OpenAI finish reason:', choice.finish_reason, choice?.message?.content);
      throw new Error("La génération IA a été interrompue. Réessayez.");
    }

    let content = choice?.message?.content;
    if (!content) {
      throw new Error('Réponse vide d’OpenAI');
    }

    content = content.replace(/```json|```/gi, '').trim();

    try {
      const parsed = JSON.parse(content);
      return { data: parsed, raw: completion };
    } catch (err) {
      console.error('OpenAI response unparsable:', content);
      throw new Error('Impossible de parser la réponse JSON d’OpenAI.');
    }
  }

  throw new Error("La génération IA a été interrompue. Réessayez.");
}

function computePortionMultiplier(familyMembers) {
  const totalWeight = familyMembers.reduce((sum, member) => {
    switch (member.age_group) {
      case 'toddler':
        return sum + 0.5;
      case 'teenager':
        return sum + 1.1; // adolescents mangent légèrement plus
      default:
        return sum + 1;
    }
  }, 0);
  const basePortions = 4;
  return Number((totalWeight / basePortions).toFixed(2));
}

async function sanitizeGeneratedPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { days: [] };
  }

  const days = Array.isArray(plan.days) ? plan.days : [];
  const sanitizedDays = [];

  for (const day of days) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    const sanitizedMeals = [];

    for (const meal of meals) {
      const title = meal?.title || '';
      const rawUrl = meal?.recipe_url || meal?.instructions_url || meal?.url;
      const sanitizedUrl = await sanitizeRecipeUrl(rawUrl, title);
      sanitizedMeals.push({
        ...meal,
        recipe_url: sanitizedUrl,
      });
    }

    sanitizedDays.push({
      ...day,
      meals: sanitizedMeals,
    });
  }

  return {
    ...plan,
    days: sanitizedDays,
  };
}

function getWeekDays(startDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

app.get('/api/status', (req, res) => {
  res.json({
    supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    alertEmailConfigured: Boolean(ALERT_EMAIL || NOTIFY_WEBHOOK),
  });
});

app.get('/api/inventory', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;

  try {
    let data;
    try {
      data = await supabaseFetch('inventory_view?select=*');
    } catch (err) {
      console.warn('Vue inventory_view indisponible, fallback inventaire brut:', err.message);
      data = await supabaseFetch('inventory?select=*');
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { product_id, name, qty, quantity, unit, location, storage_location_id, minimum_threshold = 0 } = req.body || {};

  try {
    let productId = product_id;
    let selectedUnit = unit;
    if (!productId && name) {
      const normalizedName = name.trim();
      const product = await supabaseFetch(
        `products?select=id,default_unit&name=ilike.${encodeURIComponent(normalizedName)}`
      ).then((rows) => rows?.[0]);
      if (product) {
        productId = product.id;
        if (!selectedUnit && product.default_unit) {
          selectedUnit = product.default_unit;
        }
      } else {
        let inserted = null;
        try {
          inserted = await supabaseFetch('products?on_conflict=name', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: { name: normalizedName, default_unit: selectedUnit || 'pcs' },
          });
        } catch (err) {
          if (/duplicate key value|already exists|409/.test(err.message)) {
            inserted = await supabaseFetch(
              `products?select=id,default_unit&name=ilike.${encodeURIComponent(normalizedName)}`
            );
          } else {
            throw err;
          }
        }

        const created = Array.isArray(inserted) ? inserted[0] : inserted;
        if (created) {
          productId = created.id;
          if (!selectedUnit && created.default_unit) {
            selectedUnit = created.default_unit;
          }
        }
        if (!selectedUnit) {
          selectedUnit = 'pcs';
        }
      }
    }

    let storageLocationId = storage_location_id;
    if (!storageLocationId && location) {
      const locationRow = await supabaseFetch(
        `storage_locations?select=id&name=eq.${encodeURIComponent(location)}`
      ).then((rows) => rows?.[0]);
      storageLocationId = locationRow?.id;
    }

    const payload = {
      product_id: productId,
      storage_location_id: storageLocationId,
      quantity: Number(qty ?? quantity ?? 0),
      unit: selectedUnit || 'pcs',
      minimum_threshold: Number(minimum_threshold) || 0,
    };

    const inserted = await supabaseFetch('inventory', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: payload,
    });

    res.json(inserted?.[0] || payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/menus/proposals', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY manquant côté serveur.' });
    return;
  }

  const { startDate, preferences = [], restrictions = [], scope: scopeRaw } = req.body || {};
  const scope = scopeRaw === 'today' ? 'today' : 'week';
  const requestedDayCount = scope === 'today' ? 1 : 7;
  const referenceDate = startDate ? new Date(startDate) : new Date();
  referenceDate.setHours(0, 0, 0, 0);

  try {
    const [inventoryResponse, familyResponse] = await Promise.all([
      supabaseFetch('inventory?select=quantity,unit,product:products(name,default_unit)'),
      supabaseFetch('family_members'),
    ]);

    const inventory = Array.isArray(inventoryResponse) ? inventoryResponse : [];
    const familyMembers = Array.isArray(familyResponse) && familyResponse.length > 0 ? familyResponse : DEFAULT_FAMILY;

    const inventorySummary = inventory
      .filter((item) => item?.product?.name)
      .map((item) => ({
        name: item.product.name,
        quantity: Number(item.quantity || 0),
        unit: item.unit || item.product.default_unit || 'pcs',
      }));

    const familySummary = familyMembers.map((member) => ({
      name: member.name,
      age_group: member.age_group,
    }));

    const requestedMealTypesRaw = Array.isArray(req.body?.mealTypes) && req.body.mealTypes.length
      ? req.body.mealTypes
      : ['breakfast', 'lunch', 'dinner'];
    const requestedMealTypes = Array.from(
      new Set(
        requestedMealTypesRaw.map((type) => normalizeMealTypeValue(type)).filter(Boolean)
      )
    );

    const mealTypeNameMap = {
      breakfast: 'petit-déjeuner',
      lunch: 'déjeuner',
      dinner: 'dîner',
      snack: 'goûter',
    };

    const expectedDates = scope === 'today'
      ? [new Date(referenceDate)]
      : getWeekDays(referenceDate).slice(0, requestedDayCount);
    const expectedDatesText = expectedDates
      .map((date) => {
        const copy = new Date(date);
        copy.setHours(0, 0, 0, 0);
        return `${copy.toISOString().split('T')[0]} (${copy.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })})`;
      })
      .join('; ');

    const mealTypeInstruction = requestedMealTypes
      .map((type) => mealTypeNameMap[type] || type)
      .join(', ');

    const prompt = `Génère un menu équilibré pour une famille.
Exigences :
- Utilise une structure JSON EXACTEMENT comme suit :
{
  "days": [
    {
      "date": "${referenceDate.toISOString().split('T')[0]}",
      "label": "${referenceDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}",
      "meals": [
        {
          "meal_type": "dinner",
          "title": "…",
          "description": "…",
          "ingredients": [
            { "name": "…", "quantity": 1, "unit": "pcs" }
          ],
          "prep_time_minutes": 10,
          "cook_time_minutes": 20,
          "recipe_url": "https://exemple.com/recette"
        }
      ]
    }
  ]
}
- Planifie ${requestedDayCount} jour(s).
- Repas autorisés : ${mealTypeInstruction || 'petit-déjeuner, déjeuner, dîner'} (aucun autre repas).
- Utilise au maximum les ingrédients disponibles.
- Évite les ingrédients proscrits et limite ceux rares dans les stocks.
- Préfère des repas simples à cuisiner.
- Indique suitable_for_toddler=false si un repas n'est pas adapté aux tout-petits.
- Interdiction stricte : aucun ingrédient listé dans "Restrictions" ne doit apparaître, même partiellement (ex: "poisson" => aucun poisson ni fruits de mer).
- Diversifie les repas : évite de répéter le même plat ou les mêmes ingrédients principaux plus de deux fois dans la période.
- Chaque repas doit lister au maximum 3 ingrédients principaux (ingrédients secondaires optionnels à ignorer).
- Fournis pour chaque repas les champs "prep_time_minutes" (entier minutes), "cook_time_minutes" (entier minutes) et "recipe_url" (URL https valide vers un site culinaire parmi : https://www.marmiton.org, https://cuisine.journaldesfemmes.fr, https://www.cuisineaz.com, https://www.bbcgoodfood.com, https://www.allrecipes.com, https://www.jamieoliver.com, https://www.delish.com).
- Dates exactes à utiliser et ordre à respecter : ${expectedDatesText}.
- Réponds UNIQUEMENT en JSON.`;

    const userMessage = `Période débutant le ${referenceDate.toISOString().split('T')[0]}.
Famille (${familySummary.length} personnes) : ${familySummary
      .map((member) => `${member.name} (${member.age_group})`)
      .join(', ')}.
Restrictions : ${[...restrictions].join(', ') || 'aucune'}.
Préférences : ${[...preferences].join(', ') || 'varié et équilibré'}.
Stocks disponibles : ${inventorySummary.length > 0
      ? inventorySummary.map((item) => `${item.name} (${item.quantity} ${item.unit})`).join(', ')
      : 'aucun stock particulier'}.
Prévois des quantités pour ${familyMembers.length} personnes.
Repas attendus par jour : ${mealTypeInstruction || 'petit-déjeuner, déjeuner, dîner'}.
Les portions doivent rester raisonnables : environ 120 g de féculents solides ou 250 ml de liquides par personne, et au maximum 3 pièces par personne pour les éléments unitaires.
Réponds uniquement en JSON valide.`;

    const { data } = await callOpenAIChat(
      [
        {
          role: 'system',
          content: 'Tu es un assistant nutritionniste qui génère des menus équilibrés et variés pour une famille.',
        },
        {
          role: 'user',
          content: `${prompt}
${userMessage}`,
        },
      ],
      { temperature: 0.7, max_tokens: 2500 }
    );

    const sanitizedPlan = await sanitizeGeneratedPlan(data);

    res.json({
      plan: sanitizedPlan,
      startDate: referenceDate.toISOString().split('T')[0],
      scope,
      dayCount: requestedDayCount,
      mealTypes: requestedMealTypes,
      familySize: familyMembers.length,
    });
  } catch (err) {
    console.error('Erreur génération IA:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur lors de la génération IA' });
  }
});

app.put('/api/inventory/:id', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { id } = req.params;
  const payload = {
    ...req.body,
    last_updated: new Date().toISOString(),
  };

  try {
    const updated = await supabaseFetch(`inventory?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: payload,
    });
    res.json(updated?.[0] || payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { id } = req.params;
  try {
    await supabaseFetch(`inventory?id=eq.${id}`, { method: 'DELETE' });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/menus', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  try {
    const data = await supabaseFetch(
      'menus?select=*,menu_ingredients(*,product:products(*))&order=date&order=meal_type'
    );
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shopping-lists', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  try {
    const data = await supabaseFetch(
      'shopping_lists?select=*,product:products(*)&order=is_purchased&order=priority.desc&order=added_at.desc'
    );
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopping-lists', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { product_id, name, quantity = 1, unit = 'pcs', priority = 'medium', added_reason = 'manual' } = req.body || {};

  try {
    const inserted = await supabaseFetch('shopping_lists', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        product_id: product_id || null,
        name: product_id ? null : name,
        quantity: Number(quantity),
        unit,
        priority,
        added_reason,
      },
    });
    res.json(inserted?.[0] || {});
    void recordNotification({
      type: 'shopping_reminder',
      title: 'Ajout dans la liste de courses',
      message: `${name || 'Article'} ajouté à la liste (${quantity} ${unit})`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/shopping-lists/:id', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { id } = req.params;
  try {
    const updated = await supabaseFetch(`shopping_lists?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: req.body,
    });
    res.json(updated?.[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shopping-lists/:id', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { id } = req.params;
  try {
    await supabaseFetch(`shopping_lists?id=eq.${id}`, { method: 'DELETE' });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  try {
    const data = await supabaseFetch('notifications?select=*&order=created_at.desc&limit=50');
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { id } = req.params;
  try {
    await supabaseFetch(`notifications?id=eq.${id}`, {
      method: 'PATCH',
      body: { is_read: true },
    });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/mark-all-read', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  try {
    await supabaseFetch('notifications?is_read=eq.false', {
      method: 'PATCH',
      body: { is_read: true },
    });
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alexa/shopping-list', async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;
  const { item, quantity = 1, unit = 'pcs' } = req.body || {};
  if (!item) {
    res.status(400).json({ error: 'Paramètre "item" requis.' });
    return;
  }

  try {
    const normalized = normalizeLabel(item);
    const productCandidates = await supabaseFetch(
      `products?select=*&name=ilike.%25${encodeURIComponent(item)}%25`
    ).catch(() => []);

    const product = (productCandidates || []).find((prod) => normalizeLabel(prod.name) === normalized);

    const inserted = await supabaseFetch('shopping_lists', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        product_id: product?.id ?? null,
        name: product ? null : item,
        quantity: Number(quantity),
        unit,
        added_reason: 'alexa',
        priority: 'medium',
      },
    });

    res.json({ success: true, item: inserted?.[0] || null });

    await recordNotification({
      type: 'shopping_reminder',
      title: 'Demande Alexa',
      message: `${item} ajouté via Alexa`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/menus/generate', '/api/generate-menu'], async (req, res) => {
  if (!ensureSupabaseConfigured(res)) return;

  const { startDate, scope: scopeRaw } = req.body || {};
  const scope = scopeRaw === 'today' ? 'today' : 'week';
  const dayCount = scope === 'today' ? 1 : 7;
  const referenceDate = startDate ? new Date(startDate) : new Date();
  referenceDate.setHours(0, 0, 0, 0);

  try {
    const [familyResponse, recipesResponse, productsResponse, inventoryResponse, shoppingResponse] = await Promise.all([
      supabaseFetch('family_members?select=*').catch(() => DEFAULT_FAMILY),
      supabaseFetch('recipe_templates?select=*').catch(() => FALLBACK_RECIPES),
      supabaseFetch('products?select=*').catch(() => []),
      supabaseFetch('inventory?select=*').catch(() => []),
      supabaseFetch('shopping_lists?select=*&is_purchased=eq.false').catch(() => []),
    ]);

    const familyMembers = Array.isArray(familyResponse) && familyResponse.length > 0 ? familyResponse : DEFAULT_FAMILY;
    const recipesRaw = Array.isArray(recipesResponse) && recipesResponse.length > 0 ? recipesResponse : FALLBACK_RECIPES;
    const products = Array.isArray(productsResponse) ? productsResponse : [];
    const inventoryRows = Array.isArray(inventoryResponse) ? inventoryResponse : [];
    const shoppingItems = Array.isArray(shoppingResponse) ? shoppingResponse : [];

    const requestedMealTypesRaw = Array.isArray(req.body?.mealTypes) && req.body.mealTypes.length
      ? req.body.mealTypes
      : ['breakfast', 'lunch', 'dinner'];
    const requestedMealTypes = Array.from(
      new Set(
        requestedMealTypesRaw.map((type) => normalizeMealTypeValue(type)).filter(Boolean)
      )
    );
    let mealTypes = requestedMealTypes.length > 0 ? [...requestedMealTypes] : ['breakfast', 'lunch', 'dinner'];

    const manualPlanInput = Array.isArray(req.body?.plan) ? req.body.plan : null;
    const manualPlanMap = manualPlanInput
      ? manualPlanInput.reduce((map, entry) => {
          if (!entry || !entry.date || !Array.isArray(entry.meals)) return map;
          const dateKey = new Date(entry.date).toISOString().split('T')[0];
          const meals = entry.meals.map((meal) => ({
            ...meal,
            meal_type: normalizeMealTypeValue(meal?.meal_type || meal?.mealType || ''),
          }));
          map.set(dateKey, meals);
          return map;
        }, new Map())
      : null;
    const hasManualPlan = manualPlanMap && manualPlanMap.size > 0;

    if (!hasManualPlan && recipesRaw.length === 0) {
      res.status(400).json({ error: 'Aucune recette disponible pour générer les menus.' });
      return;
    }

    const parseMinutes = (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return Math.max(0, Math.round(num));
    };

    const productById = new Map();
    const productByName = new Map();
    for (const product of products) {
      productById.set(product.id, product);
      productByName.set(normalizeLabel(product.name), product);
    }

    const portionMultiplier = computePortionMultiplier(familyMembers);

    const inventoryByProduct = new Map();
    inventoryRows.forEach((item) => {
      if (!item.product_id) return;
      const list = inventoryByProduct.get(item.product_id) || [];
      const normalized = normalizeQuantityUnit(item.quantity, item.unit, familyMembers.length);
      list.push({
        ...item,
        quantity: normalized.quantity !== null ? normalized.quantity : Number(item.quantity || 0),
        unit: normalized.unit,
      });
      inventoryByProduct.set(item.product_id, list);
    });

    for (const list of inventoryByProduct.values()) {
      list.sort((a, b) => {
        const dateA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
        const dateB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
        return dateA - dateB;
      });
    }

    const shoppingByProduct = new Map();
    const shoppingByName = new Map();
    shoppingItems.forEach((item) => {
      if (item.product_id) {
        shoppingByProduct.set(item.product_id, item);
      } else if (item.name) {
        shoppingByName.set(normalizeLabel(item.name), item);
      }
    });

    let days = scope === 'today' ? [new Date(referenceDate)] : getWeekDays(referenceDate);
    if (hasManualPlan && manualPlanMap && manualPlanMap.size > 0) {
      days = Array.from(manualPlanMap.keys()).map((iso) => {
        const parsed = new Date(iso);
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      });
    }
    const hasToddler = familyMembers.some((member) => member.age_group === 'toddler');

    if (hasManualPlan) {
      const additionalTypes = new Set();
      manualPlanMap.forEach((meals) => {
        meals.forEach((meal) => {
          if (meal?.meal_type && !mealTypes.includes(meal.meal_type)) {
            additionalTypes.add(meal.meal_type);
          }
        });
      });
      additionalTypes.forEach((type) => mealTypes.push(type));
      days = Array.from(manualPlanMap.keys())
        .map((iso) => {
          const parsed = new Date(iso);
          parsed.setHours(0, 0, 0, 0);
          return parsed;
        })
        .sort((a, b) => a.getTime() - b.getTime());
    }

    const recipesByMeal = mealTypes.reduce((acc, meal) => {
      acc[meal] = recipesRaw.filter((recipe) => recipe.meal_type === meal);
      return acc;
    }, {});

    const usedRecipeIds = new Set();
    const ingredientCache = new Map();
    const menusPayload = [];
    const menuIngredientsByKey = new Map();
    const shoppingInsertions = [];
    const shoppingUpdates = [];
    const lowStockNotifications = [];

    function getRecipeIngredients(recipe) {
      if (ingredientCache.has(recipe.id)) {
        return ingredientCache.get(recipe.id);
      }
      let parsed = [];
      if (Array.isArray(recipe.ingredients)) {
        parsed = recipe.ingredients;
      } else {
        try {
          const list = JSON.parse(recipe.ingredients || '[]');
          parsed = Array.isArray(list) ? list : [];
        } catch (err) {
          console.warn('Impossible de parser les ingrédients', recipe.id, err.message);
          parsed = [];
        }
      }
      ingredientCache.set(recipe.id, parsed);
      return parsed;
    }

    function computeAvailabilityScore(recipe) {
      const ingredients = getRecipeIngredients(recipe);
      if (!ingredients.length) return 0;
      let totalScore = 0;
      let counted = 0;
      for (const ingredient of ingredients) {
        const ingredientName = ingredient.product || ingredient.name || ingredient.title || '';
        const normalizedName = normalizeLabel(ingredientName);
        const product = productByName.get(normalizedName);
        const requiredQty = Number(ingredient.quantity || 0) * portionMultiplier;
        if (requiredQty <= 0) continue;
        counted += 1;
        if (!product) continue;
        const inventoryList = inventoryByProduct.get(product.id) || [];
        const available = inventoryList.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        if (available <= 0) continue;
        const ratio = Math.min(available / requiredQty, 1);
        totalScore += ratio;
      }
      if (counted === 0) return 0;
      return Number((totalScore / counted).toFixed(3));
    }

    function normalizeManualIngredients(list, familySize) {
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const normalized = normalizeQuantityUnit(item?.quantity, item?.unit, familySize);
        return {
          product: item?.product,
          name: item?.name || item?.product || '',
          quantity: normalized.quantity,
          unit: normalized.unit,
        };
      });
    }

    function drawRecipeForMeal(meal) {
      const basePool = recipesByMeal[meal] && recipesByMeal[meal].length > 0 ? recipesByMeal[meal] : recipesRaw;
      let pool = basePool;
      if (hasToddler) {
        const toddlerFriendly = basePool.filter((recipe) => recipe.suitable_for_toddler !== false);
        if (toddlerFriendly.length > 0) {
          pool = toddlerFriendly;
        }
      }
      const available = pool.filter((recipe) => !usedRecipeIds.has(recipe.id));
      const source = available.length > 0 ? available : pool;
      if (source.length === 0) return null;

      const scored = source.map((recipe) => ({
        recipe,
        score: computeAvailabilityScore(recipe),
      }));

      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0]?.score ?? 0;
      const bestCandidates = scored.filter((entry) => Math.abs(entry.score - topScore) < 0.05);
      const pickFrom = bestCandidates.length > 0 ? bestCandidates : scored;
      const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)]?.recipe;
      return chosen || scored[0].recipe;
    }

    for (const day of days) {
      const dateStr = day.toISOString().split('T')[0];

      const plannedMeals = manualPlanMap?.get(dateStr) || null;

      for (const meal of mealTypes) {
        const manualMeal = plannedMeals
          ? plannedMeals.find((entry) => entry && entry.meal_type === meal)
          : null;

        if (manualPlanMap && !manualMeal) {
          continue;
        }

        let recipe;
        if (manualMeal) {
          recipe = {
            id: `ai-${dateStr}-${meal}`,
            title: manualMeal.title || meal,
            meal_type: meal,
            description: manualMeal.description,
            ingredients: Array.isArray(manualMeal.ingredients) ? manualMeal.ingredients : [],
            suitable_for_toddler: manualMeal.suitable_for_toddler !== false,
          };
        } else {
          recipe = drawRecipeForMeal(meal);
          if (!recipe) continue;
          usedRecipeIds.add(recipe.id);
        }

        const ingredients = manualMeal
          ? normalizeManualIngredients(manualMeal.ingredients, familyMembers.length)
          : getRecipeIngredients(recipe);

        const menuKey = `${dateStr}:${meal}`;
        const baseSuitable = manualMeal?.suitable_for && Array.isArray(manualMeal.suitable_for)
          ? manualMeal.suitable_for.filter((id) => familyMembers.some((member) => member.id === id))
          : (manualMeal?.suitable_for_toddler === false || recipe.suitable_for_toddler === false)
          ? familyMembers.filter((m) => m.age_group !== 'toddler').map((m) => m.id)
          : familyMembers.map((m) => m.id);

        const menuIngredients = [];
        let hasMissing = false;
        let allMissing = true;

        for (const ingredient of ingredients) {
          const ingredientName = ingredient.product || ingredient.name || ingredient.title || '';
          const normalizedName = normalizeLabel(ingredientName);
          const product = productByName.get(normalizedName);

          const baseQuantity = Number(ingredient.quantity || 0);
          const rawUnit = ingredient.unit || product?.default_unit || 'pcs';
          const scaledQuantity = manualMeal ? baseQuantity : baseQuantity * portionMultiplier;
          const normalizedPortion = normalizeQuantityUnit(
            scaledQuantity,
            rawUnit,
            familyMembers.length
          );
          if (normalizedPortion.quantity === null) {
            continue;
          }
          let requiredQty = normalizedPortion.quantity;
          let unit = normalizedPortion.unit;

          if (!product) {
            hasMissing = true;
              menuIngredients.push({
                name: ingredientName,
                product_id: null,
                quantity: requiredQty,
                unit,
                available_qty: 0,
                missing_qty: requiredQty,
              });

            const existingByName = shoppingByName.get(normalizedName);
            if (existingByName) {
              const nextQuantity = Number(existingByName.quantity || 0) + requiredQty;
              shoppingUpdates.push({ id: existingByName.id, quantity: nextQuantity, unit });
              existingByName.quantity = nextQuantity;
            } else {
              shoppingInsertions.push({ name: ingredientName, quantity: requiredQty, unit, added_reason: 'auto', priority: 'high' });
              shoppingByName.set(normalizedName, {
                id: null,
                name: ingredientName,
                quantity: requiredQty,
                unit,
              });
            }
            continue;
          }

          const inventoryList = inventoryByProduct.get(product.id) || [];
          let remaining = requiredQty;
          let consumed = 0;

          for (const item of inventoryList) {
            if (remaining <= 0) break;
            const available = Number(item.quantity || 0);
            if (available <= 0) continue;
            const take = Math.min(available, remaining);
            item.quantity = Number((available - take).toFixed(2));
            consumed += take;
            remaining -= take;
            item.__dirty = true;
          }

          const missing = Number(remaining.toFixed(2));
          if (missing > 0) {
            hasMissing = true;
          }
          if (consumed > 0) {
            allMissing = false;
          }

          menuIngredients.push({
            name: product.name,
            product_id: product.id,
            quantity: Number(requiredQty.toFixed(2)),
            unit,
            available_qty: Number(consumed.toFixed(2)),
            missing_qty: missing,
          });

          if (missing > 0) {
            const existing = shoppingByProduct.get(product.id);
            if (existing) {
              const nextQuantity = Number(existing.quantity || 0) + missing;
              shoppingUpdates.push({ id: existing.id, quantity: nextQuantity, unit: existing.unit || unit });
              existing.quantity = nextQuantity;
            } else {
              shoppingInsertions.push({ product_id: product.id, quantity: missing, unit, added_reason: 'auto', priority: 'high' });
              shoppingByProduct.set(product.id, {
                id: null,
                product_id: product.id,
                quantity: missing,
                unit,
              });
            }
          }

          for (const item of inventoryList) {
            if (!item.__dirty) continue;
            if (item.minimum_threshold !== undefined && Number(item.quantity) <= Number(item.minimum_threshold)) {
              lowStockNotifications.push({ product_id: item.product_id, quantity: item.quantity, unit: item.unit });
            }
          }
        }

        const stockStatus = allMissing ? 'missing-all' : hasMissing ? 'missing-partial' : 'ready';
        const prepTimeMinutes = parseMinutes(
          manualMeal?.prep_time_minutes ?? recipe?.prep_time_minutes
        );
        const cookTimeMinutes = parseMinutes(
          manualMeal?.cook_time_minutes ?? recipe?.cook_time_minutes
        );
        const mealTitle = manualMeal?.title || recipe.title;
        const recipeUrl = await sanitizeRecipeUrl(
          manualMeal?.recipe_url ||
            manualMeal?.instructions_url ||
            recipe?.recipe_url ||
            recipe?.instructions_url,
          mealTitle
        );

        menuIngredientsByKey.set(menuKey, menuIngredients);
        menusPayload.push({
          key: menuKey,
          date: dateStr,
          meal_type: meal,
          title: mealTitle,
          description: manualMeal?.description || recipe.description || '',
          suitable_for: baseSuitable,
          portion_multiplier: manualMeal?.portion_multiplier
            ? Number(manualMeal.portion_multiplier)
            : portionMultiplier,
          suitable_for_toddler:
            manualMeal?.suitable_for_toddler !== undefined
              ? manualMeal.suitable_for_toddler
              : recipe.suitable_for_toddler ?? true,
          stock_status: stockStatus,
          source: hasManualPlan ? 'ai' : 'auto',
          prep_time_minutes: prepTimeMinutes,
          cook_time_minutes: cookTimeMinutes,
          recipe_url: recipeUrl,
        });
      }
    }

    // Persist inventory updates
    for (const list of inventoryByProduct.values()) {
      for (const item of list) {
        if (!item.__dirty) continue;
        await supabaseFetch(`inventory?id=eq.${item.id}`, {
          method: 'PATCH',
          body: {
            quantity: Number(item.quantity),
            last_updated: new Date().toISOString(),
          },
        }).catch((err) => console.warn('Erreur mise à jour inventaire:', err.message));
      }
    }

    // Update shopping list entries
    for (const update of shoppingUpdates) {
      if (!update.id) continue;
      await supabaseFetch(`shopping_lists?id=eq.${update.id}`, {
        method: 'PATCH',
        body: {
          quantity: Number(update.quantity),
          unit: update.unit,
          priority: 'high',
        },
      }).catch((err) => console.warn('Erreur mise à jour courses:', err.message));
    }

    if (shoppingInsertions.length > 0) {
      const insertChunks = [];
      const chunkSize = 50;
      for (let i = 0; i < shoppingInsertions.length; i += chunkSize) {
        insertChunks.push(shoppingInsertions.slice(i, i + chunkSize));
      }
      const shoppingDefaults = {
        product_id: null,
        name: '',
        quantity: 1,
        unit: 'pcs',
        priority: 'medium',
        added_reason: 'manual',
        is_purchased: false,
      };
      for (const chunk of insertChunks) {
        const normalizedChunk = chunk.map((item) => ({
          ...shoppingDefaults,
          ...item,
          product_id: item.product_id ?? null,
          name: item.name ?? shoppingDefaults.name,
          quantity: Number(item.quantity ?? shoppingDefaults.quantity),
          unit: item.unit ?? shoppingDefaults.unit,
          priority: item.priority ?? shoppingDefaults.priority,
          added_reason: item.added_reason ?? shoppingDefaults.added_reason,
          is_purchased: item.is_purchased ?? shoppingDefaults.is_purchased,
        }));
        await supabaseFetch('shopping_lists', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: normalizedChunk,
        }).catch((err) => console.warn('Erreur insertion courses:', err.message));
      }
    }

    // Remove existing menus within the generated range to avoid duplicates
    const startStr = days[0].toISOString().split('T')[0];
    const endStr = days[days.length - 1].toISOString().split('T')[0];

    const generationSource = hasManualPlan ? 'ai' : 'auto';

    const existingMenus = await supabaseFetch(
      `menus?select=id&date=gte.${startStr}&date=lte.${endStr}&source=eq.${generationSource}`
    ).catch(() => []);

    if (Array.isArray(existingMenus) && existingMenus.length > 0) {
      const ids = existingMenus.map((menu) => menu.id).join(',');
      await supabaseFetch(`menu_ingredients?menu_id=in.(${ids})`, { method: 'DELETE' }).catch(() => null);
      await supabaseFetch(`menus?id=in.(${ids})`, { method: 'DELETE' }).catch(() => null);
    }

    const menuDefaults = {
      recipe_id: null,
      date: null,
      meal_type: null,
      title: null,
      description: null,
      suitable_for: [],
      portion_multiplier: 1,
      suitable_for_toddler: true,
      stock_status: 'ready',
      source: generationSource,
      prep_time_minutes: null,
      cook_time_minutes: null,
      recipe_url: null,
    };

    const menusToInsert = menusPayload.map(({ key, ...rest }) => ({
      ...menuDefaults,
      ...rest,
      suitable_for: rest.suitable_for ?? menuDefaults.suitable_for,
      portion_multiplier: rest.portion_multiplier ?? menuDefaults.portion_multiplier,
      suitable_for_toddler: rest.suitable_for_toddler ?? menuDefaults.suitable_for_toddler,
      stock_status: rest.stock_status ?? menuDefaults.stock_status,
    }));

    const insertedMenus = await supabaseFetch('menus?on_conflict=date,meal_type', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: menusToInsert,
    });

    const menuIdByKey = new Map(
      (insertedMenus || []).map((menu) => [`${menu.date}:${menu.meal_type}`, menu.id])
    );

    const ingredientsPayload = [];
    for (const [key, ingredients] of menuIngredientsByKey.entries()) {
      const menuId = menuIdByKey.get(key);
      if (!menuId) continue;
      ingredients.forEach((ingredient) => {
        ingredientsPayload.push({ menu_id: menuId, ...ingredient });
      });
    }

    if (ingredientsPayload.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < ingredientsPayload.length; i += chunkSize) {
        const chunk = ingredientsPayload.slice(i, i + chunkSize);
        await supabaseFetch('menu_ingredients', {
          method: 'POST',
          body: chunk,
        }).catch((err) => console.warn('Erreur insertion ingrédients:', err.message));
      }
    }

    for (const alert of lowStockNotifications) {
      if (!alert) continue;
      const product = productById.get(alert.product_id) || { name: 'Produit' };
      await recordNotification({
        type: 'low_stock',
        title: `Stock bas: ${product.name}`,
        message: `Il reste ${alert.quantity} ${alert.unit || ''} pour ${product.name}.`,
        related_product_id: alert.product_id,
      });
    }

    if (shoppingInsertions.length > 0 || shoppingUpdates.length > 0) {
      await recordNotification({
        type: 'shopping_reminder',
        title: 'Liste de courses mise à jour',
        message: 'Des ingrédients manquants ont été ajoutés à la liste de courses.',
      });
    }

    const fullMenus = await supabaseFetch(
      'menus?select=*,menu_ingredients(*,product:products(*))&order=date&order=meal_type'
    );

    res.json(fullMenus || insertedMenus || []);
  } catch (err) {
    console.error('Erreur génération menus:', err);
    res.status(500).json({ error: err.message || 'Erreur génération menus' });
  }
});

app.get('/api/menu-history', (req, res) => {
  res.json([]);
});

app.post('/api/menu-history/:id/restore', (req, res) => {
  res.status(501).json({ error: 'Historique non implémenté dans cette version.' });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
