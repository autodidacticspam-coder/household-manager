export type ChildName = 'Zoe' | 'Zara' | 'Zander';
export type ChildLogCategory = 'sleep' | 'food' | 'poop';

export interface ChildLog {
  id: string;
  child: ChildName;
  category: ChildLogCategory;
  logDate: string;
  logTime: string;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
  loggedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChildLogWithUser extends ChildLog {
  loggedByUser: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
}

export interface CreateChildLogInput {
  child: ChildName;
  category: ChildLogCategory;
  logDate: string;
  logTime: string;
  startTime?: string | null;
  endTime?: string | null;
  description?: string | null;
}
