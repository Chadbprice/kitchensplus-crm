// ClickSend SMS diagnostic script
const u = process.env.CLICKSEND_USERNAME;
const k = process.env.CLICKSEND_API_KEY;

console.log('=== ClickSend Credential Check ===');
console.log('CLICKSEND_USERNAME:', u ? `SET (${u.substring(0, 6)}...)` : 'MISSING ❌');
console.log('CLICKSEND_API_KEY:', k ? `SET (${k.substring(0, 6)}...)` : 'MISSING ❌');

if (!u || !k) {
  console.error('\n❌ Credentials missing — SMS will not work until these are set.');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${u}:${k}`).toString('base64');

// 1. Validate account
console.log('\n=== Account Validation ===');
try {
  const res = await fetch('https://rest.clicksend.com/v3/account', {
    headers: { Authorization: auth }
  });
  const json = await res.json();
  if (res.ok) {
    console.log('✅ Account valid:', json?.data?.username ?? '(no username in response)');
    console.log('   Balance:', json?.data?.balance ?? 'unknown');
    console.log('   Country:', json?.data?.country ?? 'unknown');
  } else {
    console.error('❌ Account validation failed:', json?.response_msg ?? `HTTP ${res.status}`);
    console.log('Full response:', JSON.stringify(json, null, 2));
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Network error:', e.message);
  process.exit(1);
}

// 2. Check FROM_NUMBER constant in sms.ts
import { readFileSync } from 'fs';
const smsTs = readFileSync('./server/sms.ts', 'utf8');
const fromMatch = smsTs.match(/FROM_NUMBER\s*=\s*["'`]([^"'`]+)["'`]/);
const apiUrlMatch = smsTs.match(/CLICKSEND_API_URL\s*=\s*["'`]([^"'`]+)["'`]/);
console.log('\n=== SMS Helper Config ===');
console.log('FROM_NUMBER:', fromMatch ? fromMatch[1] : '⚠️ Not found in sms.ts');
console.log('CLICKSEND_API_URL:', apiUrlMatch ? apiUrlMatch[1] : '⚠️ Not found in sms.ts');

// 3. Send a real test SMS to a safe number (owner's number from env or a test number)
const testPhone = process.env.TEST_PHONE || '+18645678777'; // Chad's number from skill
console.log(`\n=== Live SMS Test to ${testPhone} ===`);
const payload = {
  messages: [{
    source: 'kitchensplus-crm',
    from: fromMatch?.[1] ?? 'KitchensPlus',
    to: testPhone,
    body: 'Kitchens Plus CRM — SMS system diagnostic test. If you receive this, ClickSend is working correctly. Reply STOP to opt out.'
  }]
};

try {
  const res = await fetch(apiUrlMatch?.[1] ?? 'https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('❌ Send failed (HTTP):', json?.response_msg ?? `HTTP ${res.status}`);
    console.log('Full response:', JSON.stringify(json, null, 2));
  } else {
    const msg = json?.data?.messages?.[0];
    const status = msg?.status ?? 'unknown';
    const id = msg?.message_id ?? 'unknown';
    if (status === 'SUCCESS' || status === 'QUEUED') {
      console.log(`✅ SMS sent! Status: ${status}, Message ID: ${id}`);
    } else {
      console.error(`❌ SMS not delivered. Status: ${status}`);
      console.log('Full response:', JSON.stringify(json, null, 2));
    }
  }
} catch (e) {
  console.error('❌ Network error during send:', e.message);
}
