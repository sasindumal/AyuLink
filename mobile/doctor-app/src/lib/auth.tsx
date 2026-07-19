// ==============================================
// AyuLink Mobile - Auth Context
// Persists the Bearer token + user in SecureStore
// ==============================================

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
import type { User } from "../types";

const TOKEN_KEY = "ayulink.token";
const USER_KEY = "ayulink.user";

export interface LoginFields {
    nicNumber?: string;
    licenseNumber?: string;
    password: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    /** True while the persisted session is being restored */
    loading: boolean;
    login: (fields: LoginFields) => Promise<User>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [storedToken, storedUser] = await Promise.all([
                    SecureStore.getItemAsync(TOKEN_KEY),
                    SecureStore.getItemAsync(USER_KEY),
                ]);
                if (storedToken && storedUser) {
                    setToken(storedToken);
                    setUser(JSON.parse(storedUser));
                }
            } catch {
                // Corrupt storage — start signed out
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = useCallback(async (fields: LoginFields): Promise<User> => {
        const { token: newToken, user: newUser } = await api<{
            token: string;
            user: User;
        }>("/api/mobile/login", { method: "POST", body: fields });

        setToken(newToken);
        setUser(newUser);
        await Promise.all([
            SecureStore.setItemAsync(TOKEN_KEY, newToken),
            SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser)),
        ]);
        return newUser;
    }, []);

    const logout = useCallback(async () => {
        setToken(null);
        setUser(null);
        await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY),
            SecureStore.deleteItemAsync(USER_KEY),
        ]);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
