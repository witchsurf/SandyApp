import { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Minus, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { InventoryItem, StorageLocation, Product } from '../types/database';

const DEFAULT_CATEGORY_NAME = 'Général';

function normalizeLocationKey(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-');
}

interface StockManagerEventDetail {
  locationId?: string;
}

export function StockManager() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [defaultLocationId, setDefaultLocationId] = useState<string>('');
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');

  const ensureDefaultCategoryId = useCallback(async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*');

      if (error) {
        throw error;
      }

      const categories = (data ?? []) as Array<{ id: string; name: string }>;
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .trim();

      const existing = categories.find(
        (category) => normalize(category.name) === normalize(DEFAULT_CATEGORY_NAME)
      );

      if (existing) {
        if (existing.id !== defaultCategoryId) {
          setDefaultCategoryId(existing.id);
        }
        return existing.id;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('categories')
        .insert({ name: DEFAULT_CATEGORY_NAME })
        .select('*')
        .single();

      if (insertError || !inserted) {
        throw insertError;
      }

      setDefaultCategoryId(inserted.id);
      return inserted.id;
    } catch (err) {
      console.error('Erreur catégorie:', err);
      return null;
    }
  }, [defaultCategoryId]);

  useEffect(() => {
    loadStorageLocations();
    loadInventory();
    void ensureDefaultCategoryId();
  }, [ensureDefaultCategoryId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<StockManagerEventDetail>;
      const locationId = customEvent.detail?.locationId ?? '';
      setDefaultLocationId(locationId);
      setIsAddModalOpen(true);
    };

    window.addEventListener('stock-manager:add-item', handler);
    return () => {
      window.removeEventListener('stock-manager:add-item', handler);
    };
  }, []);

  async function loadStorageLocations() {
    try {
      const { data, error } = await supabase
        .from('storage_locations')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      let locations = data ?? [];

      const existingKeys = new Set(
        locations.map((location) => normalizeLocationKey(location.name))
      );

      const defaults: Array<Pick<StorageLocation, 'name' | 'icon'>> = [
        { name: 'Frigo', icon: '🥶' },
        { name: 'Congélo', icon: '❄️' },
        { name: 'Garde-manger', icon: '🧺' },
      ];

      const missing = defaults.filter(
        (preset) => !existingKeys.has(normalizeLocationKey(preset.name))
      );

      if (missing.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('storage_locations')
          .insert(missing)
          .select('*');

        if (insertError) {
          console.error('Erreur insertion emplacements par défaut:', insertError.message);
        } else if (inserted) {
          locations = [...locations, ...inserted];
        }
      }

      setStorageLocations(locations);
    } catch (err) {
      console.error('Erreur:', err);
      setStorageLocations([]);
    }
  }

  async function loadInventory() {
    try {
      const [inventoryResponse, productsResponse, locationsResponse] = await Promise.all([
        supabase
          .from('inventory')
          .select('*')
          .order('last_updated', { ascending: false }),
        supabase
          .from('products')
          .select('id, name, default_unit'),
        supabase
          .from('storage_locations')
          .select('id, name, icon'),
      ]);

      if (inventoryResponse.error) throw inventoryResponse.error;
      if (productsResponse.error) throw productsResponse.error;
      if (locationsResponse.error) throw locationsResponse.error;

      const productMap = new Map(
        ((productsResponse.data ?? []) as Product[]).map((product) => [product.id, product])
      );
      const locationMap = new Map(
        ((locationsResponse.data ?? []) as StorageLocation[]).map((location) => [location.id, location])
      );

      const enriched = (inventoryResponse.data ?? []).map((item) => ({
        ...item,
        product: item.product_id ? productMap.get(item.product_id) : undefined,
        storage_location: item.storage_location_id
          ? locationMap.get(item.storage_location_id)
          : undefined,
      }));

      setInventory(enriched as InventoryItem[]);
      window.dispatchEvent(new Event('inventory:updated'));
    } catch (err) {
      console.error('Erreur:', err);
      setInventory([]);
    }
  }

  async function updateQuantity(id: string, change: number) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    const newQuantity = Math.max(0, item.quantity + change);

    try {
      const { error } = await supabase
        .from('inventory')
        .update({ quantity: newQuantity, last_updated: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Erreur:', error);
        return;
      }

      if (newQuantity <= item.minimum_threshold) {
        await supabase.from('notifications').insert({
          type: 'low_stock',
          title: 'Stock faible',
          message: `${item.product?.name} est en quantité faible (${newQuantity} ${item.unit})`,
          related_product_id: item.product_id,
        });
      }

      await loadInventory();
    } catch (err) {
      console.error('Erreur:', err);
    }
  }

  async function deleteItem(id: string) {
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (!error) {
        await loadInventory();
        window.dispatchEvent(new Event('inventory:updated'));
      }
    } catch (err) {
      console.error('Erreur:', err);
      setInventory(inventory.filter(i => i.id !== id));
    }
  }

  const filteredInventory = selectedLocation === 'all'
    ? inventory
    : inventory.filter(i => i.storage_location_id === selectedLocation);

  const lowStockItems = filteredInventory.filter(
    i => i.quantity <= i.minimum_threshold
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Gestion des stocks</h2>
        </div>
        <button
          onClick={() => {
            if (selectedLocation === 'all') {
              setDefaultLocationId(storageLocations[0]?.id ?? '');
            } else {
              setDefaultLocationId(selectedLocation);
            }
            setIsAddModalOpen(true);
          }}
          className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {lowStockItems.length > 0 && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-900">
              {lowStockItems.length} produit{lowStockItems.length > 1 ? 's' : ''} en stock faible
            </p>
            <p className="text-xs text-orange-700 mt-1">
              Pensez à réapprovisionner : {lowStockItems.map(i => i.product?.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedLocation('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            selectedLocation === 'all'
              ? 'bg-teal-100 text-teal-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tous ({inventory.length})
        </button>
        {storageLocations.map((location) => {
          const count = inventory.filter(i => i.storage_location_id === location.id).length;
          return (
            <button
              key={location.id}
              onClick={() => setSelectedLocation(location.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                selectedLocation === location.id
                  ? 'bg-teal-100 text-teal-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{location.icon}</span>
              {location.name} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filteredInventory.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Aucun produit dans cette section</p>
          </div>
        ) : (
          filteredInventory.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-lg border-2 transition-all ${
                item.quantity <= item.minimum_threshold
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-900">
                      {item.product?.name}
                    </h3>
                    {item.quantity <= item.minimum_threshold && (
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-gray-500">
                      {item.storage_location?.icon} {item.storage_location?.name}
                    </p>
                    {item.expiry_date && (
                      <p className="text-xs text-gray-500">
                        Expire: {new Date(item.expiry_date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-300 px-3 py-1.5">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                      disabled={item.quantity <= 0}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-gray-900 min-w-[3rem] text-center">
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => deleteItem(item.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isAddModalOpen && (
        <AddItemModal
          storageLocations={storageLocations}
          initialLocationId={defaultLocationId}
          defaultCategoryId={defaultCategoryId}
          ensureDefaultCategoryId={ensureDefaultCategoryId}
          onClose={() => {
            setIsAddModalOpen(false);
            setDefaultLocationId('');
          }}
          onAdd={() => {
            setIsAddModalOpen(false);
            setDefaultLocationId('');
            loadInventory();
          }}
        />
      )}
    </div>
  );
}

interface AddItemModalProps {
  storageLocations: StorageLocation[];
  initialLocationId?: string;
  defaultCategoryId: string;
  ensureDefaultCategoryId: () => Promise<string | null>;
  onClose: () => void;
  onAdd: () => void;
}

function AddItemModal({
  storageLocations,
  initialLocationId,
  defaultCategoryId,
  ensureDefaultCategoryId,
  onClose,
  onAdd,
}: AddItemModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [storageLocationId, setStorageLocationId] = useState(initialLocationId || '');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [minThreshold, setMinThreshold] = useState(1);
  const [newProductName, setNewProductName] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      if (!defaultCategoryId) {
        await ensureDefaultCategoryId();
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (!error && data) {
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Erreur chargement produits:', error);
      setProducts([]);
    }
  }, [defaultCategoryId, ensureDefaultCategoryId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (initialLocationId) {
      setStorageLocationId(initialLocationId);
    }
  }, [initialLocationId]);

  useEffect(() => {
    if (!storageLocationId && storageLocations.length > 0) {
      setStorageLocationId(storageLocations[0].id);
    }
  }, [storageLocationId, storageLocations]);

  useEffect(() => {
    const selected = products.find((product) => product.id === selectedProduct);
    if (selected?.default_unit) {
      setUnit(selected.default_unit);
    }
  }, [selectedProduct, products]);

  useEffect(() => {
    if (products.length === 0) {
      setIsCreatingProduct(true);
      setSelectedProduct('');
    }
  }, [products.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let productId = selectedProduct;

    if (!storageLocationId) {
      alert('Aucun emplacement n\'est configuré. Créez un emplacement dans Supabase avant d\'ajouter un produit.');
      return;
    }

    try {
      if (isCreatingProduct && newProductName) {
        const normalizedName = newProductName.trim();
        const { data: existingProducts, error: existingError } = await supabase
          .from('products')
          .select('id, default_unit, typical_storage')
          .ilike('name', normalizedName)
          .limit(1);

        if (existingError) {
          throw existingError;
        }

        if (existingProducts && existingProducts.length > 0) {
          const existing = existingProducts[0];
          productId = existing.id;
          if (existing.default_unit) {
            setUnit(existing.default_unit);
          }
          setIsCreatingProduct(false);
          setSelectedProduct(existing.id);
        } else {
          const categoryId = defaultCategoryId || (await ensureDefaultCategoryId());
          if (!categoryId) {
            throw new Error('Catégorie par défaut introuvable');
          }

          const storage = storageLocations.find((loc) => loc.id === storageLocationId);
          const typicalStorage = normalizeLocationKey(storage?.name ?? 'autre');

          const payload: Partial<Product> & {
            name: string;
            category_id: string;
            default_unit: string;
            typical_storage: string;
          } = {
            name: normalizedName,
            category_id: categoryId,
            default_unit: unit,
            typical_storage: typicalStorage,
          };

          const { data: newProduct, error: insertError } = await supabase
            .from('products')
            .insert(payload, { onConflict: 'name' })
            .select('*')
            .single();

          if (insertError) {
            if (insertError.code === '23505' || insertError.code === '409' || insertError.details?.includes('duplicate key')) {
              const { data: dup } = await supabase
                .from('products')
                .select('*')
                .ilike('name', normalizedName)
                .maybeSingle();
              if (dup) {
                productId = dup.id;
                if (dup.default_unit) {
                  setUnit(dup.default_unit);
                }
                setIsCreatingProduct(false);
                setSelectedProduct(dup.id);
              } else {
                throw insertError;
              }
            } else {
              throw insertError;
            }
          }

          if (newProduct) {
            productId = newProduct.id;
            if (newProduct.default_unit) {
              setUnit(newProduct.default_unit);
            }
            setIsCreatingProduct(false);
            setSelectedProduct(newProduct.id);
          }
        }
      }

      if (!productId) return;

      await supabase.from('inventory').insert({
        product_id: productId,
        storage_location_id: storageLocationId,
        quantity,
        unit,
        minimum_threshold: minThreshold
      });
    } catch (err) {
      console.error('Erreur:', err);
    }

    onAdd();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Ajouter un produit au stock
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emplacement
              </label>
              <select
                value={storageLocationId}
                onChange={(e) => setStorageLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              >
                <option value="">Sélectionner un emplacement</option>
                {storageLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.icon} {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isCreatingProduct}
                  onChange={(e) => {
                    setIsCreatingProduct(e.target.checked);
                    if (e.target.checked) {
                      setSelectedProduct('');
                    }
                  }}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Créer un nouveau produit</span>
              </label>
            </div>

            {isCreatingProduct ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom du produit
                  </label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Produit
                </label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                >
                  <option value="">Sélectionner un produit</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantité
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  min="0"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unité
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="pcs">pcs</option>
                  <option value="pièces">pièces</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="mL">mL</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seuil d'alerte minimum
              </label>
              <input
                type="number"
                value={minThreshold}
                onChange={(e) => setMinThreshold(Number(e.target.value))}
                min="0"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium"
              >
                Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
