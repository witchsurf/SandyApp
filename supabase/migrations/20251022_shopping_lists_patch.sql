-- Patch legacy shopping_lists columns and extend public RLS policies
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'added_at'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN added_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

ALTER TABLE shopping_lists
  ALTER COLUMN added_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopping_lists' AND column_name = 'purchased_at'
  ) THEN
    ALTER TABLE shopping_lists ADD COLUMN purchased_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_ingredients' AND column_name = 'available_qty'
  ) THEN
    ALTER TABLE menu_ingredients ADD COLUMN available_qty NUMERIC DEFAULT 0;
  END IF;
END $$;

ALTER TABLE menu_ingredients
  ALTER COLUMN available_qty SET DEFAULT 0;

UPDATE menu_ingredients
SET available_qty = COALESCE(available_qty, 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_ingredients' AND column_name = 'missing_qty'
  ) THEN
    ALTER TABLE menu_ingredients ADD COLUMN missing_qty NUMERIC DEFAULT 0;
  END IF;
END $$;

ALTER TABLE menu_ingredients
  ALTER COLUMN missing_qty SET DEFAULT 0;

UPDATE menu_ingredients
SET missing_qty = COALESCE(missing_qty, 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'menu_ingredients' AND constraint_name = 'menu_ingredients_product_id_fkey'
  ) THEN
    ALTER TABLE menu_ingredients
      ADD CONSTRAINT menu_ingredients_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure permissive dev-time RLS covers product categories as well
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
