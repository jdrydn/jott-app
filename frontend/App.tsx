import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { isTauri } from './lib/isTauri';
import { useApplyTheme } from './lib/useTheme';
import { Debug } from './pages/Debug';
import { Settings } from './pages/Settings';
import { Start } from './pages/Start';
import { Timeline } from './pages/Timeline';
import { trpc } from './trpc';

export function App() {
  const profile = trpc.profile.get.useQuery();
  useApplyTheme(profile.data?.theme);

  return (
    <div
      className={`min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 ${
        isTauri ? 'pt-4' : ''
      }`}
    >
      {isTauri ? <TauriTitlebar /> : null}
      <Switch>
        <Route path="/" component={RootRedirect} />
        <Route path="/start" component={Start} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings/debug" component={Debug} />
        <Route component={RootRedirect} />
      </Switch>
    </div>
  );
}

function TauriTitlebar() {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: native macOS titlebar drag affordance, no ARIA role applies.
    <div
      className="jott-titlebar"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const win = getCurrentWindow();
        if (e.detail === 2) win.toggleMaximize();
        else win.startDragging();
      }}
    />
  );
}

function RootRedirect() {
  const profile = trpc.profile.get.useQuery();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (profile.isLoading) return;
    setLocation(profile.data ? '/timeline' : '/start', { replace: true });
  }, [profile.isLoading, profile.data, setLocation]);

  return null;
}
