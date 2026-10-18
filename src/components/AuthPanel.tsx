"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, CheckCircle2, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export function AuthPanel() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signupError) throw signupError;
        if (!data.session) setSuccess("Check your inbox for a confirmation email, then come back to sign in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-stage">
        <div className="auth-intro">
          <div className="brand brand-auth"><span className="brand-mark"><BookOpen size={23} strokeWidth={1.8} /></span><span className="brand-word">fablekeep<span className="brand-period">.</span></span></div>
          <div className="auth-art" aria-hidden="true"><div className="auth-art-ring"><Sparkles size={53} strokeWidth={1.2} /></div><span className="auth-art-star auth-art-star-a">✦</span><span className="auth-art-star auth-art-star-b">✧</span></div>
          <p className="eyebrow">YOUR ADVENTURE, YOUR WAY</p>
          <h1>Every legend starts <em>somewhere.</em></h1>
          <p className="auth-subtitle">A simpler home for your D&D characters. All the details you need, right where your story happens.</p>
          <div className="auth-benefits"><span><CheckCircle2 size={16} /> Made for your phone</span><span><ShieldCheck size={16} /> Private cloud saves</span></div>
        </div>
        <div className="auth-card-wrap">
          <div className="auth-card">
            <div className="auth-card-icon"><BookOpen size={22} /></div>
            <p className="eyebrow">THE NEXT CHAPTER</p>
            <h2>{mode === "signup" ? "Begin your story" : "Welcome back"}</h2>
            <p className="auth-card-description">{mode === "signup" ? "Create a free account to keep your characters safe and in sync." : "Sign in to pick up where your adventure left off."}</p>
            <form className="auth-form" onSubmit={submit}>
              <label htmlFor="auth-email">Email address</label>
              <div className="auth-input-wrap"><Mail size={18} /><input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap"><LockKeyhole size={18} /><input id="auth-password" type="password" minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              {error && <div role="alert" className="message error-message">{error}</div>}
              {success && <div role="status" className="message success-message">{success}</div>}
              <button className="button primary-button full-width" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === "signup" ? "Create free account" : "Sign in"}{!busy && <ArrowRight size={18} />}</button>
            </form>
            <div className="auth-switch">{mode === "signup" ? "Already have an account?" : "New to Fablekeep?"} <button type="button" onClick={() => {setMode(mode === "signup" ? "signin" : "signup");setError("");setSuccess("");}}>{mode === "signup" ? "Sign in" : "Create an account"}</button></div>
          </div>
          <p className="auth-footnote">No sample characters. Your collection begins completely empty.</p>
        </div>
      </div>
    </div>
  );
}
