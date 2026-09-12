import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { getActingUserId, setActingUserId } from '../api/client.js';

const AppContext = createContext(null);

/**
 * Holds the acting user and every admin-editable lookup, fetched once.
 * Components read statuses, priorities, sources, types and outcomes
 * from here, so none of them hard-codes a list.
 */
export function AppProvider({ children }) {
  const [userId, setUserId] = useState(getActingUserId);
  const [boot, setBoot] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!userId) {
        setBoot(null);
        setUsers(await api.sessionUsers());
        return;
      }
      const [b, u] = await Promise.all([api.bootstrap(), api.users.list()]);
      setBoot(b);
      setUsers(u);
    } catch (err) {
      /* A stored id for a user that no longer exists would otherwise
         wedge the app on a blank screen. */
      if (err.status === 401 || err.status === 403) {
        setActingUserId(null);
        setUserId(null);
        setUsers(await api.sessionUsers().catch(() => []));
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = useCallback((id) => {
    setActingUserId(id);
    setUserId(id);
  }, []);

  const signOut = useCallback(() => {
    setActingUserId(null);
    setUserId(null);
    setBoot(null);
  }, []);

  const value = useMemo(() => {
    const user = boot?.current_user ?? null;
    const role = user?.role ?? null;
    return {
      loading,
      error,
      reload: load,
      user,
      role,
      users,
      signIn,
      signOut,
      isAdmin: role === 'ADMIN',
      isManager: role === 'MANAGER',
      canSeeTeam: role === 'ADMIN' || role === 'MANAGER',
      canAssign: role === 'ADMIN' || role === 'MANAGER',
      statuses: boot?.statuses ?? [],
      activeStatuses: (boot?.statuses ?? []).filter((s) => s.active),
      sources: boot?.lead_sources ?? [],
      priorities: boot?.priorities ?? [],
      activityTypes: boot?.activity_types ?? [],
      outcomes: boot?.activity_outcomes ?? [],
      taskStatuses: boot?.task_statuses ?? [],
      taskPriorities: boot?.task_priorities ?? [],
      funnelStages: boot?.funnel_stages ?? [],
      metricDefinitions: boot?.metric_definitions ?? {},
      salespeople: users.filter((u) => u.role !== 'ADMIN'),
    };
  }, [boot, users, loading, error, load, signIn, signOut]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export default AppContext;
