import { useIdempotentWrite } from '@/lib/use-idempotent-write';
import { invitationsApi } from './api';

export function useInvitationReset(ledgerId: string) {
  const write = useIdempotentWrite();
  return {
    ...write,
    submit: () =>
      write.submit({ ledgerId }, (key) =>
        invitationsApi.resetInvitation(
          { params: { ledgerId }, query: {}, body: undefined },
          { idempotencyKey: key },
        ),
      ),
  };
}
