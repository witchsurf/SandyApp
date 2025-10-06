export interface FamilyMember {
  id: string;
  name: string;
  age_group: 'adult' | 'teenager' | 'toddler';
  dietary_preferences: string[];
  avatar_color: string;
  created_at: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  icon: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  category_id: string;
  default_unit: string;
  typical_storage: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  storage_location_id: string;
  quantity: number;
  unit: string;
  expiry_date?: string;
  minimum_threshold: number;
  last_updated: string;
  created_at: string;
  product?: Product;
  storage_location?: StorageLocation;
}

export interface Menu {
  id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  description?: string;
  suitable_for: string[];
  created_at: string;
  stock_status?: 'ready' | 'missing-partial' | 'missing-all';
  portion_multiplier?: number;
  suitable_for_toddler?: boolean;
  source?: string;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  recipe_url?: string | null;
  menu_ingredients?: Array<MenuIngredient & { product?: Product }>;
}

export interface MenuIngredient {
  id: string;
  menu_id: string;
  product_id?: string | null;
  name: string;
  quantity: number;
  unit: string;
  created_at: string;
  product?: Product;
  available_qty?: number;
  missing_qty?: number;
}

export interface ShoppingListItem {
  id: string;
  product_id: string;
  quantity: number;
  unit: string;
  is_purchased: boolean;
  priority: 'high' | 'medium' | 'low';
  added_reason: string;
  added_at: string;
  purchased_at?: string;
  product?: Product;
}

export interface Notification {
  id: string;
  type: 'low_stock' | 'expiry_warning' | 'shopping_reminder';
  title: string;
  message: string;
  is_read: boolean;
  related_product_id?: string;
  created_at: string;
}

export interface RecipeTemplate {
  id: string;
  title: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  description?: string;
  ingredients: Array<{ name: string; quantity: number }>;
  suitable_for_toddler: boolean;
  preparation_time: number;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
}
