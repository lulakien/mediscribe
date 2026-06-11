import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toaster';

// Pages
import Welcome from './pages/Welcome';
import Transcribe from './pages/Transcribe';
import Models from './pages/Models';
import Results from './pages/Results';
import Jobs from './pages/Jobs';
import Settings from './pages/Settings';
import Advanced from './pages/Advanced';

// Layout
import WorkspaceShell from './components/WorkspaceShell';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

function AppRoutes() {
  // Check if welcome should be shown
  const shouldShowWelcome = useShouldShowWelcome();

  return (
    <Routes>
      {/* Welcome route - full screen, no workspace shell */}
      <Route path="/welcome" element={<Welcome />} />

      {/* Workspace routes - all use the WorkspaceShell layout */}
      <Route element={<WorkspaceShell />}>
        <Route path="/transcribe" element={<Transcribe />} />
        <Route path="/models" element={<Models />} />
        <Route path="/results" element={<Results />} />
        <Route path="/results/:jobId" element={<Results />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/advanced" element={<Advanced />} />
      </Route>

      {/* Default redirect */}
      <Route
        path="/"
        element={
          shouldShowWelcome ? (
            <Navigate to="/welcome" replace />
          ) : (
            <Navigate to="/transcribe" replace />
          )
        }
      />

      {/* Catch all - redirect to default */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Hook to determine if welcome screen should be shown
 * Based on DESIGN.md §4: check firstLaunchCompleted or Settings toggle
 */
function useShouldShowWelcome(): boolean {
  // Check localStorage for firstLaunchCompleted flag
  const firstLaunchCompleted = localStorage.getItem('firstLaunchCompleted') === 'true';

  // Check if user preference from settings (when available)
  // This could be extended to check a settings value
  const showWelcomeOnLaunch = localStorage.getItem('showWelcomeOnLaunch') === 'true';

  // Show welcome if first launch not completed OR user has enabled it in settings
  return !firstLaunchCompleted || showWelcomeOnLaunch;
}

export default App;
