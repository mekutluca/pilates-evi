import type { DbErrorLike, SupabaseClientType } from '$lib/types/Supabase';
import type { TraineeInput } from '$lib/types';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import { normalizePhoneNumber, PHONE_ERROR } from '$lib/utils/phone-utils';
import { dbErrorMessage } from '$lib/server/db-errors';

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
		if (!phone) return PHONE_ERROR;

		const email = getFormDataString(formData, 'email').trim() || null;
		if (email && !EMAIL_PATTERN.test(email)) return 'Geçerli bir e-posta adresi girin';

		return {
			name: getRequiredFormDataString(formData, 'name').trim(),
			phone,
			email,
			notes: getFormDataString(formData, 'notes').trim() || null
		};
	}

	/** Creates a trainee (with `id` when the caller needs it); returns an error message. */
	async create(input: TraineeInput, id: string = crypto.randomUUID()): Promise<string | null> {
		const { error } = await this.supabase.from('pe_trainees').insert({ id, ...input });
		return error ? this.describe(error, 'Öğrenci kaydedilemedi. Tekrar deneyin.') : null;
	}

	async update(traineeId: string, input: TraineeInput): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('pe_trainees')
			.update(input)
			.eq('id', traineeId)
			.select('id');
		if (error) return this.describe(error, 'Öğrenci kaydedilemedi. Tekrar deneyin.');
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
			return dbErrorMessage(
				error,
				active
					? 'Öğrenci geri yüklenemedi. Tekrar deneyin.'
					: 'Öğrenci arşivlenemedi. Tekrar deneyin.'
			);
		}
		return (data ?? []).length === 0 ? 'Öğrenci bulunamadı' : null;
	}

	private describe(error: DbErrorLike, fallback: string): string {
		return error.code === UNIQUE_VIOLATION
			? 'Bu e-posta adresiyle kayıtlı başka bir öğrenci var'
			: dbErrorMessage(error, fallback);
	}
}
