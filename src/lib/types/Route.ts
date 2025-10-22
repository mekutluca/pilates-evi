import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import type { Role } from './Role';
import IdCard from '@lucide/svelte/icons/id-card';
import TableCellsSplit from '@lucide/svelte/icons/table-cells-split';
import Medal from '@lucide/svelte/icons/medal';
import Calendar from '@lucide/svelte/icons/calendar';
import Dumbbell from '@lucide/svelte/icons/dumbbell';
import Plus from '@lucide/svelte/icons/plus';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';

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
		href: '/schedule',
		label: 'Haftalık Program',
		icon: Calendar,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Genel'
	},
	{
		href: '/my-schedule',
		label: 'Haftalık Programım',
		icon: Calendar,
		availableToRoles: ['trainer'],
		group: 'Genel'
	},
	{
		href: '/new-assignment',
		label: 'Yeni Kayıt',
		icon: Plus,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Genel'
	},
	{
		href: '/transfer',
		label: 'Randevu Değiştir',
		icon: ArrowLeftRight,
		availableToRoles: ['admin', 'coordinator'],
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
		href: '/trainees',
		label: 'Öğrenciler',
		icon: Medal,
		availableToRoles: ['admin', 'coordinator'],
		group: 'Yönetim'
	},
	{
		href: '/packages',
		label: 'Dersler',
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
