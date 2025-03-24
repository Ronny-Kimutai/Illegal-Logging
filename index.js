// Import required libraries
const mqtt = require('mqtt');
const fs = require('fs');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the "public" directory
app.use(express.static('public'));

// Load environment variables from .env file
require('dotenv').config();

// Middleware to parse JSON
app.use(express.json());

// Initialize MQTT client
let mqttClient;

// MQTT configurations for different forests
const forestConfigurations = {
    // TTN
    // Strahmore 
    strathmore: {
        protocol: process.env.STRATHMORE_PROTOCOL,
        host: process.env.STRATHMORE_HOST,
        port: process.env.STRATHMORE_PORT,
        clientId: process.env.STRATHMORE_CLIENT_ID,
        username: process.env.STRATHMORE_USERNAME,
        password: process.env.STRATHMORE_PASSWORD,
        topic: process.env.STRATHMORE_TOPIC
    },

    // KEFRI
    KEFRI: {
        protocol: process.env.KEFRI_PROTOCOL,
        host: process.env.KEFRI_HOST,
        port: process.env.KEFRI_PORT,
        clientId: process.env.KEFRI_CLIENT_ID,
        username: process.env.KEFRI_USERNAME,
        password: process.env.KEFRI_PASSWORD,
        topic: process.env.KEFRI_TOPIC
    },

    // Testing Map - Mau Forest
    Testing: {
        protocol: process.env.TESTING_PROTOCOL,
        host: process.env.TESTING_HOST,
        port: process.env.TESTING_PORT,
        clientId: process.env.TESTING_CLIENT_ID,
        username: process.env.TESTING_USERNAME,
        password: process.env.TESTING_PASSWORD,
        topic: process.env.TESTING_TOPIC,
        cert: process.env.CERT
    },
};


// Function to connect to MQTT broker based on the selected forest
function connectToForest(forest) {
    if (!forestConfigurations[forest]) {
        console.error(`Forest configuration for '${forest}' not found.`);
        return;
    }

    const config = forestConfigurations[forest];

    // Disconnect the existing client if it exists
    if (mqttClient) {
        mqttClient.end();
    }

    // Establish MQTT connection
    const connectUrl = `${config.protocol}://${config.host}:${config.port}`;
    const options = {
        clientId: config.clientId,
        clean: true,
        connectTimeout: 4000,
        username: config.username,
        password: config.password,
        reconnectPeriod: 1000,
    };

    // Add CA certificate if needed
    if (config.cert) {
    options.ca = fs.readFileSync(config.cert);
    }

    mqttClient = mqtt.connect(connectUrl, options);

    mqttClient.on('connect', () => {
        console.log(`Connected to MQTT broker for ${forest}`);
        mqttClient.subscribe([config.topic], () => {
            console.log(`Subscribed to topic '${config.topic}'`);
        });
    });

    mqttClient.on('message', (topic, payload) => {
        console.log(`Received Message for ${forest}:`, payload.toString());
        processMessage(payload);
    });

    mqttClient.on('error', (error) => {
        console.error(`Error with MQTT broker for ${forest}:`, error);
    });
}

// Function to process MQTT messages
function processMessage(payload) {
    try {
        const data = JSON.parse(payload.toString());
        const devEui = data.end_device_ids?.dev_eui;
        const receivedAt = data.received_at;
        const userLocation = data.uplink_message?.locations?.user;
        const metadata = data.uplink_message?.rx_metadata?.[0];
        const decodedPayload = data.uplink_message?.decoded_payload;

        if (devEui && receivedAt && userLocation && metadata && decodedPayload) {
            const latitude = userLocation.latitude;
            const longitude = userLocation.longitude;
            const rssi = metadata.rssi;
            const snr = metadata.snr;
            const axe = decodedPayload.axe;
            const chainsaw = decodedPayload.chainsaw;
            const cowbell = decodedPayload.cowbell;
            const panga = decodedPayload.panga;
            const background = decodedPayload.background;

            if (latitude !== undefined && longitude !== undefined) {
                io.emit('locationUpdate', {
                    dev_eui: devEui,
                    received_at: receivedAt,
                    longitude,
                    latitude,
                    rssi,
                    snr,
                    axe,
                    chainsaw,
                    cowbell,
                    panga,
                    background,
                });
                console.log(`Device EUI: ${devEui}, Latitude: ${latitude}, Longitude: ${longitude}`);
            } else {
                console.error('Invalid data format: Missing latitude or longitude');
            }
        } else {
            console.error('Invalid data format: Missing required fields');
        }
    } catch (e) {
        console.error('Failed to parse message:', e);
    }
}

// REST endpoint to switch forests
app.get('/select-forest/:forest', (req, res) => {
    const { forest } = req.params;
    if (forestConfigurations[forest]) {
        connectToForest(forest);
        res.send(`Switched to ${forest} configuration.`);
    } else {
        res.status(400).send('Invalid forest name.');
    }
});

// Endpoint to serve the Google Maps API key
app.get('/api/google-maps-key', (req, res) => {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsKey) {
        return res.status(500).json({ error: 'Google Maps API key not found' });
    }
    res.json({ key: googleMapsKey });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
