import { useEffect, useState } from 'react';
import { ShoppingCart, Plus, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ShoppingListItem, Product, Category } from '../types/database';

export function ShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    loadShoppingList();
  }, []);

  useEffect(() => {
    function handleAddEvent() {
      setIsAddModalOpen(true);
    }

    window.addEventListener('shopping-list:add-item', handleAddEvent);
    return () => {
      window.removeEventListener('shopping-list:add-item', handleAddEvent);
    };
  }, []);

  async function loadShoppingList() {
    try {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select(`
          *,
          product:products(*)
        `)
        .order('priority', { ascending: false })
        .order('is_purchased')
        .order('added_at', { ascending: false });

      if (!error && data) {
        setItems(data);
        window.dispatchEvent(new Event('shopping-list:updated'));
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Erreur de connexion:', err);
      setItems([]);
    }
  }

  async function togglePurchased(id: string, isPurchased: boolean) {
    try {
      const { data } = await supabase
        .from('shopping_lists')
        .update({
          is_purchased: !isPurchased,
          purchased_at: !isPurchased ? new Date().toISOString() : null
        })
        .eq('id', id)
        .select(`
          *,
          product:products(*)
        `)
        .single();

      if (data) {
        setItems(items.map(i => i.id === id ? data : i));
        window.dispatchEvent(new Event('shopping-list:updated'));
      }
    } catch (err) {
      console.error('Erreur:', err);
    }
  }

  async function deleteItem(id: string) {
    try {
      await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id);
    } catch (err) {
      console.error('Erreur:', err);
    }
    setItems(items.filter(i => i.id !== id));
    window.dispatchEvent(new Event('shopping-list:updated'));
  }

  async function clearPurchased() {
    const purchasedIds = items.filter(i => i.is_purchased).map(i => i.id);

    try {
      await supabase
        .from('shopping_lists')
        .delete()
        .in('id', purchasedIds);
    } catch (err) {
      console.error('Erreur:', err);
    }
    setItems(items.filter(i => !i.is_purchased));
    window.dispatchEvent(new Event('shopping-list:updated'));
  }

  const unpurchasedItems = items.filter(i => !i.is_purchased);
  const purchasedItems = items.filter(i => i.is_purchased);

  const priorityColors = {
    high: 'border-red-300 bg-red-50',
    medium: 'border-orange-300 bg-orange-50',
    low: 'border-gray-200 bg-white'
  };

  const priorityLabels = {
    high: 'Urgent',
    medium: 'Normal',
    low: 'Basse priorité'
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Liste de courses</h2>
          {unpurchasedItems.length > 0 && (
            <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs font-semibold rounded-full">
              {unpurchasedItems.length}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {purchasedItems.length > 0 && (
            <button
              onClick={clearPurchased}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              Vider achats
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm mb-2">Liste de courses vide</p>
          <p className="text-xs">Ajoutez des produits manuellement ou ils seront ajoutés automatiquement</p>
        </div>
      ) : (
        <div className="space-y-4">
          {unpurchasedItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">À acheter</h3>
              {unpurchasedItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border-2 transition-all ${priorityColors[item.priority]}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePurchased(item.id, item.is_purchased)}
                      className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-400 hover:border-teal-500 hover:bg-teal-50 transition-all flex items-center justify-center"
                    >
                      {item.is_purchased && <Check className="w-4 h-4 text-teal-600" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {item.product?.name}
                        </p>
                        {item.priority === 'high' && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded">
                            {priorityLabels.high}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {item.quantity} {item.unit}
                        {item.added_reason === 'auto' && (
                          <span className="ml-2 text-teal-600">• Ajouté automatiquement</span>
                        )}
                      </p>
                    </div>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="flex-shrink-0 p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {purchasedItems.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Acheté ({purchasedItems.length})</h3>
              {purchasedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg bg-gray-50 border border-gray-200 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePurchased(item.id, item.is_purchased)}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-white" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-through">
                        {item.product?.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {item.quantity} {item.unit}
                      </p>
                    </div>

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="flex-shrink-0 p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isAddModalOpen && (
        <AddShoppingItemModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={() => {
            setIsAddModalOpen(false);
            loadShoppingList();
          }}
        />
      )}
    </div>
  );
}

interface AddShoppingItemModalProps {
  onClose: () => void;
  onAdd: () => void;
}

function AddShoppingItemModal({ onClose, onAdd }: AddShoppingItemModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('pcs');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!newProductCategory && categories.length > 0) {
      setNewProductCategory(categories[0].id);
    }
  }, [categories, newProductCategory]);

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (!error && data) {
        setProducts(data);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setProducts([]);
    }
  }

  async function loadCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (!error && data) {
        setCategories(data);
      } else {
        setCategories([]);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setCategories([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let productId = selectedProduct;

    try {
      if (isCreatingProduct && newProductName && newProductCategory) {
        const normalizedName = newProductName.trim();
        const { data: existingProducts, error: existingError } = await supabase
          .from('products')
          .select('id, default_unit')
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
        } else {
          const { data: newProduct, error: insertError } = await supabase
            .from('products')
            .insert(
              {
                name: normalizedName,
                category_id: newProductCategory,
                default_unit: unit,
              },
              { onConflict: 'name' }
            )
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
                  setUnit(dup.default_unit);
                }
              } else {
                throw insertError;
              }
            } else {
              throw insertError;
            }
          } else if (newProduct) {
            productId = newProduct.id;
          }
        }
      }

      if (!productId) return;

      await supabase.from('shopping_lists').insert({
        product_id: productId,
        quantity,
        unit,
        priority,
        added_reason: 'manual'
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
            Ajouter à la liste de courses
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isCreatingProduct}
                  onChange={(e) => setIsCreatingProduct(e.target.checked)}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Catégorie
                  </label>
                  <select
                    value={newProductCategory}
                    onChange={(e) => setNewProductCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
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
                Priorité
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="high">Urgent</option>
                <option value="medium">Normal</option>
                <option value="low">Basse priorité</option>
              </select>
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
