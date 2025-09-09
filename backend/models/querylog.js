const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const queryLogSchema = new Schema({
    query: { type: String, required: true },
    answer: { type: String }, 
    division: { type: String, required: true, index: true },
    answered: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const QueryLog = mongoose.model('QueryLog', queryLogSchema);

module.exports = QueryLog;