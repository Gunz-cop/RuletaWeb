import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Setup paths
const sitemapPath = './dist/sitemap-0.xml';
const defaultKeyPath = './service-account.json';

// Helper for Base64url encoding
function base64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

// Helper to generate Google Auth Access Token using native crypto (zero-dependency JWT signature)
async function getAccessToken(credentials) {
  const { client_email, private_key, token_uri = 'https://oauth2.googleapis.com/token' } = credentials;
  
  if (!client_email || !private_key) {
    throw new Error('Invalid credentials format: missing client_email or private_key.');
  }

  // Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  // Claim Set
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: token_uri,
    exp: now + 3600, // token expires in 1 hour
    iat: now
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const stringToSign = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key using RS256
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(stringToSign);
  const signature = signer.sign(private_key, 'base64url');

  const jwt = `${stringToSign}.${signature}`;

  // Request OAuth2 access token
  const response = await fetch(token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OAuth token generation failed: ${data.error_description || data.error || response.statusText}`);
  }

  return data.access_token;
}

// Main execution function
async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  // Load environment variables from .env file if it exists
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      process.env[key] = value;
    }
  }

  console.log('====================================================');
  console.log('      Google Indexing API Automator - Decídelo      ');
  console.log('====================================================');

  // 1. Verify sitemap exists (requires npm run build to have completed first)
  if (!fs.existsSync(sitemapPath)) {
    console.error(`❌ Error: Sitemap not found at ${sitemapPath}`);
    console.error('   Please run "npm run build" first to generate static files and sitemap.');
    process.exit(1);
  }

  // 2. Parse URLs from sitemap
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  const urlRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
  const urls = [];
  let match;
  while ((match = urlRegex.exec(sitemapContent)) !== null) {
    urls.push(match[1]);
  }

  if (urls.length === 0) {
    console.log('⚠️ No URLs found in the sitemap.');
    process.exit(0);
  }

  console.log(`✓ Found ${urls.length} URLs in sitemap.`);

  // 3. Load service account credentials
  let credentials = null;
  let keySource = '';

  // Check direct env variables
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // Unescape PEM private key newlines if they are escaped as \n
    let pk = process.env.GOOGLE_PRIVATE_KEY;
    if (pk.startsWith('"') && pk.endsWith('"')) {
      pk = pk.slice(1, -1);
    }
    pk = pk.replace(/\\n/g, '\n');
    
    credentials = {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: pk
    };
    keySource = 'environment variables (GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY)';
  } else if (process.env.INDEXING_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.INDEXING_SERVICE_ACCOUNT_JSON);
      keySource = 'environment variable (INDEXING_SERVICE_ACCOUNT_JSON)';
    } catch (err) {
      console.error('❌ Error parsing INDEXING_SERVICE_ACCOUNT_JSON environment variable:', err.message);
    }
  } else if (fs.existsSync(defaultKeyPath)) {
    try {
      credentials = JSON.parse(fs.readFileSync(defaultKeyPath, 'utf8'));
      keySource = `local file (${defaultKeyPath})`;
    } catch (err) {
      console.error(`❌ Error reading credentials from ${defaultKeyPath}:`, err.message);
    }
  }

  if (isDryRun || !credentials) {
    if (isDryRun) {
      console.log('\n--- DRY RUN MODE ACTIVATED ---');
    } else {
      console.log('\n⚠️ No Google Service Account credentials found.');
      console.log(`   (Checked variables GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY, INDEXING_SERVICE_ACCOUNT_JSON and file ${defaultKeyPath})`);
      console.log('   Running in DRY RUN mode to show you what URLs would be indexed.\n');
    }

    console.log('List of URLs that would be sent to Google Indexing API:');
    urls.forEach((url, i) => console.log(`   [${i + 1}/${urls.length}] ${url}`));
    console.log('\nTo run in live mode:');
    console.log('1. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in your .env file, OR');
    console.log(`2. Save your service account JSON file as "${defaultKeyPath}" in the project root.`);
    console.log('3. Make sure the Service Account email is added as an OWNER of the property in Google Search Console.');
    console.log('4. Run this script without the --dry-run flag.');
    console.log('====================================================');
    return;
  }

  console.log(`✓ Loaded Google Service Account key from ${keySource}`);
  console.log(`✓ Service account client email: ${credentials.client_email}`);

  // 4. Get OAuth access token
  let accessToken;
  try {
    console.log('⌛ Authenticating with Google...');
    accessToken = await getAccessToken(credentials);
    console.log('✓ Authentication successful!');
  } catch (err) {
    console.error('❌ Authentication failed:', err.message);
    process.exit(1);
  }

  // 5. Submit URLs to Google Indexing API
  console.log(`\nSending ${urls.length} URLs to Google Indexing API...`);
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] Publishing: ${url}...`);

    try {
      const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          url: url,
          type: 'URL_UPDATED'
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        successCount++;
        console.log(`   └─ ✅ Success (Updated/Created)`);
      } else {
        failCount++;
        console.error(`   └─ ❌ Error: ${data.error?.message || response.statusText}`);
      }
    } catch (err) {
      failCount++;
      console.error(`   └─ ❌ Network error:`, err.message);
    }

    // Small delay between requests to stay safe within quotas
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log('\n====================================================');
  console.log('                    Summary                         ');
  console.log('====================================================');
  console.log(`Total URLs processed: ${urls.length}`);
  console.log(`✅ Successfully published: ${successCount}`);
  console.log(`❌ Failed submissions: ${failCount}`);
  console.log('====================================================');
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
