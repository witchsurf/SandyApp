import { RecipeTemplate, FamilyMember } from '../types/database';

export const demoFamilyMembers: FamilyMember[] = [
  {
    id: 'demo-sandy',
    name: 'Sandy',
    age_group: 'adult',
    dietary_preferences: [],
    avatar_color: '#3B82F6',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-rene',
    name: 'René',
    age_group: 'adult',
    dietary_preferences: [],
    avatar_color: '#6366F1',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-tery',
    name: 'Tery',
    age_group: 'teenager',
    dietary_preferences: [],
    avatar_color: '#F97316',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-warys',
    name: 'Warys',
    age_group: 'teenager',
    dietary_preferences: [],
    avatar_color: '#10B981',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-kelly',
    name: 'Kelly',
    age_group: 'teenager',
    dietary_preferences: [],
    avatar_color: '#EC4899',
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-sophy',
    name: 'Sophy',
    age_group: 'toddler',
    dietary_preferences: [],
    avatar_color: '#F59E0B',
    created_at: new Date().toISOString(),
  },
];

export const demoRecipes: RecipeTemplate[] = [
  {
    id: '1',
    title: 'Pâtes à la sauce tomate',
    meal_type: 'lunch',
    description: 'Pâtes simples avec sauce tomate maison',
    ingredients: [
      { name: 'Pâtes', quantity: 500 },
      { name: 'Tomates', quantity: 0.5 }
    ],
    suitable_for_toddler: true,
    preparation_time: 20,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    title: 'Poulet rôti et légumes',
    meal_type: 'dinner',
    description: 'Poulet rôti avec carottes et pommes de terre',
    ingredients: [
      { name: 'Poulet', quantity: 1.5 },
      { name: 'Carottes', quantity: 0.5 },
      { name: 'Pommes de terre', quantity: 1 }
    ],
    suitable_for_toddler: true,
    preparation_time: 60,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Riz au thon',
    meal_type: 'lunch',
    description: 'Riz avec thon et légumes',
    ingredients: [
      { name: 'Riz', quantity: 400 },
      { name: 'Thon en boîte', quantity: 2 },
      { name: 'Tomates', quantity: 0.3 }
    ],
    suitable_for_toddler: true,
    preparation_time: 25,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '4',
    title: 'Œufs brouillés',
    meal_type: 'breakfast',
    description: 'Œufs brouillés avec pain',
    ingredients: [
      { name: 'Œufs', quantity: 8 },
      { name: 'Pain', quantity: 1 },
      { name: 'Lait', quantity: 0.1 }
    ],
    suitable_for_toddler: true,
    preparation_time: 10,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '5',
    title: 'Salade composée',
    meal_type: 'dinner',
    description: 'Salade verte avec thon, tomates et œufs',
    ingredients: [
      { name: 'Salade verte', quantity: 2 },
      { name: 'Thon en boîte', quantity: 2 },
      { name: 'Tomates', quantity: 0.5 },
      { name: 'Œufs', quantity: 4 }
    ],
    suitable_for_toddler: false,
    preparation_time: 15,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '6',
    title: 'Côtelettes de porc aux haricots',
    meal_type: 'dinner',
    description: 'Côtelettes de porc avec haricots verts',
    ingredients: [
      { name: 'Cochon (viande)', quantity: 1 },
      { name: 'Haricots verts', quantity: 0.8 }
    ],
    suitable_for_toddler: true,
    preparation_time: 35,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '7',
    title: 'Bœuf aux carottes',
    meal_type: 'lunch',
    description: 'Ragoût de bœuf avec carottes',
    ingredients: [
      { name: 'Bœuf', quantity: 1 },
      { name: 'Carottes', quantity: 0.8 },
      { name: 'Pommes de terre', quantity: 0.8 }
    ],
    suitable_for_toddler: true,
    preparation_time: 90,
    difficulty: 'medium',
    created_at: new Date().toISOString()
  },
  {
    id: '8',
    title: 'Pâtes au fromage',
    meal_type: 'dinner',
    description: 'Pâtes gratinées au fromage',
    ingredients: [
      { name: 'Pâtes', quantity: 500 },
      { name: 'Fromage', quantity: 200 }
    ],
    suitable_for_toddler: true,
    preparation_time: 25,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '9',
    title: 'Yaourt et fruits',
    meal_type: 'snack',
    description: 'Yaourt nature avec fruits frais',
    ingredients: [
      { name: 'Yaourt', quantity: 6 },
      { name: 'Bananes', quantity: 2 },
      { name: 'Pommes', quantity: 2 }
    ],
    suitable_for_toddler: true,
    preparation_time: 5,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '10',
    title: 'Tartines et compote',
    meal_type: 'breakfast',
    description: 'Tartines de pain avec confiture et fruit',
    ingredients: [
      { name: 'Pain', quantity: 1 },
      { name: 'Pommes', quantity: 3 }
    ],
    suitable_for_toddler: true,
    preparation_time: 5,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '11',
    title: 'Sardines grillées et salade',
    meal_type: 'dinner',
    description: 'Sardines avec salade verte',
    ingredients: [
      { name: 'Sardines en boîte', quantity: 3 },
      { name: 'Salade verte', quantity: 1 },
      { name: 'Tomates', quantity: 0.4 }
    ],
    suitable_for_toddler: false,
    preparation_time: 15,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  },
  {
    id: '12',
    title: 'Poulet aux courgettes',
    meal_type: 'lunch',
    description: 'Poulet sauté avec courgettes',
    ingredients: [
      { name: 'Poulet', quantity: 1 },
      { name: 'Courgettes', quantity: 1 },
      { name: 'Riz', quantity: 300 }
    ],
    suitable_for_toddler: true,
    preparation_time: 30,
    difficulty: 'easy',
    created_at: new Date().toISOString()
  }
];
