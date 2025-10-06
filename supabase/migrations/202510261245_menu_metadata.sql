ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS cook_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS recipe_url TEXT;

UPDATE menus
SET prep_time_minutes = prep_time_minutes,
    cook_time_minutes = cook_time_minutes,
    recipe_url = recipe_url;
