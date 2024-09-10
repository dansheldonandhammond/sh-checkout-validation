import dotenv from 'dotenv';
dotenv.config();  // Load the environment variables

import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import createError from 'http-errors';
import cors from 'cors';
import https from 'https';
import { Buffer } from 'buffer';
import RelyingPartyClientSdk from '@connectid-tools/rp-nodejs-sdk';
import { config } from './config.js';

const rpClient = new RelyingPartyClientSdk(config);

// Initialize Express app
const app = express();

// Use CORS middleware
const storeDomain = process.env.STORE_DOMAIN;

app.use(cors({
  origin: [`https://${storeDomain}`],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// View engine setup
app.set('views', path.join(path.resolve(), 'views'));
app.set('view engine', 'pug');

// Middleware setup
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(path.resolve(), 'public')));

// Use routers
app.use('/', indexRouter);
app.use('/validate-cart', validateCartRouter);
app.use('/restricted-items', getRestrictedItemsRouter);

// Handle the user's bank selection and start the OIDC flow
app.post('/select-bank', async (req, res) => {
  const essentialClaims = req.body.essentialClaims || [];
  const voluntaryClaims = req.body.voluntaryClaims || [];
  const purpose = req.body.purpose || config.data.purpose;
  const authServerId = req.body.authorisationServerId;

  if (!authServerId) {
    const error = 'authorisationServerId parameter is required';
    console.error(error);
    return res.status(400).json({ error });
  }

  try {
    console.log(
      `Processing request to send PAR with authorisationServerId='${authServerId}' essentialClaims='${essentialClaims.join(
        ','
      )}' voluntaryClaims='${voluntaryClaims.join(',')}', purpose='${purpose}'`
    );

    const { authUrl, code_verifier, state, nonce, xFapiInteractionId } = await rpClient.sendPushedAuthorisationRequest(
      authServerId,
      essentialClaims,
      voluntaryClaims,
      purpose
    );

    res.cookie('state', state, { path: '/', sameSite: 'none', secure: true });
    res.cookie('nonce', nonce, { path: '/', sameSite: 'none', secure: true });
    res.cookie('code_verifier', code_verifier, { path: '/', sameSite: 'none', secure: true });
    res.cookie('authorisation_server_id', authServerId, { path: '/', sameSite: 'none', secure: true });

    console.log(`PAR sent to authorisationServerId='${authServerId}', returning url='${authUrl}', x-fapi-interaction-id='${xFapiInteractionId}'`);

    return res.json({ authUrl });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.toString() });
  }
});

// Following successful authentication and consent at the bank, exchange the auth token for an ID Token
app.get('/retrieve-tokens', async (req, res) => {
  if (!req.query.code) {
    console.error('No code parameter in query string');
    return res.status(400).json({ error: 'No code parameter in query string' });
  }

  try {
    const tokenSet = await rpClient.retrieveTokens(
      req.cookies.authorisation_server_id,
      req.query,
      req.cookies.code_verifier,
      req.cookies.state,
      req.cookies.nonce
    );

    const claims = tokenSet.claims();
    const token = {
      decoded: JSON.stringify(jwtDecode(tokenSet.id_token), null, 2),
      raw: tokenSet.id_token,
    };

    console.log(`Returned claims: ${JSON.stringify(claims, null, 2)}`);
    console.log(`Returned raw id_token: ${token.raw}`);
    console.log(`Returned decoded id_token: ${token.decoded}`);
    console.log(`Returned xFapiInteractionId: ${tokenSet.xFapiInteractionId}`);

    return res.json({ claims, token, xFapiInteractionId: tokenSet.xFapiInteractionId });
  } catch (error) {
    console.error('Error retrieving tokenset: ' + error);
    return res.status(500).json({ error: error.toString() });
  }
});

// Catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// Error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  const statusCode = err.status || 500;
  console.error(err.stack);
  res.status(statusCode).render('error', { error: err });
});

// Set up HTTPS server with the key and certificate from the environment variables
const key = Buffer.from(config.data.transport_key_content, 'base64');
const cert = Buffer.from(config.data.transport_pem_content, 'base64');

https.createServer({ key, cert }, app).listen(config.data.server_port, config.data.listen_address, () => {
  console.log(`Server is listening on ${config.data.listen_address} on port ${config.data.server_port}`);
});

export default app;
