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
import { clearSession, getToken, getUser, setSession } from './authStorage';
import { decodeJwt } from './jwt';
import { AuthContextValue, AuthState, AuthUser } from './types';

interface AuthResponseEnvelope {
  success: boolean;
  data: {
    user_id: string;
    email: string;
    role: UserRole;
    token: string;
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

  // Rehydrate auth state on mount
  useEffect(() => {
    try {
      const storedToken = getToken();
      const storedUser = getUser();

      if (storedToken) {
        const decoded = decodeJwt(storedToken);

        if (decoded) {
          // Token is valid and non-expired
          const activeUser: AuthUser = storedUser || {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
          };

          setState({
            user: activeUser,
            token: storedToken,
            role: decoded.role,
            isAuthenticated: true,
            isLoading: false,
          });
          return;
        } else {
          // Expired or invalid token
          clearSession();
        }
      }
    } catch {
      clearSession();
    }

    setState({
      user: null,
      token: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // Listen for 401 Unauthorized events from apiClient
  useEffect(() => {
    const handleUnauthorized = () => {
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
    const { user_id, email, role, token } = response.data.data;

    const user: AuthUser = { id: user_id, email, role };
    setSession({ user, token });

    setState({
      user,
      token,
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
    const { user_id, email, role, token } = response.data.data;

    // Automatic login on successful registration
    const user: AuthUser = { id: user_id, email, role };
    setSession({ user, token });

    setState({
      user,
      token,
      role,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback((): void => {
    clearSession();
    setState({
      user: null,
      token: null,
      role: null,
      isAuthenticated: false,
      isLoading: false,
    });
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
