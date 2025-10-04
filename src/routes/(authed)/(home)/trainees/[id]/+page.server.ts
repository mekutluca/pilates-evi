import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { TraineePurchaseMembership, Package } from '$lib/types';
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

	// Get trainee's team memberships (purchases they're part of)
	const { data: teamMemberships, error: teamError } = await supabase
		.from('pe_teams')
		.select(
			`
			id,
			trainee_id
		`
		)
		.eq('trainee_id', traineeId);

	if (teamError) {
		console.error('Error fetching team memberships:', teamError);
		throw error(500, 'Üyelik bilgileri yüklenirken hata oluştu');
	}

	const teamIds = teamMemberships?.map((tm) => tm.id) || [];

	// Get purchases for these teams with all related data
	const { data: purchaseMemberships, error: purchaseError } = await supabase
		.from('pe_purchases')
		.select(
			`
			id,
			created_at,
			team_id,
			successor_id,
			reschedule_left,
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
			)
		`
		)
		.in('team_id', teamIds)
		.order('created_at', { ascending: false });

	// Get all purchases that are part of chains involving this trainee's purchases
	const directPurchaseIds = purchaseMemberships?.map((p) => p.id) || [];

	// Get all purchases to build complete chains
	const { data: allPurchases, error: allPurchasesError } = await supabase.from('pe_purchases')
		.select(`
			id,
			created_at,
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
	interface PurchaseForChain {
		id: string;
		created_at: string;
		successor_id: string | null;
		pe_packages: { id: string; name: string; package_type: string } | null;
	}

	const findChainForPurchase = (purchaseId: string, purchases: PurchaseForChain[]): string[] => {
		const visited = new Set<string>();
		const chain: string[] = [];

		// First, find the root of this chain (go backwards)
		let current = purchaseId;
		const reverseChain = [current];

		// Find any purchase that has current as successor (parent)
		while (true) {
			const parent = purchases.find((p) => p.successor_id === current);
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
			const currentPurchase = purchases.find((p) => p.id === current);
			const successor = currentPurchase?.successor_id;
			if (!successor || visited.has(successor)) break;
			visited.add(successor);
			chain.push(successor);
			current = successor;
		}

		return chain;
	};

	// Get all purchase IDs that are part of chains involving this trainee
	const allTraineeChainPurchaseIds = new Set<string>();
	directPurchaseIds.forEach((purchaseId) => {
		const chainIds = findChainForPurchase(purchaseId, allPurchases || []);
		chainIds.forEach((id) => allTraineeChainPurchaseIds.add(id));
	});

	// Build purchase chains using successor relationships
	const buildPurchaseChain = (
		purchaseId: string,
		purchases: PurchaseForChain[]
	): PurchaseForChain[] => {
		const chain: PurchaseForChain[] = [];
		let currentPurchaseId: string | null = purchaseId;

		while (currentPurchaseId) {
			const purchaseData = purchases.find((p) => p.id === currentPurchaseId);
			if (!purchaseData) break;

			chain.push(purchaseData);
			currentPurchaseId = purchaseData.successor_id;
		}

		return chain;
	};

	// Transform to match the expected frontend structure
	const groupMembershipsWithPackages: TraineePurchaseMembership[] = [];
	const processedPurchaseIds = new Set<string>();

	if (purchaseMemberships) {
		// Process each purchase the trainee is involved in
		for (const purchase of purchaseMemberships) {
			if (purchase.pe_packages && !processedPurchaseIds.has(purchase.id)) {
				// Mark this purchase as processed
				processedPurchaseIds.add(purchase.id);

				// Get the purchase chain for this purchase
				const purchaseChain = buildPurchaseChain(purchase.id, allPurchases || []);

				// Create entries for each purchase in the chain
				purchaseChain.forEach((chainPurchase, index) => {
					groupMembershipsWithPackages.push({
						id: `${purchase.team_id}-${chainPurchase.id}`,
						trainee_id: traineeId.toString(),
						pe_purchases: {
							id: chainPurchase.id,
							created_at: chainPurchase.created_at,
							successor_id: chainPurchase.successor_id,
							reschedule_left: index === 0 ? purchase.reschedule_left : null,
							pe_packages: chainPurchase.pe_packages as Package | null
						},
						package: chainPurchase.pe_packages as Package | null,
						joined_at: purchase.created_at,
						left_at: null, // Will be determined by appointments
						purchase_id: chainPurchase.id,
						purchase_end_date: null,
						is_extension: index > 0,
						extension_number: index > 0 ? index : undefined
					});
				});
			}
		}
	}

	if (purchaseError) {
		console.error('Error fetching purchase memberships:', purchaseError);
	}

	// Get appointments for this trainee via appointment_trainees
	const today = new Date().toISOString().split('T')[0];
	const { data: traineeAppointmentRelations, error: appointmentsError } = await supabase
		.from('pe_appointment_trainees')
		.select(
			`
			appointment_id,
			pe_appointments!inner (
				id,
				date,
				purchase_id
			)
		`
		)
		.eq('trainee_id', traineeId);

	if (appointmentsError) {
		console.error('Error fetching trainee appointments:', appointmentsError);
	}

	// Create a set of purchase IDs that have future appointments for this trainee
	const futureAppointments =
		traineeAppointmentRelations?.filter(
			(rel) => rel.pe_appointments && rel.pe_appointments.date && rel.pe_appointments.date >= today
		) || [];

	const purchaseIdsWithFutureAppointments = new Set(
		futureAppointments
			.map((rel) => rel.pe_appointments?.purchase_id)
			.filter((id): id is string => !!id)
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
