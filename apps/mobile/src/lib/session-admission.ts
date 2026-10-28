import { ApiError } from './api-error';

// Credentials may exist while getMe is still pending. Only the controller's
// verified state admits business requests, including delayed upload continuations.
let admitted = false;
export const sessionAdmission = {
  set(value: boolean) {
    admitted = value;
  },
  require() {
    if (!admitted) throw new ApiError('SESSION_VERIFICATION_REQUIRED', '请先登录并完成在线核验');
  },
};
