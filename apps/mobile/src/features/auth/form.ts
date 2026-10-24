import type { Resolver } from 'react-hook-form';
import { loginBodySchema, registerBodySchema } from '@tongzhang/contracts';
export interface AuthFormValues {
  account: string;
  email: string;
  password: string;
  confirmation: string;
  acceptTerms: boolean;
}
export const emptyAuthForm: AuthFormValues = {
  account: '',
  email: '',
  password: '',
  confirmation: '',
  acceptTerms: false,
};
export function createAuthResolver(register: boolean): Resolver<AuthFormValues> {
  return async (values) => {
    const parsed = register
      ? registerBodySchema.safeParse({
          username: values.account,
          email: values.email,
          password: values.password,
          acceptTerms: values.acceptTerms,
        })
      : loginBodySchema.safeParse({ account: values.account, password: values.password });
    const errors: Record<string, { type: string; message: string }> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'username' ? 'account' : String(issue.path[0]);
        const message =
          key === 'account'
            ? register
              ? '用户名需要 2–30 个字符'
              : '请输入邮箱或用户名（最多 254 个字符）'
            : key === 'email'
              ? '请输入有效邮箱（最多 254 个字符）'
              : key === 'password'
                ? register
                  ? '密码需要 8–72 个字符，且不能超过 256 字节'
                  : '请输入密码（最多 256 个字符或字节）'
                : '请阅读并同意用户协议与隐私说明';
        errors[key] ??= { type: 'validate', message };
      }
    if (register && values.password !== values.confirmation)
      errors.confirmation = { type: 'validate', message: '两次输入的密码不一致' };
    if (Object.keys(errors).length) return { values: {}, errors };
    return { values, errors: {} };
  };
}
