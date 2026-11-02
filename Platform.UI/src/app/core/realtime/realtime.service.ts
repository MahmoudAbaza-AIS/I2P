import { Injectable, signal } from '@angular/core';

/**
 * RealtimeService — stub for future SignalR integration.
 *
 * ── Architecture note ──────────────────────────────────────────────────────
 * The backend (Platform.API) does not yet expose a SignalR hub endpoint.
 * When real-time is enabled:
 *  1. Add the `@microsoft/signalr` package.
 *  2. Replace this stub with a HubConnection that connects to
 *     `${config.apiBaseUrl}/hubs/integration`.
 *  3. Expose typed observables/signals for hub events.
 *  4. Set `features.realtimeDashboard = true` in config.json.
 *
 * For now, the connection state is permanently 'unavailable' and no
 * hub events are emitted.  Components should check connectionState and
 * degrade gracefully (show "Live updates unavailable – polling enabled").
 * ───────────────────────────────────────────────────────────────────────────
 */
export type RealtimeConnectionState = 'unavailable' | 'connecting' | 'connected' | 'disconnected' | 'error';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  /**
   * Current SignalR connection state.
   * Remains 'unavailable' until a hub is implemented.
   */
  readonly connectionState = signal<RealtimeConnectionState>('unavailable');

  /**
   * Placeholder: attempt to connect to the integration hub.
   * No-op until SignalR hub is available in the backend.
   */
  connect(): void {
    // TODO: implement when backend exposes /hubs/integration
  }

  /**
   * Placeholder: disconnect from the integration hub.
   */
  disconnect(): void {
    // TODO: implement when backend exposes /hubs/integration
  }
}
