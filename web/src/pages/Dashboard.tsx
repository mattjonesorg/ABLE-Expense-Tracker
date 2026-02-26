import { Link } from 'react-router-dom';
import {
  Title,
  Text,
  Card,
  SimpleGrid,
  Group,
  Stack,
  ThemeIcon,
} from '@mantine/core';
import { IconPlus, IconReceipt } from '@tabler/icons-react';
import { useAuth } from '../lib/auth';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: typeof IconPlus;
  color: string;
}

const quickActions: QuickAction[] = [
  {
    title: 'Add Expense',
    description: 'Record a new qualified ABLE expense',
    href: '/expenses/new',
    icon: IconPlus,
    color: 'blue',
  },
  {
    title: 'View Expenses',
    description: 'Browse and manage your expenses',
    href: '/expenses',
    icon: IconReceipt,
    color: 'teal',
  },
];

export function Dashboard() {
  const { user } = useAuth();

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Dashboard</Title>
        <Text c="dimmed" mt="xs">
          Welcome, {user?.displayName}
        </Text>
      </div>

      <Title order={3}>Quick Actions</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {quickActions.map((action) => (
          <Card
            key={action.href}
            component={Link}
            to={action.href}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Group>
              <ThemeIcon size="lg" radius="md" variant="light" color={action.color}>
                <action.icon size={20} stroke={1.5} />
              </ThemeIcon>
              <div>
                <Text fw={500}>{action.title}</Text>
                <Text size="sm" c="dimmed">
                  {action.description}
                </Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
