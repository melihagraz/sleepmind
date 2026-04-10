// SleepMind - Card Component
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'highlight' | 'youtube';
  style?: ViewStyle;
}

export default function Card({ children, variant = 'default', style }: CardProps) {
  return (
    <View style={[
      styles.base,
      variant === 'highlight' && styles.highlight,
      variant === 'youtube' && styles.youtube,
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.bgCardBorder,
    padding: Spacing.lg,
  },
  highlight: {
    borderColor: 'rgba(123,104,238,0.15)',
    backgroundColor: 'rgba(123,104,238,0.08)',
  },
  youtube: {
    borderColor: 'rgba(255,68,68,0.12)',
    backgroundColor: 'rgba(255,0,0,0.04)',
  },
});
