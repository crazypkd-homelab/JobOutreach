import { useState } from "react";
import { useAuth } from "../../app/AuthProvider";
import { Banner, Field, NeonButton, TextInput } from "../../components/ui";

export function RegisterPage() {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await register(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="panel w-full max-w-sm p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold neon-text-cyan tracking-widest">JOB OUTREACH</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">create the admin account</p>
        </div>

        {error && <Banner tone="error">{error}</Banner>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username" hint="3-30 characters, letters/numbers/underscores">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              minLength={3}
              maxLength={30}
              pattern="^[a-zA-Z0-9_]+$"
              autoComplete="username"
            />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm password">
            <TextInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <NeonButton type="submit" variant="lime" className="w-full" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </NeonButton>
        </form>
      </div>
    </div>
  );
}
