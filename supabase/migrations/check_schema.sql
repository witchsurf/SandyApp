-- Lister colonnes des tables critiques
SELECT 'products' AS "table", column_name
FROM information_schema.columns
WHERE table_name = 'products'
UNION ALL
SELECT 'inventory' AS "table", column_name
FROM information_schema.columns
WHERE table_name = 'inventory'
UNION ALL
SELECT 'menus' AS "table", column_name
FROM information_schema.columns
WHERE table_name = 'menus'
UNION ALL
SELECT 'recipe_templates' AS "table", column_name
FROM information_schema.columns
WHERE table_name = 'recipe_templates'
ORDER BY 1, 2;