import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Container, Paper, Text, Loader, Stack, Anchor } from '@mantine/core';
import { useAuth } from '../lib/auth';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  useEffect(() => {
    if (!code) {
      setError('Missing authorization code. Please try signing in again.');
      return;
    }

    if (!state) {
      setError('Missing state parameter. Please try signing in again.');
      return;
    }

    const storedState = sessionStorage.getItem('oauth_state');
    if (state !== storedState) {
      setError(
        'State mismatch — this may indicate a security issue. Please try signing in again.',
      );
      return;
    }

    let cancelled = false;

    handleOAuthCallback(code, state)
      .then(() => {
        if (cancelled) return;

        const returnTo = sessionStorage.getItem('returnTo');
        sessionStorage.removeItem('returnTo');
        const safePath =
          returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
            ? returnTo
            : '/';
        navigate(safePath, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Sign in failed. Please try again.';
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [code, state, handleOAuthCallback, navigate]);

  if (error) {
    return (
      <Container size={420} my={40}>
        <Paper withBorder shadow="md" p={30} radius="md">
          <Stack align="center">
            <Text c="red" ta="center">
              {error}
            </Text>
            <Anchor component={Link} to="/login">
              Sign in
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40}>
      <Paper withBorder shadow="md" p={30} radius="md">
        <Stack align="center">
          <Loader size="lg" />
          <Text>Signing in...</Text>
        </Stack>
      </Paper>
    </Container>
  );
}
