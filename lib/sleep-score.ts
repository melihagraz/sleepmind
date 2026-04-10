// SleepMind - Uyku Skoru Hesaplama Algoritması
// Skor 0-100 arası, 4 parametre bazında hesaplanır

export interface SleepRecord {
  id: string;
  date: string; // ISO date string
  bedtime: string; // "23:30" format
  wakeTime: string; // "07:00" format
  subjective: number; // 1-5 (sabah nasıl hissediyorsunuz?)
}

export interface SleepScore {
  total: number;
  durationScore: number;
  consistencyScore: number;
  bedtimeScore: number;
  subjectiveScore: number;
  label: string;
  emoji: string;
}

// Saat string'ini dakikaya çevir (gece yarısından itibaren)
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  // Gece yarısından sonra (00:00-05:00) = ertesi gün olarak hesapla
  return h < 6 ? (h + 24) * 60 + m : h * 60 + m;
}

// Uyku süresini dakika olarak hesapla
function calculateDuration(bedtime: string, wakeTime: string): number {
  const bed = timeToMinutes(bedtime);
  const wake = timeToMinutes(wakeTime);
  let duration = wake - bed;
  if (duration < 0) duration += 24 * 60;
  return duration;
}

// 1. Süre Skoru (%35 ağırlık)
// 7-9 saat = 100, her saat sapma için -15
function durationScore(bedtime: string, wakeTime: string): number {
  const minutes = calculateDuration(bedtime, wakeTime);
  const hours = minutes / 60;

  if (hours >= 7 && hours <= 9) return 100;

  const deviation = hours < 7 ? 7 - hours : hours - 9;
  return Math.max(0, 100 - deviation * 15);
}

// 2. Tutarlılık Skoru (%25 ağırlık)
// Son 7 günün yatış saati standart sapması
function consistencyScore(records: SleepRecord[]): number {
  if (records.length < 2) return 70; // Yeterli veri yoksa ortalama ver

  const bedtimes = records.slice(-7).map(r => timeToMinutes(r.bedtime));
  const mean = bedtimes.reduce((a, b) => a + b, 0) / bedtimes.length;
  const variance = bedtimes.reduce((sum, bt) => sum + Math.pow(bt - mean, 2), 0) / bedtimes.length;
  const stdDev = Math.sqrt(variance); // dakika cinsinden

  // 0 dakika sapma = 100, her 15 dakika sapma için -10
  return Math.max(0, Math.min(100, 100 - (stdDev / 15) * 10));
}

// 3. Yatış Saati Skoru (%20 ağırlık)
// 22:00-23:30 = 100, her 30dk sapma için -10
function bedtimeScore(bedtime: string): number {
  const minutes = timeToMinutes(bedtime);
  const idealStart = 22 * 60; // 22:00
  const idealEnd = 23 * 60 + 30; // 23:30

  if (minutes >= idealStart && minutes <= idealEnd) return 100;

  const deviation = minutes < idealStart
    ? idealStart - minutes
    : minutes - idealEnd;

  return Math.max(0, 100 - (deviation / 30) * 10);
}

// 4. Subjektif Kalite Skoru (%20 ağırlık)
// 1-5 skalası -> 0-100
function subjectiveToScore(rating: number): number {
  return Math.min(100, Math.max(0, (rating / 5) * 100));
}

// Skor etiketi
function getScoreLabel(score: number): { label: string; emoji: string } {
  if (score >= 90) return { label: 'Mükemmel', emoji: '🤩' };
  if (score >= 80) return { label: 'Çok İyi', emoji: '😄' };
  if (score >= 70) return { label: 'İyi', emoji: '😊' };
  if (score >= 60) return { label: 'Ortalama', emoji: '😐' };
  if (score >= 50) return { label: 'Düşük', emoji: '😕' };
  return { label: 'Kötü', emoji: '😫' };
}

// Ana hesaplama fonksiyonu
export function calculateSleepScore(
  record: SleepRecord,
  history: SleepRecord[] = []
): SleepScore {
  const dur = durationScore(record.bedtime, record.wakeTime);
  const con = consistencyScore([...history, record]);
  const bed = bedtimeScore(record.bedtime);
  const sub = subjectiveToScore(record.subjective);

  const total = Math.round(
    dur * 0.35 +
    con * 0.25 +
    bed * 0.20 +
    sub * 0.20
  );

  const { label, emoji } = getScoreLabel(total);

  return {
    total,
    durationScore: Math.round(dur),
    consistencyScore: Math.round(con),
    bedtimeScore: Math.round(bed),
    subjectiveScore: Math.round(sub),
    label,
    emoji,
  };
}

// Uyku süresini okunabilir formatta döndür
export function formatDuration(bedtime: string, wakeTime: string): string {
  const minutes = calculateDuration(bedtime, wakeTime);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}s ${mins}dk`;
}
