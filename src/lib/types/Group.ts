import type { Tables, TablesInsert, TablesUpdate } from '$lib/database.types';

export type Group = Tables<'pe_groups'>;
export type GroupInsert = TablesInsert<'pe_groups'>;
export type GroupUpdate = TablesUpdate<'pe_groups'>;

export type TraineeGroup = Tables<'pe_trainee_groups'>;
export type TraineeGroupInsert = TablesInsert<'pe_trainee_groups'>;
export type TraineeGroupUpdate = TablesUpdate<'pe_trainee_groups'>;

export type PackageGroup = Tables<'pe_package_groups'>;
export type PackageGroupInsert = TablesInsert<'pe_package_groups'>;

// Helper type for trainee group relationships
export type TraineeGroupWithTrainee = TraineeGroup & {
	pe_trainees: {
		id: number;
		name: string;
		email?: string;
	};
};

// Extended types with relationships
export type GroupWithMembers = Group & {
	pe_trainee_groups?: TraineeGroupWithTrainee[];
	active_member_count?: number;
};

export type GroupType = 'individual' | 'fixed' | 'dynamic';

// Helper type for group creation
export type GroupCreationData = {
	type: GroupType;
	trainee_ids: number[];
};
