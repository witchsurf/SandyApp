import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InventoryItem, Product, StorageLocation, ShoppingListItem } from '@/types/database';

const TARGET_LOCATIONS = [
  { key: 'fridge', labels: ['frigo', 'fridge'], title: 'Frigo' },
  { key: 'freezer', labels: ['congelo', 'congélo', 'freezer'], title: 'Congélo' },
  { key: 'pantry', labels: ['garde-manger', 'garde manger', 'pantry'], title: 'Garde-manger' },
] as const;

type QuickInventoryRow = InventoryItem;

type ShoppingSummaryRow = ShoppingListItem;

interface QuickDashboardProps {
  onRequestAddStock?: (locationId?: string) => void;
  onRequestAddShoppingItem?: () => void;
  onRequestGenerateMenus?: () => void;
}

interface LocationState {
  id?: string;
  icon?: string;
  title: string;
  items: Array<InventoryItem & { product?: Product }>;
  isConfigured: boolean;
}

interface ShoppingSummary {
  count: number;
  nextItem?: string;
}

export function QuickDashboard({
  onRequestAddStock,
  onRequestAddShoppingItem,
  onRequestGenerateMenus,
}: QuickDashboardProps) {
  const [locations, setLocations] = useState<LocationState[]>([]);
  const [shoppingSummary, setShoppingSummary] = useState<ShoppingSummary>({ count: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isShoppingLoading, setIsShoppingLoading] = useState(true);

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [locationsResponse, inventoryResponse, productsResponse] = await Promise.all([
        supabase.from('storage_locations').select('*'),
        supabase
          .from('inventory')
          .select(
            'id, product_id, storage_location_id, quantity, unit, minimum_threshold, created_at, last_updated'
          ),
        supabase
          .from('products')
          .select('id, name, default_unit'),
      ]);

      if (locationsResponse.error) throw locationsResponse.error;
      if (inventoryResponse.error) throw inventoryResponse.error;
      if (productsResponse.error) throw productsResponse.error;

      let rawLocations = (locationsResponse.data ?? []) as StorageLocation[];
      const inventoryRows = (inventoryResponse.data ?? []) as QuickInventoryRow[];
      const products = (productsResponse.data ?? []) as Product[];
      const productMap = new Map(products.map((product) => [product.id, product]));

      const defaults: Array<Pick<StorageLocation, 'name' | 'icon'>> = [
        { name: 'Frigo', icon: '🥶' },
        { name: 'Congélo', icon: '❄️' },
        { name: 'Garde-manger', icon: '🧺' },
      ];

      const existingKeys = new Set(rawLocations.map((location) => normalizeKey(location.name)));
      const missing = defaults.filter(
        (preset) => !existingKeys.has(normalizeKey(preset.name))
      );

      if (missing.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('storage_locations')
          .insert(missing)
          .select('*');

        if (!insertError && inserted) {
          rawLocations = [...rawLocations, ...(inserted as StorageLocation[])];
        }
      }

      const normalizedInventory: Array<InventoryItem & { product?: Product }> = inventoryRows.map(
        (row) => ({
          ...row,
          product: row.product_id ? productMap.get(row.product_id) : undefined,
        })
      );

      const mappedLocations = TARGET_LOCATIONS.map<LocationState>((target) => {
        const match = rawLocations.find((location) => {
          const normalized = normalizeKey(location.name);
          return target.labels.some((label) => normalizeKey(label) === normalized);
        });

        const items = match
          ? normalizedInventory.filter((item) => item.storage_location_id === match.id)
          : [];

        return {
          id: match?.id,
          icon: match?.icon,
          title: target.title,
          items,
          isConfigured: Boolean(match),
        };
      });

      setLocations(mappedLocations);
    } catch (error) {
      console.error('Erreur chargement inventaire (vue rapide):', error);
      setLocations(
        TARGET_LOCATIONS.map((target) => ({
          title: target.title,
          items: [],
          isConfigured: false,
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadShoppingSummary = useCallback(async () => {
    setIsShoppingLoading(true);
    try {
      const [{ data, error }, productsResponse] = await Promise.all([
        supabase
          .from('shopping_lists')
          .select(
            'id, product_id, is_purchased, quantity, unit, priority, added_reason'
          )
          .order('is_purchased')
          .order('priority', { ascending: false })
          .limit(5),
        supabase
          .from('products')
          .select('id, name, default_unit'),
      ]);

      if (error) throw error;
      if (productsResponse.error) throw productsResponse.error;

      const productMap = new Map(
        ((productsResponse.data ?? []) as Product[]).map((product) => [product.id, product])
      );

      const rows = (data ?? []) as ShoppingSummaryRow[];
      const items: Array<ShoppingListItem & { product?: Product }> = rows.map((row) => ({
        ...row,
        product: row.product_id ? productMap.get(row.product_id) : undefined,
      }));
      const pending = items.filter((item) => !item.is_purchased);

      setShoppingSummary({
        count: pending.length,
        nextItem: pending[0]?.product?.name,
      });
    } catch (error) {
      console.error('Erreur chargement liste (vue rapide):', error);
      setShoppingSummary({ count: 0 });
    } finally {
      setIsShoppingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
    loadShoppingSummary();

    const inventoryListener = () => loadInventory();
    const shoppingListener = () => loadShoppingSummary();
    const generateStart = () => setIsGenerating(true);
    const generateEnd = () => setIsGenerating(false);

    window.addEventListener('inventory:updated', inventoryListener);
    window.addEventListener('shopping-list:updated', shoppingListener);
    window.addEventListener('menu-planner:generate-start', generateStart);
    window.addEventListener('menu-planner:generate-end', generateEnd);

    return () => {
      window.removeEventListener('inventory:updated', inventoryListener);
      window.removeEventListener('shopping-list:updated', shoppingListener);
      window.removeEventListener('menu-planner:generate-start', generateStart);
      window.removeEventListener('menu-planner:generate-end', generateEnd);
    };
  }, [loadInventory, loadShoppingSummary]);

  const totalItems = useMemo(
    () => locations.reduce((acc, location) => acc + location.items.length, 0),
    [locations]
  );

  function handleAdd(locationId?: string) {
    if (!locationId) {
      alert('Configurez d\'abord cet emplacement dans Supabase.');
      return;
    }
    if (onRequestAddStock) {
      onRequestAddStock(locationId);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('stock-manager:add-item', {
        detail: { locationId },
      })
    );
  }

  function handleGenerateMenus() {
    setIsGenerating(true);
    if (onRequestGenerateMenus) {
      onRequestGenerateMenus();
      return;
    }
    window.dispatchEvent(new Event('menu-planner:generate-week'));
  }

  function handleAddShoppingItem() {
    if (onRequestAddShoppingItem) {
      onRequestAddShoppingItem();
      return;
    }
    window.dispatchEvent(new Event('shopping-list:add-item'));
  }

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planificateur de menus familiaux</h1>
          <p className="text-sm text-gray-500">
            {isLoading ? 'Inventaire en cours…' : `${totalItems} produits suivis dans vos espaces de stockage`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleGenerateMenus}
            disabled={isGenerating}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
          >
            {isGenerating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Générer 7 menus
          </button>
          <button
            onClick={handleAddShoppingItem}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            <Plus className="w-4 h-4 mr-2" />
            Article manuel
          </button>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid gap-4 md:grid-cols-3">
          {locations.map((location) => (
            <div key={location.title} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {location.icon ? <span>{location.icon}</span> : null}
                    {location.title}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {location.isConfigured
                      ? location.items.length > 0
                        ? `${location.items.length} article${location.items.length > 1 ? 's' : ''}`
                        : 'Vide'
                      : 'Initialisation…'}
                  </p>
                </div>
                <button
                  onClick={() => handleAdd(location.id)}
                  disabled={!location.isConfigured}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 disabled:text-gray-400 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                >
                  + Ajouter
                </button>
              </div>

              {location.isConfigured ? (
                location.items.length > 0 ? (
                  <ul className="space-y-1 text-xs text-gray-700">
                    {location.items.slice(0, 3).map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span className="font-medium text-gray-900">
                          {item.product?.name ?? 'Produit'}
                        </span>
                        <span>
                          {item.quantity} {item.unit || item.product?.default_unit || ''}
                        </span>
                      </li>
                    ))}
                    {location.items.length > 3 && (
                      <li className="text-[11px] text-gray-500">
                        + {location.items.length - 3} autre{location.items.length - 3 > 1 ? 's' : ''}
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">Aucun produit enregistré</p>
                )
              ) : (
                <p className="text-xs text-gray-500">Initialisation des emplacements…</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-900 font-semibold">
              <ShoppingCart className="w-4 h-4" />
              Liste de courses
            </div>
            <button
              onClick={handleAddShoppingItem}
              className="text-xs font-medium text-teal-600 hover:text-teal-700"
            >
              + Ajouter
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {isShoppingLoading
              ? 'Chargement…'
              : shoppingSummary.count === 0
              ? 'Rien à acheter'
              : `${shoppingSummary.count} article${shoppingSummary.count > 1 ? 's' : ''} à acheter${
                  shoppingSummary.nextItem ? ` • Prochain: ${shoppingSummary.nextItem}` : ''
                }`}
          </p>
        </div>
      </div>
    </section>
  );
}
function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
