import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { auth, googleProvider } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  User as FirebaseUser,
} from 'firebase/auth';

interface UserContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutFirebase: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Clean out legacy mock data from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem('lembrete_users_profiles');
      localStorage.removeItem('lembrete_active_user_id');
      localStorage.removeItem('lembretes_isolated_user_maya');
      localStorage.removeItem('lembretes_isolated_user_trabalho');
      localStorage.removeItem('lembretes_isolated_user_pessoal');
    } catch (e) {
      // Ignore
    }
  }, []);

  // Listen to authoritative Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        setFirebaseUser(user);
        if (user) {
          const profile: UserProfile = {
            id: user.uid,
            nome: user.displayName || user.email?.split('@')[0] || 'Usuário Google',
            email: user.email || undefined,
            avatarCor: '#4f46e5',
            criado_em: user.metadata.creationTime || new Date().toISOString(),
          };
          setCurrentUser(profile);

          // Register in backend
          fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
          }).catch(() => {});
        } else {
          setCurrentUser(null);
        }
        setIsAuthReady(true);
      },
      (error) => {
        console.error('Firebase Auth state error:', error);
        setIsAuthReady(true);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.warn('Google Sign-in failed or was cancelled:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('O login com Google foi cancelado antes de concluir.');
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('O navegador bloqueou a janela de login. Por favor, permita pop-ups.');
      } else {
        setAuthError(err.message || 'Falha ao autenticar com o Google.');
      }
    }
  };

  const signOutFirebase = async () => {
    try {
      await fbSignOut(auth);
      setFirebaseUser(null);
      setCurrentUser(null);
    } catch (err: any) {
      console.error('Erro ao sair da conta:', err);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        firebaseUser,
        isAuthenticated: !!firebaseUser && !!currentUser,
        isAuthReady,
        signInWithGoogle,
        signOutFirebase,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
};
