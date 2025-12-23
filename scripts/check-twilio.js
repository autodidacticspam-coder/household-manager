// Check Twilio account status and message delivery
require('dotenv').config({ path: '.env.local' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const twilio = require('twilio');
const client = twilio(accountSid, authToken);

async function checkAccount() {
  try {
    // Get account info
    const account = await client.api.accounts(accountSid).fetch();
    console.log('Twilio Account Status:');
    console.log('- Account Name:', account.friendlyName);
    console.log('- Account Status:', account.status);
    console.log('- Account Type:', account.type);
    console.log('');

    // Check recent messages
    console.log('Recent Messages:');
    const messages = await client.messages.list({ limit: 5 });

    if (messages.length === 0) {
      console.log('No messages found');
    } else {
      messages.forEach(msg => {
        console.log(`- To: ${msg.to}`);
        console.log(`  Status: ${msg.status}`);
        console.log(`  Error Code: ${msg.errorCode || 'None'}`);
        console.log(`  Error Message: ${msg.errorMessage || 'None'}`);
        console.log(`  Date: ${msg.dateSent || msg.dateCreated}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAccount();
