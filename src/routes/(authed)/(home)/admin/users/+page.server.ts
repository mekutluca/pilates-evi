import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { admin, user, userRole } }) => {
    // Ensure only admin users can access this page
    if (!user || userRole !== 'admin') {
        throw error(403, 'Bu sayfaya erişim yetkiniz yok');
    }

    try {
        // Fetch users using Supabase admin API
        const { data: usersData, error: usersError } = await admin.auth.admin.listUsers(
            {
                page: 1,
                perPage: 1000
            }
        );

        if (usersError) {
            throw error(500, 'Kullanıcılar yüklenirken hata oluştu: ' + usersError.message);
        }


        // Transform the data to match our interface
        const users = usersData.users
            .filter(user => user.role === 'pe_admin' || user.role === 'pe_coordinator')
            .map((user) => {
                // Strip the 'pe_' prefix from role for display
                const displayRole = user.role?.replace('pe_', '') || 'coordinator';
                return {
                    id: user.id,
                    email: user.email || '',
                    fullName: user.user_metadata?.fullName || '',
                    role: displayRole,
                    created_at: user.created_at,
                    last_sign_in_at: user.last_sign_in_at,
                };
            });

        return {
            users
        };
    } catch (err) {
        console.error('Error loading users:', err);
        throw error(500, 'Kullanıcılar yüklenirken hata oluştu');
    }
};

export const actions: Actions = {
    createUser: async ({ request, locals: { admin, user, userRole } }) => {
        // Ensure only admin users can perform this action
        if (!user || userRole !== 'admin') {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

        try {
            const formData = await request.formData();
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;
            const fullName = formData.get('fullName') as string;
            const role = formData.get('role') as string;

            // Validate required fields
            if (!email || !password || !fullName || !role) {
                return fail(400, {
                    success: false,
                    message: 'Tüm alanlar gereklidir'
                });
            }

            // Validate role
            if (!['admin', 'coordinator'].includes(role)) {
                return fail(400, {
                    success: false,
                    message: 'Geçersiz rol seçimi'
                });
            }

            // Create user using Supabase admin API (prefix role with 'pe_')
            const { error: createError } = await admin.auth.admin.createUser({
                email,
                password,
                user_metadata: { fullName },
                email_confirm: true,
                role: `pe_${role}`
            });

            if (createError) {
                return fail(500, {
                    success: false,
                    message: 'Kullanıcı oluşturulurken hata: ' + createError.message
                });
            }


            return {
                success: true,
                message: 'Kullanıcı başarıyla oluşturuldu'
            };
        } catch (err) {
            console.error('Error creating user:', err);
            return fail(500, {
                success: false,
                message: 'Kullanıcı oluşturulurken hata oluştu'
            });
        }
    },

    updateUser: async ({ request, locals: { admin, user, userRole } }) => {
        // Ensure only admin users can perform this action
        if (!user || userRole !== 'admin') {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

        try {
            const formData = await request.formData();
            const userId = formData.get('userId') as string;
            const email = formData.get('email') as string;
            const fullName = formData.get('fullName') as string;
            const role = formData.get('role') as string;

            // Validate required fields
            if (!userId || !email || !fullName || !role) {
                return fail(400, {
                    success: false,
                    message: 'Tüm alanlar gereklidir'
                });
            }

            // Validate role
            if (!['admin', 'coordinator'].includes(role)) {
                return fail(400, {
                    success: false,
                    message: 'Geçersiz rol seçimi'
                });
            }

            // Update user using Supabase admin API (prefix role with 'pe_')
            const updateData: any = {
                user_metadata: { fullName },
                role: `pe_${role}`
            };

            const { error: updateError } = await admin.auth.admin.updateUserById(userId, updateData);

            if (updateError) {
                return fail(500, {
                    success: false,
                    message: 'Kullanıcı güncellenirken hata: ' + updateError.message
                });
            }


            return {
                success: true,
                message: 'Kullanıcı başarıyla güncellendi'
            };
        } catch (err) {
            console.error('Error updating user:', err);
            return fail(500, {
                success: false,
                message: 'Kullanıcı güncellenirken hata oluştu'
            });
        }
    },

    resetPassword: async ({ request, locals: { admin, user, userRole } }) => {
        // Ensure only admin users can perform this action
        if (!user || userRole !== 'admin') {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

        try {
            const formData = await request.formData();
            const userId = formData.get('userId') as string;
            const newPassword = formData.get('newPassword') as string;

            // Validate required fields
            if (!userId || !newPassword) {
                return fail(400, {
                    success: false,
                    message: 'Kullanıcı ID ve yeni şifre gereklidir'
                });
            }

            // Validate password length
            if (newPassword.length < 6) {
                return fail(400, {
                    success: false,
                    message: 'Şifre en az 6 karakter olmalıdır'
                });
            }

            // Update user password using Supabase admin API
            const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
                password: newPassword
            });

            if (updateError) {
                return fail(500, {
                    success: false,
                    message: 'Şifre sıfırlanırken hata: ' + updateError.message
                });
            }

            return {
                success: true,
                message: 'Şifre başarıyla sıfırlandı'
            };
        } catch (err) {
            console.error('Error resetting password:', err);
            return fail(500, {
                success: false,
                message: 'Şifre sıfırlanırken hata oluştu'
            });
        }
    }
};