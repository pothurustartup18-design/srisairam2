import { useUpdateAvailable } from '../../../services/appUpdates/updateBadge';

/**
 * Small red dot for the profile avatar when an app update is waiting.
 * The parent must be position: relative.
 */
export default function UpdateDot() {
  const available = useUpdateAvailable();
  if (!available) return null;
  return <span className="update-dot" role="status" aria-label="App update available" title="App update available" />;
}
