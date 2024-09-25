import express from 'express';
import RelyingPartyClientSdk from '@connectid-tools/rp-nodejs-sdk';
import { config } from '../config.js';
import { clearCookies } from '../utils/cookieUtils.mjs';
import { jwtDecode } from 'jwt-decode';

const router = express.Router();
const rpClient = new RelyingPartyClientSdk(config);

// Log with timestamp and level (manual formatting)
function logWithTimestamp(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${level}: ${message}`);
}

// Wrap the call to capture internal SDK errors
async function retrieveTokensWithErrorHandling(...args) {
  try {
    return await rpClient.retrieveTokens(...args);
  } catch (error) {
    const xFapiInteractionId = error.xFapiInteractionId || 'Unknown';  // Extract x-fapi-interaction-id if available
    const authorisationServerId = args[0];  // Assuming the first arg is the authorisation server id

    // Manually format the log to include timestamp and error level
    logWithTimestamp('error', 
      `Error retrieving tokens with authorisation server ${authorisationServerId}, x-fapi-interaction-id: ${xFapiInteractionId}, ${error.message}`
    );

    console.error({ stack: error.stack, details: error });  // Additional error details for debugging
    
    throw error;  // Re-throw the processed error message to handle it in the route
  }
}

router.get('/retrieve-tokens', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Code parameter is required' });
  }

  const { authorisation_server_id, code_verifier, state, nonce } = req.cookies;

  if (!authorisation_server_id || !code_verifier || !state || !nonce) {
    return res.status(400).json({ error: 'Missing required cookies for token retrieval' });
  }

  try {
    const tokenSet = await retrieveTokensWithErrorHandling(
      authorisation_server_id,
      req.query,
      code_verifier,
      state,
      nonce
    );

    const claims = tokenSet.claims();
    const token = {
      decoded: jwtDecode(tokenSet.id_token),
      raw: tokenSet.id_token,
    };

    clearCookies(res);

    return res.status(200).json({
      claims,
      token,
      xFapiInteractionId: tokenSet.xFapiInteractionId,
    });

  } catch (error) {
    const logs = [{ type: 'Error', message: error.message, timestamp: new Date() }];
    clearCookies(res);

    return res.status(500).json({
      error: error.message || 'Unknown error occurred',
      sdkErrorDetails: error,
      logs: logs,  // Return logs in the response
    });
  }
});

export default router;
