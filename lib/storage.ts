// SleepMind - Local Storage Wrapper
// AsyncStorage üzerinde tip güvenli CRUD işlemleri

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SleepRecord } from './sleep-score';

const KEYS = {
  SLEEP_RECORDS: 'sleepmind_sleep_records',
  QUIZ_ANSWERS: 'sleepmind_quiz_answers',
  ONBOARDING_COMPLETE: 'sleepmind_onboarding_complete',
  USER_PREFERENCES: 'sleepmind_user_preferences',
};

// ─── Sleep Records ───

export async function saveSleepRecord(record: SleepRecord): Promise<void> {
  try {
    const existing = await getSleepRecords();
    // Aynı tarihi güncelle veya yeni ekle
    const index = existing.findIndex(r => r.date === record.date);
    if (index >= 0) {
      existing[index] = record;
    } else {
      existing.push(record);
    }
    await AsyncStorage.setItem(KEYS.SLEEP_RECORDS, JSON.stringify(existing));
  } catch (error) {
    console.error('Error saving sleep record:', error);
  }
}

export async function getSleepRecords(): Promise<SleepRecord[]> {
  try {
    const data = await AsyncStorage.getItem(KEYS.SLEEP_RECORDS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading sleep records:', error);
    return [];
  }
}

export async function getRecentRecords(days: number = 7): Promise<SleepRecord[]> {
  const records = await getSleepRecords();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return records
    .filter(r => new Date(r.date) >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ─── Quiz Answers ───

export interface QuizAnswers {
  gender?: string;
  age?: string;
  goal?: string;
  issues?: string[];
  routine?: string;
  lifestyle?: string[];
}

export async function saveQuizAnswers(answers: QuizAnswers): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.QUIZ_ANSWERS, JSON.stringify(answers));
  } catch (error) {
    console.error('Error saving quiz answers:', error);
  }
}

export async function getQuizAnswers(): Promise<QuizAnswers | null> {
  try {
    const data = await AsyncStorage.getItem(KEYS.QUIZ_ANSWERS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading quiz answers:', error);
    return null;
  }
}

// ─── Onboarding ───

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}

export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
  return value === 'true';
}

// ─── User Preferences ───

export interface UserPreferences {
  prayerTimesEnabled: boolean;
  ramadanModeEnabled: boolean;
  shiftModeEnabled: boolean;
  notificationsEnabled: boolean;
  dailyTipEnabled: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  prayerTimesEnabled: false,
  ramadanModeEnabled: false,
  shiftModeEnabled: false,
  notificationsEnabled: true,
  dailyTipEnabled: true,
};

export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  try {
    const current = await getPreferences();
    const updated = { ...current, ...prefs };
    await AsyncStorage.setItem(KEYS.USER_PREFERENCES, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving preferences:', error);
  }
}

export async function getPreferences(): Promise<UserPreferences> {
  try {
    const data = await AsyncStorage.getItem(KEYS.USER_PREFERENCES);
    return data ? { ...DEFAULT_PREFERENCES, ...JSON.parse(data) } : DEFAULT_PREFERENCES;
  } catch (error) {
    console.error('Error reading preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

// ─── Utility ───

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch (error) {
    console.error('Error clearing data:', error);
  }
}
