import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { LoginInput, RegisterInput } from '@careerforge/validation';
import { UserRole } from '@careerforge/types';
import { apiClient } from '@/lib/api';
import { clearSession, setSession } from './authStorage';
import { AuthContextValue, AuthState, AuthUser } from './types';

interface AuthResponseEnvelope {
  success: boolean;
  data: {
    user_id: string;
    email: string;
    role: UserRole;
  };
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    role: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Rehydrate auth state on mount via backend GET /auth/me
  useEffect(() => {
    let isMounted = true;

    async function rehydrateSession() {
      try {
        const response = await apiClient.get<AuthResponseEnvelope>('/auth/me');
        if (!isMounted) return;

        if (response.data?.success && response.data?.data) {
          const { user_id, email, role } = response.data.data;
          const user: AuthUser = { id: user_id, email, role };
          setSession({ user });
          setState({
            user,
            token: null,
            role,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        }
      } catch {
        // Unauthenticated or network error on rehydration
      }

      if (isMounted) {
        clearSession();
        setState({
          user: null,
          token: null,
          role: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    }

    rehydrateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for 401 Unauthorized events from apiClient
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setState({
        user: null,
        token: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('careerforge:unauthorized', handleUnauthorized);
      return () => {
        window.removeEventListener(
          'careerforge:unauthorized',
          handleUnauthorized
        );
      };
    }
  }, []);

  const login = useCallback(async (credentials: LoginInput): Promise<void> => {
    const response = await apiClient.post<AuthResponseEnvelope>(
      '/auth/login',
      credentials
    );
    const { user_id, email, role } = response.data.data;

    const user: AuthUser = { id: user_id, email, role };
    setSession({ user });

    setState({
      user,
      token: null,
      role,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const register = useCallback(async (data: RegisterInput): Promise<void> => {
    const response = await apiClient.post<AuthResponseEnvelope>(
      '/auth/register',
      data
    );
    const { user_id, email, role } = response.data.data;

    // Automatic login on successful registration
    const user: AuthUser = { id: user_id, email, role };
    setSession({ user });

    setState({
      user,
      token: null,
      role,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Proceed with frontend state cleanup even if network fails
    } finally {
      clearSession();
      setState({
        user: null,
        token: null,
        role: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
