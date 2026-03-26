import { chromium } from 'playwright';

const BASE = 'http://localhost:3002';
const QUESTION = 'Ik heb een storing in de ESB. waar moet ik kijken en kan je een bericht voor intranet voor de gebruikers maken?';

async function testChatESB() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('1. Opening BlueDolphin...');
  await page.goto(BASE);
  await page.waitForSelector('.panel', { timeout: 10000 });

  // Click Impact tab (2nd sidebar icon)
  console.log('2. Clicking Impact tab...');
  await page.locator('.activity-bar button').nth(1).click();
  await page.waitForTimeout(500);

  // Ensure AI Chat tab is selected in panel
  console.log('3. Selecting AI Chat tab...');
  await page.locator('.panel-tab', { hasText: 'AI Chat' }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'tests/chat-esb-1-before.png' });

  // Type and send the question
  console.log('4. Sending question...');
  const input = page.locator('.chat-input');
  await input.waitFor({ timeout: 5000 });
  await input.fill(QUESTION);
  await page.locator('.chat-send').click();

  // Wait for streaming
  console.log('5. Waiting for AI response...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tests/chat-esb-2-streaming.png' });

  // Wait for completion
  await page.locator('.chat-send:not([disabled])').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'tests/chat-esb-3-answer.png' });

  // Extract response
  const messages = await page.locator('.chat-msg.assistant').all();
  const lastMsg = messages[messages.length - 1];
  const responseText = await lastMsg.innerText();
  console.log('\n=== AI RESPONSE ===');
  console.log(responseText);
  console.log('=== END RESPONSE ===\n');

  const matchedApps = await page.locator('.chat-matched .impact-tag').allInnerTexts();
  if (matchedApps.length > 0) {
    console.log('Matched apps:', matchedApps.join(', '));
  }

  console.log('\nBrowser open 10s for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
}

testChatESB().catch(e => { console.error(e); process.exit(1); });
