import type {
  MorrowLabDataService,
  StudySensorBinding,
} from "../contracts/services";
import { useRef } from 'react';
import type { StudyTask } from '../contracts/morrowlab';
import { localMorrowLabDataService } from '../services/localMorrowLabDataService';
import { useStudySensors as useLocalStudySensors } from '../features/sensors/useStudySensors';
export const dataService: MorrowLabDataService = localMorrowLabDataService;
/** tasks: the plan, used to match open tabs to tasks. */
export function useStudySensors(tasks?: StudyTask[]): StudySensorBinding {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensors = useLocalStudySensors(videoRef, { tasks });
  return {
    videoRef,
    isMock: false,
    state: { ...sensors, currentState: sensors.currentState ?? undefined, error: sensors.error ?? undefined },
    controller: {
      start: sensors.start,
      stop: async () => sensors.stop(),
      simulatePhone: sensors.simulatePhone,
      simulateAway: sensors.simulateAway,
    },
  };
}
export const isDemoAdapter = false;
