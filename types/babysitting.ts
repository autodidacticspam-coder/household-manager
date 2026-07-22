// Types for the babysitter availability + booking feature

// One availability time range (times are 24h "HH:mm" strings)
export type AvailabilityRange = {
  startTime: string;
  endTime: string;
};

// A template slot: recurring weekly default availability
export type AvailabilityTemplateSlot = AvailabilityRange & {
  id: string;
  userId: string;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
};

// A concrete availability entry for a specific date
export type AvailabilityEntry = AvailabilityRange & {
  id: string;
  userId: string;
  entryDate: string; // yyyy-MM-dd
};

// Marks that a babysitter confirmed/customized a specific week
export type AvailabilityWeek = {
  id: string;
  userId: string;
  weekStart: string; // yyyy-MM-dd (Sunday)
  updatedAt: string;
};

export type BookingRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type BookingRequest = {
  id: string;
  babysitterId: string;
  requestDate: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  note: string | null;
  status: BookingRequestStatus;
  oneOffId: string | null;
  createdBy: string | null;
  respondedAt: string | null;
  createdAt: string;
  babysitter?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
};

export type BabysitterUser = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
};

// A babysitter's availability for one week, resolved from either
// confirmed entries or the default template
export type BabysitterWeekAvailability = {
  user: BabysitterUser;
  weekStart: string;
  confirmed: boolean;
  confirmedAt: string | null;
  // Ranges per day of week (0 = Sunday .. 6 = Saturday)
  days: Record<number, AvailabilityRange[]>;
};
