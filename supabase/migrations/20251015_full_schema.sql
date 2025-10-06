-- Ensure UUID generator extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- === Core reference tables ===
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT '📦',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT '📦',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  age_group TEXT NOT NULL CHECK (age_group IN ('adult', 'teenager', 'toddler')),
  dietary_preferences JSONB NOT NULL DEFAULT '[]'::JSONB,
  avatar_color TEXT DEFAULT '#0ea5e9',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  default_unit TEXT NOT NULL DEFAULT 'pcs',
  typical_storage UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Inventory ===
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  minimum_threshold NUMERIC NOT NULL DEFAULT 0,
  expiry_date DATE,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_product_idx ON inventory(product_id);
CREATE INDEX IF NOT EXISTS inventory_location_idx ON inventory(storage_location_id);

-- === Recipes & Menus ===
CREATE TABLE IF NOT EXISTS recipe_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  description TEXT,
  ingredients JSONB NOT NULL DEFAULT '[]'::JSONB,
  suitable_for_toddler BOOLEAN NOT NULL DEFAULT TRUE,
  preparation_time INTEGER,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipe_templates(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  title TEXT NOT NULL,
  description TEXT,
  suitable_for UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  portion_multiplier NUMERIC NOT NULL DEFAULT 1,
  suitable_for_toddler BOOLEAN NOT NULL DEFAULT TRUE,
  stock_status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS menu_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  available_qty NUMERIC DEFAULT 0,
  missing_qty NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS menu_ingredients_menu_idx ON menu_ingredients(menu_id);

-- === Legacy alignment ===
DO $$ BEGIN
  ALTER TABLE storage_locations ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📦';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS default_unit TEXT DEFAULT 'pcs';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS typical_storage UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS title TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS description TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS suitable_for UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS portion_multiplier NUMERIC NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS suitable_for_toddler BOOLEAN NOT NULL DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS stock_status TEXT NOT NULL DEFAULT 'ready';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menus ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'family_members' AND column_name = 'avatar_color'
  ) THEN
    ALTER TABLE family_members ADD COLUMN avatar_color TEXT DEFAULT '#0ea5e9';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'family_members_name_key'
  ) THEN
    CREATE UNIQUE INDEX family_members_name_key ON family_members(name);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'meal'
  ) THEN
    ALTER TABLE menus RENAME COLUMN meal TO meal_type;
  END IF;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menus' AND column_name = 'day'
  ) THEN
    ALTER TABLE menus DROP COLUMN day;
  END IF;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'menus_unique_slot_idx'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS menus_unique_slot_idx';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS menus_unique_slot_idx ON menus(date, meal_type);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'qty'
  ) THEN
    ALTER TABLE inventory RENAME COLUMN qty TO quantity;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE inventory ADD COLUMN quantity NUMERIC NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'storage_location_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'inventory' AND column_name = 'location'
    ) THEN
      ALTER TABLE inventory RENAME COLUMN location TO storage_location_id;
    ELSE
      ALTER TABLE inventory ADD COLUMN storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'unit'
  ) THEN
    ALTER TABLE inventory ADD COLUMN unit TEXT NOT NULL DEFAULT 'pcs';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'minimum_threshold'
  ) THEN
    ALTER TABLE inventory ADD COLUMN minimum_threshold NUMERIC NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE inventory ADD COLUMN expiry_date DATE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'last_updated'
  ) THEN
    ALTER TABLE inventory ADD COLUMN last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE inventory ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'product'
  ) THEN
    ALTER TABLE shopping_lists RENAME COLUMN product TO product_id;
  END IF;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- === Shopping list & notifications ===
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  is_purchased BOOLEAN NOT NULL DEFAULT FALSE,
  priority TEXT NOT NULL DEFAULT 'medium',
  added_reason TEXT NOT NULL DEFAULT 'manual',
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purchased_at TIMESTAMPTZ
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'is_purchased'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN is_purchased BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shopping_lists_purchased_idx ON shopping_lists(is_purchased);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  related_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP VIEW IF EXISTS inventory_view;

CREATE VIEW inventory_view AS
SELECT
  inv.id,
  inv.quantity,
  inv.unit,
  inv.minimum_threshold,
  inv.expiry_date,
  inv.last_updated,
  inv.created_at,
  prod.id AS product_id,
  prod.name,
  prod.default_unit,
  loc.name AS location,
  loc.icon
FROM inventory inv
LEFT JOIN products prod ON prod.id = inv.product_id
LEFT JOIN storage_locations loc ON loc.id = inv.storage_location_id;

-- === Seed defaults ===
INSERT INTO storage_locations (name, icon)
VALUES
  ('Frigo', '🥶'),
  ('Congélo', '❄️'),
  ('Garde-manger', '🧺')
ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon;

INSERT INTO product_categories (name, icon)
VALUES
  ('Féculents', '🍞'),
  ('Viandes', '🥩'),
  ('Poissons', '🐟'),
  ('Légumes', '🥕'),
  ('Produits laitiers & oeufs', '🥚'),
  ('Épicerie & condiments', '🧂'),
  ('Divers', '🧺')
ON CONFLICT (name) DO UPDATE SET icon = EXCLUDED.icon;

INSERT INTO family_members (name, age_group, avatar_color)
VALUES
  ('Sandy', 'adult', '#3B82F6'),
  ('René', 'adult', '#6366F1'),
  ('Tery', 'teenager', '#F97316'),
  ('Warys', 'teenager', '#10B981'),
  ('Kelly', 'teenager', '#EC4899'),
  ('Sophy', 'toddler', '#F59E0B')
ON CONFLICT (name) DO UPDATE SET age_group = EXCLUDED.age_group, avatar_color = EXCLUDED.avatar_color;

-- Seed products
WITH category_ids AS (
  SELECT name, id FROM product_categories
)
INSERT INTO products (name, category_id, default_unit, typical_storage)
VALUES
  ('Pâtes', (SELECT id FROM category_ids WHERE name = 'Féculents'), 'g', (SELECT id FROM storage_locations WHERE name = 'Garde-manger')),
  ('Riz', (SELECT id FROM category_ids WHERE name = 'Féculents'), 'g', (SELECT id FROM storage_locations WHERE name = 'Garde-manger')),
  ('Poulet', (SELECT id FROM category_ids WHERE name = 'Viandes'), 'kg', (SELECT id FROM storage_locations WHERE name = 'Congélo')),
  ('Carottes', (SELECT id FROM category_ids WHERE name = 'Légumes'), 'g', (SELECT id FROM storage_locations WHERE name = 'Frigo')),
  ('Pommes de terre', (SELECT id FROM category_ids WHERE name = 'Légumes'), 'g', (SELECT id FROM storage_locations WHERE name = 'Garde-manger')),
  ('Thon en boîte', (SELECT id FROM category_ids WHERE name = 'Poissons'), 'pcs', (SELECT id FROM storage_locations WHERE name = 'Garde-manger')),
  ('Œufs', (SELECT id FROM category_ids WHERE name = 'Produits laitiers & oeufs'), 'pcs', (SELECT id FROM storage_locations WHERE name = 'Frigo')),
  ('Lait', (SELECT id FROM category_ids WHERE name = 'Produits laitiers & oeufs'), 'L', (SELECT id FROM storage_locations WHERE name = 'Frigo')),
  ('Yaourt', (SELECT id FROM category_ids WHERE name = 'Produits laitiers & oeufs'), 'pcs', (SELECT id FROM storage_locations WHERE name = 'Frigo')),
  ('Pain', (SELECT id FROM category_ids WHERE name = 'Féculents'), 'pcs', (SELECT id FROM storage_locations WHERE name = 'Garde-manger'))
ON CONFLICT (name) DO NOTHING;

-- Seed recipe templates
INSERT INTO recipe_templates (title, meal_type, description, ingredients, suitable_for_toddler, preparation_time, difficulty)
SELECT
  x.title,
  x.meal_type,
  x.description,
  x.ingredients::JSONB,
  x.suitable_for_toddler,
  x.preparation_time,
  x.difficulty
FROM (
  VALUES
    ('Pâtes sauce tomate', 'lunch', 'Pâtes complètes avec sauce tomate maison', '[{"product":"Pâtes","quantity":600,"unit":"g"},{"product":"Tomates","quantity":500,"unit":"g"},{"product":"Oignon","quantity":1,"unit":"pcs"}]', TRUE, 25, 'easy'),
    ('Poulet rôti & légumes', 'dinner', 'Poulet rôti au four avec légumes de saison', '[{"product":"Poulet","quantity":1.2,"unit":"kg"},{"product":"Carottes","quantity":400,"unit":"g"},{"product":"Pommes de terre","quantity":600,"unit":"g"}]', TRUE, 75, 'medium'),
    ('Riz au thon', 'lunch', 'Bol de riz complet, thon et petits légumes', '[{"product":"Riz","quantity":400,"unit":"g"},{"product":"Thon en boîte","quantity":2,"unit":"pcs"},{"product":"Carottes","quantity":200,"unit":"g"}]', TRUE, 30, 'easy'),
    ('Œufs brouillés & pain', 'breakfast', 'Œufs brouillés moelleux avec tartines beurrées', '[{"product":"Œufs","quantity":8,"unit":"pcs"},{"product":"Lait","quantity":0.2,"unit":"L"},{"product":"Pain","quantity":1,"unit":"pcs"}]', TRUE, 15, 'easy'),
    ('Salade composée', 'dinner', 'Salade fraîche avec thon, tomates, œufs durs', '[{"product":"Salade","quantity":1,"unit":"pcs"},{"product":"Thon en boîte","quantity":2,"unit":"pcs"},{"product":"Tomates","quantity":3,"unit":"pcs"},{"product":"Œufs","quantity":4,"unit":"pcs"}]', FALSE, 20, 'easy')
) AS x(title, meal_type, description, ingredients, suitable_for_toddler, preparation_time, difficulty)
ON CONFLICT DO NOTHING;

-- === RLS + Policies ===
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Public read" ON product_categories;
DROP POLICY IF EXISTS "Public read" ON storage_locations;
DROP POLICY IF EXISTS "Public read" ON family_members;
DROP POLICY IF EXISTS "Public read" ON products;
DROP POLICY IF EXISTS "Public read" ON inventory;
DROP POLICY IF EXISTS "Public read" ON recipe_templates;
DROP POLICY IF EXISTS "Public read" ON menus;
DROP POLICY IF EXISTS "Public read" ON menu_ingredients;
DROP POLICY IF EXISTS "Public read" ON shopping_lists;
DROP POLICY IF EXISTS "Public read" ON notifications;

-- Recreate clean public read-only policies
CREATE POLICY "Public read" ON product_categories FOR SELECT USING (true);
CREATE POLICY "Public read" ON storage_locations FOR SELECT USING (true);
CREATE POLICY "Public read" ON family_members FOR SELECT USING (true);
CREATE POLICY "Public read" ON products FOR SELECT USING (true);
CREATE POLICY "Public read" ON inventory FOR SELECT USING (true);
CREATE POLICY "Public read" ON recipe_templates FOR SELECT USING (true);
CREATE POLICY "Public read" ON menus FOR SELECT USING (true);
CREATE POLICY "Public read" ON menu_ingredients FOR SELECT USING (true);
CREATE POLICY "Public read" ON shopping_lists FOR SELECT USING (true);
CREATE POLICY "Public read" ON notifications FOR SELECT USING (true);
