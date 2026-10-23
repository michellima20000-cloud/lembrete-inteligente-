import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously,
  signOut as fbSignOut,
  signInWithPopup,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';

interface UserContextType {
  currentUser: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOutFirebase: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
  recentEmails: string[];
}

const UserContext = createContext<UserContextType | null>(null);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const storedAuth = localStorage.getItem('lembrete_authenticated_user');
      if (storedAuth) {
        return JSON.parse(storedAuth);
      }
      const storedGuest = localStorage.getItem('lembrete_guest_user');
      return storedGuest ? JSON.parse(storedGuest) : null;
    } catch {
      return null;
    }
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('lembrete_recent_emails');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const rememberEmail = (email: string) => {
    try {
      const clean = email.trim().toLowerCase();
      if (!clean) return;
      localStorage.setItem('lembrete_saved_email', clean);
      setRecentEmails((prev) => {
        const next = [clean, ...prev.filter((e) => e !== clean)].slice(0, 4);
        localStorage.setItem('lembrete_recent_emails', JSON.stringify(next));
        return next;
      });
    } catch {}
  };

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
            localStorage.setItem('lembrete_authenticated_user', JSON.stringify(profile));
            localStorage.removeItem('lembrete_guest_user');
            if (user.email) {
              rememberEmail(user.email);
            }
          } catch {}

          // Save user profile to Firestore cloud
          try {
            await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
          }

          // Register in backend
          fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile),
          }).catch(() => {});
        } else {
          // If no Firebase user session yet (e.g. reload inside iframe):
          // Check if we have a persistent user session
          const hasSavedUser = localStorage.getItem('lembrete_authenticated_user');
          const savedEmail = localStorage.getItem('lembrete_saved_email');
          const savedPass = localStorage.getItem('lembrete_saved_pass');

          // If we had stored credentials, attempt silent background reconnect
          if (savedEmail && savedPass && !auth.currentUser) {
            signInWithEmailAndPassword(auth, savedEmail, savedPass).catch((e) => {
              console.warn('Background silent reconnect deferred:', e?.message);
            });
          }

          if (hasSavedUser) {
            try {
              setCurrentUser(JSON.parse(hasSavedUser));
            } catch {
              setCurrentUser(null);
            }
          } else {
            try {
              const storedGuest = localStorage.getItem('lembrete_guest_user');
              if (storedGuest) {
                setCurrentUser(JSON.parse(storedGuest));
              } else {
                setCurrentUser(null);
              }
            } catch {
              setCurrentUser(null);
            }
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
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      rememberEmail(cleanEmail);
      try {
        localStorage.setItem('lembrete_saved_pass', cleanPass);
      } catch {}
      return;
    } catch (err: any) {
      // If trimmed failed and raw pass is different, try with raw pass
      if (cleanPass !== pass) {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, pass);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_saved_pass', pass);
          } catch {}
          return;
        } catch {}
      }

      console.warn('Firebase email sign-in failed:', err);
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setAuthError('E-mail ou senha incorretos ou esta conta ainda não foi cadastrada no Firebase.');
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
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      rememberEmail(cleanEmail);
      try {
        localStorage.setItem('lembrete_saved_pass', cleanPass);
      } catch {}
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
        // Smart auto-login fallback:
        // If account already exists in Firebase, try logging in immediately with both clean and raw password!
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_saved_pass', cleanPass);
          } catch {}
          return;
        } catch (loginErr: any) {
          if (cleanPass !== pass) {
            try {
              await signInWithEmailAndPassword(auth, cleanEmail, pass);
              rememberEmail(cleanEmail);
              try {
                localStorage.setItem('lembrete_saved_pass', pass);
              } catch {}
              return;
            } catch {}
          }
          console.warn('Auto sign-in for existing account failed:', loginErr);
          setAuthError('Esta conta já existe no Firebase, mas a senha digitada está incorreta para ela. Utilize a opção "Entrar" ou recupere sua senha.');
          throw loginErr;
        }
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

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.warn('Google sign-in failed:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return;
      }
      setAuthError(err.message || 'Falha ao autenticar com o Google.');
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setAuthError('Informe seu e-mail no campo acima para receber as instruções de recuperação.');
      throw new Error('E-mail necessário');
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err: any) {
      console.warn('Password reset error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setAuthError('E-mail não encontrado no Firebase. Verifique a digitação ou crie uma conta.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Formato de e-mail inválido.');
      } else {
        setAuthError(err.message || 'Falha ao enviar e-mail de redefinição de senha.');
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
      localStorage.removeItem('lembrete_authenticated_user');
      localStorage.removeItem('lembrete_saved_pass');
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
        signInWithGoogle,
        resetPassword,
        signInAsGuest,
        signOutFirebase,
        authError,
        clearAuthError,
        recentEmails,
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
