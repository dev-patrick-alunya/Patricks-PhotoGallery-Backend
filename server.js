const express = require('express');
const app = express();
const upload = require('./Middleware/upload'); // Assuming the upload.js file is in the same directory
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');


// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require('cors');
app.use(cors({ origin: 'https://patricks-photogallery-frontend.onrender.com' }));

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Image Uploads Endpoint
// Initialize SQLite database with persistent connection
const db = new sqlite3.Database('./database/images.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Create table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    url TEXT NOT NULL
)`, (err) => {
    if (err) {
        console.error('Error creating table:', err.message);
    } else {
        console.log('Images table is ready.');
    }
});

// User Login Logic
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Dummy user data for demonstration purposes
    const user = {
        email: 'patrickalunya2021@gmail.com',
        password: '2005'
    };

    if (email === user.email && password === user.password) {
        res.status(200).json({ message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

app.post('/upload', upload.array('files'), (req, res) => {
    try {
        if (req.fileValidationError) {
            return res.status(400).json({ error: req.fileValidationError });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Please select files to upload' });
        }

        const uploadedFiles = req.files.map(file => {
            const url = `http://localhost:3000/uploads/${file.filename}`;
            db.run(`INSERT INTO images (filename, url) VALUES (?, ?)`, [file.filename, url], (err) => {
                if (err) {
                    console.error(err);
                }
            });
            return { filename: file.filename, url };
        });

        res.status(200).json({ message: 'Files uploaded successfully', files: uploadedFiles });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Image Deletion Endpoint
app.delete('/delete/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    // Check if the file exists before attempting to delete it
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error deleting file' });
        }

        // Remove the file entry from the database
        db.run(`DELETE FROM images WHERE filename = ?`, [filename], (dbErr) => {
            if (dbErr) {
                console.error(dbErr);
                return res.status(500).json({ error: 'Error deleting file from database' });
            }

            res.status(200).json({ message: 'File deleted successfully' });
        });
    });
});

// Image Retrieval Endpoint
app.get('/photos', (_req, res) => {
    db.all(`SELECT filename, url FROM images`, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error retrieving images from database' });
        }

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No images found' });
        }

        const photos = rows.filter(row => {
            const filePath = path.join(__dirname, 'uploads', row.filename);
            return fs.existsSync(filePath); // Only include files that exist in the uploads folder
        }).map(row => {
            return {
            filename: row.filename,
            url: row.url
            };
        });

        if (photos.length === 0) {
            return res.status(404).json({ message: 'No images found in the uploads folder' });
        }

        return res.status(200).json({ photos });
    });
});

// Image Retrieval by Filename Endpoint
app.get('/photos/:filename', (req, res) => {
    const filename = req.params.filename;

    // Query the database for the image URL
    db.get(`SELECT url FROM images WHERE filename = ?`, [filename], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error retrieving image from database' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Image not found in database' });
        }

        const filePath = path.join(__dirname, 'uploads', filename);

        // Check if the file exists in the uploads directory
        fs.stat(filePath, (err) => {
            if (err) {
                console.error(err);
                return res.status(404).json({ error: 'Image file not found on server' });
            }
            res.sendFile(filePath);
        });
    });
});

// Middleware to handle 404 errors
app.use((_req, res, _next) => {
    res.status(404).json({ error: 'Not Found' });
});

// Middleware to handle errors
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Middleware to handle file upload errors
app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        return res.status(500).json({ error: err.message });
    } else if (err) {
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Middleware to handle file validation errors
app.use((req, res, next) => {
    if (req.fileValidationError) {
        return res.status(400).json({ error: req.fileValidationError });
    }
    next();
});

// Middleware to handle file size limit errors
app.use((err, _req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size is too large' });
    }
    next();
});
// Middleware to handle unsupported file type errors
app.use((err, _req, res, next) => {
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Unsupported file type' });
    }
    next();
});
// Middleware to handle missing fields errors
app.use((req, res, next) => {
    if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'Please select files to upload' });
    }
    next();
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});