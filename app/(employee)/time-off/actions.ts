'use server';
import { saveLeave, type LeaveResult } from '@/lib/leave-service';
import type { CreateLeaveRequestInput } from '@/lib/validators/leave';

export type ActionState = LeaveResult;
export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<ActionState> { return saveLeave('create', input); }
export async function approveLeaveRequest(requestId: string, adminNotes?: string): Promise<ActionState> { return saveLeave('approve', { id: requestId, adminNotes }); }
export async function denyLeaveRequest(requestId: string, adminNotes?: string): Promise<ActionState> { return saveLeave('deny', { id: requestId, adminNotes }); }
export async function cancelLeaveRequest(requestId: string): Promise<ActionState> { return saveLeave('cancel', { id: requestId }); }
