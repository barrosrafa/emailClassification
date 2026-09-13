'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

export function useAuth() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const data = await api.status();
      setAuth(data);
    } catch {
      setAuth({ authenticated: false, account: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
      setAuth({ authenticated: false, account: null });
    } catch (err) {
      console.error('Falha ao sair:', err);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { auth, loading, checkAuth, logout };
}
