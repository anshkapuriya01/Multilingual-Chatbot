const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const documentSchema = new Schema({
    category: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    content: { type: String, required: true },
    division: { type: String, required: true, default: 'all', index: true }, 
    uploadedAt: { type: Date, default: Date.now }
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;