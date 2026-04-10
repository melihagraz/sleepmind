import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import {
  SnoringSession,
  SnoringEvent,
  SNORING_THRESHOLD_DB,
  MIN_EVENT_DURATION_SEC,
  TIMELINE_SAMPLE_SEC,
} from '../lib/snoring';

const C = {
  bg: '#0a0918',
  text: '#F5F0FF',
  textDim: 'rgba(232,224,240,0.4)',
  purple: '#7B68EE',
  red: '#FF5252',
  green: '#4CAF50',
};

interface Props {
  onStop: (session: SnoringSession) => void;
  onCancel: () => void;
}

export default function SnoringMonitor({ onStop, onCancel }: Props) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [currentDb, setCurrentDb] = useState(-160);
  const [eventCount, setEventCount] = useState(0);

  // Refs for tracking state across metering callbacks
  const startTimeRef = useRef<string>('');
  const eventsRef = useRef<SnoringEvent[]>([]);
  const timelineRef = useRef<Array<{ t: number; db: number }>>([]);
  const lastTimelineSampleRef = useRef(0);
  const detectStateRef = useRef<'SILENT' | 'DETECTING' | 'EVENT'>('SILENT');
  const detectStartRef = useRef(0);
  const eventPeakRef = useRef(-160);
  const eventStartRef = useRef(0);
  const elapsedRef = useRef(0);

  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.LOW_QUALITY,
      isMeteringEnabled: true,
      numberOfChannels: 1,
      sampleRate: 22050,
      bitRate: 64000,
    },
    (status) => {
      // Recording status updates (finished, error, etc.)
      if (status.hasError) {
        console.log('Recording error:', status.error);
      }
    }
  );

  const recorderState = useAudioRecorderState(recorder, 500);

  // Request permission on mount
  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      setPermissionGranted(granted);
      if (granted) {
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
        });
        startRecording();
      }
    })();
  }, []);

  const startRecording = async () => {
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      startTimeRef.current = new Date().toISOString();
      setIsRecording(true);
    } catch (e) {
      console.log('Start recording error:', e);
    }
  };

  // Process metering data
  useEffect(() => {
    if (!isRecording || !recorderState) return;

    const db = recorderState.metering ?? -160;
    const elapsed = Math.floor(recorderState.durationMillis / 1000);

    setCurrentDb(db);
    setElapsedSec(elapsed);
    elapsedRef.current = elapsed;

    // Timeline sampling
    if (elapsed - lastTimelineSampleRef.current >= TIMELINE_SAMPLE_SEC) {
      timelineRef.current.push({ t: elapsed, db });
      lastTimelineSampleRef.current = elapsed;
    }

    // Snoring detection state machine
    const state = detectStateRef.current;

    if (state === 'SILENT') {
      if (db > SNORING_THRESHOLD_DB) {
        detectStateRef.current = 'DETECTING';
        detectStartRef.current = elapsed;
        eventPeakRef.current = db;
      }
    } else if (state === 'DETECTING') {
      if (db > SNORING_THRESHOLD_DB) {
        eventPeakRef.current = Math.max(eventPeakRef.current, db);
        if (elapsed - detectStartRef.current >= MIN_EVENT_DURATION_SEC) {
          detectStateRef.current = 'EVENT';
          eventStartRef.current = detectStartRef.current;
        }
      } else {
        // False alarm, back to silent
        detectStateRef.current = 'SILENT';
      }
    } else if (state === 'EVENT') {
      if (db > SNORING_THRESHOLD_DB) {
        eventPeakRef.current = Math.max(eventPeakRef.current, db);
      } else {
        // Event ended
        const event: SnoringEvent = {
          id: `evt_${Date.now()}`,
          timestampSec: eventStartRef.current,
          durationSec: elapsed - eventStartRef.current,
          peakDb: eventPeakRef.current,
        };
        eventsRef.current.push(event);
        setEventCount(eventsRef.current.length);
        detectStateRef.current = 'SILENT';
      }
    }
  }, [recorderState?.durationMillis, isRecording]);

  const handleStop = useCallback(async () => {
    try {
      // If currently in an event, close it
      if (detectStateRef.current === 'EVENT') {
        const event: SnoringEvent = {
          id: `evt_${Date.now()}`,
          timestampSec: eventStartRef.current,
          durationSec: elapsedRef.current - eventStartRef.current,
          peakDb: eventPeakRef.current,
        };
        eventsRef.current.push(event);
      }

      await recorder.stop();
      setIsRecording(false);

      const totalSnoringMin = eventsRef.current.reduce(
        (sum, e) => sum + e.durationSec, 0
      ) / 60;

      const session: SnoringSession = {
        id: `snore_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        startTime: startTimeRef.current,
        endTime: new Date().toISOString(),
        totalDurationMin: Math.round(elapsedRef.current / 60 * 10) / 10,
        totalSnoringMin: Math.round(totalSnoringMin * 10) / 10,
        eventCount: eventsRef.current.length,
        events: eventsRef.current,
        recordingUri: recorder.uri,
        timeline: timelineRef.current,
      };

      onStop(session);
    } catch (e) {
      console.log('Stop recording error:', e);
    }
  }, [recorder, onStop]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}s ${m}dk ${s < 10 ? '0' : ''}${s}sn`;
    return `${m}dk ${s < 10 ? '0' : ''}${s}sn`;
  };

  // Normalize dB to 0-1 range for visualization
  const dbToLevel = (db: number) => {
    const min = -60;
    const max = 0;
    return Math.max(0, Math.min(1, (db - min) / (max - min)));
  };

  if (!permissionGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Mikrofon izni gerekli</Text>
        <Text style={styles.subtitle}>
          Horlama tespiti için mikrofon erişimine izin vermeniz gerekmektedir.
        </Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const level = dbToLevel(currentDb);
  const isLoud = currentDb > SNORING_THRESHOLD_DB;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Horlama Takibi</Text>
        <Text style={styles.subtitle}>
          {isRecording ? 'Dinleniyor...' : 'Hazırlanıyor...'}
        </Text>
      </View>

      {/* Timer */}
      <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>

      {/* Level Indicator */}
      <View style={styles.levelContainer}>
        <View style={styles.levelBg}>
          <View
            style={[
              styles.levelFill,
              {
                width: `${level * 100}%`,
                backgroundColor: isLoud ? C.red : C.purple,
              },
            ]}
          />
        </View>
        <Text style={[styles.dbText, isLoud && { color: C.red }]}>
          {Math.round(currentDb)} dB
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{eventCount}</Text>
          <Text style={styles.statLabel}>Horlama Olayı</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {Math.round(eventsRef.current.reduce((s, e) => s + e.durationSec, 0) / 60 * 10) / 10}
          </Text>
          <Text style={styles.statLabel}>dk Horlama</Text>
        </View>
      </View>

      {/* Info */}
      <Text style={styles.info}>
        Telefonunuzu başucunuza koyun ve uyuyun.{'\n'}
        Sabah uyandığınızda "Durdur" butonuna basın.
      </Text>

      {/* Stop Button */}
      <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
        <View style={styles.stopIcon} />
        <Text style={styles.stopText}>Kaydı Durdur</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>İptal Et</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: C.textDim,
    fontSize: 14,
    marginTop: 8,
  },
  timer: {
    color: C.purple,
    fontSize: 48,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    marginBottom: 40,
  },
  levelContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  levelBg: {
    width: '80%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: 6,
  },
  dbText: {
    color: C.textDim,
    fontSize: 13,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statValue: {
    color: C.text,
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: C.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  info: {
    color: C.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,82,82,0.15)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.3)',
    marginBottom: 16,
  },
  stopIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: C.red,
  },
  stopText: {
    color: C.red,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: C.textDim,
    fontSize: 14,
  },
});
