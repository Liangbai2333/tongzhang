import { formatInviteQrPayload, parseInviteQrPayload } from '@tongzhang/contracts';
export const invitationPayload = formatInviteQrPayload;
export function parseInvitationPayload(payload: unknown): string {
  return parseInviteQrPayload(payload);
}
