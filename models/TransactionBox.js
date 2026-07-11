const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    moneyBoxId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MoneyBox',
        required: true
    },

    type: {
        type: String,
        enum: ["income", "expense"],
        required: true
    },

    note: String,

    items: [{
        title: String,
        category: {
            type: String,
            enum: ["supplier", "expense", "delivery"  ,"outdelivery","carPayment" ,"teaForWorker","AddHand","income","workerOut", "advance", "deduction", "food"]
        },
        amount: {
            type: Number,
            required: true
        }
    }],

    
        supplierId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supplier'
        },
         deliverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Deliver'
        },
        expenseId:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Expense'
        },
        workerId:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Worker'
        },
        returnDrivery:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnDelivey'
        },

        totalAmount: {
            type: Number,
            required: true
        },

      date: {
        type: Date,
        default: Date.now
    }

}, { timestamps: true });

TransactionSchema.pre('validate', function (next) {

    this.totalAmount = this.items.reduce((sum, item) => {
        return sum + (item.amount || 0);
    }, 0);

});

module.exports = mongoose.model('Transaction', TransactionSchema);
