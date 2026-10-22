import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createExpenseBodySchema } from '@tongzhang/contracts';
import type { z } from 'zod';
export function useExpenseForm() {
  return useForm<
    z.input<typeof createExpenseBodySchema>,
    unknown,
    z.output<typeof createExpenseBodySchema>
  >({ resolver: zodResolver(createExpenseBodySchema), mode: 'onSubmit' });
}
