import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import type { Role } from './Role';
import IdCard from '@lucide/svelte/icons/id-card';
import TableCellsSplit from '@lucide/svelte/icons/table-cells-split';
import Dumbbell from '@lucide/svelte/icons/dumbbell';



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
	},
	{
		href: '/rooms',
		label: 'Odalar',
		icon: TableCellsSplit,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Yönetim'
	},
	{
		href: '/trainings',
		label: 'Egzersizler',
		icon: Dumbbell,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Yönetim'
	},
	{
		href: '/admin/users',
		label: 'Yetkili Kullanıcılar',
		icon: IdCard,
		availableToRoles: ['admin'],
		group: 'Yönetim'
	}
];