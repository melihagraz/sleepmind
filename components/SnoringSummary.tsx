import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Dimensions, Alert,
} from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SnoringSession, deleteSession } from '../lib/snoring';

const C = {
  bg: '#0a0918',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.06)',
  text: '#F5F0FF',
  textSec: '#E8E0F0',
  textDim: 'rgba(232,224,240,0.4)',
  purple: '#7B68EE',
  red: '#FF5252',
  green: '#4CAF50',
  gold: '#E8D5B7',
};

const { width } = Dimensions.get('window');

interface Props {
  session: SnoringSession;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export default function SnoringSummary({ session, visible, onClose, onDeleted }: Props) {
  const [playingEventId, setPlayingEventId] = useState<string | null>(null);
  const [seekTo, setSeekTo] = useState<number | null>(null);

  // Player for full recording
  const player = useAudioPlayer(session.recordingUri);

  const playClip = (event: { timestampSec: number; durationSec: number; id: string }) => {
    if (!player || !session.recordingUri) return;

    if (playingEventId === event.id) {
      player.pause();
      setPlayingEventId(null);
      return;
    }

    player.seekTo(event.timestampSec);
    player.play();
    setPlayingEventId(event.id);

    // Auto-stop after clip duration
    setTimeout(() => {
      player.pause();
      setPlayingEventId(null);
    }, event.durationSec * 1000);
  };

  const handleDelete = () => {
    Alert.alert(
      'Oturumu Sil',
      'Bu horlama kaydı kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(session.id);
            onDeleted();
          },
        },
      ]
    );
  };

  const formatDuration = (min: number) => {
    if (min < 1) return `${Math.round(min * 60)} sn`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h > 0) return `${h}s ${m}dk`;
    return `${m} dk`;
  };

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatEventTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
  };

  // Determine severity
  const getSeverity = () => {
    if (session.eventCount === 0) return { label: 'Horlama Yok', emoji: '😴', color: C.green };
    if (session.totalSnoringMin < 5) return { label: 'Hafif', emoji: '😌', color: C.green };
    if (session.totalSnoringMin < 15) return { label: 'Orta', emoji: '😐', color: C.gold };
    return { label: 'Yoğun', emoji: '😮', color: C.red };
  };

  const severity = getSeverity();

  // Timeline chart
  const chartWidth = width - 80;
  const chartHeight = 80;
  const maxDb = Math.max(...session.timeline.map(t => t.db), -20);
  const minDb = Math.min(...session.timeline.map(t => t.db), -60);
  const dbRange = maxDb - minDb || 1;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Horlama Raporu</Text>
            <Text style={styles.date}>
              {formatTime(session.startTime)} - {formatTime(session.endTime)}
            </Text>
          </View>

          {/* Severity Card */}
          <View style={[styles.card, { borderColor: severity.color + '40' }]}>
            <Text style={{ fontSize: 48 }}>{severity.emoji}</Text>
            <Text style={[styles.severityLabel, { color: severity.color }]}>
              {severity.label}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(session.totalDurationMin)}</Text>
              <Text style={styles.statLabel}>Toplam Süre</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(session.totalSnoringMin)}</Text>
              <Text style={styles.statLabel}>Horlama Süresi</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{session.eventCount}</Text>
              <Text style={styles.statLabel}>Horlama Olayı</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {session.events.length > 0
                  ? `${Math.round(Math.max(...session.events.map(e => e.peakDb)))} dB`
                  : '-'}
              </Text>
              <Text style={styles.statLabel}>En Yüksek Ses</Text>
            </View>
          </View>

          {/* Timeline Chart */}
          {session.timeline.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gece Ses Grafiği</Text>
              <View style={styles.chartContainer}>
                <View style={[styles.chart, { width: chartWidth, height: chartHeight }]}>
                  {/* Threshold line */}
                  <View
                    style={[
                      styles.thresholdLine,
                      {
                        bottom: (((-30) - minDb) / dbRange) * chartHeight,
                      },
                    ]}
                  />
                  {/* Bars */}
                  {session.timeline.map((point, i) => {
                    const barHeight = Math.max(2, ((point.db - minDb) / dbRange) * chartHeight);
                    const isAbove = point.db > -30;
                    const barWidth = Math.max(2, (chartWidth / session.timeline.length) - 1);
                    return (
                      <View
                        key={i}
                        style={{
                          width: barWidth,
                          height: barHeight,
                          backgroundColor: isAbove ? 'rgba(255,82,82,0.7)' : 'rgba(123,104,238,0.4)',
                          borderRadius: 1,
                          position: 'absolute',
                          bottom: 0,
                          left: (i / session.timeline.length) * chartWidth,
                        }}
                      />
                    );
                  })}
                </View>
                <View style={styles.chartLabels}>
                  <Text style={styles.chartLabel}>Başlangıç</Text>
                  <Text style={styles.chartLabel}>Bitiş</Text>
                </View>
              </View>
            </View>
          )}

          {/* Event Clips */}
          {session.events.length > 0 && session.recordingUri && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Ses Örnekleri ({session.events.length})
              </Text>
              <Text style={styles.sectionSubtitle}>
                Horlama anlarını dinleyebilirsiniz
              </Text>
              {session.events.slice(0, 10).map((event, i) => (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.clipRow,
                    playingEventId === event.id && styles.clipRowActive,
                  ]}
                  onPress={() => playClip(event)}
                >
                  <View style={styles.clipInfo}>
                    <Text style={styles.clipTime}>
                      {formatEventTime(event.timestampSec)}
                    </Text>
                    <Text style={styles.clipDuration}>
                      {event.durationSec}sn • {Math.round(event.peakDb)} dB
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.playBtn,
                      playingEventId === event.id && styles.playBtnActive,
                    ]}
                  >
                    <Text style={styles.playIcon}>
                      {playingEventId === event.id ? '⏸' : '▶'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {session.events.length > 10 && (
                <Text style={styles.moreText}>
                  ve {session.events.length - 10} olay daha...
                </Text>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>Oturumu Sil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '700',
  },
  date: {
    color: C.textDim,
    fontSize: 14,
    marginTop: 6,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 20,
  },
  severityLabel: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statItem: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    width: (width - 50) / 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  statValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: C.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: C.textSec,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: C.textDim,
    fontSize: 12,
    marginBottom: 12,
  },
  chartContainer: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 8,
  },
  chart: {
    position: 'relative',
    overflow: 'hidden',
  },
  thresholdLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,82,82,0.3)',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartLabel: {
    color: C.textDim,
    fontSize: 10,
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  clipRowActive: {
    borderColor: 'rgba(123,104,238,0.3)',
  },
  clipInfo: {
    flex: 1,
  },
  clipTime: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '600',
  },
  clipDuration: {
    color: C.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(123,104,238,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnActive: {
    backgroundColor: C.purple,
  },
  playIcon: {
    color: C.purple,
    fontSize: 14,
  },
  moreText: {
    color: C.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  closeBtn: {
    backgroundColor: C.purple,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.3)',
  },
  deleteBtnText: {
    color: C.red,
    fontSize: 14,
    fontWeight: '600',
  },
});
