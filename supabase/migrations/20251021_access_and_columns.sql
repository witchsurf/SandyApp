-- 1. Harmonise legacy columns for shopping_lists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'qty'
  ) THEN
    ALTER TABLE shopping_lists RENAME COLUMN qty TO quantity;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN quantity NUMERIC NOT NULL DEFAULT 1;
  END IF;
END $$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'priority'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
  END IF;
END $$;

ALTER TABLE shopping_lists
  ALTER COLUMN priority SET DEFAULT 'medium';

UPDATE shopping_lists
SET priority = 'medium'
WHERE priority IS NULL OR priority = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'added_reason'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN added_reason TEXT NOT NULL DEFAULT 'manual';
  END IF;
END $$;

ALTER TABLE shopping_lists
  ALTER COLUMN added_reason SET DEFAULT 'manual';

UPDATE shopping_lists
SET added_reason = 'manual'
WHERE added_reason IS NULL OR added_reason = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'is_purchased'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN is_purchased BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

ALTER TABLE shopping_lists
  ALTER COLUMN is_purchased SET DEFAULT FALSE;

UPDATE shopping_lists
SET is_purchased = FALSE
WHERE is_purchased IS NULL;

-- 2. Policies for public writes (development convenience)
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
  CREATE POLICY "Public insert storage_locations" ON storage_locations
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update storage_locations" ON storage_locations
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
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
