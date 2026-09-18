const jwt        = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const AUTH_MODE = process.env.AUTH_MODE || 'dev';

if (AUTH_MODE !== 'production') {
  // eslint-disable-next-line no-console
  console.warn('⚠️  AUTH_MODE=dev — authentication is bypassed. Set AUTH_MODE=production for live deployment.');
}

/*
 * IT_HANDOVER: Set the following environment variables in your secrets manager:
 *   AUTH_MODE=production
 *   AUTH_JWKS_URI=https://<equinix-idp-domain>/.well-known/jwks.json
 *   AUTH_AUDIENCE=<your-api-identifier>
 *   AUTH_ISSUER=https://<equinix-idp-domain>/
 * The JWKS URI is provided by Equinix IT / Auth0 / Okta during SSO onboarding.
 * Do NOT hardcode secrets — inject via Railway environment variables or Equinix vault.
 */
let jwks;
if (AUTH_MODE === 'production') {
  if (!process.env.AUTH_JWKS_URI) {
    throw new Error('AUTH_JWKS_URI must be set when AUTH_MODE=production');
  }
  jwks = jwksClient({
    jwksUri:               process.env.AUTH_JWKS_URI,
    cache:                 true,
    cacheMaxEntries:       5,
    cacheMaxAge:           10 * 60 * 60 * 1000, // 10 hours
    rateLimit:             true,
    jwksRequestsPerMinute: 10,
  });
}

function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function requireAuth(req, res, next) {
  if (AUTH_MODE !== 'production') {
    // Dev bypass — inert when AUTH_MODE=production
    req.user = {
      id:    null,
      name:  process.env.DEMO_USER_NAME  || 'Demo User',
      email: process.env.DEMO_USER_EMAIL || 'demo@equinix.com',
      role:  'Workforce Planning',
    };
    return next();
  }

  // Production: validate JWT Bearer token against JWKS endpoint
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  jwt.verify(
    token,
    getSigningKey,
    {
      audience:   process.env.AUTH_AUDIENCE,
      issuer:     process.env.AUTH_ISSUER,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.user = {
        id:    decoded.sub,
        name:  decoded.name || decoded.preferred_username || 'Unknown',
        email: decoded.email || '',
        // IT_HANDOVER: adjust the claim name below to match your IdP's role claim
        role:  decoded['https://equinix.com/role'] || decoded.role || 'Workforce Planning',
      };
      next();
    }
  );
}

module.exports = { requireAuth };
