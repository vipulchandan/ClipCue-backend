// const express = require('express');
// const dotenv = require('dotenv');
// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const FormData = require('form-data');
// const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// const ffmpeg = require('fluent-ffmpeg');
// ffmpeg.setFfmpegPath(ffmpegPath);
// const multer = require('multer');
// const cors = require('cors');

// dotenv.config();

// const app = express();

// app.use(cors());

// const PORT = process.env.PORT || 5000;
// const UPLOAD_DIR = path.join(__dirname, 'uploads');
// const TRANSCRIPTIONS_DIR = path.join(__dirname, 'transcriptions');

// // Configure multer for file upload
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, UPLOAD_DIR);
//     },
//     filename: (req, file, cb) => {
//         cb(null, file.originalname);
//     },
// });
// const upload = multer({ storage });

// app.use(express.json());

// // Set FFmpeg path
// ffmpeg.setFfmpegPath(ffmpegPath);

// // Update this constant to the desired bi-gram length (e.g., 2)
// const BIGRAM_LENGTH = 2;

// app.post('/upload', upload.single('video'), (req, res) => {
//     const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
//     const videoFilePath = path.join(UPLOAD_DIR, req.file.filename);
//     const audioFilePath = path.join(TRANSCRIPTIONS_DIR, 'extracted_audio.wav');
//     const model = 'whisper-1';

//     // fluent-ffmpeg to extract audio from the video
//     ffmpeg()
//         .input(videoFilePath)
//         .outputOptions('-vn')
//         .audioCodec('pcm_s16le')
//         .audioChannels(2)
//         .audioFrequency(44100)
//         .output(audioFilePath)
//         .on('end', () => {
//             console.log('Audio extraction successful.');

//             const formData = new FormData();
//             formData.append('model', model);
//             formData.append('file', fs.createReadStream(audioFilePath));

//             axios
//                 .post('https://api.openai.com/v1/audio/transcriptions', formData, {
//                     headers: {
//                         Authorization: `Bearer ${OPENAI_API_KEY}`,
//                         'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
//                     },
//                 })
//                 .then((response) => {
//                     const transcript = response.data.text;
//                     const words = transcript.split(' ');
//                     const timestamps = [];

//                     for (let i = 0; i < words.length - BIGRAM_LENGTH + 1; i += BIGRAM_LENGTH) {
//                         const biGram = words.slice(i, i + BIGRAM_LENGTH).join(' ');
//                         const duration = biGram.length * 80; // Adjust the duration as needed

//                         timestamps.push({
//                             start: (i * 80), // Convert to seconds
//                             text: biGram,
//                             end: ((i * 80) + duration), // Convert to seconds
//                             break: true, // Assuming a break between each bi-gram
//                         });
//                     }

//                     res.status(200).json(timestamps);
//                 })
//                 .catch((err) => {
//                     console.log(err);
//                     res.status(500).json({ error: 'Error processing transcription' });
//                 });
//         })
//         .on('error', (err) => {
//             console.error('Error extracting audio:', err);
//             res.status(500).json({ error: 'Error extracting audio' });
//         })
//         .run();
// });

// app.listen(PORT, () => {
//     console.log(`Server is listening on port ${PORT}`);
// });





const express = require('express');
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');




dotenv.config();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const extname = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + extname);
  },
});

// Multer storage configurations for different folders
const storageAudio = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'audio/');
  },
  filename: function (req, file, cb) {
    const extname = path.extname(file.originalname);
    cb(null, 'output_audio_' + Date.now() + extname);
  },
});

const storageSubtitles = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'subtitles/');
  },
  filename: function (req, file, cb) {
    cb(null, 'subtitles.srt');
  },
});

const storageOutputVideo = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'outputvideo/');
  },
  filename: function (req, file, cb) {
    const extname = path.extname(file.originalname);
    cb(null, 'output_video_' + Date.now() + extname);
  },
});

const storageFinalVideo = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'finalvideo/');
  },
  filename: function (req, file, cb) {
    const extname = path.extname(file.originalname);
    cb(null, 'final_output_' + Date.now() + extname);
  },
});

const upload = multer({ storage });

const uploadAudio = multer({ storage: storageAudio });
const uploadSubtitles = multer({ storage: storageSubtitles });
const uploadOutputVideo = multer({ storage: storageOutputVideo });
const uploadFinalVideo = multer({ storage: storageFinalVideo });


app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const inputVideo = req.file.path;
    // const outputAudio = 'output_audio.mp3';
    const outputAudio = path.join('audio', 'output_audio_' + Date.now() + '.mp3');

    const ffmpegCommand = `ffmpeg -i "${inputVideo}" -vn -acodec libmp3lame "${outputAudio}"`;

    exec(ffmpegCommand, async (error, stdout, stderr) => {
      if (error) {
        console.error('Error:', error);
        return;
      }
      console.log('Audio extracted successfully');

      const filePath = path.join(__dirname, outputAudio);
      const model = 'whisper-1';
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

      const formData = new FormData();
      formData.append('model', model);
      formData.append('file', fs.createReadStream(filePath));

      try {
        const response = await axios.post(
          'https://api.openai.com/v1/audio/transcriptions',
          formData,
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
            },
          }
        );
        const transcriptionData = response.data;


        // Convert time in milliseconds to SRT format (hh:mm:ss,mmm)
function formatTime(time) {
  const hours = Math.floor(time / 3600000);
  const minutes = Math.floor((time % 3600000) / 60000);
  const seconds = Math.floor((time % 60000) / 1000);
  const milliseconds = time % 1000;
  return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)},${padNumber(milliseconds, 3)}`;
}

// Pad numbers with leading zeros
function padNumber(number, length = 2) {
  return String(number).padStart(length, '0');
}

        const transcript = transcriptionData.text;
        const words = transcript.split(' ');
        const subtitles = [];

        let startTime = 0;
        for (let i = 0; i < words.length - 2; i += 2) {
          const biGram = words.slice(i, i + 2).join(' ');
          const duration = biGram.length * 80; // Adjust the duration as needed

          const endTime = startTime + duration;

          const subtitle = {
            number: subtitles.length + 1,
            start: formatTime(startTime),
            end: formatTime(endTime),
            text: biGram,
          };

          subtitles.push(subtitle);

          startTime = endTime;
        }

        const srtContent = subtitles
          .map(
            (subtitle) =>
              `${subtitle.number}\n${subtitle.start} --> ${subtitle.end}\n${subtitle.text}\n`
          )
          .join('\n');

        const srtFilePath = path.join('subtitles', 'subtitles' + Date.now() + '.srt');
        fs.writeFileSync(srtFilePath, srtContent);

        const outputVideoWithSubtitles = path.join('outputvideo', 'output_video_with_subtitles_' + Date.now() + '.mp4');
        const fontPath = path.join(__dirname, 'fonts', 'RobotoBold.ttf');

        const textDrawCommands = subtitles.map((subtitle) => {
          const startTime = subtitle.start;
          const endTime = subtitle.end;
          const text = subtitle.text.replace(/'/g, '\'\\\'\'');

          return `drawtext=fontfile=${fontPath}:text='${text}':x=10:y=10:fontsize=24:fontcolor=white:start=${startTime}:end=${endTime}`;
        });

        // const ffmpegTextCommand = `-vf "${textDrawCommands.join(', ')}"`;

        const textOnVideoCommand = `ffmpeg -i "${inputVideo}" -vf "subtitles=${srtFilePath.replace(/\\/g, '/')}" -y "${outputVideoWithSubtitles}"`;


        console.log(textOnVideoCommand);

        exec(textOnVideoCommand, async (error, stdout, stderr) => {
          console.log('FFmpeg Command Output:', stdout);
          console.error('FFmpeg Command Error:', stderr);
          if (error) {
            console.error('Error:', error);
            return;
          }
          console.log('Text added to video successfully');

          // const finalOutputVideo = 'final_output.mp4';
          const finalOutputVideo = path.join('finalvideo', 'final_output_' + Date.now() + '.mp4');

          const exportCommand = `ffmpeg -i "${outputVideoWithSubtitles}" -c:v libx264 -preset medium -crf 23 -c:a aac -strict experimental -b:a 192k "${finalOutputVideo}"`;

          exec(exportCommand, (error, stdout, stderr) => {
            if (error) {
              console.error('Error:', error);
              return;
            }
            console.log('Export completed successfully');

            res.status(200).json({
              message: 'Video uploaded, processed, and exported successfully',
              finalOutputVideo,
              subtitles
            });
          });
        });
      } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred during transcription' });
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred during video upload' });
  }
});

app.get('/finalvideo/:filename', (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(__dirname, 'finalvideo', filename);

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(videoPath);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


