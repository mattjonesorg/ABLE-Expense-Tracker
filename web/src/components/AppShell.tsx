import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Title,
  Button,
  Stack,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconHome,
  IconReceipt,
  IconPlus,
  IconLogout,
} from '@tabler/icons-react';
import { useAuth } from '../lib/auth';

interface NavItem {
  label: string;
  to: string;
  icon: typeof IconHome;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: IconHome },
  { label: 'Expenses', to: '/expenses', icon: IconReceipt },
  { label: 'New Expense', to: '/expenses/new', icon: IconPlus },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Title order={3}>ABLE Tracker</Title>
          </Group>
          <Group>
            {user && <Text size="sm">{user.displayName}</Text>}
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconLogout size={16} />}
              onClick={handleLogout}
              aria-label="Logout"
            >
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" aria-label="Main navigation">
        <Stack gap="xs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={20} stroke={1.5} />}
              active={location.pathname === item.to}
              onClick={close}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
