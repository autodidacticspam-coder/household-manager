'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export type Employee = {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'employee';
  avatarUrl: string | null;
  phone: string | null;
  createdAt: string;
  groups: { id: string; name: string }[];
  profile: {
    dateOfBirth: string | null;
    hireDate: string | null;
    emergencyContact: string | null;
    notes: string | null;
    importantDates: { label: string; date: string }[];
  } | null;
};

export function useEmployeesList() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const { data: users, error } = await supabase
        .from('users')
        .select(`
          *,
          employee_profiles(*),
          employee_group_memberships(
            group:employee_groups(id, name)
          )
        `)
        .order('full_name');

      if (error) throw error;

      return (users || []).map((user): Employee => {
        // Handle employee_profiles which may be array or object from Supabase join
        const rawProfile = user.employee_profiles;
        const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

        // Handle groups - filter out null values
        const groups = (user.employee_group_memberships || [])
          .map((m: { group: { id: string; name: string } | null }) => m.group)
          .filter((g: { id: string; name: string } | null): g is { id: string; name: string } => g !== null);

        return {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          avatarUrl: user.avatar_url,
          phone: user.phone,
          createdAt: user.created_at,
          groups,
          profile: profile ? {
            dateOfBirth: profile.date_of_birth,
            hireDate: profile.hire_date,
            emergencyContact: profile.emergency_contact,
            notes: profile.notes,
            importantDates: profile.important_dates || [],
          } : null,
        };
      });
    },
  });
}

export function useEmployee(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const { data: user, error } = await supabase
        .from('users')
        .select(`
          *,
          employee_profiles(*),
          employee_group_memberships(
            group:employee_groups(id, name)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Handle employee_profiles which may be array or object from Supabase join
      const rawProfile = user.employee_profiles;
      const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

      // Handle groups - filter out null values
      const groups = (user.employee_group_memberships || [])
        .map((m: { group: { id: string; name: string } | null }) => m.group)
        .filter((g: { id: string; name: string } | null): g is { id: string; name: string } => g !== null);

      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        createdAt: user.created_at,
        groups,
        profile: profile ? {
          dateOfBirth: profile.date_of_birth,
          hireDate: profile.hire_date,
          emergencyContact: profile.emergency_contact,
          notes: profile.notes,
          importantDates: profile.important_dates || [],
        } : null,
      } as Employee;
    },
    enabled: !!id,
  });
}

export type CreateEmployeeInput = {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  groupIds?: string[];
  dateOfBirth?: string;
  hireDate?: string;
};

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (input: CreateEmployeeInput) => {
      // This would typically call an API route that uses the admin client
      // For now, we'll show how it would work
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create employee');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-list'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success(t('employees.employeeCreated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export type UpdateEmployeeInput = {
  fullName?: string;
  phone?: string;
  groupIds?: string[];
  dateOfBirth?: string;
  hireDate?: string;
  emergencyContact?: string;
  notes?: string;
  importantDates?: { label: string; date: string }[];
};

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateEmployeeInput }) => {
      // Update user
      if (data.fullName || data.phone) {
        const { error: userError } = await supabase
          .from('users')
          .update({
            full_name: data.fullName,
            phone: data.phone,
          })
          .eq('id', id);

        if (userError) throw userError;
      }

      // Update profile
      const profileData = {
        date_of_birth: data.dateOfBirth,
        hire_date: data.hireDate,
        emergency_contact: data.emergencyContact,
        notes: data.notes,
        important_dates: data.importantDates,
      };

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('employee_profiles')
        .select('id')
        .eq('user_id', id)
        .single();

      if (existingProfile) {
        const { error: profileError } = await supabase
          .from('employee_profiles')
          .update(profileData)
          .eq('user_id', id);

        if (profileError) throw profileError;
      } else {
        const { error: profileError } = await supabase
          .from('employee_profiles')
          .insert({ user_id: id, ...profileData });

        if (profileError) throw profileError;
      }

      // Update group memberships if provided
      if (data.groupIds !== undefined) {
        // Delete existing memberships
        await supabase
          .from('employee_group_memberships')
          .delete()
          .eq('user_id', id);

        // Add new memberships
        if (data.groupIds.length > 0) {
          const { error: membershipError } = await supabase
            .from('employee_group_memberships')
            .insert(data.groupIds.map((groupId) => ({
              user_id: id,
              group_id: groupId,
            })));

          if (membershipError) throw membershipError;
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-list'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      toast.success(t('employees.employeeUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete employee via API (requires admin privileges)
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete employee');
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-list'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export type ImportantDateWithEmployee = {
  label: string;
  date: string;
  employeeId: string;
  employeeName: string;
  employeeAvatarUrl: string | null;
};

export function useAllImportantDates() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['all-important-dates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_profiles')
        .select(`
          important_dates,
          user:users!employee_profiles_user_id_fkey(id, full_name, avatar_url)
        `)
        .not('important_dates', 'is', null);

      if (error) throw error;

      const allDates: ImportantDateWithEmployee[] = [];

      for (const profile of data || []) {
        // Handle Supabase join - user may be an array or a single object
        const rawUser = profile.user;
        const user = Array.isArray(rawUser) ? rawUser[0] : rawUser as { id: string; full_name: string; avatar_url: string | null } | null;
        const dates = profile.important_dates as { label: string; date: string }[] | null;

        if (user && dates && Array.isArray(dates)) {
          for (const d of dates) {
            allDates.push({
              label: d.label,
              date: d.date,
              employeeId: user.id,
              employeeName: user.full_name,
              employeeAvatarUrl: user.avatar_url,
            });
          }
        }
      }

      return allDates;
    },
  });
}

export function useUpcomingImportantDates(days: number = 7) {
  const { data: allDates, isLoading, error } = useAllImportantDates();

  const upcomingDates = allDates?.filter((d) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get this year's occurrence of the date
    const [, month, day] = d.date.split('-').map(Number);
    let eventDate = new Date(today.getFullYear(), month - 1, day);

    // If the date has passed this year, check next year
    if (eventDate < today) {
      eventDate = new Date(today.getFullYear() + 1, month - 1, day);
    }

    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays >= 0 && diffDays <= days;
  }).sort((a, b) => {
    const today = new Date();
    const [, aMonth, aDay] = a.date.split('-').map(Number);
    const [, bMonth, bDay] = b.date.split('-').map(Number);

    let aDate = new Date(today.getFullYear(), aMonth - 1, aDay);
    let bDate = new Date(today.getFullYear(), bMonth - 1, bDay);

    if (aDate < today) aDate = new Date(today.getFullYear() + 1, aMonth - 1, aDay);
    if (bDate < today) bDate = new Date(today.getFullYear() + 1, bMonth - 1, bDay);

    return aDate.getTime() - bDate.getTime();
  });

  return { data: upcomingDates, isLoading, error };
}
