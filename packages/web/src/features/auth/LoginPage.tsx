import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Banner, Field, NeonButton, TextInput } from "../../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="panel w-full max-w-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold neon-text-cyan tracking-widest">JOB OUTREACH</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">sign in to continue</p>
        </div>

        {error && <Banner tone="error">{error}</Banner>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <NeonButton type="submit" variant="cyan" className="w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </NeonButton>
        </form>
      </div>
    </div>
  );
}
