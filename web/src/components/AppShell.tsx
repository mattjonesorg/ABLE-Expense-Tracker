import { Outlet, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  Button,
  Stack,
  Anchor,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconHome,
  IconReceipt,
  IconPlus,
  IconCash,
  IconChartBar,
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
  { label: 'Reimbursements', to: '/reimbursements', icon: IconCash },
  { label: 'Reports', to: '/reports', icon: IconChartBar },
  { label: 'New Expense', to: '/expenses/new', icon: IconPlus },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  // Redirect to login if not authenticated
  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

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
      {/* Skip to main content link for keyboard users */}
      <Anchor
        href="#main-content"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          zIndex: 1000,
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          el.style.position = 'fixed';
          el.style.top = '4px';
          el.style.left = '4px';
          el.style.width = 'auto';
          el.style.height = 'auto';
          el.style.overflow = 'visible';
          el.style.padding = '8px 16px';
          el.style.background = 'var(--mantine-color-blue-6)';
          el.style.color = 'white';
          el.style.borderRadius = '4px';
          el.style.textDecoration = 'none';
          el.style.fontWeight = '600';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.overflow = 'hidden';
        }}
      >
        Skip to main content
      </Anchor>

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
            <Text fw={700} size="lg">ABLE Tracker</Text>
          </Group>
          <Group>
            {user && <Text size="sm">{user.displayName}</Text>}
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconLogout size={16} aria-hidden="true" />}
              onClick={handleLogout}
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
              leftSection={<item.icon size={20} stroke={1.5} aria-hidden="true" />}
              active={location.pathname === item.to}
              onClick={close}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main id="main-content">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
