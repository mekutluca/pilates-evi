import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import type { Role } from './Role';

export interface Route {
	href: string;
	label: string;
	icon: typeof Users;
	availableToRoles: Role[];
	group: string;
}

export const allRoutes: Route[] = [
	{
		href: '/',
		label: 'Panel',
		icon: LayoutDashboard,
		availableToRoles: ['admin', 'coordinator', 'trainer', 'trainee'],
		group: 'Genel'
	},
	{
		href: '/trainers',
		label: 'Eğitmenler',
		icon: Users,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Yönetim'
	}
];