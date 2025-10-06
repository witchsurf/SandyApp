-- 1. Corrige les colonnes critiques manquantes ou mal nommées
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'qty'
  ) THEN
    ALTER TABLE inventory RENAME COLUMN qty TO quantity;
  END IF;
END $$;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE inventory
  ALTER COLUMN quantity SET DEFAULT 0;

UPDATE inventory
SET quantity = 0
WHERE quantity IS NULL;

ALTER TABLE storage_locations
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '📦';

UPDATE storage_locations
SET icon = COALESCE(NULLIF(icon, ''), '📦');

ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- 2. FK menu_ingredients → menus.id (cascade pour nettoyage automatique)
ALTER TABLE menu_ingredients
  DROP CONSTRAINT IF EXISTS menu_ingredients_menu_id_fkey;

ALTER TABLE menu_ingredients
  ADD CONSTRAINT menu_ingredients_menu_id_fkey
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE;

-- 3. Vue inventory_view tenant compte des colonnes ci-dessus
DROP VIEW IF EXISTS inventory_view;

CREATE OR REPLACE VIEW inventory_view AS
SELECT
  inv.id,
  inv.product_id,
  inv.storage_location_id,
  inv.quantity,
  inv.unit,
  inv.minimum_threshold,
  inv.expiry_date,
  inv.created_at,
  inv.last_updated,
  prod.name AS product_name,
  prod.default_unit,
  loc.name AS location_name,
  loc.icon AS location_icon
FROM inventory inv
LEFT JOIN products prod ON prod.id = inv.product_id
LEFT JOIN storage_locations loc ON loc.id = inv.storage_location_id;
