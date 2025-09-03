export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: '12.2.3 (519615d)';
	};
	public: {
		Tables: {
			pe_appointments: {
				Row: {
					appointment_date: string | null;
					created_at: string;
					created_by: string | null;
					group_id: number | null;
					hour: number;
					id: number;
					notes: string | null;
					package_id: number | null;
					room_id: number;
					series_id: string | null;
					session_number: number | null;
					status: Database['public']['Enums']['appointment_status'] | null;
					total_sessions: number | null;
					trainer_id: number;
					updated_at: string;
				};
				Insert: {
					appointment_date?: string | null;
					created_at?: string;
					created_by?: string | null;
					group_id?: number | null;
					hour: number;
					id?: number;
					notes?: string | null;
					package_id?: number | null;
					room_id: number;
					series_id?: string | null;
					session_number?: number | null;
					status?: Database['public']['Enums']['appointment_status'] | null;
					total_sessions?: number | null;
					trainer_id: number;
					updated_at?: string;
				};
				Update: {
					appointment_date?: string | null;
					created_at?: string;
					created_by?: string | null;
					group_id?: number | null;
					hour?: number;
					id?: number;
					notes?: string | null;
					package_id?: number | null;
					room_id?: number;
					series_id?: string | null;
					session_number?: number | null;
					status?: Database['public']['Enums']['appointment_status'] | null;
					total_sessions?: number | null;
					trainer_id?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'pe_appointments_group_id_fkey';
						columns: ['group_id'];
						isOneToOne: false;
						referencedRelation: 'pe_groups';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pe_appointments_package_id_fkey';
						columns: ['package_id'];
						isOneToOne: false;
						referencedRelation: 'pe_packages';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pe_appointments_room_id_fkey';
						columns: ['room_id'];
						isOneToOne: false;
						referencedRelation: 'pe_rooms';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pe_appointments_trainer_id_fkey';
						columns: ['trainer_id'];
						isOneToOne: false;
						referencedRelation: 'pe_trainers';
						referencedColumns: ['id'];
					}
				];
			};
			pe_groups: {
				Row: {
					created_at: string | null;
					id: number;
					type: Database['public']['Enums']['group_type'];
				};
				Insert: {
					created_at?: string | null;
					id?: number;
					type: Database['public']['Enums']['group_type'];
				};
				Update: {
					created_at?: string | null;
					id?: number;
					type?: Database['public']['Enums']['group_type'];
				};
				Relationships: [];
			};
			pe_package_groups: {
				Row: {
					created_at: string | null;
					group_id: number;
					id: number;
					package_id: number;
				};
				Insert: {
					created_at?: string | null;
					group_id: number;
					id?: number;
					package_id: number;
				};
				Update: {
					created_at?: string | null;
					group_id?: number;
					id?: number;
					package_id?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'pe_package_groups_group_id_fkey';
						columns: ['group_id'];
						isOneToOne: false;
						referencedRelation: 'pe_groups';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pe_package_groups_package_id_fkey';
						columns: ['package_id'];
						isOneToOne: true;
						referencedRelation: 'pe_packages';
						referencedColumns: ['id'];
					}
				];
			};
			pe_packages: {
				Row: {
					created_at: string;
					created_by: string | null;
					description: string | null;
					id: number;
					is_active: boolean | null;
					lessons_per_week: number;
					max_capacity: number;
					name: string;
					package_type: string;
					reschedulable: boolean | null;
					reschedule_limit: number | null;
					updated_at: string;
					weeks_duration: number | null;
				};
				Insert: {
					created_at?: string;
					created_by?: string | null;
					description?: string | null;
					id?: number;
					is_active?: boolean | null;
					lessons_per_week?: number;
					max_capacity?: number;
					name: string;
					reschedulable?: boolean | null;
					reschedule_limit?: number | null;
					package_type?: string;
					updated_at?: string;
					weeks_duration?: number | null;
				};
				Update: {
					created_at?: string;
					created_by?: string | null;
					description?: string | null;
					id?: number;
					is_active?: boolean | null;
					lessons_per_week?: number;
					max_capacity?: number;
					name?: string;
					reschedulable?: boolean | null;
					reschedule_limit?: number | null;
					package_type?: string;
					updated_at?: string;
					weeks_duration?: number | null;
				};
				Relationships: [];
			};
			pe_rooms: {
				Row: {
					capacity: number | null;
					id: number;
					name: string | null;
				};
				Insert: {
					capacity?: number | null;
					id?: number;
					name?: string | null;
				};
				Update: {
					capacity?: number | null;
					id?: number;
					name?: string | null;
				};
				Relationships: [];
			};
			pe_trainee_groups: {
				Row: {
					created_at: string | null;
					group_id: number;
					id: number;
					joined_at: string | null;
					left_at: string | null;
					trainee_id: number;
				};
				Insert: {
					created_at?: string | null;
					group_id: number;
					id?: number;
					joined_at?: string | null;
					left_at?: string | null;
					trainee_id: number;
				};
				Update: {
					created_at?: string | null;
					group_id?: number;
					id?: number;
					joined_at?: string | null;
					left_at?: string | null;
					trainee_id?: number;
				};
				Relationships: [
					{
						foreignKeyName: 'pe_trainee_groups_group_id_fkey';
						columns: ['group_id'];
						isOneToOne: false;
						referencedRelation: 'pe_groups';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'pe_trainee_groups_trainee_id_fkey';
						columns: ['trainee_id'];
						isOneToOne: false;
						referencedRelation: 'pe_trainees';
						referencedColumns: ['id'];
					}
				];
			};
			pe_trainees: {
				Row: {
					created_at: string | null;
					email: string | null;
					id: number;
					name: string;
					notes: string | null;
					phone: string;
				};
				Insert: {
					created_at?: string | null;
					email?: string | null;
					id?: number;
					name: string;
					notes?: string | null;
					phone: string;
				};
				Update: {
					created_at?: string | null;
					email?: string | null;
					id?: number;
					name?: string;
					notes?: string | null;
					phone?: string;
				};
				Relationships: [];
			};
			pe_trainers: {
				Row: {
					id: number;
					is_active: boolean | null;
					name: string | null;
					phone: string;
					trainer_user_id: string | null;
				};
				Insert: {
					id?: number;
					is_active?: boolean | null;
					name?: string | null;
					phone: string;
					trainer_user_id?: string | null;
				};
				Update: {
					id?: number;
					is_active?: boolean | null;
					name?: string | null;
					phone?: string;
					trainer_user_id?: string | null;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			gbt_bit_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_bool_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_bool_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_bpchar_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_bytea_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_cash_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_cash_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_date_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_date_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_decompress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_enum_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_enum_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_float4_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_float4_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_float8_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_float8_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_inet_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int2_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int2_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int4_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int4_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int8_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_int8_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_intv_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_intv_decompress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_intv_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_macad_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_macad_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_macad8_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_macad8_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_numeric_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_oid_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_oid_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_text_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_time_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_time_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_timetz_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_ts_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_ts_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_tstz_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_uuid_compress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_uuid_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_var_decompress: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbt_var_fetch: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey_var_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey_var_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey16_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey16_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey2_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey2_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey32_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey32_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey4_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey4_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey8_in: {
				Args: { '': unknown };
				Returns: unknown;
			};
			gbtreekey8_out: {
				Args: { '': unknown };
				Returns: unknown;
			};
			get_coordinator_reschedule_count: {
				Args: { user_id: string };
				Returns: number;
			};
			populate_default_weekly_schedules: {
				Args: Record<PropertyKey, never>;
				Returns: undefined;
			};
		};
		Enums: {
			appointment_status: 'scheduled' | 'completed' | 'cancelled';
			day_of_week:
				| 'monday'
				| 'tuesday'
				| 'wednesday'
				| 'thursday'
				| 'friday'
				| 'saturday'
				| 'sunday';
			group_type: 'individual' | 'fixed' | 'dynamic';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema['Tables']
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema['Enums']
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema['CompositeTypes']
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {
			appointment_status: ['scheduled', 'completed', 'cancelled'],
			day_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
			group_type: ['individual', 'fixed', 'dynamic']
		}
	}
} as const;
