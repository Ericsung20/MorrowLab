import type {
  MorrowLabDataService,
  StudySensorBinding,
} from "../contracts/services";
import { useRef } from 'react';
import { localMorrowLabDataService } from '../services/localMorrowLabDataService';
import { useStudySensors as useLocalStudySensors } from '../features/sensors/useStudySensors';
export const dataService: MorrowLabDataService = localMorrowLabDataService;
export function useStudySensors(): StudySensorBinding {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sensors = useLocalStudySensors(videoRef);
  return {
    videoRef,
    isMock: false,
    state: { ...sensors, currentState: sensors.currentState ?? undefined, error: sensors.error ?? undefined },
    controller: {
      start: sensors.start,
      stop: async () => sensors.stop(),
      simulatePhone: sensors.simulatePhone,
      simulateAway: sensors.simulateAway,
      setStudyMode: sensors.setStudyMode,
    },
  };
}
export const isDemoAdapter = false;
