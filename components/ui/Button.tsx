// SleepMind - Primary Button Component
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Colors, BorderRadius } from '../../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'gold' | 'outline';
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({ title, onPress, variant = 'primary', disabled = false, style }: ButtonProps) {
  const buttonStyle = [
    styles.base,
    variant === 'primary' && styles.primary,
    variant === 'gold' && styles.gold,
    variant === 'outline' && styles.outline,
    disabled && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.text,
    variant === 'gold' && styles.goldText,
    variant === 'outline' && styles.outlineText,
    disabled && styles.disabledText,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={textStyle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.purple,
  },
  gold: {
    backgroundColor: Colors.gold,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(123,104,238,0.4)',
  },
  disabled: {
    backgroundColor: 'rgba(123,104,238,0.3)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  goldText: {
    color: Colors.proText,
  },
  outlineText: {
    color: Colors.purple,
  },
  disabledText: {
    color: 'rgba(255,255,255,0.4)',
  },
});
