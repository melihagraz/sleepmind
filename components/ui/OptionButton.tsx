// SleepMind - Option Button (Quiz ekranları için)
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

interface OptionButtonProps {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}

export default function OptionButton({ emoji, label, selected, onPress, compact = false }: OptionButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        compact && styles.compact,
        selected && styles.selected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.emoji, compact && styles.emojiCompact]}>{emoji}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {selected && <Text style={styles.check}>✓</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.lg,
  },
  compact: {
    padding: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  selected: {
    backgroundColor: 'rgba(123,104,238,0.15)',
    borderColor: 'rgba(123,104,238,0.6)',
  },
  emoji: {
    fontSize: 26,
  },
  emojiCompact: {
    fontSize: 20,
  },
  label: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '400',
    flex: 1,
  },
  labelSelected: {
    fontWeight: '600',
  },
  check: {
    color: Colors.purple,
    fontSize: 18,
  },
});
