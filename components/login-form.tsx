// components/login-form.tsx
'use client';

// Split out of app/login/page.tsx so useSearchParams() (which Next.js
// requires a Suspense boundary around, or the whole route deopts to fully
// dynamic rendering) only suspends this part, not the page shell.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const redirectTo = (path: string): string =>
    `${window.location.origin}${path}?next=${encodeURIComponent(next)}`;

  const handleGoogle = async (): Promise<void> => {
    setError(null);
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo('/auth/callback') },
    });
    if (authError !== null) setError(authError.message);
  };

  const handleEmail = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setStatus('sending');
    setError(null);
    const { error: authError } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo('/auth/callback') },
    });
    if (authError !== null) {
      setError(authError.message);
      setStatus('error');
      return;
    }
    setStatus('sent');
  };

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Zey Compass</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Masuk untuk lanjut.</p>
      </div>

      <Button onClick={handleGoogle} style={{ width: '100%' }}>
        Masuk dengan Google
      </Button>

      <div className="row" style={{ color: 'var(--text-faint)', fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        atau
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {status === 'sent' ? (
        <p style={{ fontSize: 13 }}>Link masuk sudah dikirim ke {email}. Cek email lo.</p>
      ) : (
        <form onSubmit={handleEmail} className="stack">
          <input
            type="email"
            required
            placeholder="email@contoh.com"
            value={email}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
            style={{
              height: 40,
              padding: '0 var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated-2)',
            }}
          />
          <Button type="submit" variant="ghost" disabled={status === 'sending'} style={{ width: '100%' }}>
            {status === 'sending' ? 'Mengirim...' : 'Kirim link masuk'}
          </Button>
        </form>
      )}

      {error !== null ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
