require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const bcrypt = require('bcrypt');
const pdf = require('pdf-parse');

//Models
const Document = require('./models/document');
const User = require('./models/user');
const QueryLog = require('./models/querylog');

//Initializations
const app = express();
const port = 5000;
const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//Middleware & DB Connection
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.originalUrl}`);
  next();
});

const dbURI = process.env.MONGODB_URI;
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
      console.log('Connected to MongoDB.');
      seedUsers();
  })
  .catch((err) => console.log('MongoDB connection error:', err));

//User Seeding
async function seedUsers() {
    try {
        const users = [
            { username: 'faculty1', password: 'password123', role: 'faculty', division: '1' },
            { username: 'faculty2', password: 'password123', role: 'faculty', division: '2' },
            { username: 'faculty3', password: 'password123', role: 'faculty', division: '3' },
            { username: 'faculty4', password: 'password1.23', role: 'faculty', division: '4' },
            { username: 'student1', password: 'password123', role: 'student', division: '1' },
            { username: 'student2', password: 'password123', role: 'student', division: '2' },
            { username: 'student3', password: 'password123', role: 'student', division: '3' },
            { username: 'student4', password: 'password123', role: 'student', division: '4' },
        ];

        for (const userData of users) {
            const userExists = await User.findOne({ username: userData.username });
            if (!userExists) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(userData.password, salt);
                const user = new User({ ...userData, password: hashedPassword });
                await user.save();
                console.log(`User ${userData.username} created with a hashed password.`);
            }
        }
    } catch (error) {
        console.error('Error seeding users:', error);
    }
}

//API ROUTES

app.post('/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const user = await User.findOne({ username, role });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        res.status(200).json({
            message: 'Login successful!',
            user: { username: user.username, role: user.role, division: user.division }
        });
    } catch (error) {
        console.error("Error in /login route:", error);
        res.status(500).json({ message: "An error occurred during login." });
    }
});

app.post('/register', async (req, res) => {
    try {
        const { username, password, role, division } = req.body;
        if (!username || !password || !role || !division) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(409).json({ message: 'Username already exists.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({
            username,
            password: hashedPassword,
            role,
            division
        });
        await newUser.save();
        res.status(201).json({ message: `User '${username}' registered successfully.` });
    } catch (error) {
        console.error("Error in /register route:", error);
        res.status(500).json({ message: 'An error occurred during registration.' });
    }
});


app.post('/ask', async (req, res) => {
    const { query, division, history } = req.body;
    let answer = '';
    let answered = true;

    try {
        if (!query || !division) {
            return res.status(400).json({ message: 'Query and division are required.' });
        }
        
        const relevantDocuments = await Document.find({
            $or: [{ division: division }, { division: 'all' }]
        }).sort({ uploadedAt: -1 });

        if (relevantDocuments.length === 0) {
            answered = false;
            answer = "I'm sorry, there is no knowledge document available for your division yet.";
            await QueryLog.create({ query, division, answered, answer });
            return res.status(200).json({ answer });
        }

        const combinedContent = relevantDocuments.map(doc => `Category: ${doc.category}\nContent:\n${doc.content}`).join('\n---\n');
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        
        let formattedHistory = '';
        if (history && history.length > 0) {
            formattedHistory = history.map(turn => {
                const prefix = turn.sender === 'user' ? 'User' : 'Model';
                return `${prefix}: ${turn.text}`;
            }).join('\n');
        }

        const prompt = `
            You are a helpful and detailed assistant for a college chatbot. Your goal is to provide comprehensive and easy-to-read answers based on the provided documents and the ongoing conversation.
            **Instructions for your response:**
            1. Answer the user's latest question based ONLY on the provided document content and the context from the previous conversation history. Do not use any external knowledge.
            2. If the user's question is a follow-up, use the history to understand the context.
            3. Provide a descriptive and detailed answer. Do not give one-word or very short answers.
            4. Whenever the answer involves multiple points, steps, or a list of items, format them using bullet points for clarity.
            5. If the information is not present in the document content or conversation history, you MUST respond with the exact phrase: "I'm sorry, I cannot find an answer to that in the provided document."

            **Previous Conversation History:**
            ---
            ${formattedHistory}
            ---
            
            **User's LATEST Question:** "${query}"
            
            **Document Content:**
            ---
            ${combinedContent}
            ---
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        answer = response.text();

        if (answer.includes("I'm sorry, I cannot find an answer")) {
            answered = false;
        }
        
        await QueryLog.create({ query, division, answered, answer }); 
        res.json({ answer });

    } catch (error) {
        console.error("Error in /ask route:", error);
        answered = false;
        answer = "An error occurred while processing your question.";
        await QueryLog.create({ query, division, answered, answer });
        res.status(500).json({ message: answer });
    }
});


// Route to handle document uploads
app.post('/content/add', upload.single('file'), async (req, res) => {
    let tempFilePath = req.file ? req.file.path : null;
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        const { category, division } = req.body;
        let fileContent = '';

        
        if (req.file.mimetype === 'text/plain') {
            fileContent = fs.readFileSync(tempFilePath, 'utf-8');
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempFilePath);
            const worksheet = workbook.getWorksheet(1);
            worksheet.eachRow({ includeEmpty: false }, row => {
                fileContent += row.values.slice(1).join(' | ') + '\n';
            });
        } else if (req.file.mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(tempFilePath);
            const data = await pdf(dataBuffer);
            fileContent = data.text;
        } else {
            fs.unlinkSync(tempFilePath);
            return res.status(400).json({ message: `Unsupported file type: ${req.file.mimetype}` });
        }

        fs.unlinkSync(tempFilePath);
        tempFilePath = null;

        if (!fileContent.trim()) {
            return res.status(400).json({ message: 'File is empty or content could not be extracted.' });
        }
        
        const existingDocument = await Document.findOne({ content: fileContent });
        if (existingDocument) {
            return res.status(409).json({ message: 'Upload failed: This exact document content already exists.' });
        }

        const newDocument = new Document({
            category,
            division,
            fileName: req.file.originalname,
            content: fileContent
        });
        await newDocument.save();
        res.status(201).json({ message: `Successfully added "${newDocument.fileName}" to the knowledge base.` });
    } catch (error) {
        console.error("Error adding content:", error);
        res.status(500).json({ message: 'Failed to add document.' });
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
});

app.get('/documents/:division', async (req, res) => {
    try {
        const { division } = req.params;
        const documents = await Document.find({
            $or: [{ division: division }, { division: 'all' }]
        }).sort({ uploadedAt: -1 });
        res.json(documents);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch documents." });
    }
});

app.delete('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid document ID.' });
        }
        const deleted = await Document.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Document not found.' });
        }
        res.status(200).json({ message: 'Document deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete document.' });
    }
});

//ANALYTICS ROUTES
app.get('/analytics/:division', async (req, res) => {
    try {
        const { division } = req.params;
        const totalQueries = await QueryLog.countDocuments({ division });
        const topQueries = await QueryLog.aggregate([
            { $match: { division: division } },
            { $group: { _id: '$query', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        const unansweredQueries = await QueryLog.find({ 
            division: division, 
            answered: false 
        })
        .sort({ createdAt: -1 })
        .limit(10);
        res.status(200).json({
            totalQueries,
            topQueries,
            unansweredQueries
        });
    } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ message: 'Failed to fetch analytics data.' });
    }
});

app.delete('/analytics/:division', async (req, res) => {
    try {
        const { division } = req.params;
        await QueryLog.deleteMany({ division: division });
        res.status(200).json({ message: `Analytics data for division ${division} has been cleared.` });
    } catch (error) {
        console.error("Error clearing analytics:", error);
        res.status(500).json({ message: 'Failed to clear analytics data.' });
    }
});


// Catch-all 404 handler.
app.use((req, res, next) => {
  res.status(404).json({ message: `Route Not Found - Cannot ${req.method} ${req.originalUrl}` });
});


// Start the server
app.listen(port, () => {
  console.log(`🤖 Chatbot backend is listening on port ${port}`);
});