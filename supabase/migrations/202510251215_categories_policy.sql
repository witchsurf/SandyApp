-- Ensure categories table is usable from the SPA
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public insert categories" ON categories
    FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public update categories" ON categories
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public delete categories" ON categories
    FOR DELETE
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public select categories" ON categories
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO categories (name)
SELECT 'Général'
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE lower(name) = lower('Général')
);
