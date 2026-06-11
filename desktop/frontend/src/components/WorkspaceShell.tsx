import { Outlet, useLocation, Link } from 'react-router-dom';
import {
  FileAudio,
  Download,
  FileText,
  ListChecks,
  Settings as SettingsIcon,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useUiStore } from '../store/ui-store';
import { cn } from '../lib/utils';
import StatusFooter from './StatusFooter';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isAdvanced?: boolean;
}

const navItems: NavItem[] = [
  { path: '/transcribe', icon: FileAudio, label: 'Transcribe' },
  { path: '/models', icon: Download, label: 'Models' },
  { path: '/results', icon: FileText, label: 'Results' },
  { path: '/jobs', icon: ListChecks, label: 'Jobs' },
  { path: '/settings', icon: SettingsIcon, label: 'Settings' },
  { path: '/advanced', icon: Terminal, label: 'Advanced', isAdvanced: true },
];

export default function WorkspaceShell() {
  const location = useLocation();
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();

  const isActivePath = (path: string) => {
    if (path === '/results') {
      return location.pathname.startsWith('/results');
    }
    return location.pathname === path;
  };

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Main content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar / nav rail */}
        <aside
          className={cn(
            'flex flex-col border-r border-border-strong bg-surface-2 transition-all duration-200',
            sidebarCollapsed ? 'w-16' : 'w-[232px]'
          )}
        >
          {/* Nav items */}
          <nav className="flex-1 space-y-1 p-2 pt-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors',
                    'hover:bg-surface hover:text-text',
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : item.isAdvanced
                      ? 'text-text-faint hover:text-text-muted'
                      : 'text-text-muted',
                    sidebarCollapsed && 'justify-center px-0'
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Collapse toggle at bottom */}
          <div className="border-t border-border p-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex w-full items-center justify-center rounded-lg p-2 text-text-muted transition-colors hover:bg-surface hover:text-text"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" />
                  <span className="ml-2 text-sm">Collapse</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Status footer - persistent across all workspace routes */}
      <StatusFooter />
    </div>
  );
}
