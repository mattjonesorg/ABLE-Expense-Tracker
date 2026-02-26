import {
  TextInput,
  PasswordInput,
  Button,
  Paper,
  Title,
  Container,
  Stack,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

interface LoginFormValues {
  email: string;
  password: string;
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const form = useForm<LoginFormValues>({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (value.trim().length === 0 ? 'Email is required' : null),
      password: (value) =>
        value.length === 0 ? 'Password is required' : null,
    },
  });

  const handleSubmit = async (values: LoginFormValues) => {
    try {
      await login(values.email, values.password);
      navigate('/');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      notifications.show({
        title: 'Login failed',
        message,
        color: 'red',
      });
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">
        ABLE Tracker
      </Title>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label="Email"
              type="email"
              placeholder="you@example.com"
              withAsterisk
              aria-required="true"
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              withAsterisk
              aria-required="true"
              {...form.getInputProps('password')}
            />
            <Button type="submit" fullWidth mt="xl">
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
