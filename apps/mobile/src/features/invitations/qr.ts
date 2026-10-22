import { inviteCodeSchema } from '@tongzhang/contracts';
const PREFIX = 'tongzhang:invite:v1:';
export const invitationPayload = (code: string) => PREFIX + inviteCodeSchema.parse(code);
export function parseInvitationPayload(payload: string): string {
  if (!payload.startsWith(PREFIX)) throw new Error('不是同账邀请码');
  return inviteCodeSchema.parse(payload.slice(PREFIX.length));
}
