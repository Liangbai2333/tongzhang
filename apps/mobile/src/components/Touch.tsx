import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { motion } from '@/theme/tokens';
import { useReducedMotion } from './motion';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Shared, small press response. Animation never owns navigation or form state. */
export function Touch({ style, children, onPressIn, onPressOut, ...props }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const animate = (value: number) =>
    Animated.timing(scale, {
      toValue: reduced ? 1 : value,
      duration: reduced ? 0 : motion.press,
      useNativeDriver: true,
    }).start();
  return (
    <Pressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      onPressIn={(event) => {
        animate(0.98);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(1);
        onPressOut?.(event);
      }}
      style={({ pressed }) => [style, { opacity: props.disabled ? 0.45 : pressed ? 0.78 : 1 }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
