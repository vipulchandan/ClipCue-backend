const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const multer = require('multer');
const cors = require('cors');

dotenv.config();


const app = express();


app.use(cors());

const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TRANSCRIPTIONS_DIR = path.join(__dirname, 'transcriptions');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    },
});
const upload = multer({ storage });

app.use(express.json());

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

app.post('/upload', upload.single('video'), (req, res) => {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const videoFilePath = path.join(UPLOAD_DIR, req.file.filename);
    const audioFilePath = path.join(TRANSCRIPTIONS_DIR, 'extracted_audio.wav');
    const model = "whisper-1";

    // Use fluent-ffmpeg to extract audio from the video
    ffmpeg()
        .input(videoFilePath)
        .outputOptions('-vn')
        .audioCodec('pcm_s16le')
        .audioChannels(2)
        .audioFrequency(44100)
        .output(audioFilePath)
        .on('end', () => {
            console.log('Audio extraction successful.');

            const formData = new FormData();
            formData.append("model", model);
            formData.append('file', fs.createReadStream(audioFilePath));

            axios.post("https://api.openai.com/v1/audio/transcriptions", formData, {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                },
            }).then((response) => {
                const transcript = response.data.text;
                const words = transcript.split(' ');
                const timestamps = [];

                let currentTime = 0;

                for (const word of words) {
                    const duration = word.length * 1000; // Convert to milliseconds
                    const endTime = currentTime + duration;

                    timestamps.push({
                        start: currentTime / 1000, // Convert to seconds
                        text: word,
                        end: endTime / 1000, // Convert to seconds
                        break: true // Assuming a break between each word
                    });

                    currentTime = endTime;
                }

                res.status(200).json(timestamps);
            }).catch((err) => {
                console.log(err);
                res.status(500).json({ error: "Error processing transcription" });
            });
        })
        .on('error', (err) => {
            console.error('Error extracting audio:', err);
            res.status(500).json({ error: "Error extracting audio" });
        })
        .run();
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});