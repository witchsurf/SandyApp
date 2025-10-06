-- Ensure legacy tables expose the columns expected by the application

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_ingredients' AND column_name = 'qty'
  ) THEN
    ALTER TABLE menu_ingredients RENAME COLUMN qty TO quantity;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'menu_ingredients' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE menu_ingredients ADD COLUMN quantity NUMERIC NOT NULL DEFAULT 0;
  END IF;
END $$;

ALTER TABLE menu_ingredients
  ALTER COLUMN quantity SET DEFAULT 0;

UPDATE menu_ingredients
SET quantity = 0
WHERE quantity IS NULL;

-- Allow shopping list name to be optional, since product_id can carry context
ALTER TABLE shopping_lists
  ALTER COLUMN name DROP NOT NULL;
