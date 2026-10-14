import type { SupabaseClientType } from '$lib/types/Supabase';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import { normalizePhoneNumber } from '$lib/utils/phone-utils';

export type TraineeInput = {
	name: string;
	phone: string;
	email: string | null;
	notes: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIQUE_VIOLATION = '23505';

/**
 * Trainee records. Both the trainee list and the trainee page write through here, so a
 * trainee is validated the same way wherever it is created or edited.
 */
export class TraineeRepository {
	constructor(private supabase: SupabaseClientType) {}

	/** Reads and validates the trainee form; returns an error message when it is invalid. */
	static parseForm(formData: FormData): TraineeInput | string {
		const phone = normalizePhoneNumber(getRequiredFormDataString(formData, 'phone'));
		if (!phone) return 'Telefon numarası 10 haneli olmalıdır (ör. 555 123 45 67)';

		const email = getFormDataString(formData, 'email').trim() || null;
		if (email && !EMAIL_PATTERN.test(email)) return 'Geçerli bir e-posta adresi girin';

		return {
			name: getRequiredFormDataString(formData, 'name').trim(),
			phone,
			email,
			notes: getFormDataString(formData, 'notes').trim() || null
		};
	}

	async create(input: TraineeInput): Promise<string | null> {
		const { error } = await this.supabase
			.from('pe_trainees')
			.insert({ id: crypto.randomUUID(), ...input });
		return error ? this.describe(error, 'Öğrenci oluşturulurken hata') : null;
	}

	async update(traineeId: string, input: TraineeInput): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('pe_trainees')
			.update(input)
			.eq('id', traineeId)
			.select('id');
		if (error) return this.describe(error, 'Öğrenci güncellenirken hata');
		return (data ?? []).length === 0 ? 'Öğrenci bulunamadı' : null;
	}

	/** Archives (false) or restores (true) a trainee. */
	async setActive(traineeId: string, active: boolean): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('pe_trainees')
			.update({ is_active: active })
			.eq('id', traineeId)
			.select('id');
		if (error) {
			return (
				(active ? 'Öğrenci geri yüklenirken hata: ' : 'Öğrenci arşivlenirken hata: ') +
				error.message
			);
		}
		return (data ?? []).length === 0 ? 'Öğrenci bulunamadı' : null;
	}

	private describe(error: { code: string; message: string }, prefix: string): string {
		return error.code === UNIQUE_VIOLATION
			? 'Bu e-posta adresiyle kayıtlı başka bir öğrenci var'
			: `${prefix}: ${error.message}`;
	}
}
