import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Safety net: if auth hasn't resolved in 8s (e.g. token refresh hangs on
    // mobile with no network), force loading off so the UI isn't stuck forever.
    const fallbackTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[Auth] Timeout waiting for auth state — forcing resolve");
        setLoading(false);
      }
    }, 8000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      clearTimeout(fallbackTimer);

      setUser(session?.user ?? null);

      // User clicked a password recovery or invite link
      if (event === "PASSWORD_RECOVERY") {
        setNeedsPasswordSet(true);
        setLoading(false);
        return;
      }

      // Unblock the UI immediately — don't await the profile fetch
      setLoading(false);

      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile(data);
    } catch (err) {
      console.warn("Profile load error:", err);
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setNeedsPasswordSet(false);
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error };
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      setNeedsPasswordSet(false);
    }
    return { error };
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        needsPasswordSet,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
