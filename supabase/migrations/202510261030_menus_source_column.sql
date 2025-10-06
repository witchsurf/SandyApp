ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

UPDATE menus
SET source = COALESCE(source, 'manual');
