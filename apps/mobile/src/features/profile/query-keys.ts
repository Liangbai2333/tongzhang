export const profileKeys = {
  root: (userId: string) => ['user', userId, 'profile'] as const,
  notifications: (userId: string, unreadOnly = false) =>
    ['user', userId, 'notifications', unreadOnly ? 'unread' : 'all'] as const,
};
