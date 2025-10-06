import { useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, PackageSearch, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InventoryItem, StorageLocation, Product } from '@/types/database';

type InventoryOverviewRow = InventoryItem & {
  product?: Product | Product[] | null;
  storage_location?: StorageLocation | StorageLocation[] | null;
};

interface LocationSummary {
  location: StorageLocation;
  items: InventoryItem[];
}

export function InventoryOverview() {
  const [summaries, setSummaries] = useState<LocationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocation | null>(null);

  // Form state
  const [newProductName, setNewProductName] = useState('');
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [newUnit, setNewUnit] = useState('pcs');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setIsLoading(true);
    setHasError(false);

    try {
      const [locationsResponse, inventoryResponse] = await Promise.all([
        supabase.from('storage_locations').select('*').order('name'),
        supabase
          .from('inventory')
          .select(
            `
            id,
            product_id,
            storage_location_id,
            quantity,
            unit,
            minimum_threshold,
            created_at,
            last_updated,
            product:products(id, name, default_unit),
            storage_location:storage_locations(id, name, icon)
          `
          )
          .order('last_updated', { ascending: false }),
      ]);

      if (locationsResponse.error) throw locationsResponse.error;
      if (inventoryResponse.error) throw inventoryResponse.error;

      const locations = (locationsResponse.data ?? []) as StorageLocation[];
      const rawInventory = (inventoryResponse.data ?? []) as InventoryOverviewRow[];

      const inventoryItems: Array<InventoryItem & {
        product?: Product;
        storage_location?: StorageLocation;
      }> = rawInventory.map((item) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product ?? undefined,
        storage_location: Array.isArray(item.storage_location) ? item.storage_location[0] : item.storage_location ?? undefined,
      }));

      const grouped: LocationSummary[] = locations.map((location) => ({
        location,
        items: inventoryItems.filter((item) => item.storage_location_id === location.id),
      }));

      setSummaries(grouped);
    } catch (error) {
      console.error('Erreur chargement inventaire:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLocation) return;

    setSaving(true);

    try {
      // Étape 1 : vérifier si le produit existe déjà
      const normalizedName = newProductName.trim();

      const { data: existingProducts, error: prodError } = await supabase
        .from('products')
        .select('id, default_unit')
        .ilike('name', normalizedName)
        .limit(1);

      if (prodError) throw prodError;

      let productId: string;

      if (existingProducts && existingProducts.length > 0) {
        const existing = existingProducts[0];
        productId = existing.id;
        if (existing.default_unit) {
          setNewUnit(existing.default_unit);
        }
      } else {
        // Étape 2 : créer un nouveau produit si inexistant
        const { data: newProd, error: insertError } = await supabase
          .from('products')
          .insert([{ name: normalizedName, default_unit: newUnit }], { onConflict: 'name' })
          .select()
          .maybeSingle();

        if (insertError) {
          if (insertError.code === '23505' || insertError.code === '409' || insertError.details?.includes('duplicate key')) {
            const { data: dup } = await supabase
              .from('products')
              .select('id, default_unit')
              .ilike('name', normalizedName)
              .maybeSingle();
            if (dup) {
              productId = dup.id;
              if (dup.default_unit) {
                setNewUnit(dup.default_unit);
              }
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        } else if (newProd) {
          productId = newProd.id;
        }
      }

      // Étape 3 : insérer dans inventory
      const { error: invError } = await supabase.from('inventory').insert([
        {
          product_id: productId,
          storage_location_id: selectedLocation.id,
          quantity: newQuantity,
          unit: newUnit,
        },
      ]);

      if (invError) throw invError;

      // Fermer et refresh
      setShowModal(false);
      setNewProductName('');
      setNewQuantity(1);
      setNewUnit('pcs');
      loadOverview();
    } catch (err) {
      console.error('Erreur ajout produit:', err);
      alert('Impossible d’ajouter le produit.');
    } finally {
      setSaving(false);
    }
  }

  const totalItems = useMemo(
    () => summaries.reduce((acc, summary) => acc + summary.items.length, 0),
    [summaries]
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Inventaire rapide</h2>
        </div>
        <p className="text-sm text-gray-500">
          {totalItems} produit{totalItems > 1 ? 's' : ''}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement de l'inventaire…
        </div>
      ) : hasError ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <PackageSearch className="w-10 h-10 mb-3" />
          <p className="text-sm text-center max-w-xs">
            Impossible de récupérer l'inventaire. Vérifiez la connexion Supabase.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {summaries.map(({ location, items }) => (
            <div
              key={location.id}
              className="p-4 border border-gray-200 rounded-xl bg-gray-50"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{location.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {location.name}
                  </h3>
                </div>
                <span className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full">
                  {items.length} article{items.length > 1 ? 's' : ''}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                  <PackageSearch className="w-6 h-6 mb-2" />
                  <p className="text-xs">Aucun produit enregistré</p>
                  <button
                    onClick={() => {
                      setSelectedLocation(location);
                      setShowModal(true);
                    }}
                    className="mt-3 flex items-center gap-1 px-3 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 transition"
                  >
                    <Plus className="w-3 h-3" /> Ajouter un produit
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.slice(0, 4).map((item) => (
                    <li key={item.id} className="text-xs text-gray-700">
                      <span className="font-medium text-gray-900">
                        {item.product?.name}
                      </span>{' '}
                      — {item.quantity} {item.unit || item.product?.default_unit || ''}
                      {item.minimum_threshold >= 0 && item.quantity <= item.minimum_threshold ? (
                        <span className="ml-2 text-orange-600">⚠️ bas</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal pour ajouter un produit */}
      {showModal && selectedLocation && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              Ajouter un produit dans {selectedLocation.name}
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <input
                type="text"
                placeholder="Nom du produit"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
              <input
                type="number"
                placeholder="Quantité"
                value={newQuantity}
                onChange={(e) => setNewQuantity(parseInt(e.target.value))}
                className="w-full border rounded px-3 py-2"
                required
              />
              <input
                type="text"
                placeholder="Unité (ex: pcs, kg, L)"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1 text-sm border rounded"
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
