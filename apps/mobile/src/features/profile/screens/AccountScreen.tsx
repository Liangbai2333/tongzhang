import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { FigmaAsset, figmaAssets } from '@/icons/FigmaAsset';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme/tokens';
import { EmptyState } from '@/components/Feedback';
import { DocumentSheet } from '../components/DocumentSheet';
import type { DocumentKind } from '../documents';

export default function AccountScreen() {
  const { user, operation, logout, restore } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [document, setDocument] = useState<DocumentKind | null>(null);
  const busy = operation !== null;
  if (!user) return null;
  return (
    <Screen title="我的" back={false}>
      <View style={[ui.card, ui.row]}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FigmaAsset asset={figmaAssets['5-30'].imgIconUser} />
        </View>
        <View style={ui.grow}>
          <Text style={ui.heading}>{user.username}</Text>
          <Text selectable style={ui.muted}>
            {user.email}
          </Text>
        </View>
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>账号信息</Text>
        <Text style={ui.body}>已登录同账，当前账号已在线核验。</Text>
        <Button
          title="重新核验登录状态"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            void restore();
          }}
        />
      </View>
      <EmptyState title="共同账本" description="账本功能尚未接通，接通后即可创建或加入共同账本。" />
      <View style={ui.card}>
        <Text style={ui.heading}>了解同账</Text>
        <Button
          title="关于同账"
          variant="quiet"
          disabled={busy}
          onPress={() => setDocument('about')}
        />
        <Button
          title="用户协议"
          variant="quiet"
          disabled={busy}
          onPress={() => setDocument('terms')}
        />
        <Button
          title="隐私说明"
          variant="quiet"
          disabled={busy}
          onPress={() => setDocument('privacy')}
        />
      </View>
      <DocumentSheet document={document} onClose={() => setDocument(null)} />
      <Button title="退出登录" variant="danger" disabled={busy} onPress={() => setConfirm(true)} />
      <Sheet
        visible={confirm}
        title="退出登录？"
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
      >
        <Text style={ui.body}>退出后将清除本机登录凭据。已保存的账号和账目会保留。</Text>
        <Button
          title="确认退出"
          variant="danger"
          loading={operation === 'logout'}
          onPress={() => {
            void logout();
          }}
        />
        <Button title="取消" variant="quiet" disabled={busy} onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
