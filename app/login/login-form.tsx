"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "signin" | "signup";

export default function LoginForm({
  signedOut,
  accountDeleted,
}: {
  signedOut: boolean;
  accountDeleted: boolean;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          email,
          password,
          name: mode === "signup" ? name : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");
      /*
       * A brand new account has no body stats and no programme, so it goes
       * through both questionnaires — profile first, since the nutrition
       * estimate needs it and the training split doesn't — rather than a
       * dashboard with nothing on it. Signing in goes home.
       */
      router.replace(mode === "signup" ? "/profile/setup" : "/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">Second Week</div>

      <p className="auth-tag">
        An adaptive strength coach that changes your plan on patterns, not single sessions.
      </p>

      {signedOut && <div className="banner">Signed out. Your training data is untouched.</div>}
      {accountDeleted && <div className="banner">Account deleted. Nothing was kept.</div>}

      <div className="card auth-card">
        <div className="seg auth-seg">
          <button
            type="button"
            className={mode === "signin" ? "on" : ""}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "on" : ""}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {mode === "signup" && (
            <label>
              Name
              <input
                type="text"
                value={name}
                autoComplete="name"
                placeholder="What should the briefings call you?"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              required
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="At least 8 characters"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="banner banner--warn">{error}</div>}

          <button type="submit" disabled={busy} className="wide">
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "signup" && (
          <p className="tiny">
            Your account starts empty. The next screen asks how many days you train, what
            split you follow and which days are rest — nothing is planned for you before you
            have said what you actually do.
          </p>
        )}
      </div>

      <div className="auth-note">
        Passwords are hashed with scrypt and a per-user salt; the cookie holds a random
        token, not your identity, and signing out deletes the session server-side rather
        than just clearing the cookie. This is a personal project, so hold it to that
        standard and no further — use a password you don&apos;t use anywhere else.
      </div>
    </div>
  );
}
