export interface Trainer {
	id: string;
	trainer_user_id: string | null;
	name: string;
	phone: string;
}

export type CreateTrainerInput = Pick<Trainer, 'name' | 'phone'>;
export type UpdateTrainerInput = Partial<CreateTrainerInput> & { id: string };