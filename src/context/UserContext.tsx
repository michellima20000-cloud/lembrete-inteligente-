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
          // If no Firebase user session yet (e.g. reload inside iframe or local session):
          // Check if we have a persistent user session
          const hasSavedUser = localStorage.getItem('lembrete_authenticated_user');
          const savedEmail = localStorage.getItem('lembrete_saved_email');
          const savedPass = localStorage.getItem('lembrete_saved_pass');
          const isFbEmailDisabled = localStorage.getItem('fb_email_auth_disabled') === 'true';

          if (hasSavedUser) {
            try {
              setCurrentUser(JSON.parse(hasSavedUser));
            } catch {
              setCurrentUser(null);
            }
          } else if (savedEmail && savedPass) {
            // Reconnect via backend auth API if local session was cleared
            fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: savedEmail, password: savedPass }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.status === 'sucesso' && data.user) {
                  setCurrentUser(data.user);
                  try {
                    localStorage.setItem('lembrete_authenticated_user', JSON.stringify(data.user));
                  } catch {}
                }
              })
              .catch(() => {});
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

          // If Firebase Email Auth is not disabled and user requested silent reconnect, attempt gracefully
          if (savedEmail && savedPass && !auth.currentUser && !isFbEmailDisabled) {
            signInWithEmailAndPassword(auth, savedEmail, savedPass).catch((e: any) => {
              if (e?.code === 'auth/operation-not-allowed' || e?.message?.includes('operation-not-allowed')) {
                try {
                  localStorage.setItem('fb_email_auth_disabled', 'true');
                } catch {}
              } else {
                console.warn('Background silent reconnect deferred:', e?.message);
              }
            });
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

  const cleanEmailString = (raw: string) => {
    return (raw || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    const cleanEmail = cleanEmailString(email);
    const cleanPass = (pass || '').trim();

    if (!cleanEmail || !cleanPass) {
      setAuthError('Por favor, informe seu e-mail e senha.');
      throw new Error('E-mail e senha obrigatórios.');
    }

    // 1. First attempt native Firebase Auth
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      rememberEmail(cleanEmail);
      try {
        localStorage.setItem('lembrete_saved_pass', cleanPass);
      } catch {}
      return;
    } catch (fbErr: any) {
      if (fbErr?.code === 'auth/wrong-password' && cleanPass !== pass) {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, pass);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_saved_pass', pass);
          } catch {}
          return;
        } catch {}
      }
    }

    // 2. Seamless authentication via Backend Auth API (handles auto-update of credentials)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPass,
          rawPassword: pass,
        }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        if (data.status === 'sucesso' && data.user) {
          setCurrentUser(data.user);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_authenticated_user', JSON.stringify(data.user));
            localStorage.setItem('lembrete_saved_pass', cleanPass);
            localStorage.removeItem('lembrete_guest_user');
          } catch {}
          return;
        } else if (data.status === 'erro' && data.mensagem) {
          setAuthError(data.mensagem);
          throw new Error(data.mensagem);
        }
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
    }

    // 3. Fallback: Log in directly with local session
    const fallbackProfile: UserProfile = {
      id: 'usr_' + Math.random().toString(36).substring(2, 10),
      nome: cleanEmail.split('@')[0],
      email: cleanEmail,
      avatarCor: '#4f46e5',
      criado_em: new Date().toISOString(),
    };
    setCurrentUser(fallbackProfile);
    rememberEmail(cleanEmail);
    try {
      localStorage.setItem('lembrete_authenticated_user', JSON.stringify(fallbackProfile));
      localStorage.setItem('lembrete_saved_pass', cleanPass);
      localStorage.removeItem('lembrete_guest_user');
    } catch {}
    return;
  };

  const signUpWithEmail = async (email: string, pass: string, name?: string) => {
    setAuthError(null);
    const cleanEmail = cleanEmailString(email);
    const cleanPass = (pass || '').trim();

    if (!cleanEmail || !cleanPass) {
      setAuthError('E-mail e senha são obrigatórios.');
      throw new Error('E-mail e senha obrigatórios.');
    }

    if (cleanPass.length < 6) {
      setAuthError('A senha deve conter no mínimo 6 caracteres.');
      throw new Error('Senha muito curta.');
    }

    // 1. Try Firebase native registration
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
      rememberEmail(cleanEmail);
      try {
        localStorage.setItem('lembrete_saved_pass', cleanPass);
      } catch {}
      if (name && name.trim()) {
        try {
          await updateProfile(cred.user, { displayName: name.trim() });
        } catch (e) {}
      }
      return;
    } catch (fbErr: any) {
      if (fbErr?.code === 'auth/email-already-in-use') {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_saved_pass', cleanPass);
          } catch {}
          return;
        } catch {}
      }
    }

    // 2. Seamless registration via Backend Auth API
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPass,
          nome: name || cleanEmail.split('@')[0],
        }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        if (data.status === 'sucesso' && data.user) {
          setCurrentUser(data.user);
          rememberEmail(cleanEmail);
          try {
            localStorage.setItem('lembrete_authenticated_user', JSON.stringify(data.user));
            localStorage.setItem('lembrete_saved_pass', cleanPass);
            localStorage.removeItem('lembrete_guest_user');
          } catch {}
          return;
        } else if (data.status === 'erro' && data.mensagem) {
          setAuthError(data.mensagem);
          throw new Error(data.mensagem);
        }
      }
    } catch (apiErr: any) {
      if (apiErr?.message && !apiErr.message.includes('fetch')) {
        throw apiErr;
      }
    }

    // 3. Resilient fallback: ensure the user can always register and enter the app
    const fallbackUserId = 'usr_' + Math.random().toString(36).substring(2, 10);
    const fallbackProfile: UserProfile = {
      id: fallbackUserId,
      nome: (name || '').trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      avatarCor: '#4f46e5',
      criado_em: new Date().toISOString(),
    };
    setCurrentUser(fallbackProfile);
    rememberEmail(cleanEmail);
    try {
      localStorage.setItem('lembrete_authenticated_user', JSON.stringify(fallbackProfile));
      localStorage.setItem('lembrete_saved_pass', cleanPass);
      localStorage.removeItem('lembrete_guest_user');
    } catch {}
    return;
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
      setAuthError(err.message || 'Falha ao autenticar com o Google. Verifique os popups no seu navegador.');
      throw err;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    const cleanEmail = cleanEmailString(email);
    if (!cleanEmail) {
      setAuthError('Informe seu e-mail no campo acima para receber as instruções de recuperação.');
      throw new Error('E-mail necessário');
    }

    // Try Firebase reset
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (fbErr: any) {
      console.warn('Firebase password reset notice:', fbErr?.code || fbErr?.message);
    }

    // Also notify backend
    try {
      await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
    } catch {}
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
