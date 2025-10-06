-- Harden legacy data for menus, shopping lists, and notifications

-- Ensure shopping list columns align with UI expectations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'qty'
  ) THEN
    ALTER TABLE shopping_lists RENAME COLUMN qty TO quantity;
  END IF;
END $$;

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 1;

ALTER TABLE shopping_lists
  ALTER COLUMN quantity SET DEFAULT 1;

UPDATE shopping_lists
SET quantity = 1
WHERE quantity IS NULL;

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs';

ALTER TABLE shopping_lists
  ALTER COLUMN unit SET DEFAULT 'pcs';

UPDATE shopping_lists
SET unit = 'pcs'
WHERE unit IS NULL OR unit = '';

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE shopping_lists
  ALTER COLUMN priority SET DEFAULT 'medium';

UPDATE shopping_lists
SET priority = 'medium'
WHERE priority IS NULL OR priority = '';

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS added_reason TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE shopping_lists
  ALTER COLUMN added_reason SET DEFAULT 'manual';

UPDATE shopping_lists
SET added_reason = 'manual'
WHERE added_reason IS NULL OR added_reason = '';

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS is_purchased BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE shopping_lists
  ALTER COLUMN is_purchased SET DEFAULT FALSE;

UPDATE shopping_lists
SET is_purchased = FALSE
WHERE is_purchased IS NULL;

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE shopping_lists
  ALTER COLUMN added_at SET DEFAULT NOW();

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;

-- Ensure menu ingredient bookkeeping columns exist
ALTER TABLE menu_ingredients
  ADD COLUMN IF NOT EXISTS available_qty NUMERIC DEFAULT 0;

ALTER TABLE menu_ingredients
  ALTER COLUMN available_qty SET DEFAULT 0;

UPDATE menu_ingredients
SET available_qty = COALESCE(available_qty, 0);

ALTER TABLE menu_ingredients
  ADD COLUMN IF NOT EXISTS missing_qty NUMERIC DEFAULT 0;

ALTER TABLE menu_ingredients
  ALTER COLUMN missing_qty SET DEFAULT 0;

UPDATE menu_ingredients
SET missing_qty = COALESCE(missing_qty, 0);

DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'menu_ingredients' AND column_name = 'product_id';

  IF col_type IS NULL THEN
    ALTER TABLE menu_ingredients ADD COLUMN product_id UUID;
  ELSIF col_type <> 'uuid' THEN
    ALTER TABLE menu_ingredients DROP COLUMN product_id;
    ALTER TABLE menu_ingredients ADD COLUMN product_id UUID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_ingredients' AND column_name = 'product'
  ) THEN
    BEGIN
      UPDATE menu_ingredients
      SET product_id = NULLIF(product::TEXT, '')::UUID
      WHERE product_id IS NULL;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Ignore values that cannot be cast to UUID; leave them NULL
      NULL;
    END;
  END IF;

  BEGIN
    ALTER TABLE menu_ingredients
      ADD CONSTRAINT menu_ingredients_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Relax RLS for development convenience so anon key can mutate data
DO $$ BEGIN
  CREATE POLICY "Public insert notifications" ON notifications
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update notifications" ON notifications
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public insert shopping_lists" ON shopping_lists
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update shopping_lists" ON shopping_lists
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete shopping_lists" ON shopping_lists
    FOR DELETE
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public insert product_categories" ON product_categories
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update product_categories" ON product_categories
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete product_categories" ON product_categories
    FOR DELETE
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public insert inventory" ON inventory
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update inventory" ON inventory
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete inventory" ON inventory
    FOR DELETE
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public insert products" ON products
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update products" ON products
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
