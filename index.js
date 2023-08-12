const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');

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
    const outputAudio = path.join('audio', 'output_audio_' + Date.now() + '.mp3');

    // Audio extraction using fluent-ffmpeg
    ffmpeg()
      .input(inputVideo)
      .noVideo()
      .audioCodec('libmp3lame')
      .output(outputAudio)
      .on('end', async () => {
        console.log('Audio extracted successfully');

        // Transcription and subtitle generation code goes here
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

        // Adding subtitles to video using fluent-ffmpeg
        ffmpeg()
          .input(inputVideo)
          .output(outputVideoWithSubtitles)
          .outputOptions([`-vf subtitles=${srtFilePath.replace(/\\/g, '/')}`])
          .on('end', () => {
            console.log('Text added to video successfully');

            const finalOutputVideo = path.join('finalvideo', 'final_output_' + Date.now() + '.mp4');

            // Exporting the final video using fluent-ffmpeg
            ffmpeg()
              .input(outputVideoWithSubtitles)
              .videoCodec('libx264')
              .audioCodec('aac')
              .audioBitrate('192k')
              .outputOptions(['-preset medium', '-crf 23', '-strict experimental'])
              .output(finalOutputVideo)
              .on('end', () => {
                console.log('Export completed successfully');

                res.status(200).json({
                  message: 'Video uploaded, processed, and exported successfully',
                  finalOutputVideo,
                  subtitles
                });
              })
              .on('error', (err) => {
                console.error('Error exporting final video:', err);
                res.status(500).json({ error: 'An error occurred during video export' });
              })
              .run();
          })
          .on('error', (err) => {
            console.error('Error adding subtitles to video:', err);
            res.status(500).json({ error: 'An error occurred while adding subtitles to video' });
          })
          .run();
        } catch (error) {
          console.error('Error:', error);
          res.status(500).json({ error: 'An error occurred during transcription' });
        }
      }) 
      .on('error', (err) => {
        console.error('Error extracting audio:', err);
        res.status(500).json({ error: 'An error occurred during audio extraction' });
      })
      .run();
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



