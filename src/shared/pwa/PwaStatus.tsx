import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useConnectivityStore } from '../state/connectivityStore';

export function PwaStatus() {
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onRegisterError: () => setRegistrationFailed(true) });
  const [updateFailed, setUpdateFailed] = useState(false);

  async function applyUpdate() {
    setUpdateFailed(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateFailed(true);
    }
  }

  return (
    <aside aria-label="Connection and application status" className="status">
      <p role="status">
        {!isOnline && 'You are offline. '}
        {registrationFailed
          ? 'Offline setup could not finish. Reconnect and reload to try again.'
          : offlineReady
            ? 'The club entrance is available offline on this device.'
            : !isOnline
              ? 'Offline readiness has not been confirmed.'
              : 'Offline access requires a completed first visit on this device.'}
      </p>
      {needRefresh && (
        <div className="mt-3">
          <p>A club update is ready. Applying it reloads this page.</p>
          <button
            type="button"
            onClick={() => void applyUpdate()}
            className="mt-2"
          >
            Apply update
          </button>
        </div>
      )}
      {updateFailed && (
        <p role="alert">The update could not be applied. Please try again.</p>
      )}
    </aside>
  );
}
