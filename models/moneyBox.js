const mongoose = require('mongoose');

const MoneyBoxSchema = new mongoose.Schema({
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MoneyBox', MoneyBoxSchema);