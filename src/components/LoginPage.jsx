import React, { useState } from "react";
import { useAuth } from "../lib/AuthContext";

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // "login" or "forgot"
  const [resetSent, setResetSent] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  function switchToForgot() {
    setMode("forgot");
    setError(null);
    setResetSent(false);
  }

  function switchToLogin() {
    setMode("login");
    setError(null);
    setResetSent(false);
  }

  if (mode === "forgot") {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>Charlie Tracker</h1>
          <p className="login-subtitle">Reset your password</p>
          {resetSent ? (
            <div className="reset-sent">
              <p>Check your email for a password reset link.</p>
              <button
                type="button"
                className="login-btn"
                onClick={switchToLogin}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label htmlFor="reset-email">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                className="login-link-btn"
                onClick={switchToLogin}
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Charlie Tracker</h1>
        <p className="login-subtitle">Sign in to continue</p>
        <form onSubmit={handleSignIn}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <button
            type="button"
            className="login-link-btn"
            onClick={switchToForgot}
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}
