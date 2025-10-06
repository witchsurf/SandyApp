import { X, AlertCircle, Calendar, ShoppingBag, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Notification } from '../types/database';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function NotificationPanel({ isOpen, onClose, onUpdate }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setNotifications([]);
    }
  }

  async function markAsRead(id: string) {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    } catch (err) {
      console.error('Erreur:', err);
    }
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, is_read: true } : n
    ));
    onUpdate();
  }

  async function markAllAsRead() {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);
    } catch (err) {
      console.error('Erreur:', err);
    }
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    onUpdate();
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'low_stock': return AlertCircle;
      case 'expiry_warning': return Calendar;
      case 'shopping_reminder': return ShoppingBag;
      default: return AlertCircle;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'low_stock': return 'text-orange-500';
      case 'expiry_warning': return 'text-red-500';
      case 'shopping_reminder': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Check className="w-16 h-16 mb-3" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            <>
              {notifications.filter(n => !n.is_read).length > 0 && (
                <div className="p-3 border-b border-gray-200">
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Tout marquer comme lu
                  </button>
                </div>
              )}
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => {
                  const Icon = getIcon(notification.type);
                  const colorClass = getColor(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        !notification.is_read ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => !notification.is_read && markAsRead(notification.id)}
                    >
                      <div className="flex gap-3">
                        <Icon className={`w-5 h-5 flex-shrink-0 ${colorClass}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 mb-1">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notification.created_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}