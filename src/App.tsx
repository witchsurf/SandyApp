import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, ShoppingCart, Utensils } from 'lucide-react';
import { Header } from './components/Header';
import { QuickDashboard } from './components/QuickDashboard';
import { FamilyMembers } from './components/FamilyMembers';
import { InventoryOverview } from './components/InventoryOverview';
import { MenuPlanner } from './components/MenuPlanner';
import { StockManager } from './components/StockManager';
import { ShoppingList } from './components/ShoppingList';
import { NotificationPanel } from './components/NotificationPanel';

type TabKey = 'menus' | 'stocks' | 'shopping';

interface TabConfig {
  key: TabKey;
  label: string;
  description: string;
  icon: JSX.Element;
}

const TAB_CONFIG: TabConfig[] = [
  {
    key: 'menus',
    label: 'Menus',
    description: 'Planification des repas pour la semaine',
    icon: <Utensils className="w-4 h-4" />,
  },
  {
    key: 'stocks',
    label: 'Stocks',
    description: 'Suivi du frigo, congélo et garde-manger',
    icon: <Boxes className="w-4 h-4" />,
  },
  {
    key: 'shopping',
    label: 'Courses',
    description: 'Génération et suivi de la liste de courses',
    icon: <ShoppingCart className="w-4 h-4" />,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('menus');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [, setIsLoadingNotifications] = useState(false);

  const activeTabConfig = useMemo(
    () => TAB_CONFIG.find((tab) => tab.key === activeTab) ?? TAB_CONFIG[0],
    [activeTab]
  );

  const loadNotificationCount = useCallback(async () => {
    setIsLoadingNotifications(true);
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const unread = Array.isArray(data)
        ? data.filter((notification) => !notification.is_read).length
        : 0;
      setUnreadCount(unread);
    } catch (error) {
      console.warn('Impossible de charger les notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, []);

  useEffect(() => {
    void loadNotificationCount();

    const listeners = [
      'inventory:updated',
      'shopping-list:updated',
      'menu-planner:generate-end',
      'notifications:refresh',
    ];

    const handler = () => void loadNotificationCount();
    listeners.forEach((event) => window.addEventListener(event, handler));

    return () => {
      listeners.forEach((event) => window.removeEventListener(event, handler));
    };
  }, [loadNotificationCount]);

  const handleRequestAddStock = useCallback((locationId?: string) => {
    setActiveTab('stocks');
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('stock-manager:add-item', {
          detail: { locationId },
        })
      );
    }, 0);
  }, []);

  const handleRequestAddShopping = useCallback(() => {
    setActiveTab('shopping');
    setTimeout(() => {
      window.dispatchEvent(new Event('shopping-list:add-item'));
    }, 0);
  }, []);

  const handleRequestGenerateMenus = useCallback(() => {
    setActiveTab('menus');
    setTimeout(() => {
      window.dispatchEvent(new Event('menu-planner:generate-week'));
    }, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        onNotificationClick={() => setIsNotificationOpen(true)}
        unreadCount={unreadCount}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-8">
        <section className="pt-8">
          <QuickDashboard
            onRequestAddStock={handleRequestAddStock}
            onRequestAddShoppingItem={handleRequestAddShopping}
            onRequestGenerateMenus={handleRequestGenerateMenus}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <InventoryOverview />
          </div>
          <FamilyMembers />
        </section>

        <section className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wide text-teal-600 uppercase">
                Espace familial
              </p>
              <h2 className="text-xl font-bold text-gray-900">{activeTabConfig.label}</h2>
              <p className="text-sm text-gray-500">{activeTabConfig.description}</p>
            </div>

            <nav className="flex flex-wrap gap-2">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors text-sm font-medium ${
                    tab.key === activeTab
                      ? 'bg-teal-500 border-teal-500 text-white shadow'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-teal-200 hover:text-teal-600'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-6">
            {activeTab === 'menus' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <MenuPlanner />
                </div>
              </div>
            )}

            {activeTab === 'stocks' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <StockManager />
                </div>
              </div>
            )}

            {activeTab === 'shopping' && (
              <div className="grid gap-6">
                <ShoppingList />
              </div>
            )}
          </div>
        </section>
      </main>

      <NotificationPanel
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        onUpdate={() => loadNotificationCount()}
      />
    </div>
  );
}
