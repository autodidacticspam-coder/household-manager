// Test SMS script
// Usage: node scripts/test-sms.js +1XXXXXXXXXX

require('dotenv').config({ path: '.env.local' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('Usage: node scripts/test-sms.js +1XXXXXXXXXX');
  console.error('Example: node scripts/test-sms.js +15551234567');
  process.exit(1);
}

if (!accountSid || !authToken || !fromNumber) {
  console.error('Missing Twilio credentials in .env.local');
  console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'Set' : 'Missing');
  console.error('TWILIO_AUTH_TOKEN:', authToken ? 'Set' : 'Missing');
  console.error('TWILIO_PHONE_NUMBER:', fromNumber ? 'Set' : 'Missing');
  process.exit(1);
}

console.log('Twilio Configuration:');
console.log('- Account SID:', accountSid.substring(0, 8) + '...');
console.log('- From Number:', fromNumber);
console.log('- To Number:', phoneNumber);
console.log('');

const twilio = require('twilio');
const client = twilio(accountSid, authToken);

async function sendTestSms() {
  try {
    console.log('Sending test SMS...');

    const message = await client.messages.create({
      body: '🏠 Household Manager Test: SMS notifications are working correctly!',
      from: fromNumber,
      to: phoneNumber
    });

    console.log('');
    console.log('✅ SMS sent successfully!');
    console.log('- Message SID:', message.sid);
    console.log('- Status:', message.status);
    console.log('');
    console.log('Check your phone for the test message.');

  } catch (error) {
    console.error('');
    console.error('❌ Failed to send SMS:');
    console.error('- Error Code:', error.code);
    console.error('- Error Message:', error.message);

    if (error.code === 21211) {
      console.error('');
      console.error('The phone number format is invalid. Use format: +1XXXXXXXXXX');
    } else if (error.code === 21608) {
      console.error('');
      console.error('The phone number is not verified. For trial accounts, you need to verify recipient numbers.');
    } else if (error.code === 20003) {
      console.error('');
      console.error('Authentication failed. Check your Account SID and Auth Token.');
    }

    process.exit(1);
  }
}

sendTestSms();
