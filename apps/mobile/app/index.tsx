import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'authenticated' ? '/ledgers' : '/welcome'} />;
}
