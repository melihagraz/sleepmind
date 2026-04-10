import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── TYPES ───
export interface SnoringEvent {
  id: string;
  timestampSec: number;   // seconds since session start
  durationSec: number;    // duration of event in seconds
  peakDb: number;         // peak dBFS during event
}

export interface SnoringSession {
  id: string;
  date: string;           // ISO date "2026-04-10"
  startTime: string;      // ISO datetime
  endTime: string;        // ISO datetime
  totalDurationMin: number;
  totalSnoringMin: number;
  eventCount: number;
  events: SnoringEvent[];
  recordingUri: string | null;
  // Sampled every 5 seconds for timeline chart
  timeline: Array<{ t: number; db: number }>;
}

// ─── CONSTANTS ───
export const SNORING_THRESHOLD_DB = -30;  // dBFS threshold for snoring detection
export const MIN_EVENT_DURATION_SEC = 2;  // minimum seconds to count as event
export const METERING_INTERVAL_MS = 500;  // how often to check metering
export const TIMELINE_SAMPLE_SEC = 5;     // sample timeline every N seconds

// ─── STORAGE ───
const STORAGE_KEY = 'sleepmind_snoring_sessions';

export async function saveSession(session: SnoringSession): Promise<void> {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  // Keep last 30 sessions max
  const trimmed = sessions.slice(-30);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export async function getSessions(): Promise<SnoringSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  const filtered = sessions.filter(s => s.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
