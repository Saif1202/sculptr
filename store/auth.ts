import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

type AuthUser = {
  uid: string;
  email: string;
};

type AuthState = {
  user: AuthUser | null;
  isHydrated: boolean;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
  setHydrated: () => void;
};

const secureStorage = {
  getItem: async (name: string) => {
    const value = await SecureStore.getItemAsync(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isHydrated: false,
      signIn: (user) => set({ user }),
      signOut: () => set({ user: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage as any),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
      partialize: (state) => ({ user: state.user }),
    }
  )
);

