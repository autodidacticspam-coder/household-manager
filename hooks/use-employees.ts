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

      return (users || []).map((user): Employee => ({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        createdAt: user.created_at,
        groups: (user.employee_group_memberships || []).map((m: { group: { id: string; name: string } }) => m.group),
        profile: user.employee_profiles ? {
          dateOfBirth: user.employee_profiles.date_of_birth,
          hireDate: user.employee_profiles.hire_date,
          emergencyContact: user.employee_profiles.emergency_contact,
          notes: user.employee_profiles.notes,
          importantDates: user.employee_profiles.important_dates || [],
        } : null,
      }));
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

      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        createdAt: user.created_at,
        groups: (user.employee_group_memberships || []).map((m: { group: { id: string; name: string } }) => m.group),
        profile: user.employee_profiles ? {
          dateOfBirth: user.employee_profiles.date_of_birth,
          hireDate: user.employee_profiles.hire_date,
          emergencyContact: user.employee_profiles.emergency_contact,
          notes: user.employee_profiles.notes,
          importantDates: user.employee_profiles.important_dates || [],
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
