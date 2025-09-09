const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const studentQuerySchema = new Schema({
    studentUsername: { type: String, required: true },
    division: { type: String, required: true, index: true },
    queryText: { type: String, required: true },
    replyText: { type: String, default: '' },
    status: { type: String, enum: ['unanswered', 'answered'], default: 'unanswered' },
    createdAt: { type: Date, default: Date.now },
    answeredAt: { type: Date }
});

const StudentQuery = mongoose.model('StudentQuery', studentQuerySchema);

module.exports = StudentQuery;