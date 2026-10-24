import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { ui } from '@/components/Screen';
import {
  documentRevision,
  projectFeedbackUrl,
  readingDocuments,
  type DocumentKind,
} from '../documents';

export function DocumentSheet({
  document,
  onClose,
}: {
  document: DocumentKind | null;
  onClose: () => void;
}) {
  const content = readingDocuments[document ?? 'about'];
  return (
    <Sheet
      visible={document !== null}
      title={content.title}
      contentKey={document ?? undefined}
      onClose={onClose}
    >
      <View style={styles.section}>
        {document === 'about' && (
          <Text style={ui.strong}>
            TongZhang · {Constants.expoConfig?.version ?? '版本信息不可用'}
          </Text>
        )}
        <Text style={ui.caption}>修订日期：{documentRevision}</Text>
        <Text selectable style={ui.body}>
          {content.introduction}
        </Text>
      </View>
      {content.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={ui.heading}>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} selectable style={ui.body}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
      <View style={styles.section}>
        <Text style={ui.caption}>项目反馈地址（可选择复制）</Text>
        <Text selectable style={ui.body}>
          {projectFeedbackUrl}
        </Text>
      </View>
      <Button title="关闭" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({ section: { gap: 8 } });
