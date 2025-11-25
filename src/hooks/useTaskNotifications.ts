// src/hooks/useTaskNotifications.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { address } from '../../utils/ipAddress';
import { useAuth } from '../contexts/AuthContext';

export type TaskItem = {
  _id: string;
  title: string;
  description?: string;
  taskType: string; // 'one-time' | 'daily' | 'weekly' | ...
  assignedBy?: { username?: string; email?: string };
  assignedTo?: { _id?: string; username?: string; email?: string };
  dueDate?: string;
  priority?: string;
  status?: string;
  attachments?: any[];
  lastCompletedDate?: string;
};

type UseTaskNotificationsReturn = {
  loading: boolean;
  error: string | null;
  oneTimeToday: TaskItem[];
  oneTimeOverdue: TaskItem[];
  recurringToday: TaskItem[];
  recurringOverdue: TaskItem[];
  totalCount: number;
  refetch: () => void;
};

const normalizeStartOfDay = (d?: string | Date) => {
  if (!d) return null;
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const isOverdue = (due?: string) => {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = normalizeStartOfDay(due)!;
  return dd.getTime() < today.getTime();
};

const isToday = (due?: string) => {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = normalizeStartOfDay(due)!;
  return dd.getTime() === today.getTime();
};

export const useTaskNotifications = (): UseTaskNotificationsReturn => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [oneTimeTasks, setOneTimeTasks] = useState<TaskItem[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<TaskItem[]>([]);
  const intervalRef = useRef<number | null>(null);
  const isMounted = useRef(true);

  const canViewAll = !!user?.permissions?.canViewAllTeamTasks;

  const fetchOnce = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // One-time
      const paramsOne: any = {};
      if (user?.company?.companyId) paramsOne.companyId = user.company.companyId;
      if (!canViewAll && user?.id) paramsOne.userId = user.id;

      const pendingReq = axios.get<TaskItem[]>(`${address}/api/tasks/pending`, {
        params: { ...paramsOne, taskType: 'one-time' },
      });

      // Recurring
      const paramsRecurring: any = {};
      if (user?.company?.companyId) paramsRecurring.companyId = user.company.companyId;
      if (!canViewAll && user?.id) paramsRecurring.userId = user.id;

      const recurringReq = axios.get<TaskItem[]>(`${address}/api/tasks/pending-recurring`, {
        params: paramsRecurring,
      });

      const [pendingRes, recurringRes] = await Promise.all([pendingReq, recurringReq]);

      if (!isMounted.current) return;

      setOneTimeTasks(pendingRes.data || []);
      setRecurringTasks(recurringRes.data || []);
    } catch (err: any) {
      console.error('useTaskNotifications fetch error', err);
      if (isMounted.current) setError(err?.message || 'Failed to load tasks');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [user, canViewAll]);

  useEffect(() => {
    isMounted.current = true;
    // initial fetch
    fetchOnce();

    // Poll every 2000ms (2s)
    intervalRef.current = window.setInterval(() => {
      fetchOnce();
    }, 2000);

    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [fetchOnce]);

  // Derived groups
  const oneTimeToday = oneTimeTasks.filter(t => isToday(t.dueDate));
  const oneTimeOverdue = oneTimeTasks.filter(t => isOverdue(t.dueDate));
  const recurringToday = recurringTasks.filter(t => isToday(t.dueDate));
  const recurringOverdue = recurringTasks.filter(t => isOverdue(t.dueDate));

  const totalCount =
    oneTimeToday.length + oneTimeOverdue.length + recurringToday.length + recurringOverdue.length;

  const refetch = () => {
    fetchOnce();
  };

  return {
    loading,
    error,
    oneTimeToday,
    oneTimeOverdue,
    recurringToday,
    recurringOverdue,
    totalCount,
    refetch,
  };
};
