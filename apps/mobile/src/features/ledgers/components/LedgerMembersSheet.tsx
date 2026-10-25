import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EndpointOutput } from '@tongzhang/contracts';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Touch } from '@/components/Touch';
import { colors } from '@/theme/tokens';
import { useInvitationReset } from '@/features/invitations/use-invitation-reset';
import { ResetInvitationContent } from '@/features/invitations/components/ResetInvitationContent';

type Ledger = EndpointOutput<'getLedger'>['data'];
export function LedgerMembersSheet({
  visible,
  ledger,
  userId,
  onClose,
  onRefresh,
  onInvite,
}: {
  visible: boolean;
  ledger: Ledger;
  userId: string;
  onClose: () => void;
  onRefresh: () => void;
  onInvite: () => void;
}) {
  const [panel, setPanel] = useState<'members' | 'reset'>('members');
  const write = useInvitationReset(ledger.id);
  const canManage = ledger.creatorUserId === userId && ledger.status === 'ACTIVE';
  useEffect(() => {
    if (!visible) setPanel('members');
  }, [visible]);
  async function reset() {
    if (!canManage) return;
    const result = await write.submit();
    if (result) {
      onClose();
      onInvite();
    }
  }
  return (
    <Sheet
      visible={visible}
      variant="members"
      contentKey={panel}
      title={panel === 'reset' ? '重置邀请码？' : `账本成员 · ${ledger.memberCount} / 12`}
      onClose={() => {
        if (!write.busy && !write.uncertain) onClose();
      }}
      headerAction={
        panel === 'members' ? (
          <Touch accessibilityLabel="刷新成员" style={styles.refresh} onPress={onRefresh}>
            <Text style={styles.refreshLabel}>刷新</Text>
          </Touch>
        ) : undefined
      }
    >
      {panel === 'reset' ? (
        <ResetInvitationContent
          busy={write.busy}
          uncertain={write.uncertain}
          error={write.error}
          onSubmit={() => {
            void reset();
          }}
          onCancel={() => {
            if (write.uncertain) onRefresh();
            else setPanel('members');
          }}
        />
      ) : (
        <>
          {ledger.members.map((member) => (
            <View key={member.id} style={styles.row}>
              <Text style={styles.name}>
                {member.username}
                {member.userId === userId ? '（我）' : ''}
              </Text>
              <Text style={styles.role}>{member.role === 'CREATOR' ? '创建者' : '成员'}</Text>
            </View>
          ))}
          {canManage && (
            <>
              <Button
                compact
                title="邀请成员"
                onPress={() => {
                  onClose();
                  onInvite();
                }}
              />
              <Button
                compact
                title="重置邀请码"
                variant="secondary"
                onPress={() => {
                  write.reset();
                  setPanel('reset');
                }}
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  name: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  role: { fontSize: 15, lineHeight: 22, color: colors.text },
  refresh: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  refreshLabel: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
