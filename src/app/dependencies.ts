import type {
  MorrowLabDataService,
  StudySensorBinding,
} from "../contracts/services";
import { mockMorrowLabDataService } from "../mocks/dataService";
import { useMockStudySensors } from "../mocks/useMockStudySensors";
// Integration: replace these two bindings with adapters to the real implementations.
export const dataService: MorrowLabDataService = mockMorrowLabDataService;
export const useStudySensors: () => StudySensorBinding = useMockStudySensors;
export const isDemoAdapter = true;
