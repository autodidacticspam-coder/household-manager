export type UserRole = 'admin' | 'employee';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  phone: string | null;
  smsNotificationsEnabled: boolean;
  preferredLocale: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string;
}
