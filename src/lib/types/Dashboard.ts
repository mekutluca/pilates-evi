// Panel (dashboard) data

// A lesson as the panel lists it
export interface PanelLesson {
	appointmentId: number;
	date: string;
	hour: number;
	packageName: string;
	roomId: string;
	roomName: string;
	trainerName: string;
	traineeNames: string[];
	isGroup: boolean;
}

// A trainee's kayıt whose last lesson is within the next two weeks (or was last week)
// and that hasn't been renewed
export interface EndingKayit {
	traineeId: string;
	traineeName: string;
	purchaseId: string;
	packageName: string;
	// Lessons still ahead
	remaining: number;
	lastDate: string;
}

// A kayıt opened this week (renewals are only counted)
export interface NewKayit {
	purchaseId: string;
	createdAt: string;
	packageName: string;
	isGroup: boolean;
	trainees: Array<{ id: string; name: string }>;
}

// Coordinator/admin panel
export interface StudioPanel {
	kind: 'studio';
	today: PanelLesson[];
	weekLessonCount: number;
	weekTraineeCount: number;
	ending: EndingKayit[];
	newKayitlar: NewKayit[];
	renewalCount: number;
}

// Trainer panel: their own lessons
export interface TrainerPanel {
	kind: 'trainer';
	today: PanelLesson[];
	week: PanelLesson[];
	weekTraineeCount: number;
}

export type Panel = StudioPanel | TrainerPanel;
