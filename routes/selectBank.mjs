import express from 'express';
import RelyingPartyClientSdk from '@connectid-tools/rp-nodejs-sdk';
import { config } from '../config.js';

const router = express.Router();
const rpClient = new RelyingPartyClientSdk(config);

router.post('/select-bank', async (req, res) => {
  const essentialClaims = req.body.essentialClaims || [];
  const voluntaryClaims = req.body.voluntaryClaims || [];
  const purpose = req.body.purpose || config.data.purpose;
  const authServerId = req.body.authorisationServerId;

  if (!authServerId) {
    const error = 'authorisationServerId parameter is required';
    console.error(error);
    return res.status(400).json({ error });
  }

  const cartId = req.body.cartId;
  if (!cartId) {
    const error = 'cartId parameter is required';
    console.error(error);
    return res.status(400).json({ error });
  }

  // Check if the over18 claim is marked as essential or voluntary
if (req.body.claims?.over18 !== undefined) {
  const over18Claim = { claimName: 'over18', claimValue: req.body.claims.over18 };

  if (req.body.claims.isEssentialOver18) {
    essentialClaims.push(over18Claim);
    console.log(`over18 claim added to essentialClaims: ${JSON.stringify(over18Claim)}`);
  } else {
    voluntaryClaims.push(over18Claim);
    console.log(`over18 claim added to voluntaryClaims: ${JSON.stringify(over18Claim)}`);
  }
} else {
  console.log('over18 claim is not present in the request');
}


  try {
    
    // Send the pushed authorization request
    const { authUrl, code_verifier, state, nonce, xFapiInteractionId } = await rpClient.sendPushedAuthorisationRequest(
      authServerId,
      essentialClaims,
      voluntaryClaims,
      purpose
    );
    
    console.log(
      `PAR sent to authorisationServerId='${authServerId}', returning authUrl='${authUrl}', essentialClaims=${JSON.stringify(essentialClaims)}, voluntaryClaims=${JSON.stringify(voluntaryClaims)}`
    );
    
    const cookieOptions = {
      path: '/',
      sameSite: 'None', 
      secure: true, 
      httpOnly: true,
      maxAge: 3 * 60 * 1000 // 3 minutes
    };

    // Set cookies to maintain state
    res.cookie('state', state, cookieOptions);
    res.cookie('nonce', nonce, cookieOptions);
    res.cookie('code_verifier', code_verifier, cookieOptions);
    res.cookie('authorisation_server_id', authServerId, cookieOptions);
    
    return res.json({ authUrl });
  } catch (error) {
    console.error('Error during PAR request:', error);
    return res.status(500).json({ error: 'Failed to send PAR request', details: error.message });
  }
});

export default router;