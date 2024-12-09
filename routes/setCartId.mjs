import express from 'express';
import fetch from 'node-fetch';
import { getLogger } from '../utils/logger.mjs';

const logger = getLogger('info');
const router = express.Router();

const BIGCOMMERCE_API_URL = 'https://api.bigcommerce.com/stores/pmsgmprrgp/v3';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // BigCommerce API token

router.post('/', async (req, res) => {
    const { cartId } = req.body;

    // logger.info(`Incoming Cookies: ${JSON.stringify(req.cookies)}`);
    // logger.info(`Incoming Cookies: ${JSON.stringify(req.sessionID)}`);
    // logger.info(`Incoming Cookies: ${JSON.stringify(req.session)}`);

    // // Ensure cartId is provided
    // if (!cartId) {
    //     logger.error('cartId parameter is required');
    //     return res.status(400).json({ error: 'cartId parameter is required' });
    // }
    

    try {
        
        logger.info(`Incoming Cookies: ${JSON.stringify(req.cookies)}`);
        logger.info(`Incoming Session: ${JSON.stringify(req.session)}`);

        if (!cartId) {
            throw new Error('cartId parameter is required');
        }
        // Call BigCommerce API to validate the cartId
        const response = await fetch(`${BIGCOMMERCE_API_URL}/carts/${cartId}`, {
            method: 'GET',
            headers: {
                'X-Auth-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json',
            },
        });

        // Handle invalid cartId (404)
        if (response.status === 404) {
            logger.error(`Invalid cartId: ${cartId}`);
            return res.status(400).json({ error: 'Invalid cartId or cart does not exist' });
        }

        // Handle unexpected errors
        if (!response.ok) {
            throw new Error(`BigCommerce API error: ${response.statusText}`);
        }

        // Parse valid cart data
        const cartData = await response.json();

        // Store cartId in the session (or other desired location)
        req.session.cartId = cartId;
        req.session.save((err) => {
            if (err) {
                logger.error(`Error saving session: ${err.message}`);
                return res.status(500).json({ error: 'Error saving session data' });
            }
        
            // Log outgoing cookies after session is saved successfully
            logger.info(`Outgoing Cookies: ${JSON.stringify(res.getHeaders()['set-cookie'])}`);
            logger.info(`Session saved with cartId: ${req.session.cartId}`);
            res.status(200).json({ message: 'Cart ID validated and stored successfully' });
        });        
    } catch (error) {
        logger.error(`Error in /set-cart-id: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

export default router;
