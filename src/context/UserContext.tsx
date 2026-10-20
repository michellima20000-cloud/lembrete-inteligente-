import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { auth, googleProvider } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInAnonymously,
  signOut as fbSignOut,
  User as FirebaseUser,
} from 'firebase/auth';

interface UserContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOutFirebase: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem('lembrete_guest_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Listen to authoritative Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        setFirebaseUser(user);
        if (user) {
          const profile: UserProfile = {
            id: user.uid,
            nome: user.displayName || user.email?.split('@')[0] || (user.isAnonymous ? 'Convidado' : 'Usuário Google'),
            email: user.email || undefined,
            avatarCor: '#4f46e5',
            criado_em: user.metadata.creationTime || new Date().toISOString(),
          };
          setCurrentUser(profile);
          try {
            localStorage.removeItem('lembrete_guest_user');
          } catch {}

          // Register in backend
          fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
          }).catch(() => {});
        } else {
          // If no Firebase user, check if we had a guest session
          try {
            const stored = localStorage.getItem('lembrete_guest_user');
            if (stored) {
              setCurrentUser(JSON.parse(stored));
            } else {
              setCurrentUser(null);
            }
          } catch {
            setCurrentUser(null);
          }
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
        setAuthError('O navegador bloqueou o pop-up. Você pode tentar novamente ou entrar como Convidado.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError('Domínio de preview não autorizado no Firebase Console. Utilize a opção "Entrar como Convidado" para testar todas as funcionalidades.');
      } else {
        setAuthError(err.message || 'Falha ao autenticar com o Google. Você pode acessar como Convidado para testar.');
      }
    }
  };

  const signInAsGuest = async () => {
    setAuthError(null);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.warn('Firebase anonymous sign in unavailable, falling back to local guest profile:', err);
      const guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
      const guestProfile: UserProfile = {
        id: guestId,
        nome: 'Convidado (Demonstração)',
        avatarCor: '#6366f1',
        criado_em: new Date().toISOString(),
      };
      try {
        localStorage.setItem('lembrete_guest_user', JSON.stringify(guestProfile));
      } catch {}
      setCurrentUser(guestProfile);
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestProfile),
      }).catch(() => {});
    }
  };

  const signOutFirebase = async () => {
    try {
      localStorage.removeItem('lembrete_guest_user');
      await fbSignOut(auth);
    } catch (err: any) {
      console.error('Erro ao sair da conta:', err);
    } finally {
      setFirebaseUser(null);
      setCurrentUser(null);
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
        isAuthenticated: !!currentUser,
        isAuthReady,
        signInWithGoogle,
        signInAsGuest,
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
