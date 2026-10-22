export const profileKeys = {
  root: (userId: string) => ['user', userId, 'profile'] as const,
};
