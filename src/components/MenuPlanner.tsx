import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Menu, FamilyMember, RecipeTemplate } from '../types/database';
import { demoRecipes } from '../data/demoData';

type MenuWithDetails = Menu;

type ProposedIngredient = {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
};

type ProposedMeal = {
  meal_type: string;
  title: string;
  description?: string;
  ingredients?: ProposedIngredient[];
  suitable_for_toddler?: boolean;
  notes?: string;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  recipe_url?: string | null;
};

type ProposedDay = {
  date: string;
  label?: string;
  meals: ProposedMeal[];
};

type ProposedPlan = {
  startDate: string;
  days: ProposedDay[];
  raw?: unknown;
  mealTypes: Menu['meal_type'][];
  scope?: 'week' | 'today';
  dayCount: number;
  familySize?: number;
};

type RawProposedIngredient = {
  name?: string;
  product?: string;
  quantity?: number | string;
  unit?: string;
  notes?: string;
};

type RawProposedMeal = {
  meal_type?: string;
  mealType?: string;
  title?: string;
  description?: string;
  notes?: string;
  ingredients?: RawProposedIngredient[];
  suitable_for_toddler?: boolean;
  prep_time_minutes?: number | string;
  cook_time_minutes?: number | string;
  recipe_url?: string;
  instructions_url?: string;
  url?: string;
};

type RawProposedDay = {
  date?: string;
  label?: string;
  day?: string;
  meals?: RawProposedMeal[];
};

type RawProposalContainer = {
  plan?: { days?: RawProposedDay[] };
  days?: RawProposedDay[];
  familySize?: number;
};

const DEFAULT_MEAL_ORDER: Menu['meal_type'][] = ['breakfast', 'lunch', 'dinner'];

function normalizeQuantityForPlan(quantity: unknown, unit: unknown, familySize = 4) {
  const size = Math.max(1, Number(familySize) || 4);
  let qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { quantity: undefined, unit: sanitizeUnit(unit) };
  }

  let normalizedUnit = sanitizeUnit(unit);

  if (normalizedUnit === 'kg') {
    qty *= 1000;
    normalizedUnit = 'g';
  }
  if (normalizedUnit === 'mg') {
    qty /= 1000;
    normalizedUnit = 'g';
  }
  if (normalizedUnit === 'l') {
    qty *= 1000;
    normalizedUnit = 'ml';
  }
  if (normalizedUnit === 'cl') {
    qty *= 10;
    normalizedUnit = 'ml';
  }

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const maxMap: Record<string, number> = {
    g: 180 * size,
    ml: 320 * size,
    pcs: 4 * size,
  };
  const minMap: Record<string, number> = {
    g: 10,
    ml: 10,
    pcs: 1,
  };

  const max = maxMap[normalizedUnit] ?? 500 * size;
  const min = minMap[normalizedUnit] ?? 1;
  qty = clamp(qty, min, max);

  if (normalizedUnit === 'g' || normalizedUnit === 'ml') {
    qty = Math.round(qty / 10) * 10;
  } else if (normalizedUnit === 'pcs') {
    qty = Math.round(qty);
  }

  return { quantity: qty, unit: normalizedUnit };
}

function formatQuantityLabel(quantity?: number | null, unit?: string | null) {
  if (quantity === undefined || quantity === null) {
    return null;
  }

  const normalizedUnit = sanitizeUnit(unit);
  let value = quantity;
  let displayUnit = normalizedUnit;

  if (normalizedUnit === 'g' && value >= 1000) {
    value = Math.round((value / 1000) * 10) / 10;
    displayUnit = 'kg';
  }

  if (normalizedUnit === 'ml' && value >= 1000) {
    value = Math.round((value / 1000) * 10) / 10;
    displayUnit = 'L';
  }

  if (displayUnit === 'pcs') {
    displayUnit = displayUnit === 'pcs' && value === 1 ? 'pièce' : 'pièces';
  }

  return { value, unit: displayUnit };
}

function sanitizeUnit(unit: unknown): 'g' | 'ml' | 'pcs' | 'kg' | 'l' | 'cl' | 'mg' {
  const str = String(unit || '').toLowerCase().trim();
  if (!str) return 'pcs';
  if (['kg', 'kilogramme', 'kilogrammes'].includes(str)) return 'kg';
  if (['mg', 'milligramme', 'milligrammes'].includes(str)) return 'mg';
  if (['g', 'gramme', 'grammes'].includes(str)) return 'g';
  if (['l', 'litre', 'litres'].includes(str)) return 'l';
  if (['cl', 'centilitre', 'centilitres'].includes(str)) return 'cl';
  if (['ml', 'millilitre', 'millilitres'].includes(str)) return 'ml';
  return 'pcs';
}

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

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  cochon: ['cochon', 'porc', 'porcine', 'porcelet'],
  porc: ['porc', 'cochon'],
  porcines: ['porc', 'porcine', 'cochon'],
  porcinet: ['porcelet', 'porc', 'cochon'],
  boeuf: ['boeuf', 'bœuf', 'beouf'],
  boeufs: ['boeuf', 'bœuf'],
  pommes: ['pomme', 'pommes'],
  pomme: ['pomme', 'pommes'],
  terre: ['terre'],
  patate: ['patate', 'patates', 'pommes'],
  patates: ['patate', 'patates', 'pommes'],
};

function buildFallbackRecipeUrl(title: string) {
  const query = encodeURIComponent(title || 'recette facile famille');
  return `https://www.marmiton.org/recettes/recherche.aspx?aqt=${query}`;
}

function normalizeTextForKeywords(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractAllowedRecipeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value.trim());
    if (!ALLOWED_RECIPE_DOMAINS.includes(parsed.hostname.toLowerCase())) {
      return undefined;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

function extractRecipeKeywords(value: unknown): string[] {
  const normalized = normalizeTextForKeywords(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter((word) => word.length > 2 && !RECIPE_KEYWORD_STOP_WORDS.has(word));
}

function hasSufficientKeywordOverlap(expected: string[], candidate: string[]): boolean {
  if (expected.length === 0) return true;
  if (candidate.length === 0) return false;
  const candidateSet = new Set(candidate);
  const matches = expected.filter((word) => candidateSet.has(word));
  if (expected.length === 1) return matches.length === 1;
  if (expected.length === 2) return matches.length >= 2;
  const required = Math.min(expected.length, Math.max(2, Math.ceil(expected.length / 2)));
  return matches.length >= required;
}

function keywordMatches(word: string, candidateSet: Set<string>): boolean {
  const synonyms = KEYWORD_SYNONYMS[word] || [word];
  return synonyms.some((syn) => candidateSet.has(syn));
}

function hasEssentialKeywordCoverage(expected: string[], candidate: string[]): boolean {
  if (expected.length === 0) return true;
  if (candidate.length === 0) return false;
  const candidateSet = new Set(candidate);
  return expected.every((word) => {
    if (OPTIONAL_RECIPE_KEYWORDS.has(word)) {
      return true;
    }
    return keywordMatches(word, candidateSet);
  });
}

function sanitizeRecipeLink(url: unknown, title?: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.pathname.includes('/recettes/recherche') ||
      parsed.pathname.includes('/recherche')
    ) {
      const queryTarget = parsed.searchParams.get('aqt') || parsed.searchParams.get('q');
      const target = extractAllowedRecipeUrl(queryTarget);
      if (target) {
        return target;
      }
    }
    if (!ALLOWED_RECIPE_DOMAINS.includes(parsed.hostname.toLowerCase())) {
      const titleUrl = extractAllowedRecipeUrl(title);
      return titleUrl;
    }
    const titleKeywords = extractRecipeKeywords(title);
    const pathKeywords = extractRecipeKeywords(decodeURIComponent(parsed.pathname));
    if (
      !hasSufficientKeywordOverlap(titleKeywords, pathKeywords) ||
      !hasEssentialKeywordCoverage(titleKeywords, pathKeywords)
    ) {
      if (titleKeywords.length === 0) {
        return extractAllowedRecipeUrl(title);
      }
      return (
        extractAllowedRecipeUrl(title) || buildFallbackRecipeUrl(String(title || ''))
      );
    }
  } catch {
    return extractAllowedRecipeUrl(title);
  }
  return trimmed;
}

function buildExpectedDates(start: Date, scope: 'week' | 'today', requestedCount: number): Date[] {
  const base = new Date(start);
  base.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  if (scope === 'today') {
    dates.push(base);
  } else {
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(base);
      day.setDate(base.getDate() + i);
      dates.push(day);
    }
  }

  while (dates.length < requestedCount) {
    const last = dates.length > 0 ? dates[dates.length - 1] : base;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    dates.push(next);
  }

  return dates.slice(0, requestedCount);
}

export function MenuPlanner() {
  const [menus, setMenus] = useState<MenuWithDetails[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuWithDetails | null>(null);
  const [proposedPlan, setProposedPlan] = useState<ProposedPlan | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState<Menu['meal_type'][]>([...DEFAULT_MEAL_ORDER]);
  const [generationScope, setGenerationScope] = useState<'week' | 'today'>('week');

  const startOfWeek = useMemo(() => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // lundi en premier
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [currentDate]);

  const loadMenus = useCallback(async () => {
    const start = new Date(startOfWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    try {
      const { data, error } = await supabase
        .from('menus')
        .select(`
          *,
          menu_ingredients (
            id,
            menu_id,
            product_id,
            name,
            quantity,
            unit,
            available_qty,
            missing_qty,
            product:products (id, name, default_unit)
          )
        `)
        .eq('source', 'ai')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true })
        .order('meal_type', { ascending: true });

      if (!error && data) {
        setMenus(data as MenuWithDetails[]);
      } else {
        setMenus([]);
      }
    } catch (err) {
      console.error('Erreur chargement menus:', err);
      setMenus([]);
    }
  }, [startOfWeek]);

  const requestMenuProposals = useCallback(async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setLastError(null);
    window.dispatchEvent(new Event('menu-planner:generate-start'));

    try {
      const effectiveStart = generationScope === 'today' ? new Date() : new Date(startOfWeek);
      effectiveStart.setHours(0, 0, 0, 0);
      const startStr = effectiveStart.toISOString().split('T')[0];

      const response = await fetch('/api/menus/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: startStr, mealTypes: selectedMeals, scope: generationScope }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Échec de la génération (HTTP ${response.status})`);
      }

      const payload = await response.json();
      const normalizedMealTypesFromApi = Array.isArray(payload?.mealTypes) && payload.mealTypes.length
        ? payload.mealTypes.map((type: string) => normalizeMealTypeLabel(type))
        : selectedMeals;

      const requestedDayCount = typeof payload?.dayCount === 'number' ? payload.dayCount : generationScope === 'today' ? 1 : 7;

      const fallbackDayCount = generationScope === 'today' ? 1 : 7;
      const expectedDates = buildExpectedDates(effectiveStart, generationScope, Math.max(fallbackDayCount, requestedDayCount));

      const normalizedPlan = normalizeProposal(
        payload,
        expectedDates,
        normalizedMealTypesFromApi,
        requestedDayCount
      );
      setProposedPlan({
        ...normalizedPlan,
        scope: generationScope,
        familySize: typeof payload?.familySize === 'number' ? payload.familySize : undefined,
      });
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Erreur génération menus:', error);
      setLastError(error instanceof Error ? error.message : 'Impossible de générer automatiquement les menus.');
    } finally {
      setIsGenerating(false);
      window.dispatchEvent(new Event('menu-planner:generate-end'));
    }
  }, [generationScope, isGenerating, selectedMeals, startOfWeek]);

  const confirmMenuPlan = useCallback(async () => {
    if (!proposedPlan || isSavingPlan) return;

    setIsSavingPlan(true);
    window.dispatchEvent(new Event('menu-planner:generate-start'));
    try {
      const response = await fetch('/api/menus/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: proposedPlan.startDate,
          scope: proposedPlan.scope ?? 'week',
          mealTypes: proposedPlan.mealTypes,
          plan: proposedPlan.days.map((day) => ({
            date: day.date,
            meals: day.meals.map((meal) => ({
              meal_type: meal.meal_type,
              title: meal.title,
              description: meal.description,
              suitable_for_toddler: meal.suitable_for_toddler,
              prep_time_minutes: meal.prep_time_minutes,
              cook_time_minutes: meal.cook_time_minutes,
              recipe_url: meal.recipe_url,
              ingredients: (meal.ingredients || []).map((ingredient) => ({
                name: ingredient.name,
                quantity: ingredient.quantity,
                unit: ingredient.unit,
              })),
            })),
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `Échec de l'enregistrement (HTTP ${response.status})`);
      }

      setProposedPlan(null);
      setIsPreviewOpen(false);
      await loadMenus();
      window.dispatchEvent(new Event('inventory:updated'));
      window.dispatchEvent(new Event('shopping-list:updated'));
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch (error) {
      console.error("Erreur d'enregistrement des menus:", error);
      setLastError(error instanceof Error ? error.message : "Impossible d'enregistrer les menus générés.");
    } finally {
      setIsSavingPlan(false);
      window.dispatchEvent(new Event('menu-planner:generate-end'));
    }
  }, [isSavingPlan, loadMenus, proposedPlan]);

  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);

  useEffect(() => {
    function handleGenerateRequest() {
      void requestMenuProposals();
    }

    window.addEventListener('menu-planner:generate-week', handleGenerateRequest);
    return () => {
      window.removeEventListener('menu-planner:generate-week', handleGenerateRequest);
    };
  }, [requestMenuProposals]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  }, [startOfWeek]);

  const mealTypeLabels: Record<string, string> = {
    breakfast: 'Petit-déj',
    lunch: 'Déjeuner',
    dinner: 'Dîner',
    snack: 'Goûter',
  };

  const mealSelectionOptions: Array<{ value: Menu['meal_type']; label: string }> = [
    { value: 'breakfast', label: 'Petit-déj' },
    { value: 'lunch', label: 'Déjeuner' },
    { value: 'dinner', label: 'Dîner' },
  ];

  const scopeOptions: Array<{ value: 'week' | 'today'; label: string }> = [
    { value: 'week', label: 'Semaine complète' },
    { value: 'today', label: "Aujourd'hui" },
  ];

  const toggleMealSelection = (value: Menu['meal_type']) => {
    setSelectedMeals((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const extraMealTypes = useMemo(
    () =>
      Array.from(
        new Set(
          menus
            .map((menu) => menu.meal_type)
            .filter((type) => !DEFAULT_MEAL_ORDER.includes(type))
        )
      ),
    [menus]
  );
  const mealTypeOrder: Array<Menu['meal_type']> = [...DEFAULT_MEAL_ORDER, ...extraMealTypes];

  const menusByDate = useMemo(() => {
    const map = new Map<string, MenuWithDetails[]>();
    menus.forEach((menu) => {
      const list = map.get(menu.date) || [];
      list.push(menu);
      map.set(menu.date, list);
    });
    return map;
  }, [menus]);

  function previousWeek() {
    const newDate = new Date(startOfWeek);
    newDate.setDate(startOfWeek.getDate() - 7);
    setCurrentDate(newDate);
  }

  function nextWeek() {
    const newDate = new Date(startOfWeek);
    newDate.setDate(startOfWeek.getDate() + 7);
    setCurrentDate(newDate);
  }

  function getStatusBadge(status?: Menu['stock_status']) {
    if (status === 'missing-all') {
      return { label: 'Stock indisponible', color: 'text-red-600', Icon: AlertTriangle };
    }
    if (status === 'missing-partial') {
      return { label: 'Stock partiel', color: 'text-amber-600', Icon: AlertTriangle };
    }
    return { label: 'Prêt', color: 'text-emerald-600', Icon: CheckCircle2 };
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Planification des menus</h2>
            <p className="text-xs text-gray-500">
              Menus adaptés à la famille, synchronisés avec vos stocks
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase text-gray-500 tracking-wide">
              Repas générés
            </span>
            <div className="flex gap-1">
              {mealSelectionOptions.map((option) => {
                const active = selectedMeals.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleMealSelection(option.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-500 hover:border-teal-200 hover:text-teal-600'
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium uppercase text-gray-500 tracking-wide">
              Période
            </span>
            <div className="flex gap-1">
              {scopeOptions.map((option) => {
                const active = generationScope === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setGenerationScope(option.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-500 hover:border-teal-200 hover:text-teal-600'
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={requestMenuProposals}
              disabled={isGenerating}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? 'Génération…' : generationScope === 'today' ? 'Générer aujourd’hui' : 'Générer la semaine'}
            </button>
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nouveau menu
            </button>
          </div>
        </div>
      </div>

      {lastError && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <p>{lastError}</p>
        </div>
      )}

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
        <Sparkles className="w-4 h-4 inline mr-1" />
        L’algorithme tient compte de l’inventaire (frigo, congélo, garde-manger), ajuste les portions pour 5 adultes/ados et 1 tout-petit, puis crée la liste de courses pour les ingrédients manquants.
      </div>

      <div className="flex items-center justify-between mb-6">
        <button
          onClick={previousWeek}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        <h3 className="text-sm font-medium text-gray-900">
          Semaine du {startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </h3>

        <button
          onClick={nextWeek}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {menus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
          Aucun menu IA enregistré pour cette semaine. Générez-en un pour voir les propositions.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dateStr = day.toISOString().split('T')[0];
            const dayMenus = menusByDate.get(dateStr) ?? [];
            const isToday = day.toDateString() === new Date().toDateString();

            return (
              <div
                key={dateStr}
                className={`border-2 rounded-xl p-3 transition-all ${
                  isToday
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 bg-white hover:border-teal-300'
                }`}
              >
                <div className="text-center mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase">
                    {day.toLocaleDateString('fr-FR', { weekday: 'short' })}
                  </p>
                  <p className={`text-lg font-bold ${isToday ? 'text-teal-600' : 'text-gray-900'}`}>
                    {day.getDate()}
                  </p>
                </div>

                <div className="space-y-2">
                  {dayMenus.length === 0 && (
                    <div className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg text-center text-xs text-gray-400">
                      Aucun menu IA
                    </div>
                  )}
                  {mealTypeOrder.map((mealType) => {
                    const meal = dayMenus.find((m) => m.meal_type === mealType);
                    if (!meal) return null;

                    const { label, color, Icon } = getStatusBadge(meal.stock_status);
                    const StatusIcon = Icon;
                    return (
                      <button
                        key={meal.id}
                        type="button"
                        onClick={() => setOpenMenu(meal)}
                        className="w-full text-left p-3 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-100 hover:border-emerald-200 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-emerald-700">
                            {mealTypeLabels[meal.meal_type]}
                          </p>
                          <div className="flex items-center gap-1 text-[11px] font-medium">
                            <StatusIcon className={`w-3 h-3 ${color}`} />
                            <span className={color}>{label}</span>
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-gray-900 font-semibold line-clamp-2">
                          {meal.title}
                        </p>
                        {meal.suitable_for_toddler === false && (
                          <p className="text-[11px] text-orange-600 mt-1">Non adapté à Sophy</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddModalOpen && (
        <AddMenuModal
          date={selectedDate}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={() => {
            setIsAddModalOpen(false);
            void loadMenus();
          }}
        />
      )}

      {openMenu && (
        <MenuDetailsDrawer
          menu={openMenu}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {isPreviewOpen && proposedPlan && (
        <MenuProposalModal
          plan={proposedPlan}
          isSaving={isSavingPlan}
          onClose={() => {
            if (isSavingPlan) return;
            setIsPreviewOpen(false);
          }}
          onConfirm={confirmMenuPlan}
          onRegenerate={() => {
            setIsPreviewOpen(false);
            void requestMenuProposals();
          }}
        />
      )}
    </div>
  );
}

function normalizeMealTypeLabel(value: string): Menu['meal_type'] {
  const label = value?.toLowerCase().trim() ?? '';
  if (
    [
      'breakfast',
      'petit-déjeuner',
      'petit-dejeuner',
      'petit déjeuner',
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

function normalizeProposal(
  raw: RawProposalContainer | null | undefined,
  expectedDates: Date[],
  allowedMealTypes: Menu['meal_type'][] ,
  requestedDayCount: number
): ProposedPlan {
  const normalizedAllowed = Array.from(new Set(allowedMealTypes));
  const baseDates = (expectedDates.length > 0 ? expectedDates : [new Date()]).map((date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  });

  const dates: Date[] = baseDates.slice(0, requestedDayCount);
  while (dates.length < requestedDayCount) {
    const last = dates.length > 0 ? dates[dates.length - 1] : baseDates[0];
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    dates.push(next);
  }

  const isoDates = dates.map((date) => date.toISOString().split('T')[0]);

  const daysInput: RawProposedDay[] = Array.isArray(raw?.plan?.days)
    ? raw.plan.days ?? []
    : Array.isArray(raw?.days)
    ? raw.days ?? []
    : [];

  const dayMap = new Map<string, RawProposedDay>();
  daysInput.forEach((day, index) => {
    let iso: string | null = null;
    if (day?.date) {
      const parsed = new Date(day.date);
      if (!Number.isNaN(parsed.getTime())) {
        iso = parsed.toISOString().split('T')[0];
      }
    }
    if (!iso && index < isoDates.length) {
      iso = isoDates[index];
    }
    if (!iso) return;
    if (!dayMap.has(iso)) {
      dayMap.set(iso, day);
    }
  });

  const familySize = typeof raw?.familySize === 'number' ? raw.familySize : 4;
  const normalizedDays: ProposedDay[] = isoDates.map((iso, index) => {
    const expectedDate = dates[index];
    const sourceDay = dayMap.get(iso) ?? daysInput[index] ?? null;

    const mealsInput: RawProposedMeal[] = Array.isArray(sourceDay?.meals) ? sourceDay.meals ?? [] : [];
    const meals: ProposedMeal[] = mealsInput
      .map((meal) => {
        const normalizedIngredients: ProposedIngredient[] = Array.isArray(meal?.ingredients)
          ? meal.ingredients
              .map((ingredient) => {
                const normalized = normalizeQuantityForPlan(
                  ingredient?.quantity,
                  ingredient?.unit,
                  familySize
                );
                if (normalized.quantity === undefined) {
                  return null;
                }
                return {
                  name: ingredient?.name || ingredient?.product || '',
                  quantity: normalized.quantity,
                  unit: normalized.unit,
                  notes: ingredient?.notes,
                };
              })
              .filter(Boolean) as ProposedIngredient[]
          : [];

        const prepTime = Number(meal?.prep_time_minutes);
        const cookTime = Number(meal?.cook_time_minutes);
        const recipeUrl = sanitizeRecipeLink(
          meal?.recipe_url || meal?.instructions_url || meal?.url,
          meal?.title
        );

        return {
          meal_type: normalizeMealTypeLabel(meal?.meal_type || meal?.mealType || ''),
          title: meal?.title || 'Repas',
          description: meal?.description || meal?.notes || '',
          ingredients: normalizedIngredients,
          suitable_for_toddler:
            typeof meal?.suitable_for_toddler === 'boolean'
              ? meal.suitable_for_toddler
              : undefined,
          notes: meal?.notes,
          prep_time_minutes: Number.isFinite(prepTime) ? Math.max(0, Math.round(prepTime)) : undefined,
          cook_time_minutes: Number.isFinite(cookTime) ? Math.max(0, Math.round(cookTime)) : undefined,
          recipe_url: recipeUrl,
        };
      })
      .filter((meal: ProposedMeal) => normalizedAllowed.includes(meal.meal_type));

    return {
      date: iso,
      label:
        sourceDay?.label ||
        sourceDay?.day ||
        expectedDate.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      meals,
    };
  });

  const nonEmptyDays = normalizedDays.filter((day) => day.meals.length > 0);
  const effectiveDayCount = nonEmptyDays.length;

  return {
    startDate: isoDates[0],
    days: nonEmptyDays,
    raw,
    mealTypes: normalizedAllowed,
    dayCount: effectiveDayCount,
  };
}

interface MenuProposalModalProps {
  plan: ProposedPlan;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

function MenuProposalModal({ plan, isSaving, onClose, onConfirm, onRegenerate }: MenuProposalModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Proposition de menus IA</h3>
            <p className="text-xs text-gray-500">Vérifiez les repas proposés avant de les enregistrer pour la semaine.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {plan.mealTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
                >
                  <Utensils className="w-3 h-3" />
                  {type === 'breakfast'
                    ? 'Petit-déj'
                    : type === 'lunch'
                    ? 'Déjeuner'
                    : type === 'dinner'
                    ? 'Dîner'
                    : 'Goûter'}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {plan.scope === 'today'
                ? "Proposition limitée à aujourd'hui."
                : `${plan.dayCount} jours proposés.`}
            </p>
            {plan.familySize && (
              <p className="text-[11px] text-gray-500">
                Quantités prévues pour {plan.familySize} personnes.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[65vh] px-6 py-4 space-y-4">
          {plan.days.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600 text-center">
              Aucun repas n'a été proposé pour cette sélection. Essayez une nouvelle génération.
            </div>
          )}
          {plan.days.map((day) => (
            <div key={day.date} className="border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{day.label}</h4>
                  <p className="text-xs text-gray-500">{new Date(day.date).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {day.meals.map((meal) => (
                  <div
                    key={`${day.date}-${meal.meal_type}-${meal.title}`}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase text-teal-600">
                        {meal.meal_type === 'breakfast'
                          ? 'Petit-déj'
                          : meal.meal_type === 'lunch'
                          ? 'Déjeuner'
                          : meal.meal_type === 'dinner'
                          ? 'Dîner'
                          : 'Goûter'}
                      </span>
                      {meal.suitable_for_toddler === false && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Non adapté aux tout-petits
                        </span>
                      )}
                    </div>
                    <h5 className="text-sm font-semibold text-gray-900 line-clamp-2">{meal.title}</h5>
                    {meal.description && (
                      <p className="text-xs text-gray-600 line-clamp-3">{meal.description}</p>
                    )}
                    {(meal.prep_time_minutes || meal.cook_time_minutes) && (
                      <p className="text-[11px] text-gray-500">
                        {meal.prep_time_minutes ? `Préparation : ${meal.prep_time_minutes} min` : ''}
                        {meal.prep_time_minutes && meal.cook_time_minutes ? ' · ' : ''}
                        {meal.cook_time_minutes ? `Cuisson : ${meal.cook_time_minutes} min` : ''}
                      </p>
                    )}
                    {meal.recipe_url ? (
                      <a
                        href={meal.recipe_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-teal-600 hover:underline"
                      >
                        Voir la recette détaillée
                      </a>
                    ) : (
                      <p className="text-[11px] text-gray-400">Lien recette non fourni</p>
                    )}
                    <div className="mt-auto">
                      <p className="text-[11px] font-medium text-gray-500 mb-1">Ingrédients</p>
                      <ul className="space-y-1">
                        {(meal.ingredients || []).map((ingredient, index) => {
                          const formatted = formatQuantityLabel(ingredient.quantity ?? null, ingredient.unit ?? null);
                          return (
                            <li key={`${day.date}-${meal.meal_type}-${index}`} className="text-xs text-gray-600">
                              • {ingredient.name || 'Ingrédient'}
                              {formatted && (
                                <span>
                                  {' '}
                                  {formatted.value}
                                  {formatted.unit ? ` ${formatted.unit}` : ''}
                                </span>
                              )}
                              {ingredient.notes && <span className="text-gray-400"> — {ingredient.notes}</span>}
                            </li>
                          );
                        })}
                        {(!meal.ingredients || meal.ingredients.length === 0) && (
                          <li className="text-xs text-gray-400">Pas de détails fournis</li>
                        )}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500">
            Vérifiez que les repas correspondent bien à vos stocks avant de confirmer.
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRegenerate}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-60"
            >
              Générer une autre proposition
            </button>
            <button
              onClick={onConfirm}
              disabled={isSaving || plan.days.length === 0}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer et enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MenuDetailsDrawerProps {
  menu: MenuWithDetails;
  onClose: () => void;
}

function MenuDetailsDrawer({ menu, onClose }: MenuDetailsDrawerProps) {
  const badge = (() => {
    if (menu.stock_status === 'missing-all') {
      return { label: 'Aucun ingrédient disponible', color: 'text-red-600', bg: 'bg-red-50', Icon: AlertTriangle };
    }
    if (menu.stock_status === 'missing-partial') {
      return { label: 'Ingrédients manquants', color: 'text-amber-600', bg: 'bg-amber-50', Icon: AlertTriangle };
    }
    return { label: 'Tous les ingrédients sont en stock', color: 'text-emerald-600', bg: 'bg-emerald-50', Icon: CheckCircle2 };
  })();
  const StatusIcon = badge.Icon;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Utensils className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-teal-600 uppercase">
                {new Date(menu.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                {' · '}
                {menu.meal_type === 'breakfast'
                  ? 'Petit-déj'
                  : menu.meal_type === 'lunch'
                  ? 'Déjeuner'
                  : menu.meal_type === 'dinner'
                  ? 'Dîner'
                  : 'Snack'}
              </p>
              <h3 className="text-lg font-semibold text-gray-900">{menu.title}</h3>
              {menu.description && (
                <p className="mt-2 text-sm text-gray-600">{menu.description}</p>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-2 rounded-xl ${badge.bg} px-4 py-2 text-sm ${badge.color}`}>
            <StatusIcon className="w-4 h-4" />
            <span>{badge.label}</span>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Ingrédients</h4>
            {menu.menu_ingredients && menu.menu_ingredients.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {menu.menu_ingredients.map((ingredient) => {
                  const required = formatQuantityLabel(
                    ingredient.quantity,
                    ingredient.unit || ingredient.product?.default_unit || null
                  );
                  const missing = formatQuantityLabel(
                    ingredient.missing_qty,
                    ingredient.unit || ingredient.product?.default_unit || null
                  );
                  return (
                    <li key={ingredient.id} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="font-medium text-gray-900">
                          {ingredient.name || ingredient.product?.name}
                        </span>
                        {required && (
                          <span>
                            {' '}
                            — {required.value}
                            {required.unit ? ` ${required.unit}` : ''}
                          </span>
                        )}
                      </span>
                      {Number(ingredient.missing_qty || 0) > 0 && missing ? (
                        <span className="text-xs font-medium text-red-600">
                          Manque {missing.value} {missing.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600 font-medium">OK</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                Les ingrédients détaillés seront affichés après la prochaine génération automatique.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div className="rounded-lg bg-gray-50 p-3">
              <span className="font-semibold text-gray-700">Portions</span>
              <p className="mt-1 text-sm text-gray-900">
                ×{menu.portion_multiplier ?? 1}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <span className="font-semibold text-gray-700">Adapté aux tout-petits</span>
              <p className="mt-1 text-sm text-gray-900">
                {menu.suitable_for_toddler === false ? 'Non' : 'Oui'}
              </p>
            </div>
            {menu.prep_time_minutes !== null && menu.prep_time_minutes !== undefined && (
              <div className="rounded-lg bg-gray-50 p-3">
                <span className="font-semibold text-gray-700">Préparation</span>
                <p className="mt-1 text-sm text-gray-900">{menu.prep_time_minutes} min</p>
              </div>
            )}
            {menu.cook_time_minutes !== null && menu.cook_time_minutes !== undefined && (
              <div className="rounded-lg bg-gray-50 p-3">
                <span className="font-semibold text-gray-700">Cuisson</span>
                <p className="mt-1 text-sm text-gray-900">{menu.cook_time_minutes} min</p>
              </div>
            )}
            {menu.recipe_url && (
              <div className="col-span-2 rounded-lg bg-gray-50 p-3">
                <span className="font-semibold text-gray-700">Recette détaillée</span>
                <p className="mt-1 text-sm">
                  <a
                    href={menu.recipe_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:underline"
                  >
                    Ouvrir la recette pas à pas
                  </a>
                </p>
              </div>
            )}
            {!menu.recipe_url && (
              <div className="col-span-2 rounded-lg bg-gray-50 p-3">
                <span className="font-semibold text-gray-700">Recette détaillée</span>
                <p className="mt-1 text-sm text-gray-500">Aucun lien de recette fourni.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AddMenuModalProps {
  date: Date;
  onClose: () => void;
  onAdd: () => void;
}

function AddMenuModal({ date, onClose, onAdd }: AddMenuModalProps) {
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [suitableFor, setSuitableFor] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<RecipeTemplate[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const loadFamilyMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('name');

      if (!error && data && data.length > 0) {
        setFamilyMembers(data);
        setSuitableFor(data.map((member) => member.id));
      }
    } catch (error) {
      console.error('Erreur chargement membres famille:', error);
    }
  }, []);

  const loadRecipes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recipe_templates')
        .select('*')
        .eq('meal_type', mealType)
        .order('title');

      if (!error && data && data.length > 0) {
        setRecipes(data);
      } else {
        const filteredDemoRecipes = demoRecipes.filter((recipe) => recipe.meal_type === mealType);
        setRecipes(filteredDemoRecipes);
      }
    } catch (error) {
      console.warn('Recettes de démonstration chargées (Supabase indisponible):', error);
      const filteredDemoRecipes = demoRecipes.filter((recipe) => recipe.meal_type === mealType);
      setRecipes(filteredDemoRecipes);
    }
  }, [mealType]);

  useEffect(() => {
    void loadFamilyMembers();
  }, [loadFamilyMembers]);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  function selectRecipe(recipe: RecipeTemplate) {
    setTitle(recipe.title);
    setDescription(recipe.description || '');
    setShowSuggestions(false);

    if (!recipe.suitable_for_toddler) {
      const toddler = familyMembers.find((member) => member.age_group === 'toddler');
      if (toddler) {
        setSuitableFor((prev) => prev.filter((id) => id !== toddler.id));
      }
    }
  }

  function toggleMember(id: string) {
    setSuitableFor((prev) =>
      prev.includes(id) ? prev.filter((memberId) => memberId !== id) : [...prev, id]
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await supabase.from('menus').insert({
        date: date.toISOString().split('T')[0],
        meal_type: mealType,
        title,
        description,
        suitable_for: suitableFor,
        stock_status: 'ready',
        suitable_for_toddler: true,
        source: 'manual',
      });
    } catch (err) {
      console.error('Erreur ajout menu manuel:', err);
    }

    onAdd();
  }

  const mealTypeOptions = [
    { value: 'breakfast', label: 'Petit-déjeuner' },
    { value: 'lunch', label: 'Déjeuner' },
    { value: 'snack', label: 'Goûter' },
    { value: 'dinner', label: 'Dîner' },
  ] as const;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Ajouter un menu</h3>
              <p className="text-xs text-gray-500">
                {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase">Repas</label>
              <select
                value={mealType}
                onChange={(event) => setMealType(event.target.value as typeof mealType)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
              >
                {mealTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase">Titre</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                placeholder="Ex : Lasagnes maison"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                placeholder="Ajoutez une note ou des instructions rapides"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase">Servir pour</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {familyMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleMember(member.id)}
                    className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                      suitableFor.includes(member.id)
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-teal-200'
                    }`}
                  >
                    <span className="font-medium">{member.name}</span>
                    <span className="block text-xs text-gray-400">{member.age_group}</span>
                  </button>
                ))}
              </div>
            </div>

            {showSuggestions && recipes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase">Suggestions</h4>
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Masquer
                  </button>
                </div>
                <div className="space-y-2">
                  {recipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => selectRecipe(recipe)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-left hover:border-teal-300 hover:bg-teal-50"
                    >
                      <p className="font-medium text-gray-900">{recipe.title}</p>
                      {recipe.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">{recipe.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 text-sm font-medium"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
