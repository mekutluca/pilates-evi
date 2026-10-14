// What every form action returns: a message to show and, for flows that end on another
// page, where to go next.
export type ActionPayload = {
	success?: boolean;
	message?: string;
	redirectTo?: string;
};
