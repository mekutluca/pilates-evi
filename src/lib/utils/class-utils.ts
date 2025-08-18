import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge CSS classes using clsx and tailwind-merge
 * @param inputs - Class values to merge
 * @returns Merged CSS class string
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
