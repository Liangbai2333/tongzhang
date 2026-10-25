import { Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Touch } from '@/components/Touch';
import { FigmaAsset } from '@/icons/FigmaAsset';
import { expenseAssets } from '@/icons/expense-assets';
import { ui } from '@/components/Screen';
import { colors } from '@/theme/tokens';
import { expenseStyles } from './ExpenseUI';
export function ChoiceSheet({
  visible,
  title,
  value,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} variant="members" onClose={onClose}>
      {options.map((option) => (
        <Touch
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onSelect(option.value)}
          style={[
            expenseStyles.choice,
            value === option.value && { backgroundColor: colors.primarySoft },
          ]}
        >
          <View style={ui.between}>
            <Text style={[ui.body, ui.grow]}>{option.label}</Text>
            {value === option.value && <FigmaAsset asset={expenseAssets.done} />}
          </View>
        </Touch>
      ))}
    </Sheet>
  );
}
