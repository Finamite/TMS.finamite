import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { address } from '../../utils/ipAddress';

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

        setSettings(response.data);
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