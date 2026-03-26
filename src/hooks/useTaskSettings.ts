import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { address } from '../../utils/ipAddress';

const defaultTaskCompletionSettings = {
  enabled: false,
  pendingTasks: {
    allowAttachments: false,
    mandatoryAttachments: false,
    mandatoryRemarks: false
  },
  pendingRecurringTasks: {
    allowAttachments: false,
    mandatoryAttachments: false,
    mandatoryRemarks: false
  }
};

export const useTaskSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        if (!user?.company?.companyId) {
          console.warn('No companyId found for user');
          setSettings(null);
          return;
        }

        const response = await axios.get(`${address}/api/settings/task-completion`, {
          params: { companyId: user.company.companyId }
        });

        setSettings({
          ...defaultTaskCompletionSettings,
          ...(response.data || {}),
          pendingTasks: {
            ...defaultTaskCompletionSettings.pendingTasks,
            ...(response.data?.pendingTasks || {})
          },
          pendingRecurringTasks: {
            ...defaultTaskCompletionSettings.pendingRecurringTasks,
            ...(response.data?.pendingRecurringTasks || {})
          }
        });
      } catch (error) {
        console.error('Error fetching task settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user?.company?.companyId]);

  return { settings, loading };
};
