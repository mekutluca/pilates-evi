import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { GroupType, GroupCreationData } from '$lib/types/Group';

export async function findOrCreateGroup(
	supabase: SupabaseClient<Database>,
	data: GroupCreationData,
	packageType: 'fixed' | 'dynamic'
): Promise<{ group_id: number; created: boolean; error?: string }> {
	try {
		// For dynamic packages, always create a new group
		if (packageType === 'dynamic') {
			const result = await createGroup(supabase, data);
			return { group_id: result.group_id, created: true, error: result.error };
		}

		// For fixed packages, check if group with same members exists
		if (packageType === 'fixed') {
			const existingGroup = await findExistingFixedGroup(supabase, data.trainee_ids);
			if (existingGroup) {
				return { group_id: existingGroup, created: false };
			}

			// No existing group found, create new one
			const result = await createGroup(supabase, data);
			return { group_id: result.group_id, created: true, error: result.error };
		}

		return { group_id: -1, created: false, error: 'Invalid package type' };
	} catch (error) {
		return {
			group_id: -1,
			created: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

async function findExistingFixedGroup(
	supabase: SupabaseClient<Database>,
	traineeIds: number[]
): Promise<number | null> {
	// Get all fixed groups with the same number of active members
	const { data: groups, error } = await supabase
		.from('pe_groups')
		.select(
			`
			id,
			pe_trainee_groups!inner(trainee_id)
		`
		)
		.eq('type', 'fixed');

	if (error || !groups) {
		console.error('Error finding existing fixed groups:', error);
		return null;
	}

	// Filter groups that have exactly the same member set
	for (const group of groups) {
		const groupMembers = group.pe_trainee_groups || [];
		const groupTraineeIds = groupMembers.map((tg) => tg.trainee_id).sort();
		const sortedTraineeIds = [...traineeIds].sort();

		// Check if arrays are identical
		if (
			groupTraineeIds.length === sortedTraineeIds.length &&
			groupTraineeIds.every((id, index) => id === sortedTraineeIds[index])
		) {
			return group.id;
		}
	}

	return null;
}

async function createGroup(
	supabase: SupabaseClient<Database>,
	data: GroupCreationData
): Promise<{ group_id: number; error?: string }> {
	// Determine group type based on trainee count and package type
	let groupType: GroupType = data.type;
	if (data.trainee_ids.length === 1) {
		groupType = 'individual';
	} else if (data.type === 'fixed') {
		groupType = 'fixed';
	}

	// Create the group
	const { data: groupData, error: groupError } = await supabase
		.from('pe_groups')
		.insert({
			type: groupType
		})
		.select('id')
		.single();

	if (groupError || !groupData) {
		return { group_id: -1, error: groupError?.message || 'Failed to create group' };
	}

	// Add trainees to the group
	if (data.trainee_ids.length > 0) {
		const traineeGroups = data.trainee_ids.map((traineeId) => ({
			trainee_id: traineeId,
			group_id: groupData.id,
			joined_at: new Date().toISOString()
		}));

		const { error: traineeGroupsError } = await supabase
			.from('pe_trainee_groups')
			.insert(traineeGroups);

		if (traineeGroupsError) {
			// Rollback: delete the group
			await supabase.from('pe_groups').delete().eq('id', groupData.id);
			return { group_id: -1, error: traineeGroupsError.message };
		}
	}

	return { group_id: groupData.id };
}
