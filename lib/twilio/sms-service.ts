import { twilioClient, twilioFromNumber, isTwilioConfigured } from './client';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type NotificationType =
  | 'task_assigned'
  | 'task_due_reminder'
  | 'leave_request_submitted'
  | 'leave_request_approved'
  | 'leave_request_denied'
  | 'schedule_change';

type SmsResult = {
  success: boolean;
  twilioSid?: string;
  error?: string;
};

export async function sendSms(
  phoneNumber: string,
  message: string,
  userId: string | null,
  notificationType: NotificationType
): Promise<SmsResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Log the notification attempt
  const { data: notification, error: insertError } = await supabase
    .from('sms_notifications')
    .insert({
      user_id: userId,
      phone_number: phoneNumber,
      notification_type: notificationType,
      message,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to log SMS notification:', insertError);
  }

  // Check if Twilio is configured
  if (!isTwilioConfigured()) {
    console.warn('Twilio not configured. SMS not sent:', { phoneNumber, message });

    if (notification) {
      await supabase
        .from('sms_notifications')
        .update({
          status: 'failed',
          error_message: 'Twilio not configured'
        })
        .eq('id', notification.id);
    }

    return { success: false, error: 'Twilio not configured' };
  }

  try {
    // Format phone number (ensure it has country code)
    const formattedPhone = formatPhoneNumber(phoneNumber);

    const result = await twilioClient!.messages.create({
      body: message,
      from: twilioFromNumber,
      to: formattedPhone,
    });

    // Update notification as sent
    if (notification) {
      await supabase
        .from('sms_notifications')
        .update({
          status: 'sent',
          twilio_sid: result.sid,
          sent_at: new Date().toISOString(),
        })
        .eq('id', notification.id);
    }

    return { success: true, twilioSid: result.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to send SMS:', errorMessage);

    // Update notification as failed
    if (notification) {
      await supabase
        .from('sms_notifications')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', notification.id);
    }

    return { success: false, error: errorMessage };
  }
}

export async function sendBulkSms(
  recipients: Array<{ phoneNumber: string; userId: string | null }>,
  message: string,
  notificationType: NotificationType
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendSms(
      recipient.phoneNumber,
      message,
      recipient.userId,
      notificationType
    );

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { sent, failed };
}

function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If it's a 10-digit US number, add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If it already has country code (11+ digits starting with 1 for US)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Otherwise assume it's already formatted or international
  if (!phone.startsWith('+')) {
    return `+${digits}`;
  }

  return phone;
}
