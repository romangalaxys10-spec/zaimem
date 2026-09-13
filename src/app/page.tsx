"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Landing } from "@/components/zaimem/landing";
import { Dashboard } from "@/components/zaimem/dashboard";

const TOKEN_KEY = "zaimem_token"; // token saver: the private token persists in this browser

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  // Restore a saved token on first paint (auto-login via token saver)
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setBooting(false);
    };
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      // defer: avoid synchronous setState inside the effect body
      Promise.resolve().then(finish);
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${saved}` } })
      .then((r) => {
        if (r.ok) {
          if (!cancelled) setToken(saved);
        } else {
          localStorage.removeItem(TOKEN_KEY); // stale/invalid token
        }
      })
      .catch(() => {})
      .finally(finish);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08080c]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return token ? (
    <Dashboard token={token} onLogout={handleLogout} />
  ) : (
    <Landing onToken={handleToken} />
  );
}
