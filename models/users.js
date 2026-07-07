const mongoose = require('mongoose');


const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  role: { type: String, enum: ['superadmin', 'manager', 'staff'], default: 'staff' }, 
  notes: { type: String },
  phone:[{type:String}],
  isVerified: {
    type: Boolean,
    default: true
  },
  passwordChangedAt: Date,
  lastLogin: Date,

 refreshToken:{
    token:{type:String ,default:''},
    isRevoked:{type:Boolean,default:false},
  },
  passwordResetCode: {type: String},
  passwordResetExpires: Date,
  passwordResetAttempts :{
   type: Number,
   default:0
  },
  pandding:Date

}, { timestamps: true });


module.exports = mongoose.model('User', adminSchema);