// ==============================================
// AyuLink Mobile - Auth Context (Supabase Auth)
// NIC maps to a synthetic email:
//   <nic-lowercase>@nic.ayulink.app
// Session persistence is handled by supabase-js.
// ==============================================

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { supabase } from "./supabase";
import { rpc } from "./api";
import type { User } from "../types";

export function nicToEmail(nicNumber: string): string {
    return `${nicNumber.trim().toLowerCase()}@nic.ayulink.app`;
}

export interface LoginFields {
    nicNumber?: string;
    licenseNumber?: string;
    password: string;
}

/** Registration fields; role plus the role-specific extras. */
export type RegisterProfile = Record<string, string | string[]>;

interface AuthState {
    user: User | null;
    /** True while the persisted session is being restored */
    loading: boolean;
    login: (fields: LoginFields) => Promise<User>;
    register: (profile: RegisterProfile, password: string) => Promise<User>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await supabase.auth.getSession();
                if (data.session) {
                    const profile = await rpc<User>("app_get_my_profile");
                    setUser(profile);
                }
            } catch {
                // Stale or profile-less session — start signed out
                await supabase.auth.signOut().catch(() => {});
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const login = useCallback(async (fields: LoginFields): Promise<User> => {
        let email: string;
        if (fields.licenseNumber) {
            const resolved = await rpc<string | null>("app_login_email_for_license", {
                p_license: fields.licenseNumber,
            });
            if (!resolved) throw new Error("Invalid credentials");
            email = resolved;
        } else if (fields.nicNumber) {
            email = nicToEmail(fields.nicNumber);
        } else {
            throw new Error("Please enter your NIC or license number");
        }

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: fields.password,
        });
        if (error) {
            throw new Error(
                /rate limit/i.test(error.message)
                    ? "Too many login attempts. Please try again shortly"
                    : "Invalid credentials"
            );
        }

        try {
            const profile = await rpc<User>("app_get_my_profile");
            setUser(profile);
            return profile;
        } catch (e) {
            await supabase.auth.signOut().catch(() => {});
            throw e;
        }
    }, []);

    const register = useCallback(
        async (profile: RegisterProfile, password: string): Promise<User> => {
            const { data, error } = await supabase.auth.signUp({
                email: nicToEmail(profile.nicNumber as string),
                password,
            });
            if (error) {
                throw new Error(
                    /already/i.test(error.message)
                        ? "An account with this NIC number already exists"
                        : error.message
                );
            }
            if (!data.session) {
                throw new Error(
                    'Sign-ups need email confirmation disabled: in the Supabase Dashboard open Authentication -> Sign In / Up -> Email and turn off "Confirm email"'
                );
            }

            try {
                const created = await rpc<User>("app_register_profile", {
                    p_profile: profile,
                });
                setUser(created);
                return created;
            } catch (e) {
                await supabase.auth.signOut().catch(() => {});
                throw e;
            }
        },
        []
    );

    const logout = useCallback(async () => {
        setUser(null);
        await supabase.auth.signOut().catch(() => {});
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
