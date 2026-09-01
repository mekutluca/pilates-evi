import type { Purchase } from '$lib/types';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type { ExtensionChunk, ExtensionResult } from '$lib/types/Extension';

/**
 * Data access for pe_purchases. Successor chains (purchase → extension →
 * extension…) are resolved by the pe_purchase_chain recursive-CTE RPC in a
 * single round-trip instead of one query per link.
 */
export class PurchaseRepository {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * Every purchase id reachable from the given one by following successor_id
	 * links, starting with the given id itself. Returns [purchaseId] when the
	 * purchase has no successors; [] only when the id doesn't exist.
	 */
	async getSuccessorChain(purchaseId: string): Promise<string[]> {
		const { data, error } = await this.supabase.rpc('pe_purchase_chain', {
			p_purchase_id: purchaseId
		});
		if (error) {
			throw new Error(`Satın alma zinciri alınamadı: ${error.message}`);
		}
		return data && data.length > 0 ? data : [purchaseId];
	}

	/** The last purchase in the successor chain (the one without a successor). */
	async findLastInChain(purchaseId: string): Promise<Purchase | null> {
		const chain = await this.getSuccessorChain(purchaseId);
		const lastId = chain[chain.length - 1];

		const { data, error } = await this.supabase
			.from('pe_purchases')
			.select('*')
			.eq('id', lastId)
			.single();

		if (error || !data) {
			console.error('Error fetching purchase in chain:', error);
			return null;
		}
		return data;
	}

	/**
	 * Extends the chain ending at `predecessorId` with one new purchase per
	 * chunk — including successor links, appointments (private) or enrollments
	 * into existing group appointments — in a single transaction. A failure
	 * anywhere rolls the whole extension back (no orphan rows).
	 */
	async extend(
		predecessorId: string,
		rescheduleLeft: number,
		chunks: ExtensionChunk[]
	): Promise<ExtensionResult> {
		const { data, error } = await this.supabase.rpc('pe_extend_purchase', {
			p_predecessor_id: predecessorId,
			p_reschedule_left: rescheduleLeft,
			p_chunks: chunks
		});
		if (error) {
			throw new Error(`Uzatma işlemi başarısız: ${error.message}`);
		}
		return data;
	}

	/**
	 * Atomically consumes one reschedule credit (999 = unlimited, never
	 * decremented). Returns the remaining count, or null when nothing was
	 * consumed (unlimited, exhausted, or unknown purchase).
	 */
	async decrementRescheduleLeft(purchaseId: string): Promise<number | null> {
		const { data, error } = await this.supabase.rpc('pe_decrement_reschedule', {
			p_purchase_id: purchaseId
		});
		if (error) {
			throw new Error(`Randevu hakkı güncellenemedi: ${error.message}`);
		}
		return data;
	}
}
