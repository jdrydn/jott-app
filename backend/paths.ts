import { homedir, platform as osPlatform } from 'node:os';
import { join } from 'node:path';

export type DataDirDeps = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  home?: string;
};

export function defaultDataDir(deps: DataDirDeps = {}): string {
  const env = deps.env ?? process.env;
  const plat = deps.platform ?? osPlatform();
  const home = deps.home ?? homedir();

  if (plat === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'jottapp');
  }

  const xdg = env.XDG_DATA_HOME ?? join(home, '.local', 'share');
  return join(xdg, 'jottapp');
}
