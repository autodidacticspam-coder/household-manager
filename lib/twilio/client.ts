import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromNumber) {
  console.warn('Twilio credentials not configured. SMS notifications will be disabled.');
}

export const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;
export const twilioFromNumber = fromNumber || '';

export function isTwilioConfigured(): boolean {
  return !!twilioClient && !!twilioFromNumber;
}
