import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { auth } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously,
  signOut as fbSignOut,
  User as FirebaseUser,
} from 'firebase/auth';

interface UserContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
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
            nome: user.displayName || user.email?.split('@')[0] || (user.isAnonymous ? 'Convidado' : 'Usuário Firebase'),
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

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err: any) {
      console.warn('Firebase email sign-in failed:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setAuthError('E-mail ou senha incorretos na conta Firebase.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('O formato do e-mail informado é inválido.');
      } else if (err.code === 'auth/too-many-requests') {
        setAuthError('Muitas tentativas sem sucesso. Aguarde alguns instantes e tente novamente.');
      } else {
        setAuthError(err.message || 'Falha ao autenticar com a conta Firebase.');
      }
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      if (name && name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch (e) {
          console.warn('Could not update displayName:', e);
        }
      }
    } catch (err: any) {
      console.warn('Firebase email sign-up failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Este e-mail já está cadastrado no Firebase. Utilize a opção "Entrar".');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('O formato do e-mail informado é inválido.');
      } else {
        setAuthError(err.message || 'Falha ao criar conta no Firebase.');
      }
      throw err;
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
        signInWithEmail,
        signUpWithEmail,
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
