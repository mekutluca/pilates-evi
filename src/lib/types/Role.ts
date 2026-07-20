// Re-export from consolidated types
import type { Role } from './index';

export type { Role } from './index';

/** Turkish display names for the stripped (non-`pe_`-prefixed) roles */
export const roleLabels: Record<Role, string> = {
	admin: 'Admin',
	coordinator: 'Koordinatör',
	trainer: 'Eğitmen',
	trainee: 'Öğrenci'
};
