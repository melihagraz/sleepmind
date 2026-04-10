import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Linking, Platform, Modal, TextInput, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPlayer, createAudioPlayer, AudioPlayer, AudioModule } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initPurchases, checkProStatus, purchaseProSubscription,
  restorePurchases, addSubscriptionListener, getCustomerInfoDebug,
} from './lib/purchases';
import { SnoringSession, saveSession as saveSnoringSession } from './lib/snoring';
import SnoringMonitor from './components/SnoringMonitor';
import SnoringSummary from './components/SnoringSummary';

// ─── STORAGE POLYFILL (AsyncStorage + in-memory cache) ───
// iOS/Android'de localStorage yok, bu yüzden AsyncStorage kullanıyoruz.
// In-memory cache sayesinde localStorage ile aynı sync API'yi taklit ediyoruz.
const memStorage: Record<string, string> = {};

const storage = {
  getItem: (key: string): string | null => {
    return memStorage[key] ?? null;
  },
  setItem: (key: string, value: string): void => {
    memStorage[key] = value;
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  removeItem: (key: string): void => {
    delete memStorage[key];
    AsyncStorage.removeItem(key).catch(() => {});
  },
};

const STORAGE_KEYS = [
  'sleepmind_records',
  'sleepmind_quiz',
  'sleepmind_dreams',
  'sleepmind_prayer',
  'sleepmind_selected_prayers',
  'sleepmind_onboarding_done',
];

async function hydrateStorage(): Promise<void> {
  try {
    await Promise.all(
      STORAGE_KEYS.map(async (key) => {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value !== null) memStorage[key] = value;
        } catch {}
      })
    );
  } catch (e) {
    console.log('Storage hydrate error:', e);
  }
}


const { width } = Dimensions.get('window');

// ─── SOUND FILES ───
const SOUND_FILES: Record<string, any> = {
  rain: require('./assets/sounds/rain.wav'),
  wave: require('./assets/sounds/wave.wav'),
  white: require('./assets/sounds/white.wav'),
  forest: require('./assets/sounds/forest.wav'),
  fire: require('./assets/sounds/fire.wav'),
  piano: require('./assets/sounds/piano.wav'),
  creek: require('./assets/sounds/creek.wav'),
  thunder: require('./assets/sounds/thunder.wav'),
};
const ALARM_SOUND = require('./assets/sounds/alarm.wav');

// ─── THEME ───
const C = {
  purple: '#7B68EE',
  gold: '#E8D5B7',
  goldDark: '#D4A574',
  bg: '#1a1332',
  bgDark: '#0d0b1a',
  text: '#F5F0FF',
  textSec: '#E8E0F0',
  textMuted: 'rgba(232,224,240,0.5)',
  textDim: 'rgba(232,224,240,0.4)',
  card: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.06)',
};

// ─── ONBOARDING SCREENS ───
const OB_SCREENS = [
  'welcome', 'social_proof',
  'quiz_name', 'quiz_gender', 'quiz_age', 'quiz_goal', 'quiz_issues', 'quiz_routine', 'quiz_lifestyle',
  'sleep_score', 'progress_graph',
  'free_features', 'pro_teaser',
  'loading', 'ready',
];

// ─── QUIZ DATA ───
const QUIZZES: Record<string, any> = {
  quiz_name: {
    title: 'Adınız nedir?',
    sub: 'Size isminizle hitap edelim',
    isTextInput: true,
  },

  quiz_gender: {
    title: 'Cinsiyetiniz nedir?',
    options: [
      { emoji: '👨', label: 'Erkek', value: 'male' },
      { emoji: '👩', label: 'Kadın', value: 'female' },
      { emoji: '🧑', label: 'Belirtmek istemiyorum', value: 'other' },
    ],
  },
  quiz_age: {
    title: 'Yaş aralığınız?',
    options: [
      { emoji: '🧒', label: '18-24', value: '18-24' },
      { emoji: '🧑', label: '25-34', value: '25-34' },
      { emoji: '👨', label: '35-44', value: '35-44' },
      { emoji: '🧔', label: '45-54', value: '45-54' },
      { emoji: '👴', label: '55+', value: '55+' },
    ],
  },
  quiz_goal: {
    title: 'Ana hedefiniz nedir?',
    sub: 'Sizin için en önemli olanı seçin',
    options: [
      { emoji: '😴', label: 'Daha hızlı uyumak', value: 'fall_asleep' },
      { emoji: '🌅', label: 'Dinlenmiş uyanmak', value: 'wake_fresh' },
      { emoji: '🔄', label: 'Düzenli uyku rutini', value: 'routine' },
      { emoji: '📉', label: 'Stresi azaltmak', value: 'stress' },
    ],
  },
  quiz_issues: {
    title: 'Hangi uyku sorunlarını yaşıyorsunuz?',
    sub: 'Birden fazla seçebilirsiniz',
    multi: true,
    options: [
      { emoji: '🔄', label: 'Uykuya dalmakta zorlanıyorum', value: 'falling' },
      { emoji: '⏰', label: 'Gece sık uyanıyorum', value: 'waking' },
      { emoji: '😫', label: 'Yorgun uyanıyorum', value: 'tired' },
      { emoji: '📱', label: 'Telefon/ekran bağımlılığı', value: 'screen' },
      { emoji: '🫁', label: 'Horlama', value: 'snoring' },
    ],
  },
  quiz_routine: {
    title: 'Genelde kaçta uyursunuz?',
    options: [
      { emoji: '🌆', label: '22:00 öncesi', value: 'before_22' },
      { emoji: '🌙', label: '22:00 - 00:00', value: '22_00' },
      { emoji: '🌃', label: '00:00 - 02:00', value: '00_02' },
      { emoji: '🌌', label: '02:00 sonrası', value: 'after_02' },
    ],
  },
  quiz_lifestyle: {
    title: 'Günlük rutininizi etkileyen faktörler?',
    sub: 'Birden fazla seçebilirsiniz',
    multi: true,
    options: [
      { emoji: '🏋️', label: 'Düzenli spor yapıyorum', value: 'exercise' },
      { emoji: '☕', label: 'Çok kafein tüketiyorum', value: 'caffeine' },
      { emoji: '🌙', label: 'Vardiyalı çalışıyorum', value: 'shift' },
      { emoji: '🕌', label: 'Namaz saatleri', value: 'prayer' },
      { emoji: '🍽️', label: 'Ramazan/oruç dönemi', value: 'ramadan' },
    ],
  },
};

const QUIZ_KEYS = ['quiz_name','quiz_gender','quiz_age','quiz_goal','quiz_issues','quiz_routine','quiz_lifestyle'];

// ─── TIPS ───
const TIPS = [
  'Yatmadan 1 saat önce mavi ışık filtresi kullanmak uyku kalitenizi %23 artırabilir.',
  'Yatak odanızın sıcaklığını 18-20°C arasında tutun.',
  'Kafein vücutta 6-8 saat kalır. Öğleden sonra 2\'den sonra kahve içmemeye çalışın.',
  'Her gün aynı saatte yatıp kalkmak biyolojik saatinizi düzenler.',
  '4-7-8 nefes tekniği: 4 sn nefes al, 7 sn tut, 8 sn ver.',
  'Düzenli egzersiz uyku kalitesini artırır, ama yatmadan 3 saat önce bitirin.',
  'Karanlık ortam melatonin üretimini artırır. Karartma perde kullanın.',
  'Sıcak bir duş almak vücut sıcaklığınızı düşürür ve uykuya geçişi kolaylaştırır.',
];

function getPersonalTip(quizData: any): string {
  const issues = quizData?.quiz_issues || [];
  const lifestyle = quizData?.quiz_lifestyle || [];
  
  const tipsByIssue: Record<string, string[]> = {
    falling: [
      '4-7-8 nefes tekniği uykuya dalmayı kolaylaştırır: 4 sn nefes al, 7 sn tut, 8 sn ver.',
      'Yatmadan 1 saat önce ekranları kapatın — mavi ışık melatonini baskılar.',
      'Yatakta 20 dakika uyuyamadıysanız kalkın, sakin bir aktivite yapın.',
      'Lavanta yağı rahatlatıcı etki yapar. Yastığınıza birkaç damla damlatın.',
    ],
    waking: [
      'Gece uyanırsanız telefona bakmayın — mavi ışık tekrar uykuya dalmayı zorlaştırır.',
      'Yatak odanızın sıcaklığını 18-20°C arasında tutun.',
      'Gürültülü ortamda uyuyorsanız white noise kullanmayı deneyin.',
      'Akşam yemeğini yatmadan en az 2-3 saat önce yiyin.',
    ],
    tired: [
      '7-9 saat uyku yetişkinler için idealdir. 6 saatten az uyku bağışıklığı zayıflatır.',
      'Sabah güneş ışığına 10 dakika maruz kalmak enerji verir.',
      'Snooze basmayın — parçalı uyku daha çok yorar.',
      'Magnezyum takviyesi uyku kalitesini artırabilir.',
    ],
    screen: [
      'Yatmadan 1 saat önce mavi ışık filtresi kullanmak uyku kalitenizi %23 artırabilir.',
      'Telefonu yatak odasının dışında şarj etmeyi deneyin.',
      'Gece modu (dark mode) göz yorgunluğunu azaltır ama mavi ışığı tam engellemez.',
      'Yatmadan önce kitap okumak ekran yerine harika bir alternatif.',
    ],
    snoring: [
      'Yan yatmak horlama riskini azaltır — sırt üstü yatmaktan kaçının.',
      'Uyku apnesi belirtileri varsa mutlaka doktora görünün.',
      'Kilo vermek horlama şiddetini önemli ölçüde azaltabilir.',
      'Yastık yüksekliğinizi ayarlamak hava yolunu açabilir.',
    ],
  };

  const caffeine = [
    'Kafein vücutta 6-8 saat kalır. Öğleden sonra 2\'den sonra kahve içmemeye çalışın.',
    'Yeşil çay kahveden daha az kafein içerir ama yine de akşam tüketmeyin.',
  ];
  
  const exercise = [
    'Düzenli egzersiz uyku kalitesini artırır, ama yatmadan 3 saat önce bitirin.',
    'Akşam hafif yürüyüş sindirime yardımcı olur ve uykuya geçişi kolaylaştırır.',
  ];

  // Kişiye özel havuzdan seç
  let personalTips: string[] = [];
  
  issues.forEach((issue: string) => {
    if (tipsByIssue[issue]) personalTips.push(...tipsByIssue[issue]);
  });
  
  if (lifestyle.includes('caffeine')) personalTips.push(...caffeine);
  if (lifestyle.includes('exercise')) personalTips.push(...exercise);
  
  // Eğer kişisel tip yoksa genel havuzdan
  if (personalTips.length === 0) personalTips = TIPS;
  
  // Günün tarihine göre döngüsel seç
  return personalTips[new Date().getDate() % personalTips.length];
}

// ─── SHARED COMPONENTS ───

function Stars() {
  return (
    <>
      {Array.from({ length: 25 }).map((_, i) => (
        <View key={i} style={[styles.star, {
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 50}%`,
          width: Math.random() * 3 + 1,
          height: Math.random() * 3 + 1,
          opacity: Math.random() * 0.4 + 0.1,
        }]} />
      ))}
    </>
  );
}

function Btn({ title, onPress, variant = 'primary', disabled = false }: any) {
  return (
    <TouchableOpacity
      style={[styles.btn, variant === 'gold' && styles.btnGold, variant === 'outline' && styles.btnOutline, disabled && styles.btnDisabled]}
      onPress={onPress} disabled={disabled} activeOpacity={0.8}
    >
      <Text style={[styles.btnText, variant === 'gold' && { color: '#1a1332' }, variant === 'outline' && { color: C.purple }, disabled && { color: 'rgba(255,255,255,0.4)' }]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Option({ emoji, label, selected, onPress, compact }: any) {
  return (
    <TouchableOpacity style={[styles.option, compact && styles.optionCompact, selected && styles.optionSelected]} onPress={onPress} activeOpacity={0.7}>
      <Text style={{ fontSize: compact ? 20 : 26 }}>{emoji}</Text>
      <Text style={[styles.optionLabel, selected && { fontWeight: '600' }]}>{label}</Text>
      {selected && <Text style={{ color: C.purple, fontSize: 18, marginLeft: 'auto' as any }}>✓</Text>}
    </TouchableOpacity>
  );
}

function ProgressBarComp({ current, total }: any) {
  return (
    <View style={styles.progressBg}>
      <View style={[styles.progressFill, { width: `${(current / total) * 100}%` }]} />
    </View>
  );
}

// ═══════════════════════════════════════
// ONBOARDING SCREENS
// ═══════════════════════════════════════

function WelcomeScreen({ onNext }: any) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 64, marginBottom: 16 }}>🌙</Text>
      <Text style={styles.title}>SleepMind</Text>
      <Text style={styles.tagline}>Zihniniz Dinlensin</Text>
      <Text style={styles.heading}>Daha İyi Uyku &{'\n'}Enerjik Sabahlar</Text>
      <Text style={styles.muted}>Kullanıcıların %91'i daha sakin uyuduğunu bildiriyor</Text>
      <View style={styles.btnWrap}><Btn title="Başlayalım" onPress={onNext} /></View>
    </View>
  );
}

function SocialProofScreen({ onNext }: any) {
  return (
    <View style={styles.center}>
      <View style={{ flexDirection: 'row', marginBottom: 24 }}>
        {['😴','💤','🌙','⭐','✨'].map((e, i) => (
          <View key={i} style={[styles.proofCircle, { marginLeft: i > 0 ? -8 : 0 }]}>
            <Text style={{ fontSize: 20 }}>{e}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.bigNumber}>500K+</Text>
      <Text style={[styles.muted, { fontSize: 16, marginBottom: 24 }]}>kişi SleepMind'ı tercih etti</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {[1,2,3,4].map(i => <Text key={i} style={{ fontSize: 22, color: C.gold }}>★</Text>)}
        <Text style={{ fontSize: 22, color: 'rgba(232,213,183,0.3)' }}>★</Text>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 18, marginLeft: 4 }}>4.7</Text>
      </View>
      <Text style={[styles.muted, { marginBottom: 24 }]}>App Store & Google Play</Text>
      <View style={styles.testimonial}>
        <Text style={styles.testimonialText}>"Uyku kalitem gözle görülür şekilde arttı. Basit ama çok etkili!"</Text>
        <Text style={styles.testimonialAuthor}>— Elif K., İstanbul</Text>
      </View>
      <View style={styles.btnWrap}><Btn title="Devam Et" onPress={onNext} /></View>
    </View>
  );
}

function QuizScreen({ screen, answers, multiAnswers, onSelect, onMultiSelect, onNext }: any) {
  const quiz = QUIZZES[screen];
  if (!quiz) return null;
  
  const isMulti = quiz.multi;
  const isText = quiz.isTextInput;
  const selected = isMulti ? (multiAnswers[screen] || []) : answers[screen];
  const qIdx = QUIZ_KEYS.indexOf(screen) + 1;
  
  let canProceed = false;
  if (isText) canProceed = (answers[screen] || '').trim().length > 0;
  else if (isMulti) canProceed = multiAnswers[screen]?.length > 0;
  else canProceed = answers[screen] != null;

  return (
    <View style={styles.quizContainer}>
      <ProgressBarComp current={qIdx} total={QUIZ_KEYS.length} />
      <Text style={styles.quizTitle}>{quiz.title}</Text>
      {quiz.sub && <Text style={[styles.muted, { marginBottom: 16, textAlign: 'left' }]}>{quiz.sub}</Text>}
      
      {isText ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TextInput
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1.5, borderColor: 'rgba(123,104,238,0.3)',
              borderRadius: 16, padding: 18, color: C.text,
              fontSize: 20, textAlign: 'center', fontWeight: '600',
            }}
            placeholder="İsminiz"
            placeholderTextColor={C.textDim}
            value={answers[screen] || ''}
            onChangeText={(text: string) => onSelect(screen, text)}
            autoFocus
          />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            {quiz.options?.map((opt: any) => (
              <Option key={opt.value} emoji={opt.emoji} label={opt.label} compact={quiz.options.length > 4}
                selected={isMulti ? selected.includes(opt.value) : selected === opt.value}
                onPress={() => isMulti ? onMultiSelect(screen, opt.value) : onSelect(screen, opt.value)} />
            ))}
          </View>
        </ScrollView>
      )}
      
      <View style={{ paddingTop: 16 }}><Btn title="Devam Et" onPress={onNext} disabled={!canProceed} /></View>
    </View>
  );
}

function SleepScoreScreen({ onNext }: any) {
  const [score, setScore] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setScore(s => { if (s >= 72) { clearInterval(t); return 72; } return s + 1; }), 25);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={styles.center}>
      <Text style={[styles.tagline, { marginBottom: 24 }]}>TAHMİNİ UYKU SKORUNUZ</Text>
      <View style={styles.scoreCircle}>
        <Text style={styles.scoreNumber}>{score}</Text>
        <Text style={styles.muted}>/ 100</Text>
      </View>
      <Text style={{ color: C.gold, fontSize: 16, fontWeight: '600', marginTop: 20 }}>Ortalama — İyileştirme Potansiyeli Yüksek</Text>
      <Text style={[styles.muted, { marginTop: 8, lineHeight: 22 }]}>
        Kişisel planınızla skorunuzu{'\n'}<Text style={{ color: C.purple, fontWeight: '700' }}>4 haftada 85+'e</Text> çıkarabiliriz
      </Text>
      <View style={styles.btnWrap}><Btn title="Planımı Göster" onPress={onNext} /></View>
    </View>
  );
}

function ProgressGraphScreen({ onNext }: any) {
  const weeks = [
    { week: 'Şimdi', score: 72, emoji: '😐' }, { week: '1. Hafta', score: 76, emoji: '🙂' },
    { week: '2. Hafta', score: 80, emoji: '😊' }, { week: '3. Hafta', score: 84, emoji: '😄' },
    { week: '4. Hafta', score: 89, emoji: '🤩' },
  ];
  return (
    <View style={styles.center}>
      <Text style={styles.quizTitle}>Uyku Kalite Yolculuğunuz</Text>
      <Text style={[styles.muted, { marginBottom: 32 }]}>Kişiselleştirilmiş planınıza göre beklenen gelişim</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, width: '100%', marginBottom: 40 }}>
        {weeks.map((w, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 20 }}>{w.emoji}</Text>
            <View style={{ width: '100%', height: (w.score - 60) * 3.5, borderRadius: 8, backgroundColor: i === 4 ? C.gold : `rgba(123,104,238,${0.2 + i * 0.12})`, alignItems: 'center', paddingTop: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: i === 4 ? '#1a1332' : C.textSec }}>{w.score}</Text>
            </View>
            <Text style={{ fontSize: 10, color: C.textDim }}>{w.week}</Text>
          </View>
        ))}
      </View>
      <Btn title="Devam Et" onPress={onNext} />
    </View>
  );
}

function FreeFeaturesScreen({ onNext }: any) {
  const features = [
    { icon: '⏰', title: 'Akıllı Alarm', desc: 'Hafif uyku fazında uyandırır' },
    { icon: '📊', title: 'Günlük Uyku Skoru', desc: 'Her sabah uyku kalitenizi görün' },
    { icon: '🎵', title: '3 Uyku Sesi', desc: 'Yağmur, dalga, white noise' },
    { icon: '💡', title: 'Uyku İpuçları', desc: 'Bilimsel temelli günlük öneriler' },
    { icon: '📅', title: 'Haftalık Özet', desc: 'Uyku trendlerinizi takip edin' },
  ];
  return (
    <View style={styles.quizContainer}>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 32 }}>🎁</Text>
        <Text style={[styles.quizTitle, { marginTop: 8 }]}>Ücretsiz Başlayın</Text>
        <Text style={styles.muted}>Bunların hepsi ücretsiz — hemen başlayın</Text>
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8 }}>
          {features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}><Text style={{ fontSize: 20 }}>{f.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>{f.title}</Text>
                <Text style={{ color: C.textDim, fontSize: 12 }}>{f.desc}</Text>
              </View>
              <Text style={{ color: 'rgba(123,104,238,0.6)', fontSize: 14 }}>✓</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ paddingTop: 12 }}><Btn title="Harika, Devam Et" onPress={onNext} /></View>
    </View>
  );
}

function ProTeaserScreen({ onNext, onPurchase, onRestore }: any) {
  const proFeatures = [
    { icon: '🧠', title: 'AI Rüya Analizi' }, { icon: '🎵', title: '50+ Ses & Karışım' },
    { icon: '🌙', title: 'Ramazan & Vardiya' }, { icon: '🕌', title: 'Namaz Alarmı' },
    { icon: '🤖', title: 'AI Uyku Koçu' }, { icon: '📈', title: 'Detaylı Trend' },
  ];

  const handleRestore = async () => {
    if (onRestore) {
      await onRestore();
    }
  };

  const handlePurchase = async () => {
    if (onPurchase) {
      await onPurchase();
    }
    onNext();
  };

  const openTerms = () => Linking.openURL('https://melihagraz.github.io/sleepmind/terms.html');
  const openPrivacy = () => Linking.openURL('https://melihagraz.github.io/sleepmind/privacy.html');

  return (
    <View style={styles.quizContainer}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 28 }}>👑</Text>
          <Text style={{ color: C.gold, fontSize: 20, fontWeight: '700', marginTop: 8 }}>Daha fazlasını mı istiyorsunuz?</Text>
          <Text style={[styles.muted, { fontSize: 13 }]}>PRO ile tüm potansiyelinizi açığa çıkarın</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {proFeatures.map((f, i) => (
            <View key={i} style={styles.proChip}>
              <Text style={{ fontSize: 16 }}>{f.icon}</Text>
              <Text style={{ color: C.textSec, fontSize: 12, fontWeight: '500' }}>{f.title}</Text>
            </View>
          ))}
        </View>
        <View style={styles.proPrice}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>
            <Text style={{ color: C.gold, fontWeight: '700' }}>3 gün ücretsiz deneyin</Text> · sonra sadece ₺79,99/ay
          </Text>
          <Text style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>İstediğiniz zaman iptal edin</Text>
        </View>
        {/* Abonelik yasal bilgilendirme metni */}
        <Text style={{ color: C.textDim, fontSize: 10, textAlign: 'center', marginTop: 12, lineHeight: 15, paddingHorizontal: 8 }}>
          Abonelik 3 günlük ücretsiz deneme süresi sonunda otomatik olarak aylık ₺79,99 ücretle yenilenir.
          Deneme süresi dolmadan en az 24 saat önce iptal etmezseniz ücretlendirilirsiniz.
          Abonelik, satın alma onayı ile Apple ID hesabınızdan tahsil edilir ve mevcut dönem sona ermeden
          en az 24 saat önce iptal edilmediği sürece otomatik olarak yenilenir.
          Aboneliğinizi satın aldıktan sonra Apple ID Ayarları &gt; Abonelikler bölümünden yönetebilir ve iptal edebilirsiniz.
        </Text>
      </ScrollView>
      <View style={{ gap: 10, paddingTop: 12 }}>
        <Btn title="PRO'yu Ücretsiz Dene" variant="gold" onPress={handlePurchase} />
        <TouchableOpacity onPress={onNext} style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Ücretsiz Devam Et</Text>
        </TouchableOpacity>
        {/* Yasal bağlantılar ve Geri Yükleme */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
          <TouchableOpacity onPress={openTerms}><Text style={styles.legalLink}>Kullanım Koşulları</Text></TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity onPress={openPrivacy}><Text style={styles.legalLink}>Gizlilik Politikası</Text></TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity onPress={handleRestore}><Text style={styles.legalLink}>Satın Almaları Geri Yükle</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function LoadingScreen({ onNext }: any) {
  const [progress, setProgress] = useState(0);
  const steps = ['Uyku profiliniz oluşturuluyor...', 'Kişisel planınız hazırlanıyor...', 'Sesler ve alarm ayarlanıyor...', 'Her şey hazır!'];
  const step = progress < 30 ? 0 : progress < 60 ? 1 : progress < 90 ? 2 : 3;
  useEffect(() => {
    const t = setInterval(() => { setProgress(p => { if (p >= 100) { clearInterval(t); setTimeout(onNext, 600); return 100; } return p + 1; }); }, 30);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 48 }}>🌙</Text>
      <View style={[styles.progressBg, { marginTop: 40, marginBottom: 20, height: 6 }]}>
        <View style={[styles.progressFill, { width: `${progress}%`, height: 6 }]} />
      </View>
      <Text style={{ color: C.textSec, fontSize: 15, fontWeight: '500' }}>{steps[step]}</Text>
      <Text style={[styles.muted, { marginTop: 8 }]}>{progress}%</Text>
    </View>
  );
}

function ReadyScreen({ onNext }: any) {
  return (
    <View style={styles.center}>
      <View style={styles.readyCircle}><Text style={{ fontSize: 40 }}>🌙</Text></View>
      <Text style={[styles.title, { fontSize: 28 }]}>Hazırsınız!</Text>
      <Text style={[styles.muted, { lineHeight: 22, marginBottom: 12 }]}>Uyku planınız hazırlandı.{'\n'}Bu gece daha iyi uyumanın ilk adımı.</Text>
      <View style={{ flexDirection: 'row', gap: 24, marginVertical: 24 }}>
        {[{ n: '3', l: 'Ücretsiz Ses' }, { n: '∞', l: 'Uyku Takibi' }, { n: '7/24', l: 'Akıllı Alarm' }].map((s, i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.purple }}>{s.n}</Text>
            <Text style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{s.l}</Text>
          </View>
        ))}
      </View>
      <Btn title="Uygulamaya Başla" onPress={onNext} />
    </View>
  );
}

// ═══════════════════════════════════════
// TAB SCREENS (Ana Uygulama)
// ═══════════════════════════════════════

function HomeTab({ onTabChange, sleepRecords, setSleepRecords, quizData, isPro, onPurchase, onRefreshPro, onRestore }: any) {

  
  const todayTip = getPersonalTip(quizData);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMin, setAlarmMin] = useState(0);
  const [alarmSet, setAlarmSet] = useState(false);
  const [alarmTime, setAlarmTime] = useState('');
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [alarmPlayer, setAlarmPlayer] = useState<AudioPlayer | null>(null);
  const [alarmTimer, setAlarmTimer] = useState<any>(null);
  const [bedHour, setBedHour] = useState(23);
  const [bedMin, setBedMin] = useState(0);
  const [wakeHour, setWakeHour] = useState(7);
  const [wakeMin, setWakeMin] = useState(0);
  const [feeling, setFeeling] = useState(3);
  const lastScore = sleepRecords.length > 0 ? sleepRecords[sleepRecords.length - 1] : null;
  const [showResult, setShowResult] = useState(false);
  const [showDreamModal, setShowDreamModal] = useState(false);
  const [dreamText, setDreamText] = useState('');
  const [dreamAnalysis, setDreamAnalysis] = useState('');
  const [dreamLoading, setDreamLoading] = useState(false);
  const [dreamHistory, setDreamHistory] = useState<any[]>(() => {
    try { const saved = storage.getItem('sleepmind_dreams'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [snoringActive, setSnoringActive] = useState(false);
  const [snoringSession, setSnoringSession] = useState<SnoringSession | null>(null);
  const [showSnoringSummary, setShowSnoringSummary] = useState(false);

  // Skor hesaplama
  const calcScore = () => {
    const bedMinutes = bedHour < 6 ? (bedHour + 24) * 60 + bedMin : bedHour * 60 + bedMin;
    const wakeMinutes = wakeHour < 6 ? (wakeHour + 24) * 60 + wakeMin : wakeHour * 60 + wakeMin;
    let duration = wakeMinutes - bedMinutes;
    if (duration < 0) duration += 24 * 60;
    const hours = duration / 60;

    // Süre skoru (%35)
    let durScore = 100;
    if (hours < 7) durScore = Math.max(0, 100 - (7 - hours) * 15);
    else if (hours > 9) durScore = Math.max(0, 100 - (hours - 9) * 15);

    // Yatış saati skoru (%20)
    const idealStart = 22 * 60;
    const idealEnd = 23 * 60 + 30;
    let bedScore = 100;
    if (bedMinutes < idealStart) bedScore = Math.max(0, 100 - ((idealStart - bedMinutes) / 30) * 10);
    else if (bedMinutes > idealEnd) bedScore = Math.max(0, 100 - ((bedMinutes - idealEnd) / 30) * 10);

    // Subjektif (%20)
    const subScore = (feeling / 5) * 100;

    // Tutarlılık (%25) - ilk kayıtta sabit
    const conScore = sleepRecords.length > 1 ? 70 : 75;

    const total = Math.round(durScore * 0.35 + conScore * 0.25 + bedScore * 0.20 + subScore * 0.20);

    const durationStr = `${Math.floor(hours)}s ${Math.round((hours % 1) * 60)}dk`;

    let label = 'Kötü'; let emoji = '😫';
    if (total >= 90) { label = 'Mükemmel'; emoji = '🤩'; }
    else if (total >= 80) { label = 'Çok İyi'; emoji = '😄'; }
    else if (total >= 70) { label = 'İyi'; emoji = '😊'; }
    else if (total >= 60) { label = 'Ortalama'; emoji = '😐'; }
    else if (total >= 50) { label = 'Düşük'; emoji = '😕'; }

    const record = {
      date: new Date().toISOString().split('T')[0],
      bedtime: `${bedHour.toString().padStart(2,'0')}:${bedMin.toString().padStart(2,'0')}`,
      wakeTime: `${wakeHour.toString().padStart(2,'0')}:${wakeMin.toString().padStart(2,'0')}`,
      score: total, label, emoji, duration: durationStr, feeling,
      breakdown: { durScore: Math.round(durScore), conScore: Math.round(conScore), bedScore: Math.round(bedScore), subScore: Math.round(subScore) },
    };

    setSleepRecords((prev: any) => [...prev, record]);
    setShowResult(true);
  };

  // Alarm fonksiyonları
  const setAlarm = () => {
    const now = new Date();
    const alarm = new Date();
    alarm.setHours(alarmHour, alarmMin, 0, 0);
    if (alarm <= now) alarm.setDate(alarm.getDate() + 1);

    const diff = alarm.getTime() - now.getTime();
    const timeStr = `${alarmHour.toString().padStart(2,'0')}:${alarmMin.toString().padStart(2,'0')}`;

    const timer = setTimeout(() => {
      triggerAlarm();
    }, diff);

    setAlarmTimer(timer);
    setAlarmTime(timeStr);
    setAlarmSet(true);
    setShowAlarmModal(false);
  };

  const triggerAlarm = async () => {
    setAlarmRinging(true);
    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
      const ap = createAudioPlayer(ALARM_SOUND);
      ap.loop = true;
      ap.volume = 1.0;
      ap.play();
      setAlarmPlayer(ap);
    } catch (e) {
      console.log('Alarm ses hatası:', e);
    }
  };

  const dismissAlarm = () => {
    setAlarmRinging(false);
    setAlarmSet(false);
    setAlarmTime('');
    if (alarmPlayer) {
      try { alarmPlayer.pause(); alarmPlayer.remove(); } catch {}
      setAlarmPlayer(null);
    }
    if (alarmTimer) { clearTimeout(alarmTimer); setAlarmTimer(null); }
  };

  const cancelAlarm = () => {
    if (alarmTimer) { clearTimeout(alarmTimer); setAlarmTimer(null); }
    setAlarmSet(false);
    setAlarmTime('');
  };

  // Rüya Analizi
  const analyzeDream = async () => {
    if (!dreamText.trim()) return;

    // PRO kontrolü — ödeme yapmadan API çağrısı engellenir
    if (!isPro) {
      Alert.alert(
        'PRO Özellik',
        'AI Rüya Analizi PRO abonelere özeldir. PRO\'ya geçmek ister misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'PRO\'yu Başlat', onPress: onPurchase },
        ]
      );
      return;
    }

    setDreamLoading(true);
    setDreamAnalysis('');

    try {
      const response = await fetch('https://svoxahckedjxnrfrwefb.supabase.co/functions/v1/dream-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dream: dreamText }),
      });

      const data = await response.json();
      const analysis = data.analysis || 'Analiz yapılamadı. Lütfen tekrar deneyin.';
      setDreamAnalysis(analysis);

      // Geçmişe kaydet
      const newDream = {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        dream: dreamText.slice(0, 100) + (dreamText.length > 100 ? '...' : ''),
        analysis,
      };
      const updated = [newDream, ...dreamHistory].slice(0, 20);
      setDreamHistory(updated);
      try { storage.setItem('sleepmind_dreams', JSON.stringify(updated)); } catch {}
    } catch (error) {
      setDreamAnalysis('Bağlantı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    }

    setDreamLoading(false);
  };

  // Saat seçici
  const TimeSelector = ({ label, hour, min, onHourChange, onMinChange, icon }: any) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 8, textAlign: 'center' }}>{icon} {label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <TouchableOpacity onPress={() => onHourChange((hour - 1 + 24) % 24)} style={modalStyles.arrowBtn}>
          <Text style={modalStyles.arrow}>▲</Text>
        </TouchableOpacity>
        <Text style={modalStyles.timeText}>{hour.toString().padStart(2, '0')}</Text>
        <TouchableOpacity onPress={() => onHourChange((hour + 1) % 24)} style={modalStyles.arrowBtn}>
          <Text style={modalStyles.arrow}>▼</Text>
        </TouchableOpacity>

        <Text style={modalStyles.colon}>:</Text>

        <TouchableOpacity onPress={() => onMinChange((min - 15 + 60) % 60)} style={modalStyles.arrowBtn}>
          <Text style={modalStyles.arrow}>▲</Text>
        </TouchableOpacity>
        <Text style={modalStyles.timeText}>{min.toString().padStart(2, '0')}</Text>
        <TouchableOpacity onPress={() => onMinChange((min + 15) % 60)} style={modalStyles.arrowBtn}>
          <Text style={modalStyles.arrow}>▼</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Son 7 günün chart verileri
  const weekData = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map((day, i) => {
    const record = sleepRecords[sleepRecords.length - 7 + i];
    return { day, score: record?.score || 0, hasData: !!record };
  });

  return (
    <>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        {/* Header */}


        <View style={{ paddingTop: 8, paddingBottom: 12 }}>
          <Text style={{ color: C.textDim, fontSize: 13 }}>
            {new Date().getHours() < 6 ? 'İyi geceler' : new Date().getHours() < 12 ? 'Günaydın' : new Date().getHours() < 18 ? 'İyi günler' : 'İyi akşamlar'}
            {quizData?.quiz_name ? `, ${quizData.quiz_name}` : ''} 👋
          </Text>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>SleepMind</Text>
        </View>

        {/* Alarm Ringing Overlay */}
        {alarmRinging && (
          <View style={{
            backgroundColor: 'rgba(123,104,238,0.15)', borderWidth: 2, borderColor: C.purple,
            borderRadius: 20, padding: 24, marginBottom: 16, alignItems: 'center',
          }}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>⏰</Text>
            <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 4 }}>Alarm!</Text>
            <Text style={{ color: C.gold, fontSize: 18, fontWeight: '600', marginBottom: 16 }}>{alarmTime}</Text>
            <Text style={{ color: C.textMuted, fontSize: 14, marginBottom: 20 }}>Günaydın! Harika bir güne hazır mısınız?</Text>
            <Btn title="Alarmı Kapat" onPress={dismissAlarm} />
          </View>
        )}

        {/* Active Alarm Badge */}
        {alarmSet && !alarmRinging && (
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: 'rgba(123,104,238,0.1)', borderRadius: 12,
              padding: 10, paddingHorizontal: 14, marginBottom: 12,
              borderWidth: 1, borderColor: 'rgba(123,104,238,0.2)',
            }}
            onPress={cancelAlarm}
          >
            <Text style={{ fontSize: 16 }}>⏰</Text>
            <Text style={{ color: C.purple, fontSize: 13, fontWeight: '600' }}>Alarm: {alarmTime}</Text>
            <Text style={{ color: C.textDim, fontSize: 11, marginLeft: 'auto' as any }}>İptal et ✕</Text>
          </TouchableOpacity>
        )}

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <View>
            <Text style={{ color: C.textMuted, fontSize: 11 }}>Bugünkü Uyku Skorunuz</Text>
            {lastScore ? (
              <>
                <Text style={{ color: C.text, fontSize: 42, fontWeight: '800' }}>{lastScore.score}</Text>
                <Text style={{ color: C.gold, fontSize: 12 }}>{lastScore.label} {lastScore.emoji}</Text>
              </>
            ) : (
              <>
                <Text style={{ color: C.text, fontSize: 42, fontWeight: '800' }}>--</Text>
                <Text style={{ color: C.textDim, fontSize: 12 }}>Henüz kayıt yok</Text>
              </>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {lastScore ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: C.textDim, fontSize: 11 }}>Uyku Süresi</Text>
                <Text style={{ color: C.textSec, fontSize: 17, fontWeight: '700' }}>{lastScore.duration}</Text>
                <Text style={{ color: C.textDim, fontSize: 11, marginTop: 6 }}>Uyuma Saati</Text>
                <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>{lastScore.bedtime}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.addSleepBtn} onPress={() => { setShowResult(false); setShowSleepModal(true); }}>
              <Text style={{ fontSize: 20 }}>🛏️</Text>
              <Text style={{ color: C.purple, fontSize: 12, fontWeight: '600' }}>Uyku Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[
            { icon: '⏰', label: alarmSet ? alarmTime : 'Alarm Kur', pro: false, action: () => alarmSet ? cancelAlarm() : setShowAlarmModal(true) },
            { icon: '🎵', label: 'Sesler', pro: false, action: () => onTabChange('sounds') },
            { icon: '🧠', label: 'Rüya AI', pro: true, action: () => {
              if (!isPro) {
                Alert.alert('PRO Özellik', 'AI Rüya Analizi PRO abonelere özeldir.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'PRO\'yu Başlat', onPress: onPurchase },
                ]);
                return;
              }
              setDreamText(''); setDreamAnalysis(''); setShowDreamModal(true);
            } },
            { icon: '🫁', label: 'Horlama', pro: true, action: async () => {
              // PRO state stale olabilir (TestFlight/sandbox sync gecikmesi).
              // Önce force-refresh dene, hâlâ değilse gate göster.
              let pro = isPro;
              if (!pro && onRefreshPro) {
                pro = await onRefreshPro();
              }
              if (!pro) {
                Alert.alert('PRO Özellik', 'Horlama Takibi PRO abonelere özeldir.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Geri Yükle', onPress: onRestore },
                  { text: 'PRO\'yu Başlat', onPress: onPurchase },
                ]);
                return;
              }
              setSnoringActive(true);
            } },
          ].map((a, i) => (
            <TouchableOpacity key={i} style={styles.quickAction} onPress={a.action}>
              <Text style={{ fontSize: 24 }}>{a.icon}</Text>
              <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 4 }}>{a.label}</Text>
              {a.pro && <View style={styles.proBadge}><Text style={styles.proBadgeText}>PRO</Text></View>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Score Breakdown (if score exists) */}
        {lastScore && (
          <View style={styles.card}>
            <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600', marginBottom: 10 }}>📊 Skor Detayı</Text>
            {[
              { label: 'Uyku Süresi', score: lastScore.breakdown.durScore, weight: '35%' },
              { label: 'Tutarlılık', score: lastScore.breakdown.conScore, weight: '25%' },
              { label: 'Yatış Saati', score: lastScore.breakdown.bedScore, weight: '20%' },
              { label: 'Hissiyat', score: lastScore.breakdown.subScore, weight: '20%' },
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <Text style={{ color: C.textDim, fontSize: 12, width: 80 }}>{item.label}</Text>
                <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(123,104,238,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${item.score}%`, height: '100%', backgroundColor: item.score >= 80 ? '#4CAF50' : item.score >= 60 ? C.purple : '#FF9800', borderRadius: 3 }} />
                </View>
                <Text style={{ color: C.textMuted, fontSize: 11, width: 30, textAlign: 'right' }}>{item.score}</Text>
                <Text style={{ color: C.textDim, fontSize: 10, width: 28 }}>{item.weight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Daily Tip */}
        <View style={styles.card}>
          <Text style={{ color: 'rgba(232,213,183,0.6)', fontSize: 11, marginBottom: 4 }}>💡 Günün İpucu</Text>
          <Text style={{ color: 'rgba(232,224,240,0.7)', fontSize: 13, lineHeight: 20 }}>{todayTip}</Text>
        </View>

        {/* Weekly Chart */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600' }}>Haftalık Trend</Text>
            <Text style={{ color: C.textDim, fontSize: 11 }}>Son kayıtlar</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 }}>
            {weekData.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <View style={{
                  width: '100%',
                  height: d.hasData ? Math.max(8, ((d.score - 40) / 60) * 50) : 8,
                  borderRadius: 4,
                  backgroundColor: d.hasData ? (i === weekData.filter(x => x.hasData).length - 1 ? C.purple : 'rgba(123,104,238,0.3)') : 'rgba(123,104,238,0.08)',
                }} />
                <Text style={{ fontSize: 9, color: C.textDim }}>{d.day}</Text>
              </View>
            ))}
          </View>
          {sleepRecords.length === 0 && (
            <Text style={{ color: C.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 }}>Uyku kaydı ekledikçe grafiğiniz oluşacak</Text>
          )}
        </View>

        {/* PRO Banner */}
        {!isPro && (
          <TouchableOpacity style={styles.proBanner} onPress={onPurchase}>
            <Text style={{ fontSize: 22 }}>👑</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>PRO'ya Geç</Text>
              <Text style={{ color: C.textDim, fontSize: 11 }}>AI Rüya Analizi, 50+ ses ve daha fazlası</Text>
            </View>
            <Text style={{ color: 'rgba(232,213,183,0.5)', fontSize: 14 }}>→</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ─── SLEEP RECORD MODAL ─── */}
      <Modal visible={showSleepModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            {!showResult ? (
              <>
                {/* Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>🛏️ Uyku Kaydet</Text>
                  <TouchableOpacity onPress={() => setShowSleepModal(false)}>
                    <Text style={{ color: C.textDim, fontSize: 24 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Time Selectors */}
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                  <TimeSelector label="Yattım" icon="🌙" hour={bedHour} min={bedMin} onHourChange={setBedHour} onMinChange={setBedMin} />
                  <TimeSelector label="Kalktım" icon="☀️" hour={wakeHour} min={wakeMin} onHourChange={setWakeHour} onMinChange={setWakeMin} />
                </View>

                {/* Feeling */}
                <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 10, textAlign: 'center' }}>Nasıl hissediyorsunuz?</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
                  {[
                    { val: 1, emoji: '😫', label: 'Berbat' },
                    { val: 2, emoji: '😕', label: 'Kötü' },
                    { val: 3, emoji: '😐', label: 'Normal' },
                    { val: 4, emoji: '😊', label: 'İyi' },
                    { val: 5, emoji: '🤩', label: 'Harika' },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.val}
                      onPress={() => setFeeling(f.val)}
                      style={{
                        alignItems: 'center', padding: 8, borderRadius: 12, width: 56,
                        backgroundColor: feeling === f.val ? 'rgba(123,104,238,0.2)' : 'transparent',
                        borderWidth: feeling === f.val ? 1.5 : 0,
                        borderColor: 'rgba(123,104,238,0.5)',
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>{f.emoji}</Text>
                      <Text style={{ color: C.textDim, fontSize: 9, marginTop: 2 }}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Save Button */}
                <Btn title="Skoru Hesapla" onPress={calcScore} />
              </>
            ) : (
              <>
                {/* Result Screen */}
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 48, marginBottom: 8 }}>{lastScore?.emoji}</Text>
                  <Text style={{ color: C.text, fontSize: 48, fontWeight: '800' }}>{lastScore?.score}</Text>
                  <Text style={{ color: C.gold, fontSize: 18, fontWeight: '600', marginTop: 4 }}>{lastScore?.label}</Text>
                  <Text style={{ color: C.textDim, fontSize: 14, marginTop: 8 }}>
                    {lastScore?.bedtime} → {lastScore?.wakeTime} • {lastScore?.duration}
                  </Text>

                  {/* Breakdown */}
                  <View style={{ width: '100%', marginTop: 20, gap: 8 }}>
                    {[
                      { label: 'Uyku Süresi', score: lastScore?.breakdown.durScore, icon: '⏱️' },
                      { label: 'Tutarlılık', score: lastScore?.breakdown.conScore, icon: '🔄' },
                      { label: 'Yatış Saati', score: lastScore?.breakdown.bedScore, icon: '🌙' },
                      { label: 'Hissiyat', score: lastScore?.breakdown.subScore, icon: '💭' },
                    ].map((item, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14 }}>{item.icon}</Text>
                        <Text style={{ color: C.textMuted, fontSize: 12, width: 75 }}>{item.label}</Text>
                        <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(123,104,238,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ width: `${item.score}%`, height: '100%', backgroundColor: (item.score || 0) >= 80 ? '#4CAF50' : (item.score || 0) >= 60 ? C.purple : '#FF9800', borderRadius: 4 }} />
                        </View>
                        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600', width: 30, textAlign: 'right' }}>{item.score}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ width: '100%', marginTop: 24 }}>
                    <Btn title="Tamam" onPress={() => setShowSleepModal(false)} />
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── ALARM MODAL ─── */}
      <Modal visible={showAlarmModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>⏰ Alarm Kur</Text>
              <TouchableOpacity onPress={() => setShowAlarmModal(false)}>
                <Text style={{ color: C.textDim, fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>Kaçta uyanmak istiyorsunuz?</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 32 }}>
              <TouchableOpacity onPress={() => setAlarmHour((alarmHour - 1 + 24) % 24)} style={modalStyles.arrowBtn}>
                <Text style={modalStyles.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={modalStyles.timeText}>{alarmHour.toString().padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setAlarmHour((alarmHour + 1) % 24)} style={modalStyles.arrowBtn}>
                <Text style={modalStyles.arrow}>▼</Text>
              </TouchableOpacity>

              <Text style={modalStyles.colon}>:</Text>

              <TouchableOpacity onPress={() => setAlarmMin((alarmMin - 5 + 60) % 60)} style={modalStyles.arrowBtn}>
                <Text style={modalStyles.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={modalStyles.timeText}>{alarmMin.toString().padStart(2, '0')}</Text>
              <TouchableOpacity onPress={() => setAlarmMin((alarmMin + 5) % 60)} style={modalStyles.arrowBtn}>
                <Text style={modalStyles.arrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Alarm sesi seçimi */}
            <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>Alarm Sesi</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
              {[
                { id: 'beep', name: 'Klasik', emoji: '🔔' },
                { id: 'gentle', name: 'Nazik', emoji: '🎵' },
                { id: 'nature', name: 'Doğa', emoji: '🌅' },
              ].map(s => (
                <TouchableOpacity key={s.id} style={{
                  flex: 1, alignItems: 'center', padding: 12, borderRadius: 12,
                  backgroundColor: 'rgba(123,104,238,0.1)', borderWidth: 1,
                  borderColor: s.id === 'beep' ? 'rgba(123,104,238,0.4)' : 'rgba(255,255,255,0.06)',
                }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>{s.emoji}</Text>
                  <Text style={{ color: C.textSec, fontSize: 11 }}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Btn title="Alarmı Kur" onPress={setAlarm} />
          </View>
        </View>
      </Modal>
      {/* ─── DREAM ANALYSIS MODAL ─── */}
      <Modal visible={showDreamModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.modal, { maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>🧠 AI Rüya Analizi</Text>
              <TouchableOpacity onPress={() => setShowDreamModal(false)}>
                <Text style={{ color: C.textDim, fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!dreamAnalysis ? (
                <>
                  <Text style={{ color: C.textMuted, fontSize: 13, marginBottom: 12 }}>
                    Rüyanızı anlatın, yapay zeka analiz etsin
                  </Text>

                  <TextInput
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 14, padding: 16, color: C.textSec,
                      fontSize: 15, minHeight: 150, textAlignVertical: 'top',
                    }}
                    placeholder="Bu gece rüyamda..."
                    placeholderTextColor={C.textDim}
                    multiline
                    value={dreamText}
                    onChangeText={setDreamText}
                  />

                  <View style={{ marginTop: 16 }}>
                    <Btn
                      title={dreamLoading ? "Analiz ediliyor..." : "🔮 Rüyamı Analiz Et"}
                      onPress={analyzeDream}
                      disabled={dreamLoading || !dreamText.trim()}
                    />
                  </View>

                  {/* Örnek rüyalar */}
                  <Text style={{ color: C.textDim, fontSize: 12, marginTop: 20, marginBottom: 8 }}>💭 Örnek rüyalar:</Text>
                  {[
                    'Uçuyordum, çok yükseklerden şehri seyrediyordum',
                    'Denizde yüzüyordum ama su çok sakindi',
                    'Eski okulumda kaybolmuştum, sınıfları bulamıyordum',
                  ].map((ex, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        padding: 10, backgroundColor: 'rgba(123,104,238,0.08)',
                        borderRadius: 10, marginBottom: 6,
                        borderWidth: 1, borderColor: 'rgba(123,104,238,0.1)',
                      }}
                      onPress={() => setDreamText(ex)}
                    >
                      <Text style={{ color: C.textMuted, fontSize: 13 }}>{ex}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <>
                  {/* Analiz Sonucu */}
                  <View style={{
                    backgroundColor: 'rgba(123,104,238,0.08)',
                    borderRadius: 14, padding: 16, marginBottom: 16,
                    borderWidth: 1, borderColor: 'rgba(123,104,238,0.15)',
                  }}>
                    <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>📝 Rüyanız:</Text>
                    <Text style={{ color: C.textMuted, fontSize: 13, fontStyle: 'italic' }}>{dreamText}</Text>
                  </View>

                  <Text style={{ color: C.textSec, fontSize: 15, lineHeight: 24 }}>
                    {dreamAnalysis}
                  </Text>

                  <View style={{ marginTop: 20, gap: 10 }}>
                    <Btn title="Yeni Rüya Analiz Et" onPress={() => { setDreamText(''); setDreamAnalysis(''); }} />
                    <Btn title="Kapat" variant="outline" onPress={() => setShowDreamModal(false)} />
                  </View>
                </>
              )}

              {/* Geçmiş Rüyalar */}
              {dreamHistory.length > 0 && !dreamAnalysis && (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600', marginBottom: 10 }}>📋 Geçmiş Analizler</Text>
                  {dreamHistory.slice(0, 5).map((d: any) => (
                    <TouchableOpacity
                      key={d.id}
                      style={{
                        padding: 12, backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: 10, marginBottom: 6,
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
                      }}
                      onPress={() => { setDreamText(d.dream); setDreamAnalysis(d.analysis); }}
                    >
                      <Text style={{ color: C.textDim, fontSize: 11 }}>{d.date}</Text>
                      <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>{d.dream}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Snoring Monitor - Full Screen Overlay */}
      {snoringActive && (
        <Modal visible={snoringActive} animationType="fade" transparent={false}>
          <SnoringMonitor
            onStop={async (session) => {
              setSnoringActive(false);
              await saveSnoringSession(session);
              setSnoringSession(session);
              setShowSnoringSummary(true);
            }}
            onCancel={() => setSnoringActive(false)}
          />
        </Modal>
      )}

      {/* Snoring Summary */}
      {snoringSession && (
        <SnoringSummary
          session={snoringSession}
          visible={showSnoringSummary}
          onClose={() => { setShowSnoringSummary(false); setSnoringSession(null); }}
          onDeleted={() => { setShowSnoringSummary(false); setSnoringSession(null); }}
        />
      )}
    </>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1a1332', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, maxHeight: '85%',
  },
  arrowBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(123,104,238,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  arrow: { color: C.purple, fontSize: 12 },
  timeText: {
    color: C.text, fontSize: 32, fontWeight: '800', width: 48, textAlign: 'center',
  },
  colon: { color: C.textMuted, fontSize: 28, fontWeight: '700', marginHorizontal: 4 },
});

function SoundsTab({ isPro, onPurchase }: any) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [showProModal, setShowProModal] = useState(false);
  const player = useAudioPlayer(playing ? SOUND_FILES[playing] : null);

  useEffect(() => {
    AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  }, []);

  useEffect(() => {
    if (player && playing) {
      player.loop = true;
      player.volume = 0.7;
      player.play();
    }
  }, [player, playing]);

  const stopSound = () => {
    if (player) {
      try { player.pause(); } catch (e) {}
    }
    setPlaying(null);
  };

  const playSound = (id: string) => {
    if (playing === id) {
      stopSound();
      return;
    }
    setPlaying(id);
  };

  const sounds = [
    { id: 'rain', name: 'Yağmur', emoji: '🌧️', desc: 'Hafif yağmur sesi', free: true },
    { id: 'wave', name: 'Dalga', emoji: '🌊', desc: 'Okyanus dalgaları', free: true },
    { id: 'white', name: 'White Noise', emoji: '📡', desc: 'Beyaz gürültü', free: true },
    { id: 'forest', name: 'Orman', emoji: '🌲', desc: 'Kuş sesleri & rüzgar', free: false },
    { id: 'fire', name: 'Şömine', emoji: '🔥', desc: 'Çıtırdayan ateş', free: false },
    { id: 'piano', name: 'Piyano', emoji: '🎹', desc: 'Sakin piyano melodileri', free: false },
    { id: 'creek', name: 'Dere', emoji: '💧', desc: 'Akan su sesi', free: false },
    { id: 'thunder', name: 'Gök Gürültüsü', emoji: '⛈️', desc: 'Uzak fırtına', free: false },
  ];

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>Uyku Sesleri</Text>
        <Text style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>
          {isPro ? '50+ ses — tümüne erişiminiz var' : '3 ücretsiz ses • PRO ile 50+ ses'}
        </Text>
      </View>

      {/* Sound List */}
      <View style={{ gap: 8 }}>
        {sounds.map((s) => {
          const canPlay = s.free || isPro;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.featureRow, playing === s.id && { borderColor: 'rgba(123,104,238,0.3)' }]}
              onPress={() => canPlay ? playSound(s.id) : setShowProModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.featureIcon, { backgroundColor: canPlay ? 'rgba(123,104,238,0.15)' : 'rgba(255,255,255,0.06)' }]}>
                <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: canPlay ? C.textSec : C.textDim, fontSize: 14, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ color: C.textDim, fontSize: 12 }}>{s.desc}</Text>
              </View>
              {canPlay ? (
                <TouchableOpacity
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: playing === s.id ? C.purple : 'rgba(123,104,238,0.15)', alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => playSound(s.id)}
                >
                  <Text style={{ color: playing === s.id ? '#fff' : C.purple, fontSize: 14 }}>
                    {playing === s.id ? '⏸' : '▶'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1a1332' }}>PRO</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* PRO Upsell */}
      {!isPro && (
        <TouchableOpacity
          style={[styles.proBanner, { marginTop: 16 }]}
          onPress={() => setShowProModal(true)}
        >
          <Text style={{ fontSize: 22 }}>🎵</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>50+ Ses ile Tüm Kütüphane</Text>
            <Text style={{ color: C.textDim, fontSize: 11 }}>PRO'ya geçerek tüm sesleri aç</Text>
          </View>
          <Text style={{ color: 'rgba(232,213,183,0.5)', fontSize: 14 }}>→</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 20 }} />

      {/* PRO Modal */}
      <Modal visible={showProModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 40 }}>👑</Text>
              <Text style={{ color: C.gold, fontSize: 22, fontWeight: '700', marginTop: 8 }}>SleepMind PRO</Text>
              <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>Tüm özelliklerin kilidini aç</Text>
            </View>

            <View style={{ gap: 10, marginBottom: 20 }}>
              {[
                { icon: '🎵', text: '50+ uyku sesi & kişisel karışım' },
                { icon: '🧠', text: 'AI Rüya Analizi' },
                { icon: '🕌', text: 'Namaz alarmı entegrasyonu' },
                { icon: '🌙', text: 'Ramazan & Vardiya modu' },
                { icon: '🤖', text: 'AI Uyku Koçu' },
                { icon: '📈', text: 'Detaylı trend analizi' },
              ].map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 18 }}>{f.icon}</Text>
                  <Text style={{ color: C.textSec, fontSize: 14 }}>{f.text}</Text>
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: 'rgba(123,104,238,0.08)', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: C.gold, fontSize: 16, fontWeight: '700' }}>₺79,99 / ay</Text>
              <Text style={{ color: C.textDim, fontSize: 12, marginTop: 4 }}>3 gün ücretsiz deneme</Text>
            </View>

            <Btn title="PRO'yu Başlat" variant="gold" onPress={() => { setShowProModal(false); onPurchase(); }} />
            <TouchableOpacity style={{ alignItems: 'center', marginTop: 12 }} onPress={() => setShowProModal(false)}>
              <Text style={{ color: C.textDim, fontSize: 13 }}>Şimdilik geç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatsTab({ sleepRecords }: any) {
  if (sleepRecords.length === 0) {
    return (
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ paddingTop: 8, paddingBottom: 16 }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>İstatistikler</Text>
          <Text style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>Uyku trendlerinizi takip edin</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📊</Text>
          <Text style={{ color: C.textSec, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Henüz yeterli veri yok</Text>
          <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 }}>
            Ana sayfadan uyku kaydı ekleyin, detaylı istatistikler burada görünsün.
          </Text>
        </View>
      </View>
    );
  }

  // Hesaplamalar
  const scores = sleepRecords.map((r: any) => r.score);
  const avgScore = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length);
  const bestDay = sleepRecords.reduce((best: any, r: any) => r.score > best.score ? r : best, sleepRecords[0]);
  const worstDay = sleepRecords.reduce((worst: any, r: any) => r.score < worst.score ? r : worst, sleepRecords[0]);

  // Uyku süresi ortalaması
  const durations = sleepRecords.map((r: any) => {
    const [bh, bm] = r.bedtime.split(':').map(Number);
    const [wh, wm] = r.wakeTime.split(':').map(Number);
    const bedMin = (bh < 6 ? bh + 24 : bh) * 60 + bm;
    const wakeMin = (wh < 6 ? wh + 24 : wh) * 60 + wm;
    let dur = wakeMin - bedMin;
    if (dur < 0) dur += 24 * 60;
    return dur;
  });
  const avgDuration = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length);
  const avgDurH = Math.floor(avgDuration / 60);
  const avgDurM = avgDuration % 60;

  // Skor etiketi
  let avgLabel = 'Kötü'; let avgEmoji = '😫';
  if (avgScore >= 90) { avgLabel = 'Mükemmel'; avgEmoji = '🤩'; }
  else if (avgScore >= 80) { avgLabel = 'Çok İyi'; avgEmoji = '😄'; }
  else if (avgScore >= 70) { avgLabel = 'İyi'; avgEmoji = '😊'; }
  else if (avgScore >= 60) { avgLabel = 'Ortalama'; avgEmoji = '😐'; }
  else if (avgScore >= 50) { avgLabel = 'Düşük'; avgEmoji = '😕'; }

  // Son 7 kayıt
  const last7 = sleepRecords.slice(-7);

  // Trend (son 3 vs önceki 3)
  let trendText = '';
  let trendEmoji = '➡️';
  if (sleepRecords.length >= 4) {
    const recent = scores.slice(-3);
    const older = scores.slice(-6, -3);
    if (older.length > 0) {
      const recentAvg = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a: number, b: number) => a + b, 0) / older.length;
      const diff = Math.round(recentAvg - olderAvg);
      if (diff > 3) { trendText = `+${diff} puan artış`; trendEmoji = '📈'; }
      else if (diff < -3) { trendText = `${diff} puan düşüş`; trendEmoji = '📉'; }
      else { trendText = 'Stabil'; trendEmoji = '➡️'; }
    }
  }

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>İstatistikler</Text>
        <Text style={{ color: C.textDim, fontSize: 13, marginTop: 4 }}>{sleepRecords.length} kayıt analiz edildi</Text>
      </View>

      {/* Ortalama Skor */}
      <View style={[styles.scoreCard, { marginBottom: 16 }]}>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ color: C.textMuted, fontSize: 11, marginBottom: 4 }}>Ortalama Skor</Text>
          <Text style={{ color: C.text, fontSize: 48, fontWeight: '800' }}>{avgScore}</Text>
          <Text style={{ color: C.gold, fontSize: 14 }}>{avgLabel} {avgEmoji}</Text>
        </View>
      </View>

      {/* Özet Kartlar */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
          <Text style={{ fontSize: 20, marginBottom: 4 }}>⏱️</Text>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{avgDurH}s {avgDurM}dk</Text>
          <Text style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>Ort. Uyku Süresi</Text>
        </View>
        <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
          <Text style={{ fontSize: 20, marginBottom: 4 }}>📝</Text>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{sleepRecords.length}</Text>
          <Text style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>Toplam Kayıt</Text>
        </View>
        {trendText ? (
          <View style={[styles.card, { flex: 1, alignItems: 'center' }]}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>{trendEmoji}</Text>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>{trendText}</Text>
            <Text style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>Son Trend</Text>
          </View>
        ) : null}
      </View>

      {/* En İyi / En Kötü */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Text style={{ fontSize: 16 }}>🏆</Text>
            <Text style={{ color: '#4CAF50', fontSize: 13, fontWeight: '600' }}>En İyi Gün</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: '800' }}>{bestDay.score}</Text>
          <Text style={{ color: C.textDim, fontSize: 11 }}>{bestDay.date}</Text>
          <Text style={{ color: C.textDim, fontSize: 11 }}>{bestDay.duration} uyku</Text>
        </View>
        <View style={[styles.card, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Text style={{ fontSize: 16 }}>📉</Text>
            <Text style={{ color: '#FF9800', fontSize: 13, fontWeight: '600' }}>En Kötü Gün</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: '800' }}>{worstDay.score}</Text>
          <Text style={{ color: C.textDim, fontSize: 11 }}>{worstDay.date}</Text>
          <Text style={{ color: C.textDim, fontSize: 11 }}>{worstDay.duration} uyku</Text>
        </View>
      </View>

      {/* Son Kayıtlar Grafiği */}
      <View style={styles.card}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>📊 Son Kayıtlar</Text>
        <View style={{ gap: 6 }}>
          {last7.map((r: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: C.textDim, fontSize: 11, width: 70 }}>{r.date.slice(5)}</Text>
              <View style={{ flex: 1, height: 10, backgroundColor: 'rgba(123,104,238,0.1)', borderRadius: 5, overflow: 'hidden' }}>
                <View style={{
                  width: `${r.score}%`, height: '100%', borderRadius: 5,
                  backgroundColor: r.score >= 80 ? '#4CAF50' : r.score >= 60 ? C.purple : '#FF9800',
                }} />
              </View>
              <Text style={{ color: C.textSec, fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' }}>{r.score}</Text>
              <Text style={{ fontSize: 14 }}>{r.emoji}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Skor Dağılımı */}
      <View style={styles.card}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600', marginBottom: 12 }}>🎯 Skor Dağılımı</Text>
        {[
          { label: 'Mükemmel (90+)', min: 90, max: 101, color: '#4CAF50', emoji: '🤩' },
          { label: 'Çok İyi (80-89)', min: 80, max: 90, color: '#8BC34A', emoji: '😄' },
          { label: 'İyi (70-79)', min: 70, max: 80, color: C.purple, emoji: '😊' },
          { label: 'Ortalama (60-69)', min: 60, max: 70, color: '#FF9800', emoji: '😐' },
          { label: 'Düşük (<60)', min: 0, max: 60, color: '#FF5252', emoji: '😕' },
        ].map((range, i) => {
          const count = scores.filter((s: number) => s >= range.min && s < range.max).length;
          const pct = Math.round((count / scores.length) * 100);
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 12 }}>{range.emoji}</Text>
              <Text style={{ color: C.textDim, fontSize: 11, width: 100 }}>{range.label}</Text>
              <View style={{ flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: range.color, borderRadius: 4 }} />
              </View>
              <Text style={{ color: C.textMuted, fontSize: 11, width: 35, textAlign: 'right' }}>{count} ({pct}%)</Text>
            </View>
          );
        })}
      </View>

      {/* İpuçları */}
      <View style={styles.card}>
        <Text style={{ color: C.textSec, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>💡 Kişisel Öneriler</Text>
        {avgScore < 70 && (
          <Text style={{ color: 'rgba(232,224,240,0.7)', fontSize: 13, lineHeight: 20, marginBottom: 4 }}>
            • Uyku skorunuz ortalamanın altında. Yatış saatinizi düzenlemeyi deneyin.
          </Text>
        )}
        {avgDuration < 7 * 60 && (
          <Text style={{ color: 'rgba(232,224,240,0.7)', fontSize: 13, lineHeight: 20, marginBottom: 4 }}>
            • Ortalama uyku süreniz 7 saatin altında. Daha erken yatmayı hedefleyin.
          </Text>
        )}
        {avgScore >= 70 && avgDuration >= 7 * 60 && (
          <Text style={{ color: 'rgba(232,224,240,0.7)', fontSize: 13, lineHeight: 20, marginBottom: 4 }}>
            • Uyku düzeniniz gayet iyi! Tutarlılığı korumaya devam edin.
          </Text>
        )}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function SettingsTab({ onRestart, isPro, onPurchase, onRestore, onRefreshPro }: any) {
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [debugLoading, setDebugLoading] = useState(false);

  const handleRefreshPro = async () => {
    setDebugLoading(true);
    try {
      const pro = onRefreshPro ? await onRefreshPro() : false;
      const dump = await getCustomerInfoDebug();
      setDebugInfo(dump);
      Alert.alert(
        pro ? 'PRO Aktif' : 'PRO Bulunamadı',
        pro
          ? 'Aboneliğiniz doğrulandı ve aktif edildi.'
          : 'RevenueCat hesabınızda aktif abonelik bulunamadı. Aşağıdaki debug bilgilerini kontrol edin.'
      );
    } catch (e: any) {
      setDebugInfo('Error: ' + (e?.message || String(e)));
    } finally {
      setDebugLoading(false);
    }
  };

  const [prayerEnabled, setPrayerEnabled] = useState(() => {
    try { return storage.getItem('sleepmind_prayer') === 'true'; } catch { return false; }
  });
  const [prayerTimes, setPrayerTimes] = useState<any>(null);
  const [prayerLoading, setPrayerLoading] = useState(false);
  const [selectedPrayers, setSelectedPrayers] = useState<string[]>(() => {
    try { const s = storage.getItem('sleepmind_selected_prayers'); return s ? JSON.parse(s) : ['fajr']; } catch { return ['fajr']; }
  });
  const [city, setCity] = useState('Istanbul');

  // Namaz vakitlerini çek (Aladhan API - ücretsiz)
  const fetchPrayerTimes = async () => {
    setPrayerLoading(true);
    try {
      const today = new Date();
      const dd = today.getDate().toString().padStart(2, '0');
      const mm = (today.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = today.getFullYear();
      const res = await fetch(
        `https://api.aladhan.com/v1/timingsByCity/${dd}-${mm}-${yyyy}?city=${city}&country=Turkey&method=13`
      );
      const data = await res.json();
      if (data.data?.timings) {
        setPrayerTimes(data.data.timings);
      }
    } catch (e) {
      console.log('Prayer times fetch error:', e);
    }
    setPrayerLoading(false);
  };

  useEffect(() => {
    if (prayerEnabled) fetchPrayerTimes();
  }, [prayerEnabled, city]);

  const togglePrayer = () => {
    const newVal = !prayerEnabled;
    setPrayerEnabled(newVal);
    try { storage.setItem('sleepmind_prayer', newVal.toString()); } catch {}
  };

  const toggleSelectedPrayer = (key: string) => {
    const updated = selectedPrayers.includes(key)
      ? selectedPrayers.filter(p => p !== key)
      : [...selectedPrayers, key];
    setSelectedPrayers(updated);
    try { storage.setItem('sleepmind_selected_prayers', JSON.stringify(updated)); } catch {}
  };

  const prayerNames: Record<string, string> = {
    Fajr: '🌅 İmsak',
    Sunrise: '☀️ Güneş',
    Dhuhr: '🕐 Öğle',
    Asr: '🌤️ İkindi',
    Maghrib: '🌅 Akşam',
    Isha: '🌙 Yatsı',
  };

  return (
    <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>Ayarlar</Text>
      </View>

      {/* Profile */}
      <View style={[styles.card, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(123,104,238,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22 }}>👤</Text>
          </View>
          <View>
            <Text style={{ color: C.textSec, fontSize: 16, fontWeight: '600' }}>Misafir Kullanıcı</Text>
            <Text style={{ color: C.textDim, fontSize: 12 }}>Giriş yap veya hesap oluştur</Text>
          </View>
        </View>
      </View>

      {/* General Settings */}
      {[
        { icon: '🔔', title: 'Bildirimler', desc: 'Alarm & hatırlatmalar' },
        { icon: '🌙', title: 'Uyku Hedefi', desc: 'Hedef uyku saatinizi ayarlayın' },
      ].map((item, i) => (
        <TouchableOpacity key={i} style={[styles.featureRow, { marginBottom: 8 }]}>
          <View style={styles.featureIcon}><Text style={{ fontSize: 20 }}>{item.icon}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>{item.title}</Text>
            <Text style={{ color: C.textDim, fontSize: 12 }}>{item.desc}</Text>
          </View>
          <Text style={{ color: C.textDim, fontSize: 16 }}>→</Text>
        </TouchableOpacity>
      ))}

      {/* ─── NAMAZ ALARMI ─── */}
      <View style={{ marginTop: 12, marginBottom: 8 }}>
        <Text style={{ color: C.gold, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>🕌 Namaz Alarmı</Text>
      </View>

      <TouchableOpacity
        style={[styles.featureRow, { marginBottom: 8 }, prayerEnabled && { borderColor: 'rgba(123,104,238,0.3)' }]}
        onPress={togglePrayer}
      >
        <View style={[styles.featureIcon, { backgroundColor: prayerEnabled ? 'rgba(123,104,238,0.2)' : 'rgba(255,255,255,0.06)' }]}>
          <Text style={{ fontSize: 20 }}>🕌</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>Namaz Vakitleri</Text>
          <Text style={{ color: C.textDim, fontSize: 12 }}>Uyku düzeninize entegre edin</Text>
        </View>
        <View style={{
          width: 48, height: 28, borderRadius: 14,
          backgroundColor: prayerEnabled ? C.purple : 'rgba(255,255,255,0.15)',
          justifyContent: 'center', padding: 3,
        }}>
          <View style={{
            width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
            alignSelf: prayerEnabled ? 'flex-end' : 'flex-start',
          }} />
        </View>
      </TouchableOpacity>

      {prayerEnabled && (
        <View style={[styles.card, { marginBottom: 8 }]}>
          {/* Şehir seçimi */}
          <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 8 }}>📍 Şehir</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya', 'Giresun'].map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setCity(c)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
                  backgroundColor: city === c ? 'rgba(123,104,238,0.2)' : 'rgba(255,255,255,0.05)',
                  borderWidth: 1, borderColor: city === c ? 'rgba(123,104,238,0.4)' : 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ color: city === c ? C.purple : C.textDim, fontSize: 12 }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Namaz vakitleri */}
          {prayerLoading ? (
            <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 16 }}>Vakitler yükleniyor...</Text>
          ) : prayerTimes ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 4 }}>⏰ Bugünün Vakitleri — {city}</Text>
              {Object.entries(prayerNames).map(([key, label]) => {
                const time = prayerTimes[key];
                const isSelected = selectedPrayers.includes(key.toLowerCase());
                return (
                  <TouchableOpacity
                    key={key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      padding: 10, borderRadius: 10,
                      backgroundColor: isSelected ? 'rgba(123,104,238,0.1)' : 'rgba(255,255,255,0.02)',
                      borderWidth: 1, borderColor: isSelected ? 'rgba(123,104,238,0.2)' : 'transparent',
                    }}
                    onPress={() => toggleSelectedPrayer(key.toLowerCase())}
                  >
                    <Text style={{ color: C.textSec, fontSize: 14 }}>{label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{time}</Text>
                      <View style={{
                        width: 22, height: 22, borderRadius: 6,
                        backgroundColor: isSelected ? C.purple : 'rgba(255,255,255,0.1)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <Text style={{ color: C.textDim, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                Seçili vakitlerde uyku düzeniniz optimize edilir
              </Text>
            </View>
          ) : (
            <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 16 }}>Vakitler alınamadı</Text>
          )}
        </View>
      )}

      {/* Other PRO settings */}
      {[
        { icon: '🌙', title: 'Ramazan Modu', desc: 'Sahur/iftar uyku planı', pro: true },
        { icon: '🏭', title: 'Vardiya Modu', desc: 'Gece vardiyası desteği', pro: true },
      ].map((item, i) => (
        <TouchableOpacity key={i} style={[styles.featureRow, { marginBottom: 8 }]}>
          <View style={styles.featureIcon}><Text style={{ fontSize: 20 }}>{item.icon}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>{item.title}</Text>
            <Text style={{ color: C.textDim, fontSize: 12 }}>{item.desc}</Text>
          </View>
          <View style={{ backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#1a1332' }}>PRO</Text>
          </View>
        </TouchableOpacity>
      ))}

      {/* PRO Banner */}
      {!isPro ? (
        <TouchableOpacity style={[styles.proBanner, { marginTop: 8 }]} onPress={onPurchase}>
          <Text style={{ fontSize: 22 }}>👑</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>SleepMind PRO</Text>
            <Text style={{ color: C.textDim, fontSize: 11 }}>Tüm özelliklerin kilidini aç</Text>
          </View>
          <Text style={{ color: 'rgba(232,213,183,0.5)', fontSize: 14 }}>→</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.proBanner, { marginTop: 8 }]}>
          <Text style={{ fontSize: 22 }}>👑</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.gold, fontSize: 13, fontWeight: '600' }}>SleepMind PRO Aktif</Text>
            <Text style={{ color: C.textDim, fontSize: 11 }}>Tüm özelliklerin kilidi açık</Text>
          </View>
          <Text style={{ color: '#4CAF50', fontSize: 14 }}>✓</Text>
        </View>
      )}

      {/* Geri Yükle */}
      {!isPro && (
        <TouchableOpacity
          style={[styles.featureRow, { marginTop: 8 }]}
          onPress={onRestore}
        >
          <View style={styles.featureIcon}><Text style={{ fontSize: 20 }}>🔄</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>Satın Almaları Geri Yükle</Text>
            <Text style={{ color: C.textDim, fontSize: 12 }}>Önceki PRO aboneliğinizi geri yükleyin</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* PRO Durumunu Yenile + Debug */}
      <TouchableOpacity
        style={[styles.featureRow, { marginTop: 8 }]}
        onPress={handleRefreshPro}
        disabled={debugLoading}
      >
        <View style={styles.featureIcon}><Text style={{ fontSize: 20 }}>🔁</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.textSec, fontSize: 14, fontWeight: '600' }}>
            {debugLoading ? 'Kontrol ediliyor...' : 'PRO Durumunu Yenile'}
          </Text>
          <Text style={{ color: C.textDim, fontSize: 12 }}>Abonelik bilgisini RevenueCat'ten yeniden çek</Text>
        </View>
      </TouchableOpacity>

      {debugInfo ? (
        <View style={[styles.card, { marginTop: 8 }]}>
          <Text style={{ color: C.textDim, fontSize: 11, marginBottom: 6 }}>🔍 Debug — RevenueCat Customer Info</Text>
          <Text style={{ color: C.textSec, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            {debugInfo}
          </Text>
        </View>
      ) : null}

      {/* App Info */}
      <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
        <Text style={{ color: C.textDim, fontSize: 11 }}>SleepMind v1.0.0</Text>
        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>Zihniniz Dinlensin 🌙</Text>
      </View>

      <TouchableOpacity style={[styles.restartBtn, { marginTop: 12 }]} onPress={onRestart}>
        <Text style={{ color: 'rgba(123,104,238,0.6)', fontSize: 11 }}>↻ Onboarding'i Tekrar Göster (Dev)</Text>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ═══════════════════════════════════════
// TAB NAVIGATOR
// ═══════════════════════════════════════

function TabNavigator({ onRestart }: any) {
  const [activeTab, setActiveTab] = useState('home');
  const [isPro, setIsPro] = useState(false);
  const [sleepRecords, setSleepRecords] = useState<any[]>(() => {
    // localStorage'dan kayıtları yükle
    try {
      const saved = storage.getItem('sleepmind_records');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [quizData, setQuizData] = useState<any>(() => {
    try { const s = storage.getItem('sleepmind_quiz'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  // RevenueCat başlat ve PRO durumunu kontrol et
  useEffect(() => {
    const setup = async () => {
      await initPurchases();
      // İlk açılışta cache'i geçersiz kıl ki sandbox/TestFlight aboneliği taze gelsin
      const proStatus = await checkProStatus(true);
      setIsPro(proStatus);
    };
    setup();

    // Subscription değişikliklerini dinle
    const unsubscribe = addSubscriptionListener((proStatus) => {
      setIsPro(proStatus);
    });
    return unsubscribe;
  }, []);

  // PRO durumunu zorla yenile (Horlama gate gibi yerlerden çağrılır)
  const refreshProStatus = async (): Promise<boolean> => {
    const status = await checkProStatus(true);
    setIsPro(status);
    return status;
  };

  // PRO satın alma
  const handlePurchase = async () => {
    const success = await purchaseProSubscription();
    if (success) {
      setIsPro(true);
      Alert.alert('Tebrikler!', 'SleepMind PRO aktif edildi!');
    }
  };

  // Satın almaları geri yükle
  const handleRestore = async () => {
    const success = await restorePurchases();
    if (success) {
      setIsPro(true);
      Alert.alert('Başarılı', 'PRO aboneliğiniz geri yüklendi!');
    } else {
      Alert.alert('Bilgi', 'Aktif bir abonelik bulunamadı.');
    }
  };

  // Kayıtlar değiştiğinde localStorage'a kaydet
  useEffect(() => {
    try { storage.setItem('sleepmind_records', JSON.stringify(sleepRecords)); } catch {}
  }, [sleepRecords]);

  const tabs = [
    { id: 'home', icon: '🏠', label: 'Ana Sayfa' },
    { id: 'sounds', icon: '🎵', label: 'Sesler' },
    { id: 'stats', icon: '📊', label: 'İstatistik' },
    { id: 'settings', icon: '⚙️', label: 'Ayarlar' },
  ];


  const renderTab = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onTabChange={setActiveTab} sleepRecords={sleepRecords} setSleepRecords={setSleepRecords} quizData={quizData} isPro={isPro} onPurchase={handlePurchase} onRefreshPro={refreshProStatus} onRestore={handleRestore} />;
      case 'sounds': return <SoundsTab isPro={isPro} onPurchase={handlePurchase} />;
      case 'stats': return <StatsTab sleepRecords={sleepRecords} />;
      case 'settings': return <SettingsTab onRestart={onRestart} isPro={isPro} onPurchase={handlePurchase} onRestore={handleRestore} onRefreshPro={refreshProStatus} />;
      default: return <HomeTab onTabChange={setActiveTab} sleepRecords={sleepRecords} setSleepRecords={setSleepRecords} quizData={quizData} isPro={isPro} onPurchase={handlePurchase} onRefreshPro={refreshProStatus} onRestore={handleRestore} />;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{renderTab()}</View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity key={tab.id} style={styles.tab} onPress={() => setActiveTab(tab.id)}>
            <Text style={{ fontSize: 20, opacity: activeTab === tab.id ? 1 : 0.4 }}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════

export default function App() {
  const [obScreen, setObScreen] = useState(0);
  const [obDone, setObDone] = useState(false);
  const [answers, setAnswers] = useState<any>({});
  const [multiAnswers, setMultiAnswers] = useState<any>({});
  const [hydrated, setHydrated] = useState(false);

  // Storage'ı hydrate et ve onboarding durumunu yükle
  useEffect(() => {
    (async () => {
      await hydrateStorage();
      const done = storage.getItem('sleepmind_onboarding_done') === 'true';
      setObDone(done);
      // Quiz cevaplarını da geri yükle (gerekirse ileride kullanılabilir)
      try {
        const quizRaw = storage.getItem('sleepmind_quiz');
        if (quizRaw) {
          const parsed = JSON.parse(quizRaw);
          const single: any = {};
          const multi: any = {};
          Object.keys(parsed).forEach(k => {
            if (Array.isArray(parsed[k])) multi[k] = parsed[k];
            else single[k] = parsed[k];
          });
          setAnswers(single);
          setMultiAnswers(multi);
        }
      } catch {}
      setHydrated(true);
    })();
    initPurchases();
  }, []);

  const handleObPurchase = async () => {
    const success = await purchaseProSubscription();
    if (success) {
      Alert.alert('Tebrikler!', 'SleepMind PRO aktif edildi!');
    }
  };

  const handleObRestore = async () => {
    const success = await restorePurchases();
    if (success) {
      Alert.alert('Başarılı', 'PRO aboneliğiniz geri yüklendi!');
    } else {
      Alert.alert('Bilgi', 'Aktif bir abonelik bulunamadı.');
    }
  };

  const screenName = OB_SCREENS[obScreen];





  const goNext = () => {
    if (obScreen < OB_SCREENS.length - 1) {
      setObScreen(s => s + 1);
    } else {
      const quizData = { ...answers, ...multiAnswers };
      try {
        storage.setItem('sleepmind_quiz', JSON.stringify(quizData));
        // Namaz/Ramazan seçtiyse otomatik aktifleştir
        const lifestyle = multiAnswers.quiz_lifestyle || [];
        if (lifestyle.includes('prayer')) storage.setItem('sleepmind_prayer', 'true');
        // Onboarding tamamlandı — bir daha gösterme
        storage.setItem('sleepmind_onboarding_done', 'true');
      } catch {}
      setObDone(true);
    }
  };

  const restart = () => {
    storage.removeItem('sleepmind_onboarding_done');
    setObDone(false);
    setObScreen(0);
    setAnswers({});
    setMultiAnswers({});
  };

  const onSelect = (s: string, v: string) => setAnswers((p: any) => ({ ...p, [s]: v }));
  const onMultiSelect = (s: string, v: string) => {
    setMultiAnswers((p: any) => {
      const cur = p[s] || [];
      return { ...p, [s]: cur.includes(v) ? cur.filter((x: string) => x !== v) : [...cur, v] };
    });
  };

  const renderOnboarding = () => {
    switch (screenName) {
      case 'welcome': return <WelcomeScreen onNext={goNext} />;
      case 'social_proof': return <SocialProofScreen onNext={goNext} />;
      case 'sleep_score': return <SleepScoreScreen onNext={goNext} />;
      case 'progress_graph': return <ProgressGraphScreen onNext={goNext} />;
      case 'free_features': return <FreeFeaturesScreen onNext={goNext} />;
      case 'pro_teaser': return <ProTeaserScreen onNext={goNext} onPurchase={handleObPurchase} onRestore={handleObRestore} />;
      case 'loading': return <LoadingScreen onNext={goNext} />;
      case 'ready': return <ReadyScreen onNext={goNext} />;
      default:
        if (QUIZZES[screenName]) {
          return <QuizScreen screen={screenName} answers={answers} multiAnswers={multiAnswers}
            onSelect={onSelect} onMultiSelect={onMultiSelect} onNext={goNext} />;
        }
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stars />
      {/* Phone notch */}
      {Platform.OS === 'web' && (
        <View style={{
          position: 'absolute', top: 10, left: '50%', marginLeft: -60,
          width: 120, height: 28, backgroundColor: '#000', borderRadius: 20,
          zIndex: 100,
        }} />
      )}
      <View style={styles.safeArea}>
        {!hydrated ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 48 }}>🌙</Text>
            <Text style={[styles.muted, { marginTop: 16 }]}>Yükleniyor...</Text>
          </View>
        ) : obDone ? (
          <TabNavigator onRestart={restart} />
        ) : (
          renderOnboarding()
        )}
      </View>
      {/* Home indicator */}
      {Platform.OS === 'web' && (
        <View style={{
          position: 'absolute', bottom: 6, left: '50%', marginLeft: -67,
          width: 134, height: 5, backgroundColor: 'rgba(232,224,240,0.2)',
          borderRadius: 3, zIndex: 100,
        }} />
      )}
    </View>
  );
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    paddingTop: 50,
    width: 390,
    maxWidth: 390,
    backgroundColor: C.bg,
    ...(Platform.OS === 'web' ? {
      height: 844,
      maxHeight: 844,
      borderRadius: 40,
      overflow: 'hidden' as any,
      shadowColor: '#7B68EE',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 60,
    } : {}),
  },
  star: { position: 'absolute', borderRadius: 50, backgroundColor: C.gold },

  title: { fontSize: 32, fontWeight: '800', color: C.text, marginBottom: 4 },
  tagline: { fontSize: 13, color: 'rgba(232,213,183,0.7)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 32 },
  heading: { fontSize: 22, fontWeight: '600', color: C.textSec, textAlign: 'center', lineHeight: 32, marginBottom: 12 },
  muted: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginBottom: 16 },
  bigNumber: { fontSize: 40, fontWeight: '800', color: C.gold },
  quizTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  btnWrap: { width: '100%', marginTop: 32 },
  quizContainer: { flex: 1, paddingHorizontal: 20 },

  btn: { width: '100%', backgroundColor: C.purple, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  btnGold: { backgroundColor: C.gold },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(123,104,238,0.4)' },
  btnDisabled: { backgroundColor: 'rgba(123,104,238,0.3)' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16 },
  optionCompact: { padding: 12, paddingHorizontal: 16, gap: 10 },
  optionSelected: { backgroundColor: 'rgba(123,104,238,0.15)', borderColor: 'rgba(123,104,238,0.6)' },
  optionLabel: { fontSize: 16, color: C.textSec, flex: 1 },

  progressBg: { width: '100%', height: 3, backgroundColor: 'rgba(232,213,183,0.15)', borderRadius: 2, marginBottom: 20 },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: C.purple },

  proofCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(123,104,238,0.2)', borderWidth: 2, borderColor: 'rgba(123,104,238,0.3)', alignItems: 'center', justifyContent: 'center' },
  testimonial: { backgroundColor: C.card, borderRadius: 16, padding: 16, width: '100%', borderWidth: 1, borderColor: C.cardBorder, marginBottom: 24 },
  testimonialText: { color: 'rgba(232,224,240,0.7)', fontSize: 14, fontStyle: 'italic', lineHeight: 22 },
  testimonialAuthor: { color: 'rgba(232,213,183,0.5)', fontSize: 12, marginTop: 8 },

  scoreCircle: { width: 160, height: 160, borderRadius: 80, borderWidth: 8, borderColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontSize: 42, fontWeight: '800', color: C.text },

  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 14 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(123,104,238,0.15)', alignItems: 'center', justifyContent: 'center' },

  proChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingHorizontal: 14, backgroundColor: 'rgba(232,213,183,0.06)', borderWidth: 1, borderColor: 'rgba(232,213,183,0.1)', borderRadius: 12, width: '48%' },
  proPrice: { backgroundColor: 'rgba(123,104,238,0.08)', borderWidth: 1, borderColor: 'rgba(123,104,238,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' },

  readyCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(123,104,238,0.2)', borderWidth: 2, borderColor: 'rgba(123,104,238,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },

  scoreCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(123,104,238,0.1)', borderWidth: 1, borderColor: 'rgba(123,104,238,0.15)', borderRadius: 20, padding: 18, marginBottom: 12 },
  addSleepBtn: { alignItems: 'center', gap: 4, backgroundColor: 'rgba(123,104,238,0.15)', borderRadius: 14, padding: 12, paddingHorizontal: 16 },
  quickAction: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 14, padding: 12, alignItems: 'center', position: 'relative' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 14, padding: 14, marginBottom: 12 },
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(232,213,183,0.08)', borderWidth: 1, borderColor: 'rgba(232,213,183,0.15)', borderRadius: 14, padding: 14, marginBottom: 12 },
  proBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: C.gold, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  proBadgeText: { fontSize: 8, fontWeight: '700', color: '#1a1332' },
  restartBtn: { alignItems: 'center', padding: 10, backgroundColor: 'rgba(123,104,238,0.08)', borderWidth: 1, borderColor: 'rgba(123,104,238,0.15)', borderRadius: 10 },

  tabBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, paddingBottom: 28, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', backgroundColor: C.bgDark },
  tab: { alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 10, color: C.textDim },
  tabLabelActive: { color: C.purple, fontWeight: '600' },

  legalLink: { fontSize: 10, color: C.textDim, textDecorationLine: 'underline' },
  legalDot: { fontSize: 10, color: C.textDim },
});