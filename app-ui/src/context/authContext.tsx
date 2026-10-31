import React, { createContext, useState, useEffect, useContext } from 'react';
import type { UserProfile } from '../types';
import { API_BASE, isNativeApp } from '../constants';
import { setAccessToken, setupFetchInterceptor } from '../services/api';
import { clearRefreshToken, getRefreshToken, nativeHeaders, refreshSession, saveRefreshToken } from '../services/sessionTokens';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string, selectedRole: 'admin' | 'teacher' | 'parent' | 'superadmin') => Promise<UserProfile>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Logout handler
  const logout = async () => {
    try {
      // The app can't use the cookie, so it sends its stored token so the server can revoke it.
      const stored = isNativeApp ? await getRefreshToken() : null;
      await window.fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        ...(stored
          ? { headers: { 'Content-Type': 'application/json', ...nativeHeaders() }, body: JSON.stringify({ refreshToken: stored }) }
          : {})
      });
    } catch (err) {
      console.warn('Logout request failed (network error)', err);
    } finally {
      if (isNativeApp) await clearRefreshToken();
      setAccessToken(null);
      setUser(null);
    }
  };

  // Read saved local profile helper
  const getSavedLocalProfile = () => {
    try {
      const saved = localStorage.getItem('schoolhub_admin_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  };

  // Perform session check
  const checkSession = async () => {
    try {
      setupFetchInterceptor(logout);

      // Restores the saved session (30 days in the app, cookie in browsers).
      const outcome = await refreshSession((url, init) => window.fetch(url, init), API_BASE);
      if (outcome.ok) {
        if (outcome.accessToken) {
          setAccessToken(outcome.accessToken);

          // Get profile
          const profileRes = await window.fetch(`${API_BASE}/auth/me?_t=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.success && profileData.user) {
              const u = profileData.user;
              const localSaved = getSavedLocalProfile();
              const dbName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name;

              const mergedUser: UserProfile = {
                role: u.role,
                name: dbName || localSaved?.name || 'Jaswanth Pothuru',
                username: u.username,
                email: u.email || localSaved?.email || 'admin@schoolhub.edu',
                phone: u.phone || localSaved?.phone || '+91 9392646349',
                avatar: u.avatar || localSaved?.avatar || '',
                teacherId: u.role === 'teacher' ? u._id : undefined,
                assignedClass: u.role === 'teacher' ? u.assignedClass || '10-A' : undefined,
                classTeacherOf: u.role === 'teacher' ? u.classTeacherOf : undefined,
                studentId: u.role === 'parent' ? u._id : undefined,
                studentName: u.role === 'parent' ? u.lastName : undefined,
                admissionNo: u.role === 'parent' ? u.username : undefined,
                permissions: u.permissions,
                employeeId: u.employeeId,
                mustChangePassword: !!u.mustChangePassword
              };

              setUser(mergedUser);
            }
          }
        }
      }
    } catch (err) {
      console.error('Session check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Login handler
  const login = async (
    username: string,
    password: string,
    selectedRole: 'admin' | 'teacher' | 'parent' | 'superadmin'
  ): Promise<UserProfile> => {
    try {
      const response = await window.fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          ...nativeHeaders()
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(20000)
      });

      const data = await response.json();

      if (data.success) {
        if (data.user.role !== selectedRole) {
          if (data.user.role === 'other' && selectedRole === 'teacher') {
            // Allow custom employees to log in via Employee Portal
          } else {
            throw new Error(`This account is not registered as a ${selectedRole}.`);
          }
        }
 
        setAccessToken(data.accessToken);
        // Keep the session on this phone (never the password) so the next open doesn't ask again.
        if (isNativeApp && typeof data.refreshToken === 'string') await saveRefreshToken(data.refreshToken);
        const localSaved = getSavedLocalProfile();
 
        const mappedUser: UserProfile = {
          role: data.user.role,
          name: data.user.name || localSaved?.name || 'Jaswanth Pothuru',
          username: data.user.username,
          email: data.user.email || localSaved?.email || 'admin@schoolhub.edu',
          phone: data.user.phone || localSaved?.phone || '+91 9392646349',
          avatar: data.user.avatar || localSaved?.avatar || '',
          teacherId: data.user.role === 'teacher' ? data.user.id : undefined,
          assignedClass: data.user.role === 'teacher' ? data.user.assignedClass || '10-A' : undefined,
          classTeacherOf: data.user.role === 'teacher' ? data.user.classTeacherOf : undefined,
          studentId: data.user.role === 'parent' ? data.user.id : undefined,
          studentName: data.user.role === 'parent' ? data.user.studentName : undefined,
          admissionNo: data.user.role === 'parent' ? data.user.admissionNo : undefined,
          permissions: data.user.permissions,
          employeeId: data.user.employeeId,
          mustChangePassword: !!data.user.mustChangePassword
        };
        setUser(mappedUser);
        return mappedUser;
      } else {
        throw new Error(data.message || 'Invalid credentials.');
      }
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new Error(`No response from ${API_BASE} after 20 seconds. Check that this device can reach the server.`);
      }
      if (error?.name === 'TypeError') {
        throw new Error(`Cannot reach ${API_BASE} (${error.message}).`);
      }
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error('Could not connect to the server. Please check your connection and try again.');
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return (user.permissions || []).includes(permission);
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      try {
        const existing = localStorage.getItem('schoolhub_admin_profile');
        const parsed = existing ? JSON.parse(existing) : {};
        localStorage.setItem('schoolhub_admin_profile', JSON.stringify({
          ...parsed,
          ...updates
        }));
      } catch {}
      return updated;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        hasPermission,
        updateUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
