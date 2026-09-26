import type { SensorEvent } from '../shared/types';

// Public API of the sensors module: camera behavior detection + activity tracking.
// Owned by feature/sensors. Raw video frames must never leave this module.

export type SensorListener = (event: Omit<SensorEvent, 'id'>) => void;

export interface SensorController {
  start(sessionId: number, onEvent: SensorListener): Promise<void>;
  stop(): void;
}

/** Placeholder until the camera pipeline is implemented. */
export function createSensorController(): SensorController {
  return {
    async start() {},
    stop() {},
  };
}
