import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import UsersRound from '@lucide/svelte/icons/users-round';
import IdCard from '@lucide/svelte/icons/id-card';
import Calendar from '@lucide/svelte/icons/calendar';
import Package from '@lucide/svelte/icons/package';
import DoorOpen from '@lucide/svelte/icons/door-open';
import ShieldUser from '@lucide/svelte/icons/shield-user';
import Plus from '@lucide/svelte/icons/plus';
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
		group: 'Stüdyo'
	},
	{
		href: '/schedule',
		label: 'Takvim',
		icon: Calendar,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Stüdyo'
	},
	{
		href: '/my-schedule',
		label: 'Takvimim',
		icon: Calendar,
		availableToRoles: ['trainer'],
		group: 'Stüdyo'
	},
	{
		href: '/trainees',
		label: 'Öğrenciler',
		icon: Users,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Stüdyo'
	},
	{
		href: '/group-lessons',
		label: 'Grup Dersleri',
		icon: UsersRound,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Stüdyo'
	},
	{
		href: '/packages',
		label: 'Paketler',
		icon: Package,
		availableToRoles: ['admin'],
		group: 'Yönetim'
	},
	{
		href: '/trainers',
		label: 'Eğitmenler',
		icon: IdCard,
		availableToRoles: ['admin'],
		group: 'Yönetim'
	},
	{
		href: '/rooms',
		label: 'Odalar',
		icon: DoorOpen,
		availableToRoles: ['admin'],
		group: 'Yönetim'
	},
	{
		href: '/admin/users',
		label: 'Personel',
		icon: ShieldUser,
		availableToRoles: ['admin'],
		group: 'Yönetim'
	}
];

// Pages reached from inside the app rather than the nav; listed so the hooks guard
// their subtree by role like nav routes.
export const actionRoutes: Route[] = [
	{
		href: '/new-assignment',
		label: 'Yeni kayıt',
		icon: Plus,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Stüdyo'
	}
];
