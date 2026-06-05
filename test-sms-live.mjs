/**
 * Live ClickSend SMS test — sends a real message from +18335184811
 * Run: node test-sms-live.mjs
 */
const u = process.env.CLICKSEND_USERNAME;
const k = process.env.CLICKSEND_API_KEY;
const from = process.env.CLICKSEND_FROM ?? '+18335184811';

// Send to Chad's number (owner)
const to = '+18645678777';

if (!u || !k) {
  console.error('❌ CLICKSEND_USERNAME or CLICKSEND_API_KEY not set');
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${u}:${k}`).toString('base64');

console.log(`Sending test SMS from ${from} to ${to}...`);

const payload = {
  messages: [{
    source: 'kitchensplus-crm',
    from,
    to,
    body: 'Kitchens Plus Upstate — SMS system test. Your ClickSend integration is working correctly. Questions? Call Chad at 864-567-8777.'
  }]
};

const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: auth
  },
  body: JSON.stringify(payload)
});

const json = await res.json();
const msg = json?.data?.messages?.[0];
const status = msg?.status ?? 'unknown';
const id = msg?.message_id ?? 'unknown';
const cost = msg?.message_price ?? 'unknown';

if (status === 'SUCCESS' || status === 'QUEUED') {
  console.log(`✅ SMS sent successfully!`);
  console.log(`   Status: ${status}`);
  console.log(`   Message ID: ${id}`);
  console.log(`   Cost: $${cost}`);
} else {
  console.error(`❌ SMS failed. Status: ${status}`);
  console.log('Full response:', JSON.stringify(json, null, 2));
}
