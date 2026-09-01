import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { PRIVATE_SUPABASE_SECRET_KEY } from '$env/static/private';
import type { Role } from '$lib/types';
import type { Database } from '$lib/types/database.types';
import { allRoutes } from '$lib/types/Route';
import { defaultErrorMessage } from '$lib/utils/errors';

// Privileged client for server-only user management (creating accounts,
// pe_user_organizations membership, admin password resets). Deliberately
// sessionless: giving it the request cookies would make it send the signed-in
// user's JWT instead of the secret key, re-enabling RLS. Never expose it to the
// client and never use it for reads the RLS client can do. With the key unset
// the rest of the app still works; only the user-management actions fail.
const adminClient = PRIVATE_SUPABASE_SECRET_KEY
	? createClient<Database>(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SECRET_KEY, {
			auth: { autoRefreshToken: false, persistSession: false }
		})
	: undefined;

const supabase: Handle = async ({ event, resolve }) => {
	/**
	 * Creates a Supabase client specific to this server request.
	 *
	 * The Supabase client gets the Auth token from the request cookies.
	 */
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				/**
				 * SvelteKit's cookies API requires `path` to be explicitly set in
				 * the cookie options. Setting `path` to `/` replicates previous/
				 * standard behavior.
				 */
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	event.locals.admin = adminClient;

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before returning the session.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) {
			// JWT validation has failed
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * Supabase libraries use the `content-range` and `x-supabase-api-version`
			 * headers, so we need to tell SvelteKit to pass it through.
			 */
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	// Get user role and organization from app_metadata (set by pe_switch_organization)
	let userRole: Role | null = null;
	let organizationId: string | null = null;
	if (user) {
		const appMetadata = user.app_metadata as
			{ organization_role?: string; organization_id?: string } | undefined;
		const role = appMetadata?.organization_role?.replace('pe_', '');
		userRole = role ? (role as Role) : null;
		organizationId = appMetadata?.organization_id ?? null;
	}
	event.locals.userRole = userRole;
	event.locals.organizationId = organizationId;

	if (event.route.id?.startsWith('/(authed)')) {
		if (!session) {
			redirect(303, '/login');
		}

		// Role-based access control
		const normalizedPathname = event.url.pathname.replace(/\/+$/, '') || '/';
		const matchedRoute = allRoutes.find((route) => route.href === normalizedPathname);
		if (matchedRoute && (!userRole || !matchedRoute.availableToRoles.includes(userRole))) {
			await event.locals.supabase.auth.signOut({ scope: 'local' });
			redirect(303, '/login');
		}
	}

	if (session && event.route.id?.startsWith('/(prelogin)')) {
		redirect(303, '/');
	}

	const response = await resolve(event);
	// Private app: keep all pages out of search engine indexes
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	return response;
};

export const handle: Handle = sequence(supabase, authGuard);

// Unexpected server errors (thrown by `load`/actions, or an unhandled 404)
// render +error.svelte; log everything but 404s and hand the page a generic
// Turkish message instead of SvelteKit's English default.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status !== 404) {
		console.error(`[${status}] ${event.request.method} ${event.url.pathname}: ${message}`, error);
	}
	return { message: defaultErrorMessage(status) };
};
