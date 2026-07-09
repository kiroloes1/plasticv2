const mongoose = require("mongoose");

const workerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dailySalary: { type: Number, required: true, min: 0 }, // اليومية الثابتة
  
  // الرصيد: لو (سالب) يبقى العامل مديون، لو (موجب) يبقى له فلوس
  balance: {
    amount: { type: Number, default: 0 },
    notes: { type: String, default: "" }
  },

  // سجل السلف والخصومات والأكل
  financialRecords: [{
    type: { type: String, enum: ["advance", "deduction", "food"], required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  }],

  // سجل الحضور (حاضر أو غايب فقط)
  attendance: [{
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent"], default: "present" }
  }],

  // أرشيف عمليات القبض السابقة
  paymentHistory: [{
    date: { type: Date, default: Date.now },
    daysWorked: Number,
    totalDeductions: Number,
    netPaid: Number
  }]
}, { timestamps: true });

module.exports = mongoose.model("Worker", workerSchema);