import { create } from "zustand";

export type DateRange = "week" | "month" | "quarter" | "year";

interface AppState {
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
}

export const useAppStore = create<AppState>((set) => ({
  dateRange: "month",
  setDateRange: (dateRange) => set({ dateRange }),
}));
