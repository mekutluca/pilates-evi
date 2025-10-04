import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { Tables } from '$lib/database.types';
import type { TraineePurchaseMembership } from '$lib/types';
import { getRequiredFormDataString } from '$lib/utils';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const traineeId = Number(params.id);

	if (isNaN(traineeId)) {
		throw error(400, 'Geçersiz öğrenci ID');
	}

	// Get trainee details
	const { data: trainee, error: traineeError } = await supabase
		.from('pe_trainees')
		.select('*')
		.eq('id', traineeId)
		.single();

	if (traineeError || !trainee) {
		throw error(404, 'Öğrenci bulunamadı');
	}

	// Get trainee's purchase memberships with package details including successor relationships
	const { data: purchaseMemberships, error: purchaseError } = await supabase
		.from('pe_purchase_trainees')
		.select(
			`
			*,
			pe_purchases (
				*,
				successor_id,
				pe_packages (
					id,
					name,
					description,
					weeks_duration,
					lessons_per_week,
					max_capacity,
					package_type,
					reschedulable,
					reschedule_limit,
					created_at
				),
				pe_rooms (
					id,
					name
				),
				pe_trainers (
					id,
					name
				)
			)
		`
		)
		.eq('trainee_id', traineeId)
		.order('id', { ascending: false });

	// Get all purchases that this trainee is involved in (including extensions where trainee might not be directly linked)
	// First get purchases where trainee is directly linked
	const { data: directPurchases, error: directPurchasesError } = await supabase
		.from('pe_purchase_trainees')
		.select(`
			trainee_id,
			pe_purchases!inner (
				id,
				start_date,
				end_date,
				successor_id,
				pe_packages (
					id,
					name,
					package_type
				)
			)
		`)
		.eq('trainee_id', traineeId);

	if (directPurchasesError) {
		console.error('Error fetching direct purchases for trainee:', directPurchasesError);
	}

	// Get all purchases that are in the same chains (including extensions)
	const directPurchaseIds = directPurchases?.map(p => p.pe_purchases.id) || [];

	// Now get all purchases that are part of chains starting from or including direct purchases
	const { data: allRelatedPurchases, error: allPurchasesError } = await supabase
		.from('pe_purchases')
		.select(`
			id,
			start_date,
			end_date,
			successor_id,
			pe_packages (
				id,
				name,
				package_type
			)
		`);

	if (allPurchasesError) {
		console.error('Error fetching all purchases:', allPurchasesError);
	}

	// Build complete chains including extensions for this trainee
	const findChainForPurchase = (purchaseId: number, allPurchases: any[]): number[] => {
		const visited = new Set<number>();
		const chain = [];

		// First, find the root of this chain (go backwards)
		let current = purchaseId;
		const reverseChain = [current];

		// Find any purchase that has current as successor (parent)
		while (true) {
			const parent = allPurchases.find(p => p.successor_id === current);
			if (!parent || visited.has(parent.id)) break;
			visited.add(parent.id);
			current = parent.id;
			reverseChain.unshift(current);
		}

		// Now start from the root and follow successors forward
		current = reverseChain[0];
		chain.push(current);
		visited.clear();
		visited.add(current);

		while (true) {
			const successor = allPurchases.find(p => p.id === current)?.successor_id;
			if (!successor || visited.has(successor)) break;
			visited.add(successor);
			chain.push(successor);
			current = successor;
		}

		return chain;
	};

	// Get all purchase IDs that are part of chains involving this trainee
	const allTraineeChainPurchaseIds = new Set<number>();
	directPurchaseIds.forEach(purchaseId => {
		const chainIds = findChainForPurchase(purchaseId, allRelatedPurchases || []);
		chainIds.forEach(id => allTraineeChainPurchaseIds.add(id));
	});


	// Filter related purchases to only those in trainee's chains
	const allPurchasesForTrainee = allRelatedPurchases?.filter(purchase =>
		allTraineeChainPurchaseIds.has(purchase.id)
	).map(purchase => ({
		trainee_id: traineeId,
		pe_purchases: purchase
	})) || [];

	// Build purchase chains using successor relationships
	const buildPurchaseChain = (purchaseId: number, allPurchases: any[]): any[] => {
		const chain = [];
		let currentPurchaseId = purchaseId;

		while (currentPurchaseId) {
			const purchaseData = allPurchases.find(p => p.pe_purchases.id === currentPurchaseId);
			if (!purchaseData) break;

			chain.push(purchaseData.pe_purchases);
			currentPurchaseId = purchaseData.pe_purchases.successor_id;
		}

		return chain;
	};

	// Transform to match the expected frontend structure
	// Each pe_purchase_trainees entry represents a distinct membership period (join -> leave or join -> ongoing)
	const groupMembershipsWithPackages: TraineePurchaseMembership[] = [];
	const processedMembershipIds = new Set<number>(); // Track processed membership entries, not purchases

	if (purchaseMemberships && allPurchasesForTrainee) {
		// Process each membership entry individually
		// This handles cases where a trainee leaves and rejoins the same purchase
		for (const membership of purchaseMemberships) {
			if (membership.pe_purchases && !processedMembershipIds.has(membership.id)) {
				// Mark this specific membership entry as processed
				processedMembershipIds.add(membership.id);

				// Get the purchase chain for this membership's purchase
				const purchaseChain = buildPurchaseChain(membership.pe_purchases.id, allPurchasesForTrainee);

				// For the specific membership entry, create entries for the purchase chain
				purchaseChain.forEach((purchase, index) => {
					groupMembershipsWithPackages.push({
						...membership,
						package: membership.pe_purchases.pe_packages || null,
						joined_at: index === 0 ? membership.start_date || membership.pe_purchases.start_date || new Date().toISOString() : purchase.start_date,
						left_at: index === 0 ? membership.end_date : null, // Only first purchase respects trainee departure
						purchase_id: purchase.id,
						purchase_end_date: purchase.end_date,
						is_extension: index > 0,
						extension_number: index > 0 ? index : undefined,
						id: `${membership.id}-${index}` // Unique ID based on membership entry and chain position
					});
				});
			}
		}
	}

	if (purchaseError) {
		console.error('Error fetching purchase memberships:', purchaseError);
	}

	// Get future appointments for this trainee to determine truly active purchases
	const today = new Date().toISOString().split('T')[0];
	const { data: futureAppointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(`
			purchase_id,
			appointment_date,
			status,
			pe_purchases!inner(
				pe_purchase_trainees!inner(trainee_id)
			)
		`)
		.eq('pe_purchases.pe_purchase_trainees.trainee_id', traineeId)
		.gte('appointment_date', today)
		.eq('status', 'scheduled');

	if (appointmentsError) {
		console.error('Error fetching future appointments:', appointmentsError);
	}

	// Create a set of purchase IDs that have future appointments for this trainee
	const purchaseIdsWithFutureAppointments = new Set(
		futureAppointments?.map(apt => apt.purchase_id) || []
	);

	return {
		trainee,
		groupMemberships: groupMembershipsWithPackages || [],
		purchaseIdsWithFutureAppointments: Array.from(purchaseIdsWithFutureAppointments)
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals: { supabase } }) => {
		const traineeId = Number(params.id);

		if (isNaN(traineeId)) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const formData = await request.formData();
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		const email = formData.get('email')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		const { error: updateError } = await supabase
			.from('pe_trainees')
			.update({
				name,
				phone,
				email,
				notes
			})
			.eq('id', traineeId);

		if (updateError) {
			console.error('Error updating trainee:', updateError);
			return fail(500, { message: 'Öğrenci güncellenirken hata oluştu' });
		}

		return { success: true };
	},

	removeFromGroup: async ({ request, params, locals: { supabase, user, userRole } }) => {
		// Check permissions - only admin and coordinator can remove trainees from groups
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const traineeId = Number(params.id);

		if (isNaN(traineeId)) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const formData = await request.formData();
		const purchaseIdStr = formData.get('purchase_id')?.toString();

		if (!purchaseIdStr) {
			return fail(400, { message: 'Grup seçimi gereklidir' });
		}

		const purchaseId = Number(purchaseIdStr);

		if (isNaN(purchaseId)) {
			return fail(400, { message: 'Geçersiz grup ID' });
		}

		// Verify that the trainee is actually in this purchase group and is active
		const { data: existingMembership, error: membershipError } = await supabase
			.from('pe_purchase_trainees')
			.select('*, pe_purchases(pe_packages(name, package_type))')
			.eq('trainee_id', traineeId)
			.eq('purchase_id', purchaseId)
			.is('end_date', null)
			.single();

		if (membershipError || !existingMembership) {
			return fail(404, { message: 'Öğrenci bu grupta aktif değil' });
		}

		// Only allow removal from group packages
		if (existingMembership.pe_purchases?.pe_packages?.package_type !== 'group') {
			return fail(400, { message: 'Sadece grup derslerinden çıkarılabilir' });
		}

		// Set end_date to today to remove the trainee from the group
		const today = new Date().toISOString().split('T')[0];

		const { error: removalError } = await supabase
			.from('pe_purchase_trainees')
			.update({ end_date: today })
			.eq('trainee_id', traineeId)
			.eq('purchase_id', purchaseId)
			.is('end_date', null);

		if (removalError) {
			console.error('Error removing trainee from group:', removalError);
			return fail(500, { message: 'Öğrenci gruptan çıkarılırken hata oluştu' });
		}

		const packageName = existingMembership.pe_purchases?.pe_packages?.name || 'gruptan';
		return {
			success: true,
			message: `Öğrenci "${packageName}" dersinden başarıyla çıkarıldı`
		};
	},

	archiveTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		// Check permissions - only admin and coordinator can archive trainees
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const traineeId = Number(params.id);

		if (isNaN(traineeId)) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const { error: archiveError } = await supabase
			.from('pe_trainees')
			.update({ is_active: false })
			.eq('id', traineeId);

		if (archiveError) {
			console.error('Error archiving trainee:', archiveError);
			return fail(500, { message: 'Öğrenci arşivlenirken hata oluştu' });
		}

		return { success: true, message: 'Öğrenci başarıyla arşivlendi' };
	},

	restoreTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		// Check permissions - only admin and coordinator can restore trainees
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const traineeId = Number(params.id);

		if (isNaN(traineeId)) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const { error: restoreError } = await supabase
			.from('pe_trainees')
			.update({ is_active: true })
			.eq('id', traineeId);

		if (restoreError) {
			console.error('Error restoring trainee:', restoreError);
			return fail(500, { message: 'Öğrenci geri yüklenirken hata oluştu' });
		}

		return { success: true, message: 'Öğrenci başarıyla geri yüklendi' };
	}
};
