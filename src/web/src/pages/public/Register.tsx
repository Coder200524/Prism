import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Input } from "../../components/Input";

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ name, email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md w-full mt-12 mb-24">
      <div className="bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.37)] rounded-3xl p-10">
        <h1 className="text-3xl font-display uppercase tracking-widest text-df-text mb-2">Register</h1>
        
        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Input
            label="Name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password (min 8)"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-df-pink">{error}</p> : null}
          
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-[#c70b47] py-3.5 text-sm font-semibold font-mono text-white tracking-widest hover:bg-df-pink transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-xs font-mono text-df-dim">
            Already have an account?{" "}
            <Link to="/login" className="text-df-text hover:text-df-cyan transition-colors font-semibold">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
